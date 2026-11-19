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

/* eslint-disable security/detect-non-literal-fs-filename -- fixture paths are created in a test-owned temporary directory */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexedCsvTableRowStore } from './indexed-csv-table-row-store';
import { findCsvTableMatch } from './csv-table-search';

it('finds parsed disk-backed cells outside the viewport in filtered and sorted display order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-table-find-'));
    let store: IndexedCsvTableRowStore | undefined;
    try {
        const filePath = join(directory, 'find.swo.csv');
        const records = Array.from({ length: 300 }, (_, index) => index === 299
            ? `${index},"before, TARGET\ncontinued",keep`
            : `${index},other,${index === 298 ? 'keep' : 'drop'}`);
        await writeFile(filePath, `cycles,event,group\n${records.join('\n')}\n`, 'utf8');
        store = await IndexedCsvTableRowStore.create(filePath);
        await store.waitForIndexing();
        const signal = new AbortController().signal;
        await expect(findCsvTableMatch(store, 'target\ncontinued', 'next', null, signal)).resolves.toEqual({
            rowIndex: 299, sourceRowIndex: 299, columnIndex: 1, start: 8, end: 24,
        });
        await store.applyView([{ columnIndex: 2, value: 'keep' }], { columnIndex: 0, direction: 'descending' });
        const first = await findCsvTableMatch(store, 'target', 'next', null, signal);
        expect(first).toEqual({ rowIndex: 0, sourceRowIndex: 299, columnIndex: 1, start: 8, end: 14 });
        await expect(findCsvTableMatch(store, 'target', 'previous', first, signal)).resolves.toEqual(first);
        await store.applyView([{ columnIndex: 2, value: 'drop' }], null);
        await expect(findCsvTableMatch(store, 'target', 'next', null, signal)).resolves.toBeNull();
    } finally {
        await store?.dispose();
        await rm(directory, { recursive: true, force: true });
    }
});
