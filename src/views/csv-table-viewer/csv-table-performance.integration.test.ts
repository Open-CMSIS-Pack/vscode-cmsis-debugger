/* eslint-disable security/detect-non-literal-fs-filename */
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

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexedCsvTableRowStore } from './indexed-csv-table-row-store';
import { getCsvTableScrollGeometry, CSV_TABLE_MAX_SCROLL_HEIGHT } from './csv-table-scroll-geometry';

const ROW_BLOCK_SIZE = 10_000;
const ROW_BLOCK_COUNT = 125;
const TOTAL_ROW_COUNT = ROW_BLOCK_SIZE * ROW_BLOCK_COUNT + 1;

describe('SWO CSV generated-file performance integration', () => {
    it('covers segmented indexing, compressed visible reads, views, cancellation, and cleanup', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-performance-'));
        const filePath = join(temporaryDirectory, 'generated.swo.csv');
        const rowBlock = Array.from(
            { length: ROW_BLOCK_SIZE },
            (_, rowIndex) => `${rowIndex},${rowIndex === ROW_BLOCK_SIZE - 1 ? 'Target' : 'Event'}\n`,
        ).join('');
        await writeFile(filePath, `cycles,type\n${rowBlock.repeat(ROW_BLOCK_COUNT)}final,Target\n`, 'utf8');

        let store: IndexedCsvTableRowStore | undefined;
        try {
            store = await IndexedCsvTableRowStore.create(filePath);
            await store.waitForIndexing();

            expect(store.sourceRowCount).toBe(TOTAL_ROW_COUNT);
            expect(store.rowCount).toBe(TOTAL_ROW_COUNT);
            await expect(store.getRows(65_535, 65_538)).resolves.toEqual([
                { sourceRowIndex: 65_535, cells: ['5535', 'Event'] },
                { sourceRowIndex: 65_536, cells: ['5536', 'Event'] },
                { sourceRowIndex: 65_537, cells: ['5537', 'Event'] },
            ]);

            const geometry = getCsvTableScrollGeometry(store.rowCount, CSV_TABLE_MAX_SCROLL_HEIGHT / 2, 600);
            expect(geometry.logicalTableHeight).toBeGreaterThan(CSV_TABLE_MAX_SCROLL_HEIGHT);
            expect(geometry.scrollHeight).toBe(CSV_TABLE_MAX_SCROLL_HEIGHT);
            expect(geometry.scrollScale).toBeGreaterThan(1);
            await expect(store.getRows(geometry.firstVisibleRow, geometry.firstVisibleRow + 2)).resolves.toEqual([
                { sourceRowIndex: 625_000, cells: ['5000', 'Event'] },
                { sourceRowIndex: 625_001, cells: ['5001', 'Event'] },
            ]);

            await store.applyView([{ columnIndex: 1, value: 'target', match: 'exact' }], null);
            expect(store.rowCount).toBe(ROW_BLOCK_COUNT + 1);
            await expect(store.getRows(0, 1)).resolves.toEqual([
                { sourceRowIndex: 9_999, cells: ['9999', 'Target'] },
            ]);

            await store.applyView(
                [{ columnIndex: 1, value: 'target', match: 'exact' }],
                { columnIndex: 0, direction: 'descending' },
            );
            await expect(store.getRows(0, 1)).resolves.toEqual([
                { sourceRowIndex: TOTAL_ROW_COUNT - 1, cells: ['final', 'Target'] },
            ]);

            const controller = new AbortController();
            controller.abort();
            await expect(store.applyView([{ columnIndex: 1, value: 'event' }], null, controller.signal))
                .rejects.toMatchObject({ name: 'AbortError' });

            await store.dispose();
            store = undefined;
            const cancellingStore = await IndexedCsvTableRowStore.create(filePath);
            expect(cancellingStore.isIndexing).toBe(true);
            await cancellingStore.dispose();
            await cancellingStore.waitForIndexing();
            expect(cancellingStore.isIndexing).toBe(false);
        } finally {
            await store?.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }

        await expect(stat(temporaryDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    }, 60_000);
});
