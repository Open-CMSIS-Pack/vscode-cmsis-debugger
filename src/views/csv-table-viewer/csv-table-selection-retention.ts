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

import type { CsvTableRowStore } from './csv-table-row-store';
import { EMPTY_ROW_SELECTION, isRowSelected, type RowSelectionInterval, type RowSelectionState } from './row-selection';

const ROW_BATCH_SIZE = 4096;

interface RowIdentity {
    readonly cycles: string;
    readonly occurrence: number;
}

export interface CsvTableSelectionIdentity {
    readonly selected: readonly RowIdentity[];
    readonly caret: RowIdentity | null;
    readonly anchor: RowIdentity | null;
}

export const getCsvTableSelectionIdentity = async (
    selection: RowSelectionState,
    store: CsvTableRowStore,
): Promise<CsvTableSelectionIdentity | null> => {
    const cyclesColumn = findCyclesColumn(store.columns);
    if (cyclesColumn === -1 || selection.intervals.length === 0) {
        return null;
    }
    return await getSelectionIdentity(selection, store, cyclesColumn);
};

export const restoreCsvTableSelection = async (
    identity: CsvTableSelectionIdentity | null,
    store: CsvTableRowStore,
): Promise<RowSelectionState> => {
    const cyclesColumn = findCyclesColumn(store.columns);
    return identity === null || cyclesColumn === -1
        ? EMPTY_ROW_SELECTION
        : await findSelection(identity, store, cyclesColumn);
};

const findCyclesColumn = (columns: readonly string[]): number => columns.findIndex(column => column.toLowerCase() === 'cycles');

const getSelectionIdentity = async (
    selection: RowSelectionState,
    store: CsvTableRowStore,
    cyclesColumn: number,
): Promise<CsvTableSelectionIdentity> => {
    const occurrences = new Map<string, number>();
    const selected: RowIdentity[] = [];
    let caret: RowIdentity | null = null;
    let anchor: RowIdentity | null = null;
    await visitRows(store, (rowIndex, cells) => {
        const cycles = cells.at(cyclesColumn) ?? '';
        const occurrence = occurrences.get(cycles) ?? 0;
        occurrences.set(cycles, occurrence + 1);
        const identity = { cycles, occurrence };
        if (isRowSelected(selection, rowIndex)) {
            selected.push(identity);
        }
        if (selection.caret === rowIndex) {
            caret = identity;
        }
        if (selection.anchor === rowIndex) {
            anchor = identity;
        }
    });
    return { selected, caret, anchor };
};

const findSelection = async (
    identity: CsvTableSelectionIdentity,
    store: CsvTableRowStore,
    cyclesColumn: number,
): Promise<RowSelectionState> => {
    const selectedIdentities = new Set(identity.selected.map(identityKey));
    const caretIdentity = identity.caret === null ? null : identityKey(identity.caret);
    const anchorIdentity = identity.anchor === null ? null : identityKey(identity.anchor);
    const occurrences = new Map<string, number>();
    const selectedRows: number[] = [];
    let caret: number | null = null;
    let anchor: number | null = null;
    await visitRows(store, (rowIndex, cells) => {
        const cycles = cells.at(cyclesColumn) ?? '';
        const occurrence = occurrences.get(cycles) ?? 0;
        occurrences.set(cycles, occurrence + 1);
        const key = identityKey({ cycles, occurrence });
        if (selectedIdentities.has(key)) {
            selectedRows.push(rowIndex);
        }
        if (key === caretIdentity) {
            caret = rowIndex;
        }
        if (key === anchorIdentity) {
            anchor = rowIndex;
        }
    });
    if (selectedRows.length === 0) {
        return EMPTY_ROW_SELECTION;
    }
    return {
        intervals: toIntervals(selectedRows),
        caret,
        anchor,
    };
};

const visitRows = async (
    store: CsvTableRowStore,
    visitor: (rowIndex: number, cells: readonly string[]) => void,
): Promise<void> => {
    for (let start = 0; start < store.rowCount; start += ROW_BATCH_SIZE) {
        const rows = await store.getRows(start, Math.min(start + ROW_BATCH_SIZE, store.rowCount));
        rows.forEach((row, index) => visitor(start + index, row.cells));
    }
};

const identityKey = ({ cycles, occurrence }: RowIdentity): string => `${cycles.length}:${cycles}:${occurrence}`;

const toIntervals = (rows: readonly number[]): readonly RowSelectionInterval[] => rows.reduce<RowSelectionInterval[]>((intervals, row) => {
    const previous = intervals.at(-1);
    if (previous !== undefined && previous.end + 1 === row) {
        intervals[intervals.length - 1] = { start: previous.start, end: row };
    } else {
        intervals.push({ start: row, end: row });
    }
    return intervals;
}, []);
