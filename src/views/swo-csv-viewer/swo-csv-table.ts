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

export interface SwoCsvRow {
    readonly sourceRowIndex: number;
    readonly cells: readonly string[];
}

export interface SwoCsvTable {
    readonly columns: readonly string[];
    readonly rows: readonly SwoCsvRow[];
    readonly malformedRowCount: number;
}

export interface SwoCsvFilter {
    readonly columnIndex: number;
    readonly value: string;
}

export type SwoCsvSortDirection = 'ascending' | 'descending';

export interface SwoCsvSort {
    readonly columnIndex: number | null;
    readonly direction: SwoCsvSortDirection;
}

export const parseSwoCsv = (contents: string): SwoCsvTable => {
    return parseSwoCsvLines(contents.split(/\r?\n/));
};


export const parseSwoCsvLines = (lines: Iterable<string>): SwoCsvTable => {
    const iterator = lines[Symbol.iterator]();
    const header = iterator.next().value;
    if (header === undefined || header.length === 0) {
        return { columns: [], rows: [], malformedRowCount: 0 };
    }

    const columns = header.split(',');
    const rows: SwoCsvRow[] = [];
    let malformedRowCount = 0;

    for (let next = iterator.next(); !next.done; next = iterator.next()) {
        const line = next.value;
        if (line.length === 0) {
            continue;
        }

        const rawCells = line.split(',');
        if (rawCells.length !== columns.length) {
            malformedRowCount += 1;
        }
        rows.push({
            sourceRowIndex: rows.length,
            cells: normalizeCells(rawCells, columns.length),
        });
    }

    return { columns, rows, malformedRowCount };
};

export const filterSwoCsvRows = (rows: readonly SwoCsvRow[], filters: readonly SwoCsvFilter[]): readonly SwoCsvRow[] => {
    const activeFilters = filters.filter(filter => filter.value.length > 0);
    if (activeFilters.length === 0) {
        return rows;
    }

    return rows.filter(row => activeFilters.every(filter =>
        (row.cells[filter.columnIndex] ?? '').toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())
    ));
};

export const sortSwoCsvRows = (rows: readonly SwoCsvRow[], sort: SwoCsvSort | null): readonly SwoCsvRow[] => {
    if (sort === null) {
        return rows;
    }

    const direction = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((left, right) => {
        const comparison = sort.columnIndex === null
            ? left.sourceRowIndex - right.sourceRowIndex
            : (left.cells[sort.columnIndex] ?? '').localeCompare(right.cells[sort.columnIndex] ?? '', undefined, { numeric: true, sensitivity: 'base' });
        return comparison === 0
            ? left.sourceRowIndex - right.sourceRowIndex
            : comparison * direction;
    });
};

const normalizeCells = (rawCells: readonly string[], columnCount: number): readonly string[] => {
    if (rawCells.length === columnCount) {
        return rawCells;
    }

    if (rawCells.length < columnCount) {
        return [...rawCells, ...Array<string>(columnCount - rawCells.length).fill('')];
    }

    return [
        ...rawCells.slice(0, columnCount - 1),
        rawCells.slice(columnCount - 1).join(','),
    ];
};
