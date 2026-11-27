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
import { findCsvTableMatch, getCsvTableCellMatches, type CsvTableSearchMatch } from './csv-table-search';

const createStore = (cells: readonly (readonly string[])[]): InMemoryCsvTableRowStore => new InMemoryCsvTableRowStore({
    columns: ['event', 'value'],
    malformedRowCount: 0,
    rows: cells.map((rowCells, sourceRowIndex) => ({ sourceRowIndex, cells: rowCells })),
});

const find = (store: InMemoryCsvTableRowStore, direction: 'next' | 'previous' = 'next', after: CsvTableSearchMatch | null = null): Promise<CsvTableSearchMatch | null> => findCsvTableMatch(store, 'a', direction, after, new AbortController().signal);

describe('getCsvTableCellMatches', () => {
    it('stops collecting after 128 highlights even for a million occurrences', () => {
        const value = 'a'.repeat(1_000_000);
        const exec = jest.spyOn(RegExp.prototype, 'exec');
        try {
            const matches = getCsvTableCellMatches(value, 'a');
            expect(exec.mock.calls.filter(([input]) => input === value)).toHaveLength(128);
            expect(matches).toHaveLength(128);
            expect(matches[0]).toEqual({ start: 0, end: 1 });
            expect(matches.at(-1)).toEqual({ start: 127, end: 128 });
        } finally {
            exec.mockRestore();
        }
    });

    it('preserves a late active occurrence within the highlight budget', () => {
        const active = { start: 999_999, end: 1_000_000 };
        const matches = getCsvTableCellMatches('a'.repeat(1_000_000), 'a', active);
        expect(matches).toHaveLength(128);
        expect(matches.at(-2)).toEqual({ start: 126, end: 127 });
        expect(matches.at(-1)).toEqual(active);
    });

    it('does not duplicate an active occurrence already collected', () => {
        const matches = getCsvTableCellMatches('a'.repeat(128), 'a', { start: 63, end: 64 });
        expect(matches).toEqual(Array.from({ length: 128 }, (_, index) => ({ start: index, end: index + 1 })));
    });

    it('searches literal text rather than regular expressions', () => {
        expect(getCsvTableCellMatches('x [a].* X [A].*', '[a].*')).toEqual([{ start: 2, end: 7 }, { start: 10, end: 15 }]);
        expect(getCsvTableCellMatches('a\\b a\\B', 'a\\b')).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }]);
    });

    it('preserves original UTF-16 offsets with case folding and supplementary characters', () => {
        expect(getCsvTableCellMatches('İ😀Aa', 'a')).toEqual([{ start: 3, end: 4 }, { start: 4, end: 5 }]);
        expect(getCsvTableCellMatches('x😀😀', '😀')).toEqual([{ start: 1, end: 3 }, { start: 3, end: 5 }]);
        expect(getCsvTableCellMatches('KKk', 'k')).toEqual([{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]);
    });

    it('returns nonoverlapping matches and handles empty or missing queries', () => {
        expect(getCsvTableCellMatches('aaaaa', 'aa')).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
        expect(getCsvTableCellMatches('abc', '')).toEqual([]);
        expect(getCsvTableCellMatches('', 'x')).toEqual([]);
        expect(getCsvTableCellMatches('abc', 'missing')).toEqual([]);
    });
});

describe('findCsvTableMatch', () => {
    const expected: readonly CsvTableSearchMatch[] = [
        { rowIndex: 0, sourceRowIndex: 0, columnIndex: 0, start: 0, end: 1 },
        { rowIndex: 0, sourceRowIndex: 0, columnIndex: 0, start: 2, end: 3 },
        { rowIndex: 0, sourceRowIndex: 0, columnIndex: 1, start: 1, end: 2 },
        { rowIndex: 2, sourceRowIndex: 2, columnIndex: 1, start: 0, end: 1 },
    ];

    it.each(['next', 'previous'] as const)('navigates every occurrence in %s order and wraps', async direction => {
        const store = createStore([['a a', 'xa'], ['none', ''], ['', 'A']]);
        const ordered = direction === 'next' ? expected : expected.toReversed();
        let match: CsvTableSearchMatch | null = null;
        for (const target of [...ordered, ...ordered]) {
            match = await find(store, direction, match);
            expect(match).toEqual(target);
        }
    });

    it.each(['next', 'previous'] as const)('wraps a sole result in %s direction', async direction => {
        const store = createStore([['', 'A']]);
        const match = await find(store, direction);
        expect(match).not.toBeNull();
        expect(await find(store, direction, match)).toEqual(match);
    });

    it.each(['next', 'previous'] as const)('includes the selected row when starting in %s direction', async direction => {
        const store = createStore([['a', ''], ['a', ''], ['a', '']]);
        expect(await findCsvTableMatch(store, 'a', direction, null, new AbortController().signal, { startRowIndex: 1 }))
            .toEqual({ rowIndex: 1, sourceRowIndex: 1, columnIndex: 0, start: 0, end: 1 });
    });

    it.each(['next', 'previous'] as const)('wraps from a selected row without a match in %s direction', async direction => {
        const store = createStore(direction === 'next' ? [['a', ''], ['none', '']] : [['none', ''], ['a', '']]);
        const startRowIndex = direction === 'next' ? 1 : 0;
        expect(await findCsvTableMatch(store, 'a', direction, null, new AbortController().signal, { startRowIndex }))
            .toEqual(expect.objectContaining({ rowIndex: 1 - startRowIndex }));
        expect(await findCsvTableMatch(store, 'missing', direction, null, new AbortController().signal, { startRowIndex })).toBeNull();
    });

    it.each(['next', 'previous'] as const)('retains the exact confirmed occurrence when editing the query in %s direction', async direction => {
        const store = createStore([['a aa aa', '']]);
        const after = { rowIndex: 0, sourceRowIndex: 0, columnIndex: 0, start: 5, end: 7 };
        expect(await findCsvTableMatch(store, 'a', direction, after, new AbortController().signal, { includeAfter: true }))
            .toEqual({ ...after, end: 6 });
    });

    it('advances from a confirmed occurrence when the edited query no longer matches there', async () => {
        const store = createStore([['before target', ''], ['replacement', '']]);
        const after = { rowIndex: 0, sourceRowIndex: 0, columnIndex: 0, start: 7, end: 13 };
        expect(await findCsvTableMatch(store, 'replacement', 'next', after, new AbortController().signal, { includeAfter: true }))
            .toEqual(expect.objectContaining({ rowIndex: 1, start: 0, end: 11 }));
    });

    it('scans offscreen rows with bounded range requests and no retained match list', async () => {
        const store = createStore(Array.from({ length: 1025 }, (_, row) => [row === 1024 ? 'a' : 'none', '']));
        const getRows = jest.spyOn(store, 'getRows');
        expect(await find(store)).toEqual({ rowIndex: 1024, sourceRowIndex: 1024, columnIndex: 0, start: 0, end: 1 });
        expect(getRows.mock.calls.length).toBeGreaterThan(1);
        expect(getRows.mock.calls.every(([start, end]) => end - start <= 128)).toBe(true);
        expect(await find(store, 'previous')).toEqual({ rowIndex: 1024, sourceRowIndex: 1024, columnIndex: 0, start: 0, end: 1 });
    });

    it('reports no result for an empty view, empty query, or missing text', async () => {
        expect(await find(createStore([]))).toBeNull();
        const store = createStore([['none', '']]);
        expect(await find(store)).toBeNull();
        expect(await findCsvTableMatch(store, '', 'next', null, new AbortController().signal)).toBeNull();
    });

    it('keeps source identity when the visible rows are filtered and sorted', async () => {
        const store = createStore([['z a', 'keep'], ['b a', 'drop'], ['c a', 'keep']]);
        await store.applyView([{ columnIndex: 1, value: 'keep' }], { columnIndex: 0, direction: 'ascending' });
        expect(await find(store)).toEqual({ rowIndex: 0, sourceRowIndex: 2, columnIndex: 0, start: 2, end: 3 });
    });

    it('checks cancellation before and after row I/O', async () => {
        const store = createStore([['a', '']]);
        const controller = new AbortController();
        controller.abort();
        const getRows = jest.spyOn(store, 'getRows');
        await expect(findCsvTableMatch(store, 'a', 'next', null, controller.signal)).rejects.toThrow();
        expect(getRows).not.toHaveBeenCalled();
        const duringRead = new AbortController();
        getRows.mockImplementationOnce(async () => {
            duringRead.abort();
            return [{ sourceRowIndex: 0, cells: ['a'] }];
        });
        await expect(findCsvTableMatch(store, 'a', 'next', null, duringRead.signal)).rejects.toThrow();
    });

    it.each(['next', 'previous'] as const)('does not schedule timers during a %s scan within the time budget', async direction => {
        const store = createStore(Array.from({ length: 100_000 }, () => ['none', '']));
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        const timer = jest.spyOn(globalThis, 'setTimeout');
        try {
            expect(await find(store, direction)).toBeNull();
            expect(timer).not.toHaveBeenCalled();
        } finally {
            timer.mockRestore();
            now.mockRestore();
        }
    });

    it('resets the time budget after yielding instead of yielding at every checkpoint', async () => {
        const store = createStore(Array.from({ length: 2048 }, () => ['none', '']));
        const now = jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(8);
        const timer = jest.spyOn(globalThis, 'setTimeout');
        try {
            expect(await find(store)).toBeNull();
            expect(timer).toHaveBeenCalledTimes(1);
        } finally {
            timer.mockRestore();
            now.mockRestore();
        }
    });

    it('yields for cancellation during an in-memory scan', async () => {
        const store = createStore(Array.from({ length: 2048 }, () => ['none', '']));
        const controller = new AbortController();
        const now = jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(8);
        const timer = setTimeout(() => controller.abort(), 0);
        try {
            await expect(findCsvTableMatch(store, 'a', 'next', null, controller.signal)).rejects.toThrow();
        } finally {
            clearTimeout(timer);
            now.mockRestore();
        }
    });

    it('yields for cancellation while scanning many occurrences in one cell backwards', async () => {
        const store = createStore([['a'.repeat(20000), '']]);
        const controller = new AbortController();
        const now = jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(8);
        const timer = setTimeout(() => controller.abort(), 0);
        try {
            await expect(findCsvTableMatch(store, 'a', 'previous', null, controller.signal)).rejects.toThrow();
        } finally {
            clearTimeout(timer);
            now.mockRestore();
        }
    });

    it('propagates row-store failures', async () => {
        const store = createStore([['a', '']]);
        jest.spyOn(store, 'getRows').mockRejectedValue(new Error('read failed'));
        await expect(find(store)).rejects.toThrow('read failed');
    });
});
