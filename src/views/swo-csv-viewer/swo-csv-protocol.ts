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

import type { SwoCsvFilter, SwoCsvRow, SwoCsvSort } from './swo-csv-table';

export interface SwoCsvTableState {
    readonly type: 'tableState';
    readonly columns: readonly string[];
    readonly totalRowCount: number;
    readonly malformedRowCount: number;
    readonly loading: boolean;
    readonly error?: string;
}

export interface SwoCsvRows {
    readonly type: 'rows';
    readonly requestId: number;
    readonly start: number;
    readonly rows: readonly SwoCsvRow[];
    readonly totalRowCount: number;
}

export type SwoCsvHostMessage = SwoCsvTableState | SwoCsvRows;

export interface SwoCsvReady {
    readonly type: 'ready';
}

export interface SwoCsvRequestRows {
    readonly type: 'requestRows';
    readonly requestId: number;
    readonly start: number;
    readonly end: number;
}

export interface SwoCsvSetFilters {
    readonly type: 'setFilters';
    readonly filters: readonly SwoCsvFilter[];
}

export interface SwoCsvSetSort {
    readonly type: 'setSort';
    readonly sort: SwoCsvSort | null;
}

export interface SwoCsvCellSelected {
    readonly type: 'cellSelected';
    readonly sourceRowIndex: number;
    readonly columnIndex: number;
    readonly columnName: string;
    readonly cellValue: string;
}

export type SwoCsvWebviewMessage = SwoCsvReady | SwoCsvRequestRows | SwoCsvSetFilters | SwoCsvSetSort | SwoCsvCellSelected;
