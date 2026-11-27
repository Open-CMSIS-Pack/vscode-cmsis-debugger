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

import type { CsvTableFindResult, CsvTableState, CsvTableWebviewMessage } from '../../../views/csv-table-viewer/csv-table-protocol';
import type { CsvTableSearchDirection, CsvTableSearchMatch } from '../../../views/csv-table-viewer/csv-table-search';
import { isPrimaryModifierPressed } from './csv-table-modifiers';

export const getCsvTableFindCommand = (
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    platform: string,
    open: boolean,
    inputFocused: boolean,
): 'open' | 'close' | CsvTableSearchDirection | null => {
    if (isPrimaryModifierPressed(event, platform) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        return 'open';
    }
    if (open && event.key === 'Escape') {
        return 'close';
    }
    if (event.key === 'F3' || (open && inputFocused && event.key === 'Enter')) {
        return event.shiftKey ? 'previous' : 'next';
    }
    return null;
};

export interface CsvTableFindState {
    readonly open: boolean;
    readonly query: string;
    readonly match: CsvTableSearchMatch | null;
    readonly pending: boolean;
    readonly status: string;
}

export const INITIAL_FIND_STATE: CsvTableFindState = { open: false, query: '', match: null, pending: false, status: '' };
const FIND_DEBOUNCE_MS = 150;

export class CsvTableFindController {
    private state = INITIAL_FIND_STATE;
    private available = false;
    private revision = 0;
    private requestId = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private startRowIndex: number | null = null;
    private sticky = false;
    private stickyMatch: CsvTableSearchMatch | null = null;

    public constructor(
        private readonly postMessage: (message: CsvTableWebviewMessage) => void,
        private readonly onChange: (state: CsvTableFindState) => void,
        private readonly selectRow: (rowIndex: number) => void = () => { },
    ) { }

    private update(change: Partial<CsvTableFindState>): void {
        this.state = { ...this.state, ...change };
        this.onChange(this.state);
    }

    private cancel(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.requestId += 1;
        this.postMessage({ type: 'cancelFind' });
    }

    private restart(): void {
        this.cancel();
        this.update({ match: null, pending: false, status: this.state.query && !this.available ? 'Waiting for table…' : '' });
        if (this.state.open && this.state.query && this.available) {
            this.timer = setTimeout(() => this.find('next', false), FIND_DEBOUNCE_MS);
        }
    }

    public open(rowIndex: number | null = null): void {
        if (!this.state.open) {
            this.startRowIndex = rowIndex;
            this.update({ open: true });
            this.restart();
        }
    }

    public close(): void {
        this.cancel();
        this.sticky = false;
        this.stickyMatch = null;
        this.update({ open: false, match: null, pending: false, status: '' });
    }

    public setQuery(query: string): void {
        this.update({ query });
        this.restart();
    }

    public suspend(): void {
        this.available = false;
        this.startRowIndex = null;
        this.sticky = false;
        this.stickyMatch = null;
        this.restart();
    }

    public updateView(view: Pick<CsvTableState, 'viewRevision' | 'loading' | 'indexing' | 'updating' | 'error'>): void {
        const available = !view.loading && !view.indexing && !view.updating && view.error === undefined;
        if (available !== this.available || view.viewRevision !== this.revision) {
            this.available = available;
            this.revision = view.viewRevision;
            this.startRowIndex = null;
            this.sticky = false;
            this.stickyMatch = null;
            this.restart();
        }
    }

    public find(direction: CsvTableSearchDirection, confirm = true): void {
        if (!this.state.open || !this.state.query || !this.available) {
            return;
        }
        this.sticky ||= confirm;
        if (this.state.pending) {
            return;
        }
        clearTimeout(this.timer);
        this.timer = undefined;
        this.requestId += 1;
        this.update({ pending: true, status: 'Searching…' });
        this.postMessage({
            type: 'find', requestId: this.requestId, viewRevision: this.revision, query: this.state.query, direction,
            after: this.state.match ?? this.stickyMatch,
            ...(this.startRowIndex === null ? {} : { startRowIndex: this.startRowIndex }),
            ...(this.state.match === null && this.stickyMatch !== null ? { includeAfter: true } : {}),
        });
    }

    public receive(message: CsvTableFindResult): void {
        if (!this.state.open || !this.state.pending || message.requestId !== this.requestId || message.viewRevision !== this.revision) {
            return;
        }
        this.update({
            pending: false,
            match: message.match,
            status: message.error ?? (message.match === null ? 'No results' : `Row ${message.match.sourceRowIndex}, column ${message.match.columnIndex + 1}`),
        });
        if (this.sticky && message.match !== null) {
            this.stickyMatch = message.match;
            this.selectRow(message.match.rowIndex);
        }
    }

    public dispose(): void {
        this.cancel();
    }
}
