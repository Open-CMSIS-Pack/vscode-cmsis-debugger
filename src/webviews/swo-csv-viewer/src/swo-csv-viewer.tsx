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
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
    clearSelectedRows,
    commitRowSelectionCaret,
    EMPTY_ROW_SELECTION,
    isRowSelected,
    moveRowCaret,
    selectAllRows,
    selectRowRange,
    selectSingleRow,
    toggleRow,
    type RowSelectionMovement,
    type RowSelectionState,
} from '../../../views/swo-csv-viewer/row-selection';
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
    const tableHeaderRef = useRef<HTMLDivElement>(null);
    const [tableState, setTableState] = useState<TableState>(INITIAL_STATE);
    const [rows, setRows] = useState<readonly SwoCsvRow[]>([]);
    const [rowStart, setRowStart] = useState(0);
    const [filters, setFilters] = useState<readonly SwoCsvFilter[]>([]);
    const [sort, setSort] = useState<SwoCsvSort | null>(null);
    const [columnWidths, setColumnWidths] = useState<readonly number[]>([]);
    const [selection, setSelection] = useState<RowSelectionState>(EMPTY_ROW_SELECTION);
    const [tableRevision, setTableRevision] = useState(0);
    const [renderedRequestId, setRenderedRequestId] = useState<number | null>(null);
    const latestRequestId = useRef(0);
    const activeColumnResize = useRef<ActiveColumnResize | null>(null);
    const suppressSort = useRef(false);
    const keyboardRangeActive = useRef(false);
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
                setSelection(EMPTY_ROW_SELECTION);
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

    const updateRowSelection = (event: ReactMouseEvent<HTMLButtonElement>, rowIndex: number): void => {
        setSelection(current => event.shiftKey
            ? selectRowRange(current, rowIndex)
            : event.ctrlKey || event.metaKey
                ? toggleRow(current, rowIndex)
                : selectSingleRow(rowIndex));
        scrollElementRef.current?.focus({ preventScroll: true });
    };

    const moveSelection = (destination: number, movement: RowSelectionMovement): void => {
        const clampedDestination = Math.max(0, Math.min(destination, tableState.totalRowCount - 1));
        setSelection(current => moveRowCaret(current, clampedDestination, tableState.totalRowCount, movement));
        rowVirtualizer.scrollToIndex(clampedDestination, { align: 'auto' });
    };

    const handleTableKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.target instanceof HTMLElement && event.target.closest('.table-header') !== null) {
            return;
        }
        const controlPressed = event.ctrlKey || event.metaKey;
        if (controlPressed && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            setSelection(current => selectAllRows(current, tableState.totalRowCount));
            return;
        }
        if (controlPressed && event.key.toLowerCase() === 'c' && selection.intervals.length > 0) {
            event.preventDefault();
            vscode.postMessage({ type: 'copyRows', intervals: selection.intervals });
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setSelection(clearSelectedRows);
            return;
        }
        if (tableState.totalRowCount === 0) {
            return;
        }

        const firstVisibleRow = virtualRows.find(row => row.start + row.size > (scrollElementRef.current?.scrollTop ?? 0))?.index ?? 0;
        const currentRow = selection.caret ?? firstVisibleRow;
        if (controlPressed && (event.key === ' ' || event.code === 'Space')) {
            event.preventDefault();
            setSelection(current => toggleRow(current, current.caret ?? firstVisibleRow));
            return;
        }
        const visibleHeight = Math.max(ROW_HEIGHT, (scrollElementRef.current?.clientHeight ?? ROW_HEIGHT) - (tableHeaderRef.current?.offsetHeight ?? 0));
        const pageSize = Math.max(1, Math.floor(visibleHeight / ROW_HEIGHT));
        let destination: number;
        switch (event.key) {
            case 'ArrowUp':
                destination = currentRow - 1;
                break;
            case 'ArrowDown':
                destination = currentRow + 1;
                break;
            case 'PageUp':
                destination = currentRow - pageSize;
                break;
            case 'PageDown':
                destination = currentRow + pageSize;
                break;
            case 'Home':
                destination = 0;
                break;
            case 'End':
                destination = tableState.totalRowCount - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        keyboardRangeActive.current = event.shiftKey;
        moveSelection(destination, event.shiftKey ? 'extend' : controlPressed ? 'caret-only' : 'replace');
    };

    const handleTableKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Shift' && keyboardRangeActive.current) {
            keyboardRangeActive.current = false;
            setSelection(commitRowSelectionCaret);
        }
    };

    const effectiveColumnWidths = columnWidths.length === tableState.columns.length + 1
        ? columnWidths
        : [72, ...tableState.columns.map(() => 180)];
    const gridTemplateColumns = effectiveColumnWidths.map(width => `${width}px`).join(' ');
    const tableWidth = effectiveColumnWidths.reduce((width, columnWidth) => width + columnWidth, 0);
    const activeRowIsRendered = selection.caret !== null && virtualRows.some(row => row.index === selection.caret);
    return <main className="swo-csv-viewer">
        <section className="table-frame" aria-label="CSV table">
            <div
                className="table-scroll"
                ref={scrollElementRef}
                role="grid"
                aria-label="CSV rows"
                aria-colcount={tableState.columns.length + 1}
                aria-rowcount={tableState.totalRowCount + 1}
                aria-multiselectable="true"
                aria-activedescendant={activeRowIsRendered ? `swo-csv-row-${selection.caret}` : undefined}
                tabIndex={0}
                onKeyDown={handleTableKeyDown}
                onKeyUp={handleTableKeyUp}
            >
                <div className="table-header" ref={tableHeaderRef} role="row" aria-rowindex={1} style={{ gridTemplateColumns, width: `${tableWidth}px` }}>
                    <div className="index-header" role="columnheader" aria-colindex={1}>
                        <button type="button" className={`sort-button ${sort?.columnIndex === null ? sort.direction : ''}`} aria-label="Sort by row index" onClick={() => updateSort(null)}>#</button>
                        <span className="filter-spacer" />
                        <button type="button" className="column-resize" aria-label="Resize row index" onPointerDown={event => startColumnResize(event, 0, effectiveColumnWidths[0])} onPointerMove={resizeColumn} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onLostPointerCapture={finishColumnResize} />
                    </div>
                    {tableState.columns.map((column, columnIndex) => <label key={column} role="columnheader" aria-colindex={columnIndex + 2}>
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
                <div className="table-rows" role="rowgroup" style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: `${tableWidth}px` }}>
                    {virtualRows.map(virtualRow => {
                        const row = rows[virtualRow.index - rowStart];
                        if (row === undefined) {
                            return null;
                        }
                        const selected = isRowSelected(selection, virtualRow.index);
                        const caret = selection.caret === virtualRow.index;
                        return <div
                            className={`table-row${selected ? ' selected' : ''}${caret ? ' caret' : ''}`}
                            id={`swo-csv-row-${virtualRow.index}`}
                            key={row.sourceRowIndex}
                            role="row"
                            aria-rowindex={virtualRow.index + 2}
                            aria-selected={selected}
                            style={{ gridTemplateColumns, transform: `translateY(${virtualRow.start}px)` }}
                        >
                            <span className="row-index-cell" role="gridcell" aria-colindex={1}>{row.sourceRowIndex}</span>
                            {row.cells.map((cellValue, columnIndex) => <button
                                type="button"
                                className="table-cell"
                                key={`${row.sourceRowIndex}-${columnIndex}`}
                                role="gridcell"
                                aria-colindex={columnIndex + 2}
                                tabIndex={-1}
                                onClick={event => {
                                    updateRowSelection(event, virtualRow.index);
                                    vscode.postMessage({ type: 'cellSelected', sourceRowIndex: row.sourceRowIndex, columnIndex, columnName: tableState.columns[columnIndex], cellValue });
                                }}
                            >{cellValue}</button>)}
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