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

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexedSwoCsvRowStore } from './indexed-swo-csv-row-store';

describe('IndexedSwoCsvRowStore', () => {
    it('indexes and reads quoted records from disk', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        await writeFile(filePath, 'cycles,note\r\n12,"first line\nsecond line"\r\n13,"said ""retry"""\r\n14,extra,value\r\n', 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            expect(store.columns).toEqual(['cycles', 'note']);
            expect(store.rowCount).toBe(3);
            expect(store.malformedRowCount).toBe(1);
            await expect(store.getRows(0, 3)).resolves.toEqual([
                { sourceRowIndex: 0, cells: ['12', 'first line\nsecond line'] },
                { sourceRowIndex: 1, cells: ['13', 'said "retry"'] },
                { sourceRowIndex: 2, cells: ['14', 'extra,value'] },
            ]);
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it('filters and sorts an indexed view while preserving source row indexes', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        await writeFile(filePath, 'cycles,type\n10,Event\n2,Message\n2,Event\n', 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            await store.applyView([{ columnIndex: 1, value: 'event' }], { columnIndex: 0, direction: 'ascending' });
            expect(store.rowCount).toBe(2);
            await expect(store.getRows(0, 2)).resolves.toEqual([
                { sourceRowIndex: 2, cells: ['2', 'Event'] },
                { sourceRowIndex: 0, cells: ['10', 'Event'] },
            ]);

            await store.applyView([], { columnIndex: null, direction: 'descending' });
            expect((await store.getRows(0, 3)).map(row => row.sourceRowIndex)).toEqual([2, 1, 0]);

            await store.applyView([{ columnIndex: 1, value: 'event' }], null);
            expect((await store.getRows(0, 2)).map(row => row.sourceRowIndex)).toEqual([0, 2]);
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it('keeps the most recently requested view when updates overlap', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        const rows = Array.from({ length: 5_000 }, (_, index) => `${index},${index % 2 === 0 ? 'Event' : 'Message'}\n`);
        await writeFile(filePath, `cycles,type\n${rows.join('')}`, 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            const filteringView = store.applyView([{ columnIndex: 1, value: 'event' }], null);
            const resetView = store.applyView([], null);

            await Promise.all([filteringView, resetView]);

            expect(store.rowCount).toBe(5_000);
            expect((await store.getRows(0, 2)).map(row => row.cells[1])).toEqual(['Event', 'Message']);
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });
});
