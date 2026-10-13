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
import { getCsvTableSelectionIdentity, restoreCsvTableSelection } from './csv-table-selection-retention';
import { EMPTY_ROW_SELECTION, selectRowRange, selectSingleRow, toggleRow } from './row-selection';

const createStore = (columns: readonly string[], rows: readonly (readonly string[])[]): InMemoryCsvTableRowStore => new InMemoryCsvTableRowStore({
    columns,
    rows: rows.map((cells, sourceRowIndex) => ({ sourceRowIndex, cells })),
    malformedRowCount: 0,
});

describe('CSV table selection retention', () => {
    it('restores selected cycles at their new row positions', async () => {
        const previous = createStore(['cycles', 'type'], [['10', 'a'], ['20', 'b'], ['30', 'c']]);
        const refreshed = createStore(['cycles', 'type'], [['5', 'new'], ['20', 'b'], ['30', 'c']]);
        const selection = toggleRow(selectSingleRow(1), 2);

        const identity = await getCsvTableSelectionIdentity(selection, previous);

        await expect(restoreCsvTableSelection(identity, refreshed)).resolves.toEqual({
            intervals: [{ start: 1, end: 2 }],
            caret: 2,
            anchor: 2,
        });
    });

    it('drops selected cycles that no longer exist', async () => {
        const previous = createStore(['cycles'], [['10'], ['20'], ['30']]);
        const refreshed = createStore(['cycles'], [['10'], ['30']]);
        const identity = await getCsvTableSelectionIdentity(selectRowRange(selectSingleRow(1), 2), previous);

        await expect(restoreCsvTableSelection(identity, refreshed)).resolves.toEqual({
            intervals: [{ start: 1, end: 1 }],
            caret: 1,
            anchor: null,
        });
    });

    it('matches duplicate cycles by occurrence order', async () => {
        const previous = createStore(['cycles'], [['10'], ['10'], ['20']]);
        const refreshed = createStore(['cycles'], [['10'], ['20'], ['10']]);
        const identity = await getCsvTableSelectionIdentity(selectSingleRow(1), previous);

        await expect(restoreCsvTableSelection(identity, refreshed)).resolves.toEqual({
            intervals: [{ start: 2, end: 2 }],
            caret: 2,
            anchor: 2,
        });
    });

    it('clears selection when either table has no cycles column', async () => {
        const withoutCycles = createStore(['type'], [['event']]);
        const withCycles = createStore(['cycles'], [['10']]);

        await expect(getCsvTableSelectionIdentity(selectSingleRow(0), withoutCycles)).resolves.toBeNull();
        await expect(restoreCsvTableSelection(null, withCycles)).resolves.toBe(EMPTY_ROW_SELECTION);
        const identity = await getCsvTableSelectionIdentity(selectSingleRow(0), withCycles);
        await expect(restoreCsvTableSelection(identity, withoutCycles)).resolves.toBe(EMPTY_ROW_SELECTION);
    });
});
