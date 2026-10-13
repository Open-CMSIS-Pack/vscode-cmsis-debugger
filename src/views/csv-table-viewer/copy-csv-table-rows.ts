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

import { EOL } from 'node:os';
import { areValidRowSelectionIntervals, type RowSelectionInterval } from './row-selection';
import type { CsvTableRowStore } from './csv-table-row-store';
import { serializeCsvTableRow } from './csv-table';

const MAX_COPY_BYTES = 50 * 1024 * 1024;

export type CopyCsvTableRowsResult = 'copied' | 'invalid' | 'cancelled' | 'too-large';

export const copyCsvTableRows = async (
    intervals: readonly RowSelectionInterval[],
    rowStore: CsvTableRowStore,
    writeText: (value: string) => Thenable<void>,
    isActive: () => boolean,
    batchSize = 10_000,
    maxBytes = MAX_COPY_BYTES,
): Promise<CopyCsvTableRowsResult> => {
    if (!areValidRowSelectionIntervals(intervals, rowStore.rowCount)
        || !Number.isInteger(batchSize) || batchSize <= 0
        || !Number.isInteger(maxBytes) || maxBytes <= 0) {
        return 'invalid';
    }
    const lines: string[] = [];
    let byteLength = 0;
    for (const interval of intervals) {
        for (let start = interval.start; start <= interval.end; start += batchSize) {
            const rows = await rowStore.getRows(start, Math.min(start + batchSize, interval.end + 1));
            if (!isActive()) {
                return 'cancelled';
            }
            for (const row of rows) {
                const line = serializeCsvTableRow(row);
                byteLength += Buffer.byteLength(line, 'utf8') + Buffer.byteLength(EOL, 'utf8');
                if (byteLength > maxBytes) {
                    return 'too-large';
                }
                lines.push(line);
            }
        }
    }
    if (!isActive()) {
        return 'cancelled';
    }
    await writeText(`${lines.join(EOL)}${EOL}`);
    return 'copied';
};
