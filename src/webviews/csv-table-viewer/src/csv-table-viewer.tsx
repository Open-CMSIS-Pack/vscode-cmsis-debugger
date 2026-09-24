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

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
    clearSelectedRows,
    commitRowSelectionCaret,
    EMPTY_ROW_SELECTION,
    findFirstSelectedRowInRange,
    isRowSelected,
    moveRowCaret,
    selectAllRows,
    selectRowRange,
    selectSingleRow,
    toggleRow,
    type RowSelectionMovement,
    type RowSelectionState,
} from '../../../views/csv-table-viewer/row-selection';
import type { CsvTableFilter, CsvTableRow, CsvTableSort } from '../../../views/csv-table-viewer/csv-table';
import type { CsvTableHostMessage, CsvTableWebviewMessage } from '../../../views/csv-table-viewer/csv-table-protocol';
import { getCsvTableScrollGeometry, CSV_TABLE_ROW_HEIGHT } from '../../../views/csv-table-viewer/csv-table-scroll-geometry';
import './csv-table-viewer.css';

declare function acquireVsCodeApi(): { postMessage: (message: CsvTableWebviewMessage) => void };

const vscode = acquireVsCodeApi();
const ROW_OVERSCAN = 16;
const FILTER_DEBOUNCE_MS = 250;
const COPY_BUTTON_DELAY_MS = 1_000;
const getMinimumColumnWidth = (columnIndex: number): number => columnIndex === 0 ? 22 : 100;

interface TableState {
    readonly viewRevision: number;
    readonly columns: readonly string[];
    readonly totalRowCount: number;
    readonly malformedRowCount: number;
    readonly loading: boolean;
    readonly indexing: boolean;
    readonly updating: boolean;
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
    viewRevision: 0,
    columns: [],
    totalRowCount: 0,
    malformedRowCount: 0,
    loading: true,
    indexing: false,
    updating: false,
};


export const CsvTableViewer = (): JSX.Element => {
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const tableHeaderRef = useRef<HTMLDivElement>(null);
    const [tableState, setTableState] = useState<TableState>(INITIAL_STATE);
    const [rows, setRows] = useState<readonly CsvTableRow[]>([]);
    const [rowStart, setRowStart] = useState(0);
    const [filters, setFilters] = useState<readonly CsvTableFilter[]>([]);
    const [sort, setSort] = useState<CsvTableSort | null>(null);
    const [columnWidths, setColumnWidths] = useState<readonly number[]>([]);
    const [selection, setSelection] = useState<RowSelectionState>(EMPTY_ROW_SELECTION);
    const [copyButtonReady, setCopyButtonReady] = useState(false);
    const [scrollTop, setScrollTop] = useState(0);
    const [tableRevision, setTableRevision] = useState(0);
    const [renderedRequestId, setRenderedRequestId] = useState<number | null>(null);
    const [rowRequestVersion, setRowRequestVersion] = useState(0);
    const latestRequestId = useRef(0);
    const viewRevision = useRef(0);
    const rowRequestInFlight = useRef<number | null>(null);
    const activeColumnResize = useRef<ActiveColumnResize | null>(null);
    const suppressSort = useRef(false);
    const keyboardRangeActive = useRef(false);
    const clearSortSuppressionTimer = useRef<number | null>(null);
    const filterTimer = useRef<number | null>(null);
    const copyButtonTimer = useRef<number | null>(null);
    const rowViewportHeight = Math.max(CSV_TABLE_ROW_HEIGHT, (scrollElementRef.current?.clientHeight ?? CSV_TABLE_ROW_HEIGHT) - (tableHeaderRef.current?.offsetHeight ?? 0));
    const { scrollHeight, scrollScale, logicalScrollTop, firstVisibleRow } = getCsvTableScrollGeometry(tableState.totalRowCount, scrollTop, rowViewportHeight);
    const visibleRowCount = Math.max(1, Math.ceil(rowViewportHeight / CSV_TABLE_ROW_HEIGHT));
    const renderedRowStart = Math.max(0, firstVisibleRow - ROW_OVERSCAN);
    const renderedRowEnd = Math.min(tableState.totalRowCount, firstVisibleRow + visibleRowCount + ROW_OVERSCAN);

    useEffect(() => {
        const receiveMessage = (event: MessageEvent<CsvTableHostMessage>): void => {
            const message = event.data;
            if (message.type === 'tableState') {
                viewRevision.current = message.viewRevision;
                setTableState(previousState => {
                    const isProgressUpdate = message.viewRevision === previousState.viewRevision
                        && (message.indexing || message.updating)
                        && !message.loading
                        && message.columns.length === previousState.columns.length
                        && message.columns.every((column, index) => column === previousState.columns[index]);
                    if (!isProgressUpdate) {
                        latestRequestId.current += 1;
                        rowRequestInFlight.current = null;
                        setRows([]);
                        setSelection(EMPTY_ROW_SELECTION);
                        setTableRevision(revision => revision + 1);
                        setRowRequestVersion(version => version + 1);
                        setColumnWidths(widths => widths.length === message.columns.length + 1 ? widths : [72, ...message.columns.map(() => 180)]);
                    }
                    return message;
                });
                return;
            }
            if (message.type === 'rows') {
                if (message.requestId !== latestRequestId.current || message.viewRevision !== viewRevision.current) {
                    return;
                }
                rowRequestInFlight.current = null;
                setRows(message.rows);
                setRowStart(message.start);
                setRenderedRequestId(message.requestId);
                setRowRequestVersion(version => version + 1);
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
        if (copyButtonTimer.current !== null) {
            window.clearTimeout(copyButtonTimer.current);
        }
    }, []);

    useEffect(() => {
        setCopyButtonReady(false);
        if (copyButtonTimer.current !== null) {
            window.clearTimeout(copyButtonTimer.current);
            copyButtonTimer.current = null;
        }
        if (selection.intervals.length === 0) {
            return;
        }
        copyButtonTimer.current = window.setTimeout(() => {
            setCopyButtonReady(true);
            copyButtonTimer.current = null;
        }, COPY_BUTTON_DELAY_MS);
        return () => {
            if (copyButtonTimer.current !== null) {
                window.clearTimeout(copyButtonTimer.current);
                copyButtonTimer.current = null;
            }
        };
    }, [selection.intervals]);

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
        if (tableState.loading || renderedRowEnd <= renderedRowStart || rowRequestInFlight.current !== null) {
            return;
        }
        const nextRequestId = latestRequestId.current + 1;
        latestRequestId.current = nextRequestId;
        rowRequestInFlight.current = nextRequestId;
        vscode.postMessage({
            type: 'requestRows',
            requestId: nextRequestId,
            viewRevision: tableState.viewRevision,
            start: renderedRowStart,
            end: renderedRowEnd,
        });
    }, [renderedRowEnd, renderedRowStart, rowRequestVersion, tableRevision, tableState.loading, tableState.totalRowCount, tableState.viewRevision]);

    const updateFilter = (columnIndex: number, value: string): void => {
        const nextFilters = tableState.columns.map((_, index) => ({ columnIndex: index, value: index === columnIndex ? value : filters.find(filter => filter.columnIndex === index)?.value ?? '' }));
        setFilters(nextFilters);
        vscode.postMessage({ type: 'cancelViewUpdate' });
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
        if (suppressSort.current || tableState.indexing) {
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
        const minimumWidth = getMinimumColumnWidth(activeResize.columnIndex);
        setColumnWidths(widths => widths.map((width, index) => index === activeResize.columnIndex
            ? Math.max(minimumWidth, activeResize.startWidth + event.clientX - activeResize.startX)
            : width));
    };

    const minimizeColumn = (event: ReactMouseEvent<HTMLButtonElement>, columnIndex: number): void => {
        event.preventDefault();
        event.stopPropagation();
        suppressSort.current = true;
        setColumnWidths(widths => widths.map((width, index) => index === columnIndex
            ? getMinimumColumnWidth(columnIndex)
            : width));
        if (clearSortSuppressionTimer.current !== null) {
            window.clearTimeout(clearSortSuppressionTimer.current);
        }
        clearSortSuppressionTimer.current = window.setTimeout(() => {
            suppressSort.current = false;
            clearSortSuppressionTimer.current = null;
        }, 0);
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
        scrollElementRef.current?.scrollTo({ top: clampedDestination * CSV_TABLE_ROW_HEIGHT / scrollScale });
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
            vscode.postMessage({ type: 'copyRows', viewRevision: tableState.viewRevision, intervals: selection.intervals });
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

        const currentRow = selection.caret ?? firstVisibleRow;
        if (controlPressed && (event.key === ' ' || event.code === 'Space')) {
            event.preventDefault();
            setSelection(current => toggleRow(current, current.caret ?? firstVisibleRow));
            return;
        }
        const visibleHeight = Math.max(CSV_TABLE_ROW_HEIGHT, (scrollElementRef.current?.clientHeight ?? CSV_TABLE_ROW_HEIGHT) - (tableHeaderRef.current?.offsetHeight ?? 0));
        const pageSize = Math.max(1, Math.floor(visibleHeight / CSV_TABLE_ROW_HEIGHT));
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
    const gridTemplateColumns = effectiveColumnWidths.map((width, index) => index === effectiveColumnWidths.length - 1
        ? `minmax(${width}px, 1fr)`
        : `${width}px`).join(' ');
    const tableWidth = effectiveColumnWidths.reduce((width, columnWidth) => width + columnWidth, 0);
    const tableLayoutWidth = `max(99%, ${tableWidth}px)`;
    const activeRowIsRendered = selection.caret !== null
        && selection.caret >= renderedRowStart
        && selection.caret < renderedRowEnd;
    const copyButtonRow = copyButtonReady
        ? findFirstSelectedRowInRange(selection.intervals, firstVisibleRow, firstVisibleRow + visibleRowCount - 1)
        : null;
    const copyButtonTop = copyButtonRow === null
        ? 0
        : Math.max(4, (tableHeaderRef.current?.offsetHeight ?? 0) + copyButtonRow * CSV_TABLE_ROW_HEIGHT - scrollTop - 30);
    return <main className="csv-table-viewer">
        <section className="table-frame" aria-label="CSV table">
            <div
                className="table-scroll"
                ref={scrollElementRef}
                role="grid"
                aria-label="CSV rows"
                aria-colcount={tableState.columns.length + 1}
                aria-rowcount={tableState.totalRowCount + 1}
                aria-multiselectable="true"
                aria-activedescendant={activeRowIsRendered ? `csv-table-row-${selection.caret}` : undefined}
                tabIndex={0}
                onKeyDown={handleTableKeyDown}
                onKeyUp={handleTableKeyUp}
                onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
            >
                <div className="table-header" ref={tableHeaderRef} role="row" aria-rowindex={1} style={{ gridTemplateColumns, width: tableLayoutWidth }}>
                    <div className="index-header" role="columnheader" aria-colindex={1}>
                        <button type="button" className={`sort-button ${sort?.columnIndex === null ? sort.direction : ''}`} aria-label="Sort by row index" disabled={tableState.indexing} onClick={() => updateSort(null)}>#</button>
                        <span className="filter-spacer" />
                        <button type="button" className="column-resize" aria-label="Resize row index" onPointerDown={event => startColumnResize(event, 0, effectiveColumnWidths[0])} onPointerMove={resizeColumn} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onLostPointerCapture={finishColumnResize} onDoubleClick={event => minimizeColumn(event, 0)} />
                    </div>
                    {tableState.columns.map((column, columnIndex) => <label key={column} role="columnheader" aria-colindex={columnIndex + 2}>
                        <button type="button" className={`sort-button ${sort?.columnIndex === columnIndex ? sort.direction : ''}`} aria-label={`Sort by ${column}`} disabled={tableState.indexing} onClick={() => updateSort(columnIndex)}>{column}</button>
                        <input
                            type="search"
                            aria-label={`Filter ${column}`}
                            value={filters.find(filter => filter.columnIndex === columnIndex)?.value ?? ''}
                            onChange={event => updateFilter(columnIndex, event.target.value)}
                        />
                        <button type="button" className="column-resize" aria-label={`Resize ${column}`} onPointerDown={event => startColumnResize(event, columnIndex + 1, effectiveColumnWidths[columnIndex + 1])} onPointerMove={resizeColumn} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onLostPointerCapture={finishColumnResize} onDoubleClick={event => minimizeColumn(event, columnIndex + 1)} />
                    </label>)}
                </div>
                <div className="table-rows" role="rowgroup" style={{ height: `${scrollHeight}px`, width: tableLayoutWidth }}>
                    {Array.from({ length: renderedRowEnd - renderedRowStart }, (_, offset) => renderedRowStart + offset).map(rowIndex => {
                        const row = rows[rowIndex - rowStart];
                        if (row === undefined) {
                            return null;
                        }
                        const selected = isRowSelected(selection, rowIndex);
                        const caret = selection.caret === rowIndex;
                        const rowTop = scrollTop + rowIndex * CSV_TABLE_ROW_HEIGHT - logicalScrollTop;
                        return <div
                            className={`table-row${selected ? ' selected' : ''}${caret ? ' caret' : ''}`}
                            id={`csv-table-row-${rowIndex}`}
                            key={row.sourceRowIndex}
                            role="row"
                            aria-rowindex={rowIndex + 2}
                            aria-selected={selected}
                            style={{ gridTemplateColumns, transform: `translateY(${rowTop}px)` }}
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
                                    updateRowSelection(event, rowIndex);
                                    vscode.postMessage({ type: 'cellSelected', sourceRowIndex: row.sourceRowIndex, columnIndex, columnName: tableState.columns[columnIndex], cellValue });
                                }}
                            >{cellValue}</button>)}
                        </div>;
                    })}
                </div>
            </div>
            {copyButtonRow !== null && <button
                type="button"
                className="copy-selection-tooltip"
                aria-label="Copy selected rows"
                onClick={() => vscode.postMessage({ type: 'copyRows', viewRevision: tableState.viewRevision, intervals: selection.intervals })}
                style={{ top: `${copyButtonTop}px` }}
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path fill="currentColor" d="M4 4V1h8v8H9v3H1V4h3Zm1 0h4v4h2V2H5v2Zm3 1H2v6h6V5Z" />
                </svg>
                <span>Copy</span>
            </button>}
        </section>
        {tableState.loading && <div className="loading-overlay" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <span>{tableState.loadingMessage ?? 'Loading CSV...'}</span>
        </div>}
        {tableState.error !== undefined && <p className="table-status error">{tableState.error}</p>}
        {tableState.indexing && <p className="table-status" role="status" aria-live="polite">Indexing {tableState.totalRowCount} rows...</p>}
        {tableState.updating && <p className="table-status" role="status" aria-live="polite">{tableState.loadingMessage ?? 'Updating table...'}</p>}
        {!tableState.loading && tableState.error === undefined && tableState.totalRowCount === 0 && <p className="table-status">No matching rows</p>}
        {tableState.malformedRowCount > 0 && <p className="table-status warning">{tableState.malformedRowCount} rows were normalized to the header column count.</p>}
    </main>;
};