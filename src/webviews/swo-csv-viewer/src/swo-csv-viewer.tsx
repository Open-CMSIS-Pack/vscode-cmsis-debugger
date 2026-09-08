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

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SwoCsvFilter, SwoCsvRow, SwoCsvSort } from '../../../views/swo-csv-viewer/swo-csv-table';
import type { SwoCsvHostMessage, SwoCsvWebviewMessage } from '../../../views/swo-csv-viewer/swo-csv-protocol';
import './swo-csv-viewer.css';

declare function acquireVsCodeApi(): { postMessage: (message: SwoCsvWebviewMessage) => void };

const vscode = acquireVsCodeApi();
const ROW_HEIGHT = 24;
const FILTER_DEBOUNCE_MS = 250;

interface TableState {
    readonly columns: readonly string[];
    readonly totalRowCount: number;
    readonly malformedRowCount: number;
    readonly loading: boolean;
    readonly loadingMessage?: string;
    readonly error?: string;
}

interface ActiveColumnResize {
    readonly pointerId: number;
    readonly columnIndex: number;
    readonly startX: number;
    readonly startWidth: number;
}

const INITIAL_STATE: TableState = {
    columns: [],
    totalRowCount: 0,
    malformedRowCount: 0,
    loading: true,
};

export const SwoCsvViewer = (): JSX.Element => {
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const [tableState, setTableState] = useState<TableState>(INITIAL_STATE);
    const [rows, setRows] = useState<readonly SwoCsvRow[]>([]);
    const [rowStart, setRowStart] = useState(0);
    const [filters, setFilters] = useState<readonly SwoCsvFilter[]>([]);
    const [sort, setSort] = useState<SwoCsvSort | null>(null);
    const [columnWidths, setColumnWidths] = useState<readonly number[]>([]);
    const [tableRevision, setTableRevision] = useState(0);
    const [renderedRequestId, setRenderedRequestId] = useState<number | null>(null);
    const latestRequestId = useRef(0);
    const activeColumnResize = useRef<ActiveColumnResize | null>(null);
    const suppressSort = useRef(false);
    const clearSortSuppressionTimer = useRef<number | null>(null);
    const filterTimer = useRef<number | null>(null);
    const rowVirtualizer = useVirtualizer({
        count: tableState.totalRowCount,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 16,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();

    useEffect(() => {
        const receiveMessage = (event: MessageEvent<SwoCsvHostMessage>): void => {
            const message = event.data;
            if (message.type === 'tableState') {
                setTableState(message);
                setRows([]);
                setTableRevision(revision => revision + 1);
                setColumnWidths(widths => widths.length === message.columns.length + 1 ? widths : [72, ...message.columns.map(() => 180)]);
                return;
            }
            if (message.type === 'rows') {
                if (message.requestId !== latestRequestId.current) {
                    return;
                }
                setRows(message.rows);
                setRowStart(message.start);
                setRenderedRequestId(message.requestId);
            }
        };
        window.addEventListener('message', receiveMessage);
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', receiveMessage);
    }, []);

    useEffect(() => () => {
        if (clearSortSuppressionTimer.current !== null) {
            window.clearTimeout(clearSortSuppressionTimer.current);
        }
        if (filterTimer.current !== null) {
            window.clearTimeout(filterTimer.current);
        }
    }, []);

    useEffect(() => {
        if (renderedRequestId === null) {
            return;
        }
        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                vscode.postMessage({ type: 'rowsRendered', requestId: renderedRequestId });
            });
        });
        return () => {
            window.cancelAnimationFrame(firstFrame);
            window.cancelAnimationFrame(secondFrame);
        };
    }, [renderedRequestId]);

    useEffect(() => {
        if (tableState.loading || virtualRows.length === 0) {
            return;
        }
        const nextRequestId = latestRequestId.current + 1;
        latestRequestId.current = nextRequestId;
        vscode.postMessage({
            type: 'requestRows',
            requestId: nextRequestId,
            start: virtualRows[0].index,
            end: virtualRows.at(-1)?.index === undefined ? 0 : virtualRows.at(-1)!.index + 1,
        });
    }, [tableRevision, tableState.loading, tableState.totalRowCount, virtualRows.at(0)?.index, virtualRows.at(-1)?.index]);

    const updateFilter = (columnIndex: number, value: string): void => {
        const nextFilters = tableState.columns.map((_, index) => ({ columnIndex: index, value: index === columnIndex ? value : filters.find(filter => filter.columnIndex === index)?.value ?? '' }));
        setFilters(nextFilters);
        if (filterTimer.current !== null) {
            window.clearTimeout(filterTimer.current);
        }
        filterTimer.current = window.setTimeout(() => {
            vscode.postMessage({ type: 'setFilters', filters: nextFilters });
            filterTimer.current = null;
        }, FILTER_DEBOUNCE_MS);
        scrollElementRef.current?.scrollTo({ top: 0 });
    };

    const updateSort = (columnIndex: number | null): void => {
        if (suppressSort.current) {
            return;
        }
        const nextSort = sort?.columnIndex !== columnIndex
            ? { columnIndex, direction: 'ascending' as const }
            : sort.direction === 'ascending'
                ? { columnIndex, direction: 'descending' as const }
                : null;
        setSort(nextSort);
        vscode.postMessage({ type: 'setSort', sort: nextSort });
        scrollElementRef.current?.scrollTo({ top: 0 });
    };

    const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number, startWidth: number): void => {
        if (event.button !== 0) {
            return;
        }
        if (clearSortSuppressionTimer.current !== null) {
            window.clearTimeout(clearSortSuppressionTimer.current);
            clearSortSuppressionTimer.current = null;
        }
        activeColumnResize.current = { pointerId: event.pointerId, columnIndex, startX: event.clientX, startWidth };
        suppressSort.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    };

    const resizeColumn = (event: ReactPointerEvent<HTMLButtonElement>): void => {
        const activeResize = activeColumnResize.current;
        if (activeResize === null || activeResize.pointerId !== event.pointerId) {
            return;
        }
        const minimumWidth = activeResize.columnIndex === 0 ? 22 : 100;
        setColumnWidths(widths => widths.map((width, index) => index === activeResize.columnIndex
            ? Math.max(minimumWidth, activeResize.startWidth + event.clientX - activeResize.startX)
            : width));
    };

    const finishColumnResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
        if (activeColumnResize.current?.pointerId !== event.pointerId) {
            return;
        }
        activeColumnResize.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        clearSortSuppressionTimer.current = window.setTimeout(() => {
            suppressSort.current = false;
            clearSortSuppressionTimer.current = null;
        }, 0);
    };

    const effectiveColumnWidths = columnWidths.length === tableState.columns.length + 1
        ? columnWidths
        : [72, ...tableState.columns.map(() => 180)];
    const gridTemplateColumns = effectiveColumnWidths.map(width => `${width}px`).join(' ');
    const tableWidth = effectiveColumnWidths.reduce((width, columnWidth) => width + columnWidth, 0);
    return <main className="swo-csv-viewer">
        <section className="table-frame" aria-label="CSV table">
            <div className="table-scroll" ref={scrollElementRef}>
                <div className="table-header" style={{ gridTemplateColumns, width: `${tableWidth}px` }}>
                    <div className="index-header">
                        <button type="button" className={`sort-button ${sort?.columnIndex === null ? sort.direction : ''}`} aria-label="Sort by row index" onClick={() => updateSort(null)}>#</button>
                        <span className="filter-spacer" />
                        <button type="button" className="column-resize" aria-label="Resize row index" onPointerDown={event => startColumnResize(event, 0, effectiveColumnWidths[0])} onPointerMove={resizeColumn} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onLostPointerCapture={finishColumnResize} />
                    </div>
                    {tableState.columns.map((column, columnIndex) => <label key={column}>
                        <button type="button" className={`sort-button ${sort?.columnIndex === columnIndex ? sort.direction : ''}`} aria-label={`Sort by ${column}`} onClick={() => updateSort(columnIndex)}>{column}</button>
                        <input
                            type="search"
                            aria-label={`Filter ${column}`}
                            value={filters.find(filter => filter.columnIndex === columnIndex)?.value ?? ''}
                            onChange={event => updateFilter(columnIndex, event.target.value)}
                        />
                        <button type="button" className="column-resize" aria-label={`Resize ${column}`} onPointerDown={event => startColumnResize(event, columnIndex + 1, effectiveColumnWidths[columnIndex + 1])} onPointerMove={resizeColumn} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onLostPointerCapture={finishColumnResize} />
                    </label>)}
                </div>
                <div className="table-rows" style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: `${tableWidth}px` }}>
                    {virtualRows.map(virtualRow => {
                        const row = rows[virtualRow.index - rowStart];
                        if (row === undefined) {
                            return null;
                        }
                        return <div className="table-row" key={row.sourceRowIndex} style={{ gridTemplateColumns, transform: `translateY(${virtualRow.start}px)` }}>
                            <span className="row-index-cell">{row.sourceRowIndex}</span>
                            {row.cells.map((cellValue, columnIndex) => <button type="button" className="table-cell" key={`${row.sourceRowIndex}-${columnIndex}`} onClick={() => vscode.postMessage({ type: 'cellSelected', sourceRowIndex: row.sourceRowIndex, columnIndex, columnName: tableState.columns[columnIndex], cellValue })}>{cellValue}</button>)}
                        </div>;
                    })}
                </div>
            </div>
        </section>
        {tableState.loading && <div className="loading-overlay" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <span>{tableState.loadingMessage ?? 'Loading CSV...'}</span>
        </div>}
        {tableState.error !== undefined && <p className="table-status error">{tableState.error}</p>}
        {!tableState.loading && tableState.error === undefined && tableState.totalRowCount === 0 && <p className="table-status">No matching rows</p>}
        {tableState.malformedRowCount > 0 && <p className="table-status warning">{tableState.malformedRowCount} rows were normalized to the header column count.</p>}
    </main>;
};