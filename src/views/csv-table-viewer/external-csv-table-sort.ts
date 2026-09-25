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

import { open, mkdtemp, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareCsvTableSortValues, type CsvTableSortDirection } from './csv-table';

const RUN_ROW_LIMIT = 50_000;
const RUN_KEY_BYTES_LIMIT = 16 * 1024 * 1024;
const READER_BUFFER_SIZE = 64 * 1024;
const OUTPUT_BUFFER_ROW_COUNT = 16_384;

export interface ExternalSortEntry {
    readonly rowId: number;
    readonly sortValue: string;
}

export interface ExternalSortOptions {
    readonly runRowLimit?: number;
    readonly runKeyBytesLimit?: number;
}

export class ExternalRowIdIndex {
    private constructor(
        private readonly temporaryDirectory: string,
        private readonly fileHandle: FileHandle,
        public readonly rowCount: number,
        public readonly runCount: number,
        public readonly scanMs: number,
        public readonly writeRunsMs: number,
        public readonly mergeRunsMs: number,
    ) { }

    public static async create(
        entries: AsyncIterable<ExternalSortEntry>,
        direction: CsvTableSortDirection,
        options: ExternalSortOptions = {},
    ): Promise<ExternalRowIdIndex> {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vscode-cmsis-debugger-csv-table-'));
        try {
            const { runPaths, scanMs, writeRunsMs } = await writeSortedRuns(temporaryDirectory, entries, direction, options);
            const indexPath = join(temporaryDirectory, 'row-ids.bin');
            const mergeRunsStartedAt = performance.now();
            const rowCount = await mergeRuns(runPaths, indexPath, direction);
            const mergeRunsMs = performance.now() - mergeRunsStartedAt;
            // The path is created in this store's private temporary directory.
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const fileHandle = await open(indexPath, 'r');
            return new ExternalRowIdIndex(temporaryDirectory, fileHandle, rowCount, runPaths.length, scanMs, writeRunsMs, mergeRunsMs);
        } catch (error) {
            await rm(temporaryDirectory, { recursive: true, force: true });
            throw error;
        }
    }

    public async getRowIds(start: number, end: number): Promise<readonly number[]> {
        const boundedStart = Math.max(0, Math.min(start, this.rowCount));
        const boundedEnd = Math.max(boundedStart, Math.min(end, this.rowCount));
        const buffer = Buffer.allocUnsafe((boundedEnd - boundedStart) * Uint32Array.BYTES_PER_ELEMENT);
        if (buffer.length === 0) {
            return [];
        }
        const result = await this.fileHandle.read(buffer, 0, buffer.length, boundedStart * Uint32Array.BYTES_PER_ELEMENT);
        if (result.bytesRead !== buffer.length) {
            throw new Error(`Expected ${buffer.length} row-index bytes but read ${result.bytesRead}`);
        }
        const rowIds: number[] = [];
        for (let offset = 0; offset < buffer.length; offset += Uint32Array.BYTES_PER_ELEMENT) {
            rowIds.push(buffer.readUInt32LE(offset));
        }
        return rowIds;
    }

    public async dispose(): Promise<void> {
        await this.fileHandle.close();
        await rm(this.temporaryDirectory, { recursive: true, force: true });
    }
}

const writeSortedRuns = async (
    temporaryDirectory: string,
    entries: AsyncIterable<ExternalSortEntry>,
    direction: CsvTableSortDirection,
    options: ExternalSortOptions,
): Promise<{ readonly runPaths: readonly string[]; readonly scanMs: number; readonly writeRunsMs: number }> => {
    const runPaths: string[] = [];
    const batch: ExternalSortEntry[] = [];
    let keyBytes = 0;
    let scanMs = 0;
    let writeRunsMs = 0;
    const rowLimit = options.runRowLimit ?? RUN_ROW_LIMIT;
    const keyBytesLimit = options.runKeyBytesLimit ?? RUN_KEY_BYTES_LIMIT;

    const flush = async (): Promise<void> => {
        if (batch.length === 0) {
            return;
        }
        const writeStartedAt = performance.now();
        batch.sort((left, right) => compareEntries(left, right, direction));
        const runPath = join(temporaryDirectory, `run-${runPaths.length}.bin`);
        const encodedEntries = batch.map(encodeEntry);
        // The path is created in this store's private temporary directory.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await writeFile(runPath, Buffer.concat(encodedEntries));
        runPaths.push(runPath);
        batch.length = 0;
        keyBytes = 0;
        writeRunsMs += performance.now() - writeStartedAt;
    };

    const iterator = entries[Symbol.asyncIterator]();
    while (true) {
        const scanStartedAt = performance.now();
        const next = await iterator.next();
        scanMs += performance.now() - scanStartedAt;
        if (next.done) {
            break;
        }
        const entry = next.value;
        const writeStartedAt = performance.now();
        const entryKeyBytes = Buffer.byteLength(entry.sortValue);
        if (batch.length >= rowLimit || keyBytes + entryKeyBytes > keyBytesLimit) {
            await flush();
        }
        batch.push(entry);
        keyBytes += entryKeyBytes;
        writeRunsMs += performance.now() - writeStartedAt;
    }
    await flush();
    return { runPaths, scanMs, writeRunsMs };
};

const mergeRuns = async (
    runPaths: readonly string[],
    indexPath: string,
    direction: CsvTableSortDirection,
): Promise<number> => {
    // The path is created in this store's private temporary directory.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const output = await open(indexPath, 'w');
    const readers = await Promise.all(runPaths.map(async runPath => await RunReader.create(runPath)));
    let rowCount = 0;
    let outputBuffer = Buffer.allocUnsafe(OUTPUT_BUFFER_ROW_COUNT * Uint32Array.BYTES_PER_ELEMENT);
    let outputOffset = 0;
    try {
        const current = await Promise.all(readers.map(async reader => await reader.readEntry()));
        while (true) {
            let selectedIndex = -1;
            for (let index = 0; index < current.length; index += 1) {
                const candidate = current.at(index)!;
                if (candidate !== null && (selectedIndex < 0 || compareEntries(candidate, current.at(selectedIndex)!, direction) < 0)) {
                    selectedIndex = index;
                }
            }
            if (selectedIndex < 0) {
                break;
            }
            const selected = current.at(selectedIndex)!;
            outputBuffer.writeUInt32LE(selected.rowId, outputOffset);
            outputOffset += Uint32Array.BYTES_PER_ELEMENT;
            rowCount += 1;
            if (outputOffset === outputBuffer.length) {
                await output.write(outputBuffer);
                outputBuffer = Buffer.allocUnsafe(OUTPUT_BUFFER_ROW_COUNT * Uint32Array.BYTES_PER_ELEMENT);
                outputOffset = 0;
            }
            const nextEntry = await readers.at(selectedIndex)!.readEntry();
            current.splice(selectedIndex, 1, nextEntry);
        }
        if (outputOffset > 0) {
            await output.write(outputBuffer.subarray(0, outputOffset));
        }
        return rowCount;
    } finally {
        await Promise.all(readers.map(async reader => await reader.dispose()));
        await output.close();
    }
};

class RunReader {
    private readonly buffer = Buffer.allocUnsafe(READER_BUFFER_SIZE);
    private bufferStart = 0;
    private bufferEnd = 0;
    private filePosition = 0;

    private constructor(private readonly fileHandle: FileHandle) { }

    public static async create(filePath: string): Promise<RunReader> {
        // The path is created in this store's private temporary directory.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        return new RunReader(await open(filePath, 'r'));
    }

    public async readEntry(): Promise<ExternalSortEntry | null> {
        const header = await this.readBytes(8, true);
        if (header === null) {
            return null;
        }
        const keyLength = header.readUInt32LE(0);
        const rowId = header.readUInt32LE(4);
        const key = await this.readBytes(keyLength, false);
        return { rowId, sortValue: key!.toString('utf8') };
    }

    public async dispose(): Promise<void> {
        await this.fileHandle.close();
    }

    private async readBytes(length: number, allowEndOfFile: boolean): Promise<Buffer | null> {
        const output = Buffer.allocUnsafe(length);
        let outputOffset = 0;
        while (outputOffset < length) {
            if (this.bufferStart === this.bufferEnd) {
                const result = await this.fileHandle.read(this.buffer, 0, this.buffer.length, this.filePosition);
                if (result.bytesRead === 0) {
                    if (allowEndOfFile && outputOffset === 0) {
                        return null;
                    }
                    throw new Error('Unexpected end of external sort run');
                }
                this.filePosition += result.bytesRead;
                this.bufferStart = 0;
                this.bufferEnd = result.bytesRead;
            }
            const copyLength = Math.min(length - outputOffset, this.bufferEnd - this.bufferStart);
            this.buffer.copy(output, outputOffset, this.bufferStart, this.bufferStart + copyLength);
            this.bufferStart += copyLength;
            outputOffset += copyLength;
        }
        return output;
    }
}

const encodeEntry = (entry: ExternalSortEntry): Buffer => {
    const key = Buffer.from(entry.sortValue, 'utf8');
    const buffer = Buffer.allocUnsafe(8 + key.length);
    buffer.writeUInt32LE(key.length, 0);
    buffer.writeUInt32LE(entry.rowId, 4);
    key.copy(buffer, 8);
    return buffer;
};

const compareEntries = (left: ExternalSortEntry, right: ExternalSortEntry, direction: CsvTableSortDirection): number => {
    const comparison = compareCsvTableSortValues(left.sortValue, right.sortValue);
    const directionMultiplier = direction === 'ascending' ? 1 : -1;
    return comparison === 0 ? left.rowId - right.rowId : comparison * directionMultiplier;
};
