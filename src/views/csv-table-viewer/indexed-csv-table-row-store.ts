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

import { createReadStream } from 'node:fs';
import { open, stat, type FileHandle } from 'node:fs/promises';
import { ExternalRowIdIndex, type ExternalSortEntry } from './external-csv-table-sort';
import type { CsvTableColumnCacheTiming, CsvTableRowStore, CsvTableViewTiming } from './csv-table-row-store';
import { compareCsvTableSortValues, matchesCsvTableFilter, normalizeCsvTableFilterValue, parseCsvTableRecord, type CsvTableFilter, type CsvTableRow, type CsvTableSort } from './csv-table';

const VIEW_SCAN_BATCH_SIZE = 4096;
const EXTERNAL_SORT_FILE_SIZE_LIMIT = 300 * 1024 * 1024;
const INDEX_SEGMENT_SIZE = 65_536;
const PARSED_COLUMN_CACHE_BYTES = 64 * 1024 * 1024;
const EXACT_INDEX_MAX_DISTINCT_VALUES = 1024;
const EXACT_INDEX_MAX_BYTES = 16 * 1024 * 1024;
const EXACT_INDEX_COLUMN_LIMIT = 2;

interface CsvRecordIndex {
    columns: readonly string[];
    readonly locations: SegmentedRecordLocations;
    malformedRowCount: number;
}

interface ParsedColumnSegment {
    readonly raw: readonly string[];
    readonly normalized: readonly string[];
}

interface MutableColumnCacheTiming {
    hits: number;
    misses: number;
    loadMs: number;
}

class ParsedColumnCache {
    private readonly segments = new Map<string, { readonly segment: ParsedColumnSegment; readonly bytes: number }>();
    private sizeBytes = 0;

    public constructor(private readonly maxBytes: number) { }

    public get(columnIndex: number, start: number): ParsedColumnSegment | undefined {
        const key = `${columnIndex}:${start}`;
        const cached = this.segments.get(key);
        if (cached === undefined) {
            return undefined;
        }
        this.segments.delete(key);
        this.segments.set(key, cached);
        return cached.segment;
    }

    public set(columnIndex: number, start: number, segment: ParsedColumnSegment): void {
        const key = `${columnIndex}:${start}`;
        const bytes = segment.raw.reduce((total, value, index) => total + Buffer.byteLength(value) + Buffer.byteLength(segment.normalized.at(index) ?? ''), 0);
        const previous = this.segments.get(key);
        if (previous !== undefined) {
            this.sizeBytes -= previous.bytes;
            this.segments.delete(key);
        }
        if (bytes > this.maxBytes) {
            return;
        }
        this.segments.set(key, { segment, bytes });
        this.sizeBytes += bytes;
        while (this.sizeBytes > this.maxBytes) {
            const oldestKey = this.segments.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            const oldest = this.segments.get(oldestKey)!;
            this.segments.delete(oldestKey);
            this.sizeBytes -= oldest.bytes;
        }
    }

    public clear(): void {
        this.segments.clear();
        this.sizeBytes = 0;
    }
}

const getColumnTiming = (timing: Map<number, MutableColumnCacheTiming>, columnIndex: number): MutableColumnCacheTiming => {
    let columnTiming = timing.get(columnIndex);
    if (columnTiming === undefined) {
        columnTiming = { hits: 0, misses: 0, loadMs: 0 };
        timing.set(columnIndex, columnTiming);
    }
    return columnTiming;
};

const toColumnCacheTiming = (timing: ReadonlyMap<number, MutableColumnCacheTiming>): readonly CsvTableColumnCacheTiming[] => Array.from(
    timing,
    ([columnIndex, value]) => ({ columnIndex, ...value }),
);

const getRequiredColumns = (
    filters: readonly CsvTableFilter[],
    sortColumnIndex: number | null,
    indexedColumns: readonly number[],
): readonly number[] => Array.from(new Set([
    ...filters.filter(filter => !indexedColumns.includes(filter.columnIndex)).map(filter => filter.columnIndex),
    ...(sortColumnIndex === null ? [] : [sortColumnIndex]),
]));

const createRowIds = (start: number, end: number): Uint32Array => Uint32Array.from(
    { length: end - start },
    (_, index) => start + index,
);

const lowerBound = (values: Uint32Array, target: number): number => {
    let start = 0;
    let end = values.length;
    while (start < end) {
        const middle = start + Math.floor((end - start) / 2);
        if (values.at(middle)! < target) {
            start = middle + 1;
        } else {
            end = middle;
        }
    }
    return start;
};

const intersectSortedRowIds = (left: Uint32Array, right: Uint32Array): Uint32Array => {
    const intersection: number[] = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
        const leftValue = left.at(leftIndex)!;
        const rightValue = right.at(rightIndex)!;
        if (leftValue === rightValue) {
            intersection.push(leftValue);
            leftIndex += 1;
            rightIndex += 1;
        } else if (leftValue < rightValue) {
            leftIndex += 1;
        } else {
            rightIndex += 1;
        }
    }
    return Uint32Array.from(intersection);
};

export class IndexedCsvTableRowStore implements CsvTableRowStore {
    private viewRowIds: Uint32Array | null = null;
    private externalView: ExternalRowIdIndex | null = null;
    private viewUpdate = Promise.resolve();
    private disposed = false;
    private readonly columnCache = new ParsedColumnCache(PARSED_COLUMN_CACHE_BYTES);
    private readonly exactIndexes = new Map<number, ReadonlyMap<string, Uint32Array> | null>();

    private constructor(
        private readonly fileHandle: FileHandle,
        private readonly index: CsvRecordIndex,
        private readonly fileSize: number,
        private readonly indexing: CsvRecordIndexing,
    ) { }

    public static async create(filePath: string): Promise<IndexedCsvTableRowStore> {
        const indexing = startCsvRecordIndexing(filePath);
        // The path originates from a VS Code file URI.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fileStatPromise = stat(filePath);
        const [index, fileStat] = await Promise.all([indexing.indexReady, fileStatPromise]);
        // The path originates from a VS Code file URI.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fileHandle = await open(filePath, 'r');
        return new IndexedCsvTableRowStore(fileHandle, index, fileStat.size, indexing);
    }

    public get columns(): readonly string[] {
        return this.index.columns;
    }

    public get sourceRowCount(): number {
        return this.index.locations.length;
    }

    public get rowCount(): number {
        return this.externalView?.rowCount ?? this.viewRowIds?.length ?? this.index.locations.length;
    }

    public get malformedRowCount(): number {
        return this.index.malformedRowCount;
    }

    public get isIndexing(): boolean {
        return !this.disposed && this.indexing.isIndexing;
    }

    public async applyView(filters: readonly CsvTableFilter[], sort: CsvTableSort | null, signal?: AbortSignal): Promise<CsvTableViewTiming> {
        let completeUpdate: () => void = () => undefined;
        const previousUpdate = this.viewUpdate;
        this.viewUpdate = new Promise<void>(resolve => {
            completeUpdate = resolve;
        });
        await previousUpdate;
        try {
            signal?.throwIfAborted();
            return await this.applyViewInternal(filters, sort, signal);
        } finally {
            completeUpdate();
        }
    }

    public async getRows(start: number, end: number): Promise<readonly CsvTableRow[]> {
        if (this.externalView !== null) {
            const rowIds = await this.externalView.getRowIds(start, end);
            return await Promise.all(rowIds.map(rowId => this.getRequiredSourceRow(rowId)));
        }
        if (this.viewRowIds === null) {
            return await this.readSourceRows(start, Math.min(end, this.index.locations.length));
        }
        return await Promise.all(Array.from(this.viewRowIds.subarray(start, end), async rowId => await this.getRequiredSourceRow(rowId)));
    }

    public async getSourceRow(sourceRowIndex: number): Promise<CsvTableRow | undefined> {
        if (sourceRowIndex < 0 || sourceRowIndex >= this.index.locations.length) {
            return undefined;
        }
        return await this.getRequiredSourceRow(sourceRowIndex);
    }

    public onDidIndexProgress(listener: () => void): () => void {
        return this.indexing.onProgress(listener);
    }

    public async waitForIndexing(): Promise<void> {
        await this.indexing.completion;
    }

    public async dispose(): Promise<void> {
        this.disposed = true;
        this.indexing.cancel();
        this.viewRowIds = null;
        this.columnCache.clear();
        this.exactIndexes.clear();
        await this.replaceExternalView(null);
        await this.fileHandle.close();
    }

    private async applyViewInternal(filters: readonly CsvTableFilter[], sort: CsvTableSort | null, signal?: AbortSignal): Promise<CsvTableViewTiming> {
        const applyStartedAt = performance.now();
        const sourceRowCount = this.index.locations.length;
        const activeFilters = filters
            .filter(filter => filter.value.length > 0)
            .map(filter => ({ ...filter, value: normalizeCsvTableFilterValue(filter.value) }));
        if (activeFilters.length === 0 && sort === null) {
            await this.replaceExternalView(null);
            this.viewRowIds = null;
            return { store: 'indexed', scanMs: 0, sortMs: 0, materializeMs: 0, matchedRows: this.rowCount };
        }

        const cacheTiming = new Map<number, MutableColumnCacheTiming>();
        const exactIndexColumns: number[] = [];
        const candidateRowIds = await this.getExactFilterCandidates(activeFilters, cacheTiming, exactIndexColumns, signal);
        if (this.fileSize > EXTERNAL_SORT_FILE_SIZE_LIMIT && sort?.columnIndex !== null && sort !== null) {
            const externalView = await ExternalRowIdIndex.create(
                this.scanMatchingSortEntries(activeFilters, sort.columnIndex, cacheTiming, candidateRowIds, signal),
                sort.direction,
            );
            signal?.throwIfAborted();
            await this.replaceExternalView(externalView);
            this.viewRowIds = null;
            return {
                store: 'external-merge',
                scanMs: externalView.scanMs,
                sortMs: externalView.mergeRunsMs,
                materializeMs: performance.now() - applyStartedAt - externalView.scanMs - externalView.writeRunsMs - externalView.mergeRunsMs,
                matchedRows: externalView.rowCount,
                runCount: externalView.runCount,
                writeRunsMs: externalView.writeRunsMs,
                mergeRunsMs: externalView.mergeRunsMs,
                columnCache: toColumnCacheTiming(cacheTiming),
                exactIndexColumns,
            };
        }

        const scanStartedAt = performance.now();
        const sortedMatches: Array<{ readonly rowId: number; readonly sortValue: string }> = [];
        const matchingRowIds: number[] = [];
        const sortByValue = sort?.columnIndex !== null && sort !== null;
        for (let start = 0; start < sourceRowCount; start += VIEW_SCAN_BATCH_SIZE) {
            signal?.throwIfAborted();
            const end = Math.min(start + VIEW_SCAN_BATCH_SIZE, sourceRowCount);
            const batchCandidates = candidateRowIds === null
                ? undefined
                : candidateRowIds.subarray(lowerBound(candidateRowIds, start), lowerBound(candidateRowIds, end));
            if (batchCandidates?.length === 0) {
                continue;
            }
            const requiredColumns = getRequiredColumns(activeFilters, sortByValue ? sort.columnIndex : null, exactIndexColumns);
            const columns = await this.readCachedColumns(start, end, requiredColumns, cacheTiming);
            const rowIds = batchCandidates ?? createRowIds(start, end);
            for (const rowId of rowIds) {
                if (activeFilters.every(filter => exactIndexColumns.includes(filter.columnIndex)
                    || matchesCsvTableFilter(columns.get(filter.columnIndex)?.normalized.at(rowId - start) ?? '', filter))) {
                    if (sortByValue) {
                        sortedMatches.push({ rowId, sortValue: columns.get(sort.columnIndex)?.raw.at(rowId - start) ?? '' });
                    } else {
                        matchingRowIds.push(rowId);
                    }
                }
            }
        }
        signal?.throwIfAborted();
        const scanMs = performance.now() - scanStartedAt;

        const sortStartedAt = performance.now();
        if (sort !== null) {
            const direction = sort.direction === 'ascending' ? 1 : -1;
            sortedMatches.sort((left, right) => {
                const comparison = compareCsvTableSortValues(left.sortValue, right.sortValue);
                return comparison === 0 ? left.rowId - right.rowId : comparison * direction;
            });
            if (!sortByValue && direction < 0) {
                matchingRowIds.reverse();
            }
        }
        const sortMs = performance.now() - sortStartedAt;
        const materializeStartedAt = performance.now();
        const viewRowIds = sortByValue
            ? Uint32Array.from(sortedMatches, match => match.rowId)
            : Uint32Array.from(matchingRowIds);
        signal?.throwIfAborted();
        await this.replaceExternalView(null);
        this.viewRowIds = viewRowIds;
        return {
            store: 'indexed',
            scanMs,
            sortMs,
            materializeMs: performance.now() - materializeStartedAt,
            matchedRows: viewRowIds.length,
            columnCache: toColumnCacheTiming(cacheTiming),
            exactIndexColumns,
        };
    }

    private async *scanMatchingSortEntries(
        activeFilters: readonly CsvTableFilter[],
        columnIndex: number,
        cacheTiming: Map<number, MutableColumnCacheTiming>,
        candidateRowIds: Uint32Array | null,
        signal?: AbortSignal,
    ): AsyncGenerator<ExternalSortEntry> {
        for (let start = 0; start < this.index.locations.length; start += VIEW_SCAN_BATCH_SIZE) {
            signal?.throwIfAborted();
            const end = Math.min(start + VIEW_SCAN_BATCH_SIZE, this.index.locations.length);
            const batchCandidates = candidateRowIds === null
                ? undefined
                : candidateRowIds.subarray(lowerBound(candidateRowIds, start), lowerBound(candidateRowIds, end));
            if (batchCandidates?.length === 0) {
                continue;
            }
            const exactIndexColumns = activeFilters.filter(filter => filter.match === 'exact' && this.exactIndexes.get(filter.columnIndex) instanceof Map).map(filter => filter.columnIndex);
            const requiredColumns = getRequiredColumns(activeFilters, columnIndex, exactIndexColumns);
            const columns = await this.readCachedColumns(start, end, requiredColumns, cacheTiming);
            const rowIds = batchCandidates ?? createRowIds(start, end);
            for (const rowId of rowIds) {
                if (activeFilters.every(filter => exactIndexColumns.includes(filter.columnIndex)
                    || matchesCsvTableFilter(columns.get(filter.columnIndex)?.normalized.at(rowId - start) ?? '', filter))) {
                    yield { rowId, sortValue: columns.get(columnIndex)?.raw.at(rowId - start) ?? '' };
                }
            }
        }
    }

    private async getExactFilterCandidates(
        filters: readonly CsvTableFilter[],
        cacheTiming: Map<number, MutableColumnCacheTiming>,
        indexedColumns: number[],
        signal?: AbortSignal,
    ): Promise<Uint32Array | null> {
        let candidates: Uint32Array | null = null;
        for (const filter of filters) {
            if (filter.match !== 'exact') {
                continue;
            }
            const index = await this.getOrBuildExactIndex(filter.columnIndex, cacheTiming, signal);
            if (index === null) {
                continue;
            }
            indexedColumns.push(filter.columnIndex);
            const matches = index.get(filter.value) ?? new Uint32Array();
            candidates = candidates === null ? matches : intersectSortedRowIds(candidates, matches);
        }
        return candidates;
    }

    private async getOrBuildExactIndex(
        columnIndex: number,
        cacheTiming: Map<number, MutableColumnCacheTiming>,
        signal?: AbortSignal,
    ): Promise<ReadonlyMap<string, Uint32Array> | null> {
        if (this.isIndexing) {
            return null;
        }
        const existing = this.exactIndexes.get(columnIndex);
        if (existing !== undefined) {
            return existing;
        }
        const values = new Map<string, number[]>();
        let estimatedBytes = 0;
        for (let start = 0; start < this.index.locations.length; start += VIEW_SCAN_BATCH_SIZE) {
            signal?.throwIfAborted();
            const end = Math.min(start + VIEW_SCAN_BATCH_SIZE, this.index.locations.length);
            const column = (await this.readCachedColumns(start, end, [columnIndex], cacheTiming)).get(columnIndex)!;
            for (let offset = 0; offset < column.normalized.length; offset += 1) {
                const value = column.normalized.at(offset)!;
                let rowIds = values.get(value);
                if (rowIds === undefined) {
                    if (values.size >= EXACT_INDEX_MAX_DISTINCT_VALUES) {
                        this.exactIndexes.set(columnIndex, null);
                        return null;
                    }
                    rowIds = [];
                    values.set(value, rowIds);
                    estimatedBytes += value.length * 2 + 32;
                }
                rowIds.push(start + offset);
                estimatedBytes += Uint32Array.BYTES_PER_ELEMENT;
                if (estimatedBytes > EXACT_INDEX_MAX_BYTES) {
                    this.exactIndexes.set(columnIndex, null);
                    return null;
                }
            }
        }
        if (this.exactIndexes.size >= EXACT_INDEX_COLUMN_LIMIT) {
            const oldestColumn = this.exactIndexes.keys().next().value;
            if (oldestColumn !== undefined) {
                this.exactIndexes.delete(oldestColumn);
            }
        }
        const index = new Map(Array.from(values, ([value, rowIds]) => [value, Uint32Array.from(rowIds)]));
        this.exactIndexes.set(columnIndex, index);
        return index;
    }

    private async readCachedColumns(
        start: number,
        end: number,
        columnIndexes: readonly number[],
        timing: Map<number, MutableColumnCacheTiming>,
    ): Promise<ReadonlyMap<number, ParsedColumnSegment>> {
        const columns = new Map<number, ParsedColumnSegment>();
        const missing: number[] = [];
        for (const columnIndex of columnIndexes) {
            const stats = getColumnTiming(timing, columnIndex);
            const cached = this.columnCache.get(columnIndex, start);
            if (cached === undefined) {
                stats.misses += 1;
                missing.push(columnIndex);
            } else {
                stats.hits += 1;
                columns.set(columnIndex, cached);
            }
        }
        if (missing.length > 0) {
            const loadStartedAt = performance.now();
            const rows = await this.readSourceRows(start, end);
            const loadMs = performance.now() - loadStartedAt;
            for (const columnIndex of missing) {
                const raw = rows.map(row => row.cells.at(columnIndex) ?? '');
                const segment = { raw, normalized: raw.map(normalizeCsvTableFilterValue) };
                if (end - start === VIEW_SCAN_BATCH_SIZE || end === this.index.locations.length && !this.isIndexing) {
                    this.columnCache.set(columnIndex, start, segment);
                }
                columns.set(columnIndex, segment);
                getColumnTiming(timing, columnIndex).loadMs += loadMs / missing.length;
            }
        }
        return columns;
    }

    private async replaceExternalView(replacement: ExternalRowIdIndex | null): Promise<void> {
        const previous = this.externalView;
        this.externalView = replacement;
        if (previous !== null) {
            await previous.dispose();
        }
    }

    private async getRequiredSourceRow(sourceRowIndex: number): Promise<CsvTableRow> {
        const rows = await this.readSourceRows(sourceRowIndex, sourceRowIndex + 1);
        const row = rows[0];
        if (row === undefined) {
            throw new Error(`CSV row ${sourceRowIndex} could not be read`);
        }
        return row;
    }

    private async readSourceRows(start: number, end: number): Promise<readonly CsvTableRow[]> {
        if (start >= end) {
            return [];
        }
        const first = this.index.locations.get(start);
        const last = this.index.locations.get(end - 1);
        if (first === undefined || last === undefined) {
            return [];
        }
        const byteLength = last.offset + last.length - first.offset;
        const buffer = Buffer.allocUnsafe(byteLength);
        const result = await this.fileHandle.read(buffer, 0, byteLength, first.offset);
        if (result.bytesRead !== byteLength) {
            throw new Error(`Expected ${byteLength} CSV bytes but read ${result.bytesRead}`);
        }
        const rows: CsvTableRow[] = [];
        for (let sourceRowIndex = start; sourceRowIndex < end; sourceRowIndex += 1) {
            const location = this.index.locations.get(sourceRowIndex);
            if (location === undefined) {
                break;
            }
            const relativeOffset = location.offset - first.offset;
            const record = buffer.toString('utf8', relativeOffset, relativeOffset + location.length);
            rows.push({
                sourceRowIndex,
                cells: normalizeIndexedCells(parseCsvTableRecord(record), this.columns.length),
            });
        }
        return rows;
    }
}

interface CsvRecordIndexing {
    readonly indexReady: Promise<CsvRecordIndex>;
    readonly completion: Promise<void>;
    readonly isIndexing: boolean;
    onProgress(listener: () => void): () => void;
    cancel(): void;
}

const startCsvRecordIndexing = (filePath: string): CsvRecordIndexing => {
    const records = new SegmentedRecordLocations();
    const index: CsvRecordIndex = { columns: [], locations: records, malformedRowCount: 0 };
    const listeners = new Set<() => void>();
    let cancelled = false;
    let indexing = true;
    let stream: ReturnType<typeof createReadStream> | undefined;
    let resolveIndexReady: (index: CsvRecordIndex) => void = () => undefined;
    let rejectIndexReady: (reason: unknown) => void = () => undefined;
    const indexReady = new Promise<CsvRecordIndex>((resolve, reject) => {
        resolveIndexReady = resolve;
        rejectIndexReady = reject;
    });
    let recordOffset = 0;
    let byteOffset = 0;
    let insideQuotes = false;
    let pendingQuote = false;
    let pendingCarriageReturn = false;
    let recordHasContent = false;
    let recordFieldCount = 1;
    let pendingHeaderParts: Buffer[] = [];

    const addRecord = (endOffset: number): void => {
        if (recordHasContent) {
            if (index.columns.length === 0) {
                index.columns = parseCsvTableRecord(Buffer.concat(pendingHeaderParts).toString('utf8'));
                resolveIndexReady(index);
            } else {
                if (recordFieldCount !== index.columns.length) {
                    index.malformedRowCount += 1;
                }
                records.push(recordOffset, endOffset - recordOffset);
            }
        }
        pendingHeaderParts = [];
        recordHasContent = false;
        recordFieldCount = 1;
        recordOffset = endOffset;
    };

    const notifyProgress = (): void => {
        for (const listener of listeners) {
            listener();
        }
    };
    const completion = (async (): Promise<void> => {
        // The path originates from a VS Code file URI.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        stream = createReadStream(filePath);
        try {
            for await (const chunk of stream) {
                if (cancelled) {
                    break;
                }
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                let segmentStart = 0;
                for (let byteIndex = 0; byteIndex < buffer.length; byteIndex += 1) {
                    const value = buffer.at(byteIndex)!;
                    if (pendingCarriageReturn) {
                        pendingCarriageReturn = false;
                        if (value === 0x0a) {
                            recordOffset += 1;
                            segmentStart = byteIndex + 1;
                            continue;
                        }
                    }
                    if (pendingQuote) {
                        pendingQuote = false;
                        if (value === 0x22) {
                            continue;
                        }
                        insideQuotes = false;
                    }
                    if (value === 0x22) {
                        recordHasContent = true;
                        if (insideQuotes) {
                            if (byteIndex + 1 < buffer.length) {
                                if (buffer.at(byteIndex + 1) === 0x22) {
                                    byteIndex += 1;
                                } else {
                                    insideQuotes = false;
                                }
                            } else {
                                pendingQuote = true;
                            }
                        } else {
                            insideQuotes = true;
                        }
                    } else if ((value === 0x0a || value === 0x0d) && !insideQuotes) {
                        if (index.columns.length === 0 && segmentStart < byteIndex) {
                            pendingHeaderParts.push(buffer.subarray(segmentStart, byteIndex));
                        }
                        addRecord(byteOffset + byteIndex);
                        pendingCarriageReturn = value === 0x0d;
                        recordOffset = byteOffset + byteIndex + 1;
                        segmentStart = byteIndex + 1;
                    } else if (value === 0x2c && !insideQuotes) {
                        recordHasContent = true;
                        recordFieldCount += 1;
                    } else {
                        recordHasContent = true;
                    }
                }
                if (index.columns.length === 0 && segmentStart < buffer.length) {
                    pendingHeaderParts.push(buffer.subarray(segmentStart));
                }
                byteOffset += buffer.length;
                notifyProgress();
            }
            if (!cancelled && recordHasContent) {
                addRecord(byteOffset);
            }
            if (index.columns.length === 0) {
                resolveIndexReady(index);
            }
        } catch (error) {
            if (!cancelled) {
                rejectIndexReady(error);
                throw error;
            }
        } finally {
            indexing = false;
            stream.destroy();
            notifyProgress();
        }
    })();
    return {
        indexReady,
        completion,
        get isIndexing(): boolean {
            return indexing;
        },
        onProgress(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        cancel(): void {
            cancelled = true;
            stream?.destroy();
        },
    };
};

class SegmentedRecordLocations {
    private readonly offsetSegments: Float64Array[] = [];
    private readonly lengthSegments: Uint32Array[] = [];
    private recordCount = 0;

    public get length(): number {
        return this.recordCount;
    }

    public push(offset: number, length: number): void {
        const segmentIndex = Math.floor(this.recordCount / INDEX_SEGMENT_SIZE);
        const indexInSegment = this.recordCount % INDEX_SEGMENT_SIZE;
        let offsets = this.offsetSegments.at(segmentIndex);
        let lengths = this.lengthSegments.at(segmentIndex);
        if (offsets === undefined || lengths === undefined) {
            offsets = new Float64Array(INDEX_SEGMENT_SIZE);
            lengths = new Uint32Array(INDEX_SEGMENT_SIZE);
            this.offsetSegments.push(offsets);
            this.lengthSegments.push(lengths);
        }
        offsets.set([offset], indexInSegment);
        lengths.set([length], indexInSegment);
        this.recordCount += 1;
    }

    public get(index: number): { readonly offset: number; readonly length: number } | undefined {
        if (index < 0 || index >= this.recordCount) {
            return undefined;
        }
        const segmentIndex = Math.floor(index / INDEX_SEGMENT_SIZE);
        const indexInSegment = index % INDEX_SEGMENT_SIZE;
        return {
            offset: this.offsetSegments.at(segmentIndex)!.at(indexInSegment)!,
            length: this.lengthSegments.at(segmentIndex)!.at(indexInSegment)!,
        };
    }
}

const normalizeIndexedCells = (rawCells: readonly string[], columnCount: number): readonly string[] => {
    if (rawCells.length === columnCount) {
        return rawCells;
    }
    if (rawCells.length < columnCount) {
        return [...rawCells, ...Array<string>(columnCount - rawCells.length).fill('')];
    }
    return [...rawCells.slice(0, columnCount - 1), rawCells.slice(columnCount - 1).join(',')];
};
