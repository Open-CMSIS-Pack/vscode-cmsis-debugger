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

export interface LoadedRowRange {
    readonly viewRevision: number;
    readonly start: number;
    readonly end: number;
}

export const isRowRangeLoaded = (
    loadedRange: LoadedRowRange | null,
    viewRevision: number,
    start: number,
    end: number,
): boolean => loadedRange !== null
&& loadedRange.viewRevision === viewRevision
&& loadedRange.start <= start
    && loadedRange.end >= end;

export const shouldRequestRows = (
    loading: boolean,
    requestInFlight: boolean,
    loadedRange: LoadedRowRange | null,
    viewRevision: number,
    start: number,
    end: number,
): boolean => !loading
&& end > start
&& !requestInFlight
    && !isRowRangeLoaded(loadedRange, viewRevision, start, end);
