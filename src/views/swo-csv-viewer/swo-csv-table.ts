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
    const builder = new SwoCsvTableBuilder();
    for (const line of lines) {
        builder.addLine(line);
    }
    return builder.build();
};

export const parseSwoCsvAsyncLines = async (lines: AsyncIterable<string>): Promise<SwoCsvTable> => {
    const builder = new SwoCsvTableBuilder();
    for await (const line of lines) {
        builder.addLine(line);
    }
    return builder.build();
};

class SwoCsvTableBuilder {
    private columns: readonly string[] | undefined;
    private readonly rows: SwoCsvRow[] = [];
    private malformedRowCount = 0;

    public addLine(line: string): void {
        if (this.columns === undefined) {
            this.columns = line.length === 0 ? [] : parseCsvRecord(line);
            return;
        }
        if (line.length === 0) {
            return;
        }

        const rawCells = parseCsvRecord(line);
        if (rawCells.length !== this.columns.length) {
            this.malformedRowCount += 1;
        }
        this.rows.push({
            sourceRowIndex: this.rows.length,
            cells: normalizeCells(rawCells, this.columns.length),
        });
    }

    public build(): SwoCsvTable {
        return {
            columns: this.columns ?? [],
            rows: this.rows,
            malformedRowCount: this.malformedRowCount,
        };
    }
}

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

const parseCsvRecord = (record: string): readonly string[] => {
    const cells: string[] = [];
    let cell = '';
    let insideQuotes = false;

    for (let index = 0; index < record.length; index += 1) {
        const character = record.charAt(index);
        if (character === '"') {
            if (insideQuotes && record.charAt(index + 1) === '"') {
                cell += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (character === ',' && !insideQuotes) {
            cells.push(cell);
            cell = '';
        } else {
            cell += character;
        }
    }

    cells.push(cell);
    return cells;
};
