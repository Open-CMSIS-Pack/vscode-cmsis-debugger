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

import { filterSwoCsvRows, parseSwoCsv, parseSwoCsvAsyncLines, parseSwoCsvChunks, parseSwoCsvLines, sortSwoCsvRows } from './swo-csv-table';

describe('parseSwoCsv', () => {
    it('parses known unquoted rows and preserves source row indexes', () => {
        const table = parseSwoCsv('cycles,stream,type\n12,main,event\n13,worker,message\n');

        expect(table.columns).toEqual(['cycles', 'stream', 'type']);
        expect(table.rows).toEqual([
            { sourceRowIndex: 0, cells: ['12', 'main', 'event'] },
            { sourceRowIndex: 1, cells: ['13', 'worker', 'message'] },
        ]);
        expect(table.malformedRowCount).toBe(0);
    });

    it('pads short rows and combines surplus values into the final column', () => {
        const table = parseSwoCsv('cycles,stream,note\n12,main\n13,worker,a,b\n');

        expect(table.rows).toEqual([
            { sourceRowIndex: 0, cells: ['12', 'main', ''] },
            { sourceRowIndex: 1, cells: ['13', 'worker', 'a,b'] },
        ]);
        expect(table.malformedRowCount).toBe(2);
    });

    it('parses quoted commas and escaped quotes without marking rows malformed', () => {
        const table = parseSwoCsv('cycles,stream,note\n12,main,"decoder received a,b and said ""retry"""\n');

        expect(table.rows).toEqual([
            { sourceRowIndex: 0, cells: ['12', 'main', 'decoder received a,b and said "retry"'] },
        ]);
        expect(table.malformedRowCount).toBe(0);
    });

    it('parses line iterables without concatenating their input', () => {
        const table = parseSwoCsvLines(['cycles,type', '12,event', '13,message']);

        expect(table.rows).toHaveLength(2);
        expect(table.rows[1]).toEqual({ sourceRowIndex: 1, cells: ['13', 'message'] });
    });

    it('parses asynchronous line iterables incrementally', async () => {
        async function* lines(): AsyncGenerator<string> {
            yield 'cycles,type';
            yield '12,event';
            yield '13,message';
        }

        const table = await parseSwoCsvAsyncLines(lines());

        expect(table.rows).toHaveLength(2);
        expect(table.rows[1]).toEqual({ sourceRowIndex: 1, cells: ['13', 'message'] });
    });

    it('parses chunks across record, escaped quote, and CRLF boundaries', async () => {
        async function* chunks(): AsyncGenerator<string> {
            yield 'cycles,note\r';
            yield '\n12,"first line\nsecond ';
            yield 'line with "';
            yield '"quoted"" text"\r';
            yield '\n13,done';
        }

        const table = await parseSwoCsvChunks(chunks());

        expect(table.rows).toEqual([
            { sourceRowIndex: 0, cells: ['12', 'first line\nsecond line with "quoted" text'] },
            { sourceRowIndex: 1, cells: ['13', 'done'] },
        ]);
        expect(table.malformedRowCount).toBe(0);
    });
});


describe('filterSwoCsvRows', () => {
    it('uses case-insensitive substring matching and AND semantics', () => {
        const table = parseSwoCsv('stream,type\nMain,Event\nmain,Message\nworker,Event\n');

        expect(filterSwoCsvRows(table.rows, [
            { columnIndex: 0, value: 'main' },
            { columnIndex: 1, value: 'event' },
        ])).toEqual([{ sourceRowIndex: 0, cells: ['Main', 'Event'] }]);
    });
});

describe('sortSwoCsvRows', () => {
    const rows = parseSwoCsv('value,type\n10,event\n2,message\n2,event\n').rows;

    it('sorts values naturally and preserves file order for equal values', () => {
        expect(sortSwoCsvRows(rows, { columnIndex: 0, direction: 'ascending' }).map(row => row.sourceRowIndex)).toEqual([1, 2, 0]);
    });

    it('sorts by source row index', () => {
        expect(sortSwoCsvRows(rows, { columnIndex: null, direction: 'descending' }).map(row => row.sourceRowIndex)).toEqual([2, 1, 0]);
    });
});
