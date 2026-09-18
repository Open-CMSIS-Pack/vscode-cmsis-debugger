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

import { ExternalRowIdIndex, type ExternalSortEntry } from './external-swo-csv-sort';

describe('ExternalRowIdIndex', () => {
    it('merges bounded runs using natural order and stable row IDs', async () => {
        async function* entries(): AsyncGenerator<ExternalSortEntry> {
            yield { rowId: 4, sortValue: '10' };
            yield { rowId: 3, sortValue: '2' };
            yield { rowId: 1, sortValue: '2' };
            yield { rowId: 2, sortValue: '20' };
            yield { rowId: 0, sortValue: '1' };
        }

        const index = await ExternalRowIdIndex.create(entries(), 'ascending', { runRowLimit: 2 });
        try {
            expect(index.rowCount).toBe(5);
            await expect(index.getRowIds(0, 5)).resolves.toEqual([0, 1, 3, 4, 2]);
            await expect(index.getRowIds(1, 4)).resolves.toEqual([1, 3, 4]);
        } finally {
            await index.dispose();
        }
    });

    it('merges descending runs while keeping equal values in source order', async () => {
        async function* entries(): AsyncGenerator<ExternalSortEntry> {
            yield { rowId: 0, sortValue: '1' };
            yield { rowId: 2, sortValue: '10' };
            yield { rowId: 1, sortValue: '10' };
        }

        const index = await ExternalRowIdIndex.create(entries(), 'descending', { runRowLimit: 1 });
        try {
            await expect(index.getRowIds(0, 3)).resolves.toEqual([1, 2, 0]);
        } finally {
            await index.dispose();
        }
    });

    it('profiles async entry production separately from run creation', async () => {
        async function* delayedEntries(): AsyncGenerator<ExternalSortEntry> {
            await new Promise<void>(resolve => setTimeout(resolve, 30));
            yield { rowId: 0, sortValue: 'value' };
        }

        const index = await ExternalRowIdIndex.create(delayedEntries(), 'ascending');
        try {
            expect(index.scanMs).toBeGreaterThanOrEqual(20);
            expect(index.scanMs).toBeGreaterThan(index.writeRunsMs);
            expect(index.mergeRunsMs).toBeGreaterThanOrEqual(0);
        } finally {
            await index.dispose();
        }
    });
});
