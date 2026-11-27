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

import type { CsvTableRowStore } from './csv-table-row-store';

export interface CsvTableTextMatch {
    readonly start: number;
    readonly end: number;
}

export interface CsvTableSearchMatch extends CsvTableTextMatch {
    readonly rowIndex: number;
    readonly sourceRowIndex: number;
    readonly columnIndex: number;
}

export type CsvTableSearchDirection = 'next' | 'previous';

const SEARCH_BATCH_SIZE = 128;
const SEARCH_YIELD_BUDGET_MS = 8;
const MAX_CELL_HIGHLIGHTS = 128;

// eslint-disable-next-line security/detect-non-literal-regexp -- Escape all metacharacters so the query remains literal.
const createPattern = (query: string): RegExp => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');

export function getCsvTableCellMatches(value: string, query: string, active: CsvTableTextMatch | null = null): readonly CsvTableTextMatch[] {
    if (query.length === 0) {
        return [];
    }
    const matches: CsvTableTextMatch[] = [];
    for (const match of value.matchAll(createPattern(query))) {
        matches.push({ start: match.index, end: match.index + match[0].length });
        if (matches.length === MAX_CELL_HIGHLIGHTS) {
            break;
        }
    }
    if (active !== null && !matches.some(match => match.start === active.start && match.end === active.end)) {
        if (matches.length === MAX_CELL_HIGHLIGHTS) {
            matches.pop();
        }
        matches.push({ start: active.start, end: active.end });
        matches.sort((left, right) => left.start - right.start);
    }
    return matches;
}

const compareMatches = (left: CsvTableSearchMatch, right: CsvTableSearchMatch): number => left.rowIndex - right.rowIndex
    || left.columnIndex - right.columnIndex || left.start - right.start;

export async function findCsvTableMatch(
    store: CsvTableRowStore,
    query: string,
    direction: CsvTableSearchDirection,
    after: CsvTableSearchMatch | null,
    signal: AbortSignal,
    options: { readonly startRowIndex?: number; readonly includeAfter?: boolean } = {},
): Promise<CsvTableSearchMatch | null> {
    signal.throwIfAborted();
    if (query.length === 0 || store.rowCount === 0) {
        return null;
    }
    const pattern = createPattern(query);
    const forward = direction === 'next';
    let yieldDeadline = performance.now() + SEARCH_YIELD_BUDGET_MS;
    const yieldToCancellation = async (): Promise<void> => {
        signal.throwIfAborted();
        if (performance.now() < yieldDeadline) {
            return;
        }
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal.throwIfAborted();
        yieldDeadline = performance.now() + SEARCH_YIELD_BUDGET_MS;
    };
    let work = 0;
    const scan = async (start: number, end: number, wrapped: boolean): Promise<CsvTableSearchMatch | null> => {
        let boundary = forward ? start : end;
        while (forward ? boundary < end : boundary > start) {
            signal.throwIfAborted();
            const batchStart = forward ? boundary : Math.max(start, boundary - SEARCH_BATCH_SIZE);
            const batchEnd = forward ? Math.min(end, boundary + SEARCH_BATCH_SIZE) : boundary;
            const rows = await store.getRows(batchStart, batchEnd);
            signal.throwIfAborted();
            for (let offset = forward ? 0 : rows.length - 1; forward ? offset < rows.length : offset >= 0; offset += forward ? 1 : -1) {
                // eslint-disable-next-line security/detect-object-injection -- Offset stays within the current row batch.
                const row = rows[offset];
                for (let columnIndex = forward ? 0 : row.cells.length - 1; forward ? columnIndex < row.cells.length : columnIndex >= 0; columnIndex += forward ? 1 : -1) {
                    let previous: CsvTableSearchMatch | null = null;
                    // eslint-disable-next-line security/detect-object-injection -- Column index is bounded by the cell array.
                    for (const textMatch of row.cells[columnIndex].matchAll(pattern)) {
                        const match: CsvTableSearchMatch = {
                            rowIndex: batchStart + offset,
                            sourceRowIndex: row.sourceRowIndex,
                            columnIndex,
                            start: textMatch.index,
                            end: textMatch.index + textMatch[0].length,
                        };
                        const comparison = after === null ? 0 : compareMatches(match, after);
                        const inDirection = (forward ? comparison > 0 : comparison < 0) || (options.includeAfter === true && comparison === 0);
                        const eligible = after === null || (wrapped ? !inDirection : inDirection);
                        if (eligible) {
                            if (forward) {
                                return match;
                            }
                            previous = match;
                        }
                        if (++work % 1024 === 0) {
                            await yieldToCancellation();
                        }
                    }
                    if (previous !== null) {
                        return previous;
                    }
                    if (++work % 128 === 0) {
                        await yieldToCancellation();
                    }
                }
            }
            boundary = forward ? batchEnd : batchStart;
            await yieldToCancellation();
        }
        return null;
    };
    const hasCursor = after !== null || options.startRowIndex !== undefined;
    const cursorRow = Math.max(0, Math.min(after?.rowIndex ?? options.startRowIndex ?? 0, store.rowCount - 1));
    const result = await scan(forward && hasCursor ? cursorRow : 0, !forward && hasCursor ? cursorRow + 1 : store.rowCount, false);
    if (result !== null || !hasCursor) {
        return result;
    }
    return scan(forward ? 0 : cursorRow, forward ? cursorRow + 1 : store.rowCount, true);
}
