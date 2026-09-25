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

import { InMemoryCsvTableRowStore } from './csv-table-row-store';

describe('InMemoryCsvTableRowStore', () => {
    it('exposes table metadata and supports filtered, sorted row views', async () => {
        const store = new InMemoryCsvTableRowStore({
            columns: ['value', 'type'],
            rows: [
                { sourceRowIndex: 0, cells: ['10', 'event'] },
                { sourceRowIndex: 1, cells: ['2', 'message'] },
                { sourceRowIndex: 2, cells: ['3', 'event'] },
            ],
            malformedRowCount: 1,
        });

        const timing = await store.applyView([{ columnIndex: 1, value: 'event' }], { columnIndex: 0, direction: 'descending' });

        expect(store.columns).toEqual(['value', 'type']);
        expect(store.sourceRowCount).toBe(3);
        expect(store.rowCount).toBe(2);
        expect(store.malformedRowCount).toBe(1);
        expect(store.isIndexing).toBe(false);
        expect(timing).toEqual(expect.objectContaining({ store: 'in-memory', materializeMs: 0, matchedRows: 2 }));
        await expect(store.getRows(0, 1)).resolves.toEqual([{ sourceRowIndex: 0, cells: ['10', 'event'] }]);
        await expect(store.getSourceRow(1)).resolves.toEqual({ sourceRowIndex: 1, cells: ['2', 'message'] });
        await expect(store.getSourceRow(3)).resolves.toBeUndefined();
    });

    it('does not change its view when an update is already aborted', async () => {
        const store = new InMemoryCsvTableRowStore({
            columns: ['value'],
            rows: [
                { sourceRowIndex: 0, cells: ['first'] },
                { sourceRowIndex: 1, cells: ['second'] },
            ],
            malformedRowCount: 0,
        });
        const controller = new AbortController();
        controller.abort();

        await expect(store.applyView([{ columnIndex: 0, value: 'second' }], null, controller.signal))
            .rejects.toThrow('This operation was aborted');
        await expect(store.getRows(0, 2)).resolves.toEqual([
            { sourceRowIndex: 0, cells: ['first'] },
            { sourceRowIndex: 1, cells: ['second'] },
        ]);
    });

    it('provides no-op indexing lifecycle hooks and clears its display rows on disposal', async () => {
        const store = new InMemoryCsvTableRowStore({
            columns: ['value'],
            rows: [{ sourceRowIndex: 0, cells: ['first'] }],
            malformedRowCount: 0,
        });
        const listener = jest.fn();

        const disposeListener = store.onDidIndexProgress(listener);
        disposeListener();
        await expect(store.waitForIndexing()).resolves.toBeUndefined();
        await store.dispose();

        expect(listener).not.toHaveBeenCalled();
        expect(store.rowCount).toBe(0);
        await expect(store.getRows(0, 1)).resolves.toEqual([]);
        await expect(store.getSourceRow(0)).resolves.toEqual({ sourceRowIndex: 0, cells: ['first'] });
    });
});