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

export interface RowSelectionInterval {
    readonly start: number;
    readonly end: number;
}

export interface RowSelectionState {
    readonly intervals: readonly RowSelectionInterval[];
    readonly caret: number | null;
    readonly anchor: number | null;
}

export type RowSelectionMovement = 'replace' | 'extend' | 'caret-only';

export const EMPTY_ROW_SELECTION: RowSelectionState = {
    intervals: [],
    caret: null,
    anchor: null,
};

export const isRowSelected = (state: RowSelectionState, rowIndex: number): boolean => {
    return state.intervals.some(interval => rowIndex >= interval.start && rowIndex <= interval.end);
};

export const selectSingleRow = (rowIndex: number): RowSelectionState => ({
    intervals: [{ start: rowIndex, end: rowIndex }],
    caret: rowIndex,
    anchor: rowIndex,
});

export const selectRowRange = (state: RowSelectionState, rowIndex: number): RowSelectionState => {
    const anchor = state.anchor ?? state.caret ?? rowIndex;
    return {
        intervals: [orderedInterval(anchor, rowIndex)],
        caret: rowIndex,
        anchor,
    };
};

export const toggleRow = (state: RowSelectionState, rowIndex: number): RowSelectionState => ({
    intervals: isRowSelected(state, rowIndex)
        ? removeRow(state.intervals, rowIndex)
        : addRow(state.intervals, rowIndex),
    caret: rowIndex,
    anchor: rowIndex,
});

export const moveRowCaret = (
    state: RowSelectionState,
    rowIndex: number,
    rowCount: number,
    movement: RowSelectionMovement,
): RowSelectionState => {
    if (rowCount === 0) {
        return EMPTY_ROW_SELECTION;
    }
    const destination = Math.max(0, Math.min(rowIndex, rowCount - 1));
    if (movement === 'extend') {
        return selectRowRange(state, destination);
    }
    if (movement === 'caret-only') {
        return { ...state, caret: destination, anchor: destination };
    }
    return selectSingleRow(destination);
};

export const selectAllRows = (state: RowSelectionState, rowCount: number): RowSelectionState => {
    if (rowCount === 0) {
        return EMPTY_ROW_SELECTION;
    }
    const caret = state.caret === null ? 0 : Math.min(state.caret, rowCount - 1);
    return {
        intervals: [{ start: 0, end: rowCount - 1 }],
        caret,
        anchor: caret,
    };
};

export const clearSelectedRows = (state: RowSelectionState): RowSelectionState => ({
    intervals: [],
    caret: state.caret,
    anchor: state.caret,
});

export const commitRowSelectionCaret = (state: RowSelectionState): RowSelectionState => ({
    ...state,
    anchor: state.caret,
});

const orderedInterval = (first: number, second: number): RowSelectionInterval => ({
    start: Math.min(first, second),
    end: Math.max(first, second),
});

const removeRow = (intervals: readonly RowSelectionInterval[], rowIndex: number): readonly RowSelectionInterval[] => {
    return intervals.flatMap(interval => {
        if (rowIndex < interval.start || rowIndex > interval.end) {
            return [interval];
        }
        const remaining: RowSelectionInterval[] = [];
        if (interval.start < rowIndex) {
            remaining.push({ start: interval.start, end: rowIndex - 1 });
        }
        if (rowIndex < interval.end) {
            remaining.push({ start: rowIndex + 1, end: interval.end });
        }
        return remaining;
    });
};

const addRow = (intervals: readonly RowSelectionInterval[], rowIndex: number): readonly RowSelectionInterval[] => {
    const ordered = [...intervals, { start: rowIndex, end: rowIndex }].sort((left, right) => left.start - right.start);
    return ordered.reduce<RowSelectionInterval[]>((merged, interval) => {
        const previous = merged.at(-1);
        if (previous === undefined || interval.start > previous.end + 1) {
            merged.push(interval);
        } else {
            merged[merged.length - 1] = { start: previous.start, end: Math.max(previous.end, interval.end) };
        }
        return merged;
    }, []);
};
