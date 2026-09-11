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
            await store.waitForIndexing();
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

    it('counts fields around quoted commas and multiline values without decoding data records', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        await writeFile(filePath, 'cycles,type,note\r\n1,Event,"a, b"\r\n2,Message,"said ""retry""\nagain"\r\n3,Event\r\n4,Event,one,extra\r\n', 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            await store.waitForIndexing();
            expect(store.rowCount).toBe(4);
            expect(store.malformedRowCount).toBe(2);
            await expect(store.getRows(0, 4)).resolves.toEqual([
                { sourceRowIndex: 0, cells: ['1', 'Event', 'a, b'] },
                { sourceRowIndex: 1, cells: ['2', 'Message', 'said "retry"\nagain'] },
                { sourceRowIndex: 2, cells: ['3', 'Event', ''] },
                { sourceRowIndex: 3, cells: ['4', 'Event', 'one,extra'] },
            ]);
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it('exposes the header before background indexing completes', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        const rows = Array.from({ length: 500_000 }, (_, index) => `${index},Event\n`);
        await writeFile(filePath, `cycles,type\n${rows.join('')}`, 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            expect(store.columns).toEqual(['cycles', 'type']);
            expect(store.isIndexing).toBe(true);
            expect(store.rowCount).toBeLessThan(500_000);
            let progressEvents = 0;
            const removeProgressListener = store.onDidIndexProgress(() => {
                progressEvents += 1;
            });
            await store.waitForIndexing();
            removeProgressListener();
            expect(progressEvents).toBeGreaterThan(0);
            expect(store.isIndexing).toBe(false);
            expect(store.rowCount).toBe(500_000);
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    }, 30_000);

    it('refreshes a partial filter after indexing without reusing incomplete cache data', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        const rows = Array.from({ length: 500_000 }, (_, index) => `${index},${index % 2 === 0 ? 'Event' : 'Message'}\n`);
        await writeFile(filePath, `cycles,type\n${rows.join('')}`, 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            expect(store.isIndexing).toBe(true);
            await store.applyView([{ columnIndex: 1, value: 'event' }], null);
            expect(store.rowCount).toBeLessThan(250_000);

            await store.waitForIndexing();
            await store.applyView([{ columnIndex: 1, value: 'event' }], null);

            expect(store.rowCount).toBe(250_000);
            expect((await store.getRows(249_999, 250_000))[0]).toEqual({
                sourceRowIndex: 499_998,
                cells: ['499998', 'Event'],
            });
        } finally {
            await store.dispose();
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    }, 30_000);

    it('filters and sorts an indexed view while preserving source row indexes', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        await writeFile(filePath, 'cycles,type\n10,Event\n2,Message\n2,Event\n', 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        try {
            await store.waitForIndexing();
            expect(store.sourceRowCount).toBe(3);
            expect(store.rowCount).toBe(3);
            await store.applyView([{ columnIndex: 1, value: 'event' }], { columnIndex: 0, direction: 'ascending' });
            expect(store.sourceRowCount).toBe(3);
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
            await store.waitForIndexing();
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

    it('cancels an active index when disposed', async () => {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swo-csv-row-store-'));
        const filePath = join(temporaryDirectory, 'trace.swo.csv');
        const rows = Array.from({ length: 500_000 }, (_, index) => `${index},Event\n`);
        await writeFile(filePath, `cycles,type\n${rows.join('')}`, 'utf8');

        const store = await IndexedSwoCsvRowStore.create(filePath);
        expect(store.isIndexing).toBe(true);
        await store.dispose();
        await store.waitForIndexing();
        expect(store.isIndexing).toBe(false);
        await rm(temporaryDirectory, { recursive: true, force: true });
    }, 30_000);

});
