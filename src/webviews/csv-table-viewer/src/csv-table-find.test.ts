/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CsvTableFind, CsvTableState, CsvTableWebviewMessage } from '../../../views/csv-table-viewer/csv-table-protocol';
import { CsvTableFindController, getCsvTableFindCommand, INITIAL_FIND_STATE } from './csv-table-find';

const READY_VIEW = { viewRevision: 1, loading: false, indexing: false, updating: false };
const MATCH = { rowIndex: 500, sourceRowIndex: 700, columnIndex: 2, start: 3, end: 9 };

const createFixture = (): {
    readonly controller: CsvTableFindController;
    readonly posted: CsvTableWebviewMessage[];
    readonly state: () => typeof INITIAL_FIND_STATE;
    readonly request: () => CsvTableFind;
} => {
    let state = INITIAL_FIND_STATE;
    const posted: CsvTableWebviewMessage[] = [];
    const controller = new CsvTableFindController(message => posted.push(message), next => { state = next; });
    controller.updateView(READY_VIEW);
    posted.length = 0;
    return {
        controller, posted, state: () => state,
        request: () => {
            const request = posted.findLast(message => message.type === 'find');
            if (request?.type !== 'find') {
                throw new Error('Expected a search request');
            }
            return request;
        },
    };
};

beforeEach(() => {
    jest.useFakeTimers();
});
afterEach(() => {
    jest.useRealTimers();
});

describe('CSV Find shortcuts', () => {
    const keyEvent = { key: 'f', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

    it('opens with the platform primary modifier, including from header inputs', () => {
        expect(getCsvTableFindCommand({ ...keyEvent, ctrlKey: true }, 'Win32', false, false)).toBe('open');
        expect(getCsvTableFindCommand({ ...keyEvent, metaKey: true, key: 'F' }, 'MacIntel', false, false)).toBe('open');
        expect(getCsvTableFindCommand({ ...keyEvent, ctrlKey: true }, 'MacIntel', false, false)).toBeNull();
        expect(getCsvTableFindCommand({ ...keyEvent, ctrlKey: true, altKey: true }, 'Win32', false, false)).toBeNull();
    });

    it('handles Escape only when Find is open, preserving normal row-selection shortcuts', () => {
        expect(getCsvTableFindCommand({ ...keyEvent, key: 'Escape' }, 'Win32', true, false)).toBe('close');
        expect(getCsvTableFindCommand({ ...keyEvent, key: 'Escape' }, 'Win32', false, false)).toBeNull();
        expect(getCsvTableFindCommand({ ...keyEvent, key: 'a', ctrlKey: true }, 'Win32', true, false)).toBeNull();
        expect(getCsvTableFindCommand({ ...keyEvent, key: 'ArrowDown' }, 'Win32', true, false)).toBeNull();
    });

    it('navigates with F3 or Enter in the Find input, reversing with Shift', () => {
        for (const shiftKey of [false, true]) {
            const direction = shiftKey ? 'previous' : 'next';
            expect(getCsvTableFindCommand({ ...keyEvent, key: 'F3', shiftKey }, 'Win32', false, false)).toBe(direction);
            expect(getCsvTableFindCommand({ ...keyEvent, key: 'Enter', shiftKey }, 'Win32', true, true)).toBe(direction);
        }
        expect(getCsvTableFindCommand({ ...keyEvent, key: 'Enter' }, 'Win32', true, false)).toBeNull();
    });
});

describe('CSV Find lifecycle', () => {
    it('debounces query changes and searches the complete view without a selection message', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('old');
        jest.advanceTimersByTime(100);
        fixture.controller.setQuery('target');
        jest.advanceTimersByTime(149);
        expect(fixture.posted.some(message => message.type === 'find')).toBe(false);
        jest.advanceTimersByTime(1);
        expect(fixture.request()).toEqual(expect.objectContaining({ query: 'target', after: null, direction: 'next', viewRevision: 1 }));
        expect(fixture.state().pending).toBe(true);
        expect(fixture.posted.every(message => message.type === 'find' || message.type === 'cancelFind')).toBe(true);
        fixture.controller.dispose();
    });

    it('passes the current occurrence as the navigation cursor in both directions', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        jest.runOnlyPendingTimers();
        fixture.controller.receive({ ...fixture.request(), type: 'findResult', match: MATCH });
        expect(fixture.state().match).toEqual(MATCH);
        fixture.controller.find('previous');
        expect(fixture.request()).toEqual(expect.objectContaining({ direction: 'previous', after: MATCH }));
        fixture.controller.receive({ ...fixture.request(), type: 'findResult', match: MATCH });
        fixture.controller.find('next');
        expect(fixture.request()).toEqual(expect.objectContaining({ direction: 'next', after: MATCH }));
        fixture.controller.dispose();
    });

    it('discards old query results even when they arrive before the new debounce completes', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('old');
        jest.runOnlyPendingTimers();
        const old = fixture.request();
        fixture.controller.setQuery('new');
        fixture.controller.receive({ ...old, type: 'findResult', match: MATCH });
        expect(fixture.state().match).toBeNull();
        jest.runOnlyPendingTimers();
        fixture.controller.receive({ ...old, type: 'findResult', match: MATCH });
        expect(fixture.state().pending).toBe(true);
        fixture.controller.dispose();
    });

    it.each(['loading', 'indexing', 'updating'] as const)('waits for a stable view during %s and restarts only once', field => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        const busy = { ...READY_VIEW, [field]: true };
        fixture.controller.updateView(busy);
        jest.runOnlyPendingTimers();
        expect(fixture.posted.some(message => message.type === 'find')).toBe(false);
        expect(fixture.state().status).toContain('Waiting');
        fixture.controller.updateView(READY_VIEW);
        jest.runOnlyPendingTimers();
        const request = fixture.request();
        fixture.controller.receive({ ...request, type: 'findResult', match: MATCH });
        fixture.controller.updateView(READY_VIEW);
        jest.runOnlyPendingTimers();
        expect(fixture.request()).toEqual(request);
        expect(fixture.state().match).toEqual(MATCH);
        fixture.controller.dispose();
    });

    it('clears highlights immediately on view changes and rejects stale revisions', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        jest.runOnlyPendingTimers();
        const old = fixture.request();
        fixture.controller.receive({ ...old, type: 'findResult', match: MATCH });
        fixture.controller.suspend();
        expect(fixture.state().match).toBeNull();
        fixture.controller.updateView({ ...READY_VIEW, viewRevision: 2 });
        jest.runOnlyPendingTimers();
        fixture.controller.receive({ ...fixture.request(), type: 'findResult', viewRevision: 1, match: MATCH });
        expect(fixture.state().match).toBeNull();
        expect(fixture.request().after).toBeNull();
        expect(fixture.request().viewRevision).toBe(2);
        fixture.controller.dispose();
    });

    it('cancels when closed, preserves the query, and starts afresh when reopened', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        jest.runOnlyPendingTimers();
        const old = fixture.request();
        fixture.controller.close();
        fixture.controller.receive({ ...old, type: 'findResult', match: MATCH });
        expect(fixture.state()).toEqual({ ...INITIAL_FIND_STATE, query: 'target' });
        expect(fixture.posted.at(-1)).toEqual({ type: 'cancelFind' });
        fixture.controller.open();
        jest.runOnlyPendingTimers();
        expect(fixture.request().requestId).not.toBe(old.requestId);
        expect(fixture.request().after).toBeNull();
        fixture.controller.dispose();
    });

    it('does not issue empty, closed, concurrent, or unavailable searches', () => {
        const fixture = createFixture();
        fixture.controller.find('next');
        fixture.controller.open();
        fixture.controller.find('next');
        fixture.controller.setQuery('target');
        fixture.controller.suspend();
        fixture.controller.find('next');
        expect(fixture.posted.some(message => message.type === 'find')).toBe(false);
        fixture.controller.updateView(READY_VIEW);
        fixture.controller.find('next');
        const request = fixture.request();
        fixture.controller.find('previous');
        expect(fixture.request()).toBe(request);
        fixture.controller.dispose();
    });

    it('reports no results and errors and cancels queued work on disposal', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        jest.runOnlyPendingTimers();
        fixture.controller.receive({ ...fixture.request(), type: 'findResult', match: null });
        expect(fixture.state().status).toBe('No results');
        fixture.controller.find('next');
        fixture.controller.receive({ ...fixture.request(), type: 'findResult', match: null, error: 'Search failed' });
        expect(fixture.state().status).toBe('Search failed');
        fixture.controller.setQuery('new');
        fixture.controller.dispose();
        const count = fixture.posted.length;
        jest.runOnlyPendingTimers();
        expect(fixture.posted).toHaveLength(count);
    });

    it('waits rather than searching a failed table', () => {
        const fixture = createFixture();
        fixture.controller.open();
        fixture.controller.setQuery('target');
        fixture.controller.updateView({ ...READY_VIEW, error: 'Load failed' } satisfies Pick<CsvTableState, 'viewRevision' | 'loading' | 'indexing' | 'updating' | 'error'>);
        jest.runOnlyPendingTimers();
        expect(fixture.posted.some(message => message.type === 'find')).toBe(false);
        fixture.controller.dispose();
    });
});
