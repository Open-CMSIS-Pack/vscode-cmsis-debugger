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

import { describe, expect, it } from '@jest/globals';
import { EMPTY_ROW_SELECTION, selectRowRange, selectSingleRow, toggleRow } from '../../../views/csv-table-viewer/row-selection';
import { getCsvTableRowRevealScrollTop, getCsvTableScrollGeometry } from '../../../views/csv-table-viewer/csv-table-scroll-geometry';
import { getCsvTableClickTarget, getCsvTableMenuItemIndex, getCsvTableNavigationTarget } from './csv-table-navigation';

const NAVIGATION_OPTIONS = {
    rowIndex: 50, columnIndex: null, rowCount: 100, columnCount: 4, pageSize: 20,
    shiftKey: false, primaryModifier: false,
};
const CLICK_OPTIONS = {
    selection: EMPTY_ROW_SELECTION, selectedCell: null, rowIndex: 5, columnIndex: 2, clickCount: 1,
    shiftKey: false, altKey: false, primaryModifier: false,
};
const CELL_SELECTION = { intervals: [], caret: 5, anchor: 5 };

describe('CSV table click selection', () => {
    it('selects an unselected row before entering cell mode on a later click', () => {
        expect(getCsvTableClickTarget(CLICK_OPTIONS)).toEqual({ rowIndex: 5, columnIndex: null, selection: selectSingleRow(5) });
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection: selectSingleRow(5) }))
            .toEqual({ rowIndex: 5, columnIndex: 2, selection: CELL_SELECTION });
    });

    it('enters cell mode from any row in a selected range', () => {
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection: selectRowRange(selectSingleRow(3), 7) }))
            .toEqual({ rowIndex: 5, columnIndex: 2, selection: CELL_SELECTION });
    });

    it('keeps same-row clicks in cell mode but selects a different row first', () => {
        const options = { ...CLICK_OPTIONS, selectedCell: { rowIndex: 5, columnIndex: 0 }, selection: CELL_SELECTION };
        expect(getCsvTableClickTarget(options)).toEqual({ rowIndex: 5, columnIndex: 2, selection: CELL_SELECTION });
        expect(getCsvTableClickTarget({ ...options, rowIndex: 6 })).toEqual({ rowIndex: 6, columnIndex: null, selection: selectSingleRow(6) });
    });

    it.each([null, { rowIndex: 5, columnIndex: 2 }])('always selects a row when clicking the index with selectedCell=%s', selectedCell => {
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, columnIndex: null, selection: selectSingleRow(5), selectedCell }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: selectSingleRow(5) });
    });

    it.each([2, 3])('reserves repeated click %i without changing selection mode', clickCount => {
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection: selectSingleRow(5), clickCount })).toBeNull();
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, columnIndex: null, primaryModifier: true, clickCount })).toBeNull();
    });

    it('supports keyboard-generated clicks with a zero click count', () => {
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, clickCount: 0 }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: selectSingleRow(5) });
    });

    it.each([null, 2])('extends row selection with Shift on column %s', columnIndex => {
        const selection = selectSingleRow(3);
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection, columnIndex, shiftKey: true }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: selectRowRange(selection, 5) });
    });

    it.each([null, 2])('toggles row selection with Alt on column %s', columnIndex => {
        for (const selection of [selectSingleRow(3), selectRowRange(selectSingleRow(3), 7)]) {
            expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection, columnIndex, altKey: true }))
                .toEqual({ rowIndex: 5, columnIndex: null, selection: toggleRow(selection, 5) });
        }
    });

    it('uses the cell-mode caret as the Shift-click range anchor', () => {
        expect(getCsvTableClickTarget({
            ...CLICK_OPTIONS, selection: CELL_SELECTION, selectedCell: { rowIndex: 5, columnIndex: 0 }, rowIndex: 8, shiftKey: true,
        })).toEqual({ rowIndex: 8, columnIndex: null, selection: selectRowRange(CELL_SELECTION, 8) });
    });

    it('uses row mode for primary-modifier clicks and prioritizes Shift over Alt and the primary modifier', () => {
        const selection = selectRowRange(selectSingleRow(3), 7);
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection, primaryModifier: true }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: selectSingleRow(5) });
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection, shiftKey: true, altKey: true, primaryModifier: true }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: selectRowRange(selection, 5) });
        expect(getCsvTableClickTarget({ ...CLICK_OPTIONS, selection, altKey: true, primaryModifier: true }))
            .toEqual({ rowIndex: 5, columnIndex: null, selection: toggleRow(selection, 5) });
    });
});

describe('CSV table keyboard navigation', () => {
    it.each([null, 0, 2])('switches vertical and page navigation to row mode from column %s', columnIndex => {
        const options = { ...NAVIGATION_OPTIONS, columnIndex };
        for (const { key, rowIndex } of [
            { key: 'ArrowUp', rowIndex: 49 }, { key: 'ArrowDown', rowIndex: 51 },
            { key: 'PageUp', rowIndex: 30 }, { key: 'PageDown', rowIndex: 70 },
            { key: 'Home', rowIndex: 0 }, { key: 'End', rowIndex: 99 },
        ]) {
            expect(getCsvTableNavigationTarget({ ...options, key })).toEqual({ rowIndex, columnIndex: null, movement: 'replace' });
        }
    });

    it('enters the first data column from row mode only with Right', () => {
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowRight' }))
            .toEqual({ rowIndex: 50, columnIndex: 0, movement: 'replace' });
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowLeft' }))
            .toEqual({ rowIndex: 50, columnIndex: null, movement: 'replace' });
    });

    it('stays in row mode on repeated Left presses after leaving the first cell', () => {
        let columnIndex: number | null = 0;
        for (let press = 0; press < 3; press += 1) {
            const target = getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowLeft', columnIndex });
            expect(target).toEqual({ rowIndex: 50, columnIndex: null, movement: 'replace' });
            columnIndex = target?.columnIndex ?? null;
        }
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowRight', columnIndex }))
            .toEqual({ rowIndex: 50, columnIndex: 0, movement: 'replace' });
    });

    it.each([
        { key: 'ArrowLeft', columnIndex: 0, expected: null },
        { key: 'ArrowLeft', columnIndex: 2, expected: 1 },
        { key: 'ArrowRight', columnIndex: 0, expected: 1 },
        { key: 'ArrowRight', columnIndex: 3, expected: 3 },
    ])('moves $key from column $columnIndex to $expected', ({ key, columnIndex, expected }) => {
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key, columnIndex }))
            .toEqual({ rowIndex: 50, columnIndex: expected, movement: 'replace' });
    });

    it.each([
        { key: 'ArrowUp', rowIndex: 0, expected: 0 },
        { key: 'ArrowDown', rowIndex: 99, expected: 99 },
        { key: 'PageUp', rowIndex: 3, expected: 0 },
        { key: 'PageDown', rowIndex: 97, expected: 99 },
    ])('clamps $key at row $rowIndex to $expected', ({ key, rowIndex, expected }) => {
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key, rowIndex, columnIndex: 2 }))
            .toEqual({ rowIndex: expected, columnIndex: null, movement: 'replace' });
    });

    it('handles single-row, single-column tables', () => {
        const options = { ...NAVIGATION_OPTIONS, rowIndex: 0, rowCount: 1, columnCount: 1 };
        expect(getCsvTableNavigationTarget({ ...options, key: 'End', columnIndex: 0 })).toEqual({ rowIndex: 0, columnIndex: null, movement: 'replace' });
        expect(getCsvTableNavigationTarget({ ...options, key: 'ArrowRight', columnIndex: 0 })).toEqual({ rowIndex: 0, columnIndex: 0, movement: 'replace' });
    });

    it.each([
        { shiftKey: false, primaryModifier: false, movement: 'replace' },
        { shiftKey: true, primaryModifier: false, movement: 'extend' },
        { shiftKey: false, primaryModifier: true, movement: 'caret-only' },
        { shiftKey: true, primaryModifier: true, movement: 'extend' },
    ])('resolves row movement to $movement for Shift=$shiftKey, primary=$primaryModifier', ({ movement, ...modifiers }) => {
        for (const columnIndex of [null, 2]) {
            for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
                expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, ...modifiers, key, columnIndex }))
                    .toMatchObject({ columnIndex: null, movement });
            }
        }
    });

    it.each([
        { shiftKey: true, primaryModifier: false },
        { shiftKey: false, primaryModifier: true },
        { shiftKey: true, primaryModifier: true },
    ])('leaves modified horizontal keys unhandled for Shift=$shiftKey, primary=$primaryModifier', modifiers => {
        for (const columnIndex of [null, 0, 2]) {
            for (const key of ['ArrowLeft', 'ArrowRight']) {
                expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, ...modifiers, key, columnIndex })).toBeNull();
            }
        }
    });

    it('ignores unhandled keys, empty tables, and horizontal navigation without data columns', () => {
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'Enter' })).toBeNull();
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowDown', rowCount: 0 })).toBeNull();
        expect(getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowRight', columnCount: 0 })).toBeNull();
    });

    it.each([200_000, 10_000_000])('reveals row-key destinations only at viewport edges for %i rows', rowCount => {
        const viewportHeight = 600;
        const scrollTop = 123;
        const { firstVisibleRow } = getCsvTableScrollGeometry(rowCount, scrollTop, viewportHeight);
        for (const key of ['ArrowUp', 'ArrowDown']) {
            const target = getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key, rowCount, rowIndex: firstVisibleRow + 10 });
            expect(target).not.toBeNull();
            expect(getCsvTableRowRevealScrollTop(rowCount, scrollTop, viewportHeight, target?.rowIndex ?? -1)).toBe(scrollTop);
        }
        const above = getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowUp', rowCount, rowIndex: firstVisibleRow });
        const below = getCsvTableNavigationTarget({ ...NAVIGATION_OPTIONS, key: 'ArrowDown', rowCount, rowIndex: firstVisibleRow + 24 });
        expect(getCsvTableRowRevealScrollTop(rowCount, scrollTop, viewportHeight, above?.rowIndex ?? -1)).toBeLessThan(scrollTop);
        expect(getCsvTableRowRevealScrollTop(rowCount, scrollTop, viewportHeight, below?.rowIndex ?? -1)).toBeGreaterThan(scrollTop);
    });
});

describe('CSV table context-menu navigation', () => {
    it.each([
        { key: 'ArrowDown', currentIndex: 0, expected: 1 },
        { key: 'ArrowDown', currentIndex: 1, expected: 0 },
        { key: 'ArrowUp', currentIndex: 1, expected: 0 },
        { key: 'ArrowUp', currentIndex: 0, expected: 1 },
        { key: 'Home', currentIndex: 1, expected: 0 },
        { key: 'End', currentIndex: 0, expected: 1 },
        { key: 'ArrowDown', currentIndex: -1, expected: 0 },
    ])('moves $key from item $currentIndex to $expected', ({ key, currentIndex, expected }) => {
        expect(getCsvTableMenuItemIndex(key, currentIndex, 2)).toBe(expected);
    });

    it.each(['ArrowUp', 'ArrowDown', 'Home', 'End'])('handles a single enabled item and no enabled items with %s', key => {
        expect(getCsvTableMenuItemIndex(key, 0, 1)).toBe(0);
        expect(getCsvTableMenuItemIndex(key, -1, 0)).toBeNull();
    });

    it.each(['Escape', 'Tab', 'Enter', 'F10', 'ContextMenu'])('leaves %s to the component', key => {
        expect(getCsvTableMenuItemIndex(key, 0, 2)).toBeNull();
    });
});
