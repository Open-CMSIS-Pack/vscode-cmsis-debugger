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
import type { SwoCsvRowStore } from './swo-csv-row-store';
import { serializeSwoCsvRow } from './swo-csv-table';

export type CopySwoCsvRowsResult = 'copied' | 'invalid' | 'cancelled';

export const copySwoCsvRows = async (
    intervals: readonly RowSelectionInterval[],
    rowStore: SwoCsvRowStore,
    writeText: (value: string) => Thenable<void>,
    isActive: () => boolean,
    batchSize = 10_000,
): Promise<CopySwoCsvRowsResult> => {
    if (!areValidRowSelectionIntervals(intervals, rowStore.rowCount) || !Number.isInteger(batchSize) || batchSize <= 0) {
        return 'invalid';
    }
    const lines: string[] = [];
    for (const interval of intervals) {
        for (let start = interval.start; start <= interval.end; start += batchSize) {
            const rows = await rowStore.getRows(start, Math.min(start + batchSize, interval.end + 1));
            if (!isActive()) {
                return 'cancelled';
            }
            lines.push(...rows.map(serializeSwoCsvRow));
        }
    }
    if (!isActive()) {
        return 'cancelled';
    }
    await writeText(`${lines.join(EOL)}${EOL}`);
    return 'copied';
};
