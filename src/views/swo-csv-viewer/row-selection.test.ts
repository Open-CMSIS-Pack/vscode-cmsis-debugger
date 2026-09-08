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

import {
    areValidRowSelectionIntervals,
    clearSelectedRows,
    commitRowSelectionCaret,
    EMPTY_ROW_SELECTION,
    isRowSelected,
    moveRowCaret,
    selectAllRows,
    selectRowRange,
    selectSingleRow,
    toggleRow,
} from './row-selection';

describe('row selection', () => {
    it('validates normalized selection intervals against the current view', () => {
        expect(areValidRowSelectionIntervals([{ start: 1, end: 3 }, { start: 5, end: 5 }], 6)).toBe(true);
        expect(areValidRowSelectionIntervals([], 6)).toBe(false);
        expect(areValidRowSelectionIntervals([{ start: 1, end: 3 }, { start: 3, end: 5 }], 6)).toBe(false);
        expect(areValidRowSelectionIntervals([{ start: 1, end: 6 }], 6)).toBe(false);
        expect(areValidRowSelectionIntervals([{ start: 1.5, end: 2 }], 6)).toBe(false);
    });

    it('selects one row when extending without an anchor', () => {
        expect(selectRowRange(EMPTY_ROW_SELECTION, 4)).toEqual({
            intervals: [{ start: 4, end: 4 }],
            caret: 4,
            anchor: 4,
        });
    });

    it('extends, shrinks, and reverses a range around a fixed anchor', () => {
        const initial = selectSingleRow(5);
        const extended = moveRowCaret(initial, 9, 20, 'extend');
        const shrunk = moveRowCaret(extended, 7, 20, 'extend');
        const reversed = moveRowCaret(shrunk, 3, 20, 'extend');

        expect(extended.intervals).toEqual([{ start: 5, end: 9 }]);
        expect(shrunk.intervals).toEqual([{ start: 5, end: 7 }]);
        expect(reversed).toEqual({ intervals: [{ start: 3, end: 5 }], caret: 3, anchor: 5 });
    });

    it('toggles one row while preserving discontiguous selections', () => {
        const selected = toggleRow(toggleRow(selectSingleRow(2), 5), 8);
        const deselected = toggleRow(selected, 5);

        expect(selected.intervals).toEqual([
            { start: 2, end: 2 },
            { start: 5, end: 5 },
            { start: 8, end: 8 },
        ]);
        expect(deselected.intervals).toEqual([
            { start: 2, end: 2 },
            { start: 8, end: 8 },
        ]);
        expect(deselected.caret).toBe(5);
    });

    it('splits an interval when toggling a selected row', () => {
        const state = selectAllRows(EMPTY_ROW_SELECTION, 10);
        expect(toggleRow(state, 4).intervals).toEqual([
            { start: 0, end: 3 },
            { start: 5, end: 9 },
        ]);
    });

    it('clamps movement to table boundaries', () => {
        expect(moveRowCaret(EMPTY_ROW_SELECTION, -10, 5, 'replace').caret).toBe(0);
        expect(moveRowCaret(EMPTY_ROW_SELECTION, 20, 5, 'replace').caret).toBe(4);
        expect(moveRowCaret(EMPTY_ROW_SELECTION, 0, 0, 'replace')).toBe(EMPTY_ROW_SELECTION);
    });

    it('moves the caret without changing selection', () => {
        const state = selectAllRows(EMPTY_ROW_SELECTION, 20);
        const moved = moveRowCaret(state, 12, 20, 'caret-only');
        expect(moved.intervals).toBe(state.intervals);
        expect(moved.caret).toBe(12);
        expect(moved.anchor).toBe(12);
    });

    it('represents selecting one million rows with one interval', () => {
        const state = selectAllRows(EMPTY_ROW_SELECTION, 1_000_000);
        expect(state.intervals).toEqual([{ start: 0, end: 999_999 }]);
        expect(isRowSelected(state, 999_999)).toBe(true);
    });

    it('clears selection while retaining the caret', () => {
        expect(clearSelectedRows(selectSingleRow(6))).toEqual({ intervals: [], caret: 6, anchor: 6 });
    });

    it('commits the caret as anchor without changing selection', () => {
        const extended = selectRowRange(selectSingleRow(3), 8);
        const committed = commitRowSelectionCaret(extended);

        expect(committed.intervals).toBe(extended.intervals);
        expect(committed.caret).toBe(8);
        expect(committed.anchor).toBe(8);
    });
});
