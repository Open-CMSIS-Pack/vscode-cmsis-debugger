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

import type { CsvTableFilter, CsvTableRow, CsvTableSort } from './csv-table';
import type { RowSelectionInterval } from './row-selection';

export interface CsvTableState {
    readonly type: 'tableState';
    readonly viewRevision: number;
    readonly columns: readonly string[];
    readonly totalRowCount: number;
    readonly malformedRowCount: number;
    readonly loading: boolean;
    readonly indexing: boolean;
    readonly updating: boolean;
    readonly loadingMessage?: string;
    readonly error?: string;
}

export interface CsvTableRows {
    readonly type: 'rows';
    readonly requestId: number;
    readonly viewRevision: number;
    readonly start: number;
    readonly rows: readonly CsvTableRow[];
    readonly totalRowCount: number;
}

export type CsvTableHostMessage = CsvTableState | CsvTableRows;

export interface CsvTableReady {
    readonly type: 'ready';
}

export interface CsvTableRequestRows {
    readonly type: 'requestRows';
    readonly requestId: number;
    readonly viewRevision: number;
    readonly start: number;
    readonly end: number;
}

export interface CsvTableSetFilters {
    readonly type: 'setFilters';
    readonly filters: readonly CsvTableFilter[];
}

export interface CsvTableCancelViewUpdate {
    readonly type: 'cancelViewUpdate';
}

export interface CsvTableSetSort {
    readonly type: 'setSort';
    readonly sort: CsvTableSort | null;
}

export interface CsvTableCellSelected {
    readonly type: 'cellSelected';
    readonly sourceRowIndex: number;
    readonly columnIndex: number;
    readonly columnName: string;
    readonly cellValue: string;
}

export interface CsvTableRowsRendered {
    readonly type: 'rowsRendered';
    readonly requestId: number;
}

export interface CsvTableCopyRows {
    readonly type: 'copyRows';
    readonly viewRevision: number;
    readonly intervals: readonly RowSelectionInterval[];
}

export type CsvTableWebviewMessage = CsvTableReady | CsvTableRequestRows | CsvTableSetFilters | CsvTableCancelViewUpdate | CsvTableSetSort | CsvTableCellSelected | CsvTableRowsRendered | CsvTableCopyRows;
