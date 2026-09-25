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

import { filterCsvTableRows, sortCsvTableRows, type CsvTableFilter, type CsvTableRow, type CsvTableSort, type CsvTableTable } from './csv-table';

export interface CsvTableRowStore {
    readonly columns: readonly string[];
    readonly sourceRowCount: number;
    readonly rowCount: number;
    readonly malformedRowCount: number;
    readonly isIndexing: boolean;

    applyView(filters: readonly CsvTableFilter[], sort: CsvTableSort | null, signal?: AbortSignal): Promise<CsvTableViewTiming>;
    getRows(start: number, end: number): Promise<readonly CsvTableRow[]>;
    getSourceRow(sourceRowIndex: number): Promise<CsvTableRow | undefined>;
    onDidIndexProgress(listener: () => void): () => void;
    waitForIndexing(): Promise<void>;
    dispose(): Promise<void>;
}

export interface CsvTableViewTiming {
    readonly store: 'in-memory' | 'indexed' | 'external-merge';
    readonly scanMs: number;
    readonly sortMs: number;
    readonly materializeMs: number;
    readonly matchedRows: number;
    readonly runCount?: number;
    readonly writeRunsMs?: number;
    readonly mergeRunsMs?: number;
    readonly columnCache?: readonly CsvTableColumnCacheTiming[];
    readonly exactIndexColumns?: readonly number[];
}

export interface CsvTableColumnCacheTiming {
    readonly columnIndex: number;
    readonly hits: number;
    readonly misses: number;
    readonly loadMs: number;
}

export class InMemoryCsvTableRowStore implements CsvTableRowStore {
    private viewRows: readonly CsvTableRow[];

    public constructor(private readonly table: CsvTableTable) {
        this.viewRows = table.rows;
    }

    public get columns(): readonly string[] {
        return this.table.columns;
    }

    public get sourceRowCount(): number {
        return this.table.rows.length;
    }

    public get rowCount(): number {
        return this.viewRows.length;
    }

    public get malformedRowCount(): number {
        return this.table.malformedRowCount;
    }

    public get isIndexing(): boolean {
        return false;
    }

    public async applyView(filters: readonly CsvTableFilter[], sort: CsvTableSort | null, signal?: AbortSignal): Promise<CsvTableViewTiming> {
        signal?.throwIfAborted();
        const scanStartedAt = performance.now();
        const filteredRows = filterCsvTableRows(this.table.rows, filters);
        const scanMs = performance.now() - scanStartedAt;
        const sortStartedAt = performance.now();
        this.viewRows = sortCsvTableRows(filteredRows, sort);
        return {
            store: 'in-memory',
            scanMs,
            sortMs: performance.now() - sortStartedAt,
            materializeMs: 0,
            matchedRows: this.viewRows.length,
        };
    }

    public async getRows(start: number, end: number): Promise<readonly CsvTableRow[]> {
        return this.viewRows.slice(start, end);
    }

    public async getSourceRow(sourceRowIndex: number): Promise<CsvTableRow | undefined> {
        return this.table.rows.at(sourceRowIndex);
    }

    public onDidIndexProgress(_listener: () => void): () => void {
        return () => undefined;
    }

    public async waitForIndexing(): Promise<void> {
        return;
    }

    public async dispose(): Promise<void> {
        this.viewRows = [];
    }
}
