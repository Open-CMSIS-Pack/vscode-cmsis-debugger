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

import { copySwoCsvRows } from './copy-swo-csv-rows';
import { InMemorySwoCsvRowStore, type SwoCsvRowStore } from './swo-csv-row-store';

describe('copySwoCsvRows', () => {
    it('copies selected rows in current display order as valid CSV', async () => {
        const store = new InMemorySwoCsvRowStore({
            columns: ['value', 'note'],
            rows: [
                { sourceRowIndex: 0, cells: ['10', 'plain'] },
                { sourceRowIndex: 1, cells: ['2', 'with,comma'] },
                { sourceRowIndex: 2, cells: ['3', 'with "quote"'] },
            ],
            malformedRowCount: 0,
        });
        await store.applyView([], { columnIndex: 0, direction: 'ascending' });
        const writeText = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

        await expect(copySwoCsvRows([{ start: 0, end: 0 }, { start: 2, end: 2 }], store, writeText, () => true))
            .resolves.toBe('copied');
        expect(writeText).toHaveBeenCalledWith('2,"with,comma"\r\n10,plain');
    });

    it('reads large intervals in bounded batches', async () => {
        const getRows: jest.MockedFunction<SwoCsvRowStore['getRows']> = jest.fn();
        getRows
            .mockResolvedValueOnce([{ sourceRowIndex: 0, cells: ['a'] }, { sourceRowIndex: 1, cells: ['b'] }])
            .mockResolvedValueOnce([{ sourceRowIndex: 2, cells: ['c'] }]);
        const store = createRowStore(3, getRows);

        await expect(copySwoCsvRows([{ start: 0, end: 2 }], store, async () => undefined, () => true, 2))
            .resolves.toBe('copied');
        expect(getRows.mock.calls).toEqual([[0, 2], [2, 3]]);
    });

    it('rejects invalid intervals without reading or writing', async () => {
        const getRows: jest.MockedFunction<SwoCsvRowStore['getRows']> = jest.fn();
        const writeText = jest.fn<Promise<void>, [string]>();

        await expect(copySwoCsvRows([{ start: 0, end: 3 }], createRowStore(3, getRows), writeText, () => true))
            .resolves.toBe('invalid');
        expect(getRows).not.toHaveBeenCalled();
        expect(writeText).not.toHaveBeenCalled();
    });

    it('cancels clipboard publication when the store becomes stale', async () => {
        const store = createRowStore(1, async () => [{ sourceRowIndex: 0, cells: ['value'] }]);
        const writeText = jest.fn<Promise<void>, [string]>();

        await expect(copySwoCsvRows([{ start: 0, end: 0 }], store, writeText, () => false)).resolves.toBe('cancelled');
        expect(writeText).not.toHaveBeenCalled();
    });
});

const createRowStore = (rowCount: number, getRows: SwoCsvRowStore['getRows']): SwoCsvRowStore => ({
    columns: ['value'],
    rowCount,
    malformedRowCount: 0,
    applyView: async () => ({ store: 'in-memory', scanMs: 0, sortMs: 0, materializeMs: 0, matchedRows: rowCount }),
    getRows,
    getSourceRow: async () => undefined,
    dispose: async () => undefined,
});
