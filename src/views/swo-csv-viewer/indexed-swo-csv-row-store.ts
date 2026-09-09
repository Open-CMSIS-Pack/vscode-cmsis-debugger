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
import { ExternalRowIdIndex, type ExternalSortEntry } from './external-swo-csv-sort';
import type { SwoCsvRowStore, SwoCsvViewTiming } from './swo-csv-row-store';
import { compareSwoCsvSortValues, parseSwoCsvRecord, type SwoCsvFilter, type SwoCsvRow, type SwoCsvSort } from './swo-csv-table';

const VIEW_SCAN_BATCH_SIZE = 4096;
const EXTERNAL_SORT_FILE_SIZE_LIMIT = 300 * 1024 * 1024;
const INDEX_SEGMENT_SIZE = 65_536;

interface CsvRecordIndex {
    readonly columns: readonly string[];
    readonly locations: SegmentedRecordLocations;
    readonly malformedRowCount: number;
}

export class IndexedSwoCsvRowStore implements SwoCsvRowStore {
    private viewRowIds: Uint32Array | null = null;
    private externalView: ExternalRowIdIndex | null = null;
    private viewUpdate = Promise.resolve();

    private constructor(
        private readonly fileHandle: FileHandle,
        private readonly index: CsvRecordIndex,
        private readonly fileSize: number,
    ) { }

    public static async create(filePath: string): Promise<IndexedSwoCsvRowStore> {
        const [index, fileStat] = await Promise.all([buildCsvRecordIndex(filePath), stat(filePath)]);
        // The path originates from a VS Code file URI.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fileHandle = await open(filePath, 'r');
        return new IndexedSwoCsvRowStore(fileHandle, index, fileStat.size);
    }

    public get columns(): readonly string[] {
        return this.index.columns;
    }

    public get rowCount(): number {
        return this.externalView?.rowCount ?? this.viewRowIds?.length ?? this.index.locations.length;
    }

    public get malformedRowCount(): number {
        return this.index.malformedRowCount;
    }

    public async applyView(filters: readonly SwoCsvFilter[], sort: SwoCsvSort | null): Promise<SwoCsvViewTiming> {
        let completeUpdate: () => void = () => undefined;
        const previousUpdate = this.viewUpdate;
        this.viewUpdate = new Promise<void>(resolve => {
            completeUpdate = resolve;
        });
        await previousUpdate;
        try {
            return await this.applyViewInternal(filters, sort);
        } finally {
            completeUpdate();
        }
    }

    public async getRows(start: number, end: number): Promise<readonly SwoCsvRow[]> {
        if (this.externalView !== null) {
            const rowIds = await this.externalView.getRowIds(start, end);
            return await Promise.all(rowIds.map(rowId => this.getRequiredSourceRow(rowId)));
        }
        if (this.viewRowIds === null) {
            return await this.readSourceRows(start, Math.min(end, this.index.locations.length));
        }
        return await Promise.all(Array.from(this.viewRowIds.subarray(start, end), async rowId => await this.getRequiredSourceRow(rowId)));
    }

    public async getSourceRow(sourceRowIndex: number): Promise<SwoCsvRow | undefined> {
        if (sourceRowIndex < 0 || sourceRowIndex >= this.index.locations.length) {
            return undefined;
        }
        return await this.getRequiredSourceRow(sourceRowIndex);
    }

    public async dispose(): Promise<void> {
        this.viewRowIds = null;
        await this.replaceExternalView(null);
        await this.fileHandle.close();
    }

    private async applyViewInternal(filters: readonly SwoCsvFilter[], sort: SwoCsvSort | null): Promise<SwoCsvViewTiming> {
        const applyStartedAt = performance.now();
        const activeFilters = filters
            .filter(filter => filter.value.length > 0)
            .map(filter => ({ ...filter, value: filter.value.toLocaleLowerCase() }));
        if (activeFilters.length === 0 && sort === null) {
            await this.replaceExternalView(null);
            this.viewRowIds = null;
            return { store: 'indexed', scanMs: 0, sortMs: 0, materializeMs: 0, matchedRows: this.rowCount };
        }

        if (this.fileSize > EXTERNAL_SORT_FILE_SIZE_LIMIT && sort?.columnIndex !== null && sort !== null) {
            const externalView = await ExternalRowIdIndex.create(
                this.scanMatchingSortEntries(activeFilters, sort.columnIndex),
                sort.direction,
            );
            await this.replaceExternalView(externalView);
            this.viewRowIds = null;
            return {
                store: 'external-merge',
                scanMs: externalView.writeRunsMs,
                sortMs: externalView.mergeRunsMs,
                materializeMs: performance.now() - applyStartedAt - externalView.writeRunsMs - externalView.mergeRunsMs,
                matchedRows: externalView.rowCount,
                runCount: externalView.runCount,
                writeRunsMs: externalView.writeRunsMs,
                mergeRunsMs: externalView.mergeRunsMs,
            };
        }

        const scanStartedAt = performance.now();
        const sortedMatches: Array<{ readonly rowId: number; readonly sortValue: string }> = [];
        const matchingRowIds: number[] = [];
        const sortByValue = sort?.columnIndex !== null && sort !== null;
        for (let start = 0; start < this.index.locations.length; start += VIEW_SCAN_BATCH_SIZE) {
            const rows = await this.readSourceRows(start, Math.min(start + VIEW_SCAN_BATCH_SIZE, this.index.locations.length));
            for (const row of rows) {
                if (activeFilters.every(filter =>
                    (row.cells[filter.columnIndex] ?? '').toLocaleLowerCase().includes(filter.value)
                )) {
                    if (sortByValue) {
                        sortedMatches.push({ rowId: row.sourceRowIndex, sortValue: row.cells[sort.columnIndex] ?? '' });
                    } else {
                        matchingRowIds.push(row.sourceRowIndex);
                    }
                }
            }
        }
        const scanMs = performance.now() - scanStartedAt;

        const sortStartedAt = performance.now();
        if (sort !== null) {
            const direction = sort.direction === 'ascending' ? 1 : -1;
            sortedMatches.sort((left, right) => {
                const comparison = compareSwoCsvSortValues(left.sortValue, right.sortValue);
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
        await this.replaceExternalView(null);
        this.viewRowIds = viewRowIds;
        return {
            store: 'indexed',
            scanMs,
            sortMs,
            materializeMs: performance.now() - materializeStartedAt,
            matchedRows: viewRowIds.length,
        };
    }

    private async *scanMatchingSortEntries(
        activeFilters: readonly SwoCsvFilter[],
        columnIndex: number,
    ): AsyncGenerator<ExternalSortEntry> {
        for (let start = 0; start < this.index.locations.length; start += VIEW_SCAN_BATCH_SIZE) {
            const rows = await this.readSourceRows(start, Math.min(start + VIEW_SCAN_BATCH_SIZE, this.index.locations.length));
            for (const row of rows) {
                if (activeFilters.every(filter =>
                    (row.cells[filter.columnIndex] ?? '').toLocaleLowerCase().includes(filter.value)
                )) {
                    yield { rowId: row.sourceRowIndex, sortValue: row.cells[columnIndex] ?? '' };
                }
            }
        }
    }

    private async replaceExternalView(replacement: ExternalRowIdIndex | null): Promise<void> {
        const previous = this.externalView;
        this.externalView = replacement;
        if (previous !== null) {
            await previous.dispose();
        }
    }

    private async getRequiredSourceRow(sourceRowIndex: number): Promise<SwoCsvRow> {
        const rows = await this.readSourceRows(sourceRowIndex, sourceRowIndex + 1);
        const row = rows[0];
        if (row === undefined) {
            throw new Error(`CSV row ${sourceRowIndex} could not be read`);
        }
        return row;
    }

    private async readSourceRows(start: number, end: number): Promise<readonly SwoCsvRow[]> {
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
        const rows: SwoCsvRow[] = [];
        for (let sourceRowIndex = start; sourceRowIndex < end; sourceRowIndex += 1) {
            const location = this.index.locations.get(sourceRowIndex);
            if (location === undefined) {
                break;
            }
            const relativeOffset = location.offset - first.offset;
            const record = buffer.toString('utf8', relativeOffset, relativeOffset + location.length);
            rows.push({
                sourceRowIndex,
                cells: normalizeIndexedCells(parseSwoCsvRecord(record), this.columns.length),
            });
        }
        return rows;
    }
}

const buildCsvRecordIndex = async (filePath: string): Promise<CsvRecordIndex> => {
    const records = new SegmentedRecordLocations();
    let columns: readonly string[] = [];
    let malformedRowCount = 0;
    let recordOffset = 0;
    let byteOffset = 0;
    let insideQuotes = false;
    let pendingQuote = false;
    let pendingCarriageReturn = false;
    let recordHasContent = false;
    let pendingRecordParts: Buffer[] = [];

    const addRecord = (endOffset: number): void => {
        if (recordHasContent) {
            const rawCells = parseSwoCsvRecord(Buffer.concat(pendingRecordParts).toString('utf8'));
            if (columns.length === 0) {
                columns = rawCells;
            } else {
                if (rawCells.length !== columns.length) {
                    malformedRowCount += 1;
                }
                records.push(recordOffset, endOffset - recordOffset);
            }
        }
        pendingRecordParts = [];
        recordHasContent = false;
        recordOffset = endOffset;
    };

    // The path originates from a VS Code file URI.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stream = createReadStream(filePath);
    try {
        for await (const chunk of stream) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            let segmentStart = 0;
            for (let index = 0; index < buffer.length; index += 1) {
                const value = buffer[index];
                if (pendingCarriageReturn) {
                    pendingCarriageReturn = false;
                    if (value === 0x0a) {
                        recordOffset += 1;
                        segmentStart = index + 1;
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
                        if (index + 1 < buffer.length) {
                            if (buffer[index + 1] === 0x22) {
                                index += 1;
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
                    if (segmentStart < index) {
                        pendingRecordParts.push(buffer.subarray(segmentStart, index));
                    }
                    addRecord(byteOffset + index);
                    pendingCarriageReturn = value === 0x0d;
                    recordOffset = byteOffset + index + 1;
                    segmentStart = index + 1;
                } else {
                    recordHasContent = true;
                }
            }
            if (segmentStart < buffer.length) {
                pendingRecordParts.push(buffer.subarray(segmentStart));
            }
            byteOffset += buffer.length;
        }
        if (recordHasContent) {
            addRecord(byteOffset);
        }
    } finally {
        stream.destroy();
    }
    return { columns, locations: records, malformedRowCount };
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
        let offsets = this.offsetSegments[segmentIndex];
        let lengths = this.lengthSegments[segmentIndex];
        if (offsets === undefined || lengths === undefined) {
            offsets = new Float64Array(INDEX_SEGMENT_SIZE);
            lengths = new Uint32Array(INDEX_SEGMENT_SIZE);
            this.offsetSegments.push(offsets);
            this.lengthSegments.push(lengths);
        }
        offsets[indexInSegment] = offset;
        lengths[indexInSegment] = length;
        this.recordCount += 1;
    }

    public get(index: number): { readonly offset: number; readonly length: number } | undefined {
        if (index < 0 || index >= this.recordCount) {
            return undefined;
        }
        const segmentIndex = Math.floor(index / INDEX_SEGMENT_SIZE);
        const indexInSegment = index % INDEX_SEGMENT_SIZE;
        return {
            offset: this.offsetSegments[segmentIndex]![indexInSegment]!,
            length: this.lengthSegments[segmentIndex]![indexInSegment]!,
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
