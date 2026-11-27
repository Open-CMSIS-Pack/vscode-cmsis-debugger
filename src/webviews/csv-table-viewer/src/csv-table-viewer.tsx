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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
    clearSelectedRows,
    commitRowSelectionCaret,
    EMPTY_ROW_SELECTION,
    isRowSelected,
    moveRowCaret,
    selectAllRows,
    selectRowForContextMenu,
    selectSingleRow,
    toggleRow,
    type RowSelectionMovement,
    type RowSelectionState,
} from '../../../views/csv-table-viewer/row-selection';
import type { CsvTableFilter, CsvTableRow, CsvTableSort } from '../../../views/csv-table-viewer/csv-table';
import type { CsvTableHostMessage, CsvTableWebviewMessage } from '../../../views/csv-table-viewer/csv-table-protocol';
import { getCsvTableRowRevealScrollTop, getCsvTableScrollGeometry, CSV_TABLE_ROW_HEIGHT } from '../../../views/csv-table-viewer/csv-table-scroll-geometry';
import { getCsvTableCellMatches, type CsvTableSearchMatch } from '../../../views/csv-table-viewer/csv-table-search';
import { shouldRequestRows, type LoadedRowRange } from './csv-table-row-request';
import { isContextMenuShortcut, isPrimaryModifierPressed } from './csv-table-modifiers';
import { CsvTableFindController, getCsvTableFindCommand, INITIAL_FIND_STATE } from './csv-table-find';
import { getCsvTableClickTarget, getCsvTableMenuItemIndex, getCsvTableNavigationTarget, type CsvTableSelectedCell } from './csv-table-navigation';
import './csv-table-viewer.css';

declare function acquireVsCodeApi(): { postMessage: (message: CsvTableWebviewMessage) => void };

const vscode = acquireVsCodeApi();
const ROW_OVERSCAN = 16;
const FILTER_DEBOUNCE_MS = 250;
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

interface ContextMenuPosition {
    readonly x: number;
    readonly y: number;
    readonly rowIndex?: number;
    readonly columnIndex?: number;
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


const renderCellText = (value: string, query: string, active: CsvTableSearchMatch | null): JSX.Element => {
    const matches = getCsvTableCellMatches(value, query, active);
    return <>{matches.map((match, index) => <Fragment key={match.start}>
        {value.slice(index === 0 ? 0 : matches[index - 1].end, match.start)}
        <mark className={active?.start === match.start && active.end === match.end ? 'find-match active' : 'find-match'}>{value.slice(match.start, match.end)}</mark>
    </Fragment>)}{value.slice(matches.at(-1)?.end ?? 0)}</>;
};

export const CsvTableViewer = (): JSX.Element => {
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const findInputRef = useRef<HTMLInputElement>(null);
    const [findState, setFindState] = useState(INITIAL_FIND_STATE);
    const lastFocusedControl = useRef<HTMLElement | null>(null);
    const tableHeaderRef = useRef<HTMLDivElement>(null);
    const [tableState, setTableState] = useState<TableState>(INITIAL_STATE);
    const [rows, setRows] = useState<readonly CsvTableRow[]>([]);
    const [rowStart, setRowStart] = useState(0);
    const [filters, setFilters] = useState<readonly CsvTableFilter[]>([]);
    const [sort, setSort] = useState<CsvTableSort | null>(null);
    const [columnWidths, setColumnWidths] = useState<readonly number[]>([]);
    const [selection, setSelection] = useState<RowSelectionState>(EMPTY_ROW_SELECTION);
    const [selectedCell, setSelectedCell] = useState<CsvTableSelectedCell | null>(null);
    const revealedCell = useRef<CsvTableSelectedCell | null>(null);
    const [findController] = useState(() => new CsvTableFindController(
        message => vscode.postMessage(message),
        setFindState,
        rowIndex => {
            setSelectedCell(null);
            setSelection(selectSingleRow(rowIndex));
        },
    ));
    const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [rowViewportHeight, setRowViewportHeight] = useState(CSV_TABLE_ROW_HEIGHT);
    const [tableRevision, setTableRevision] = useState(0);
    const [renderedRequestId, setRenderedRequestId] = useState<number | null>(null);
    const [rowRequestVersion, setRowRequestVersion] = useState(0);
    const latestRequestId = useRef(0);
    const viewRevision = useRef(0);
    const rowRequestInFlight = useRef<number | null>(null);
    const loadedRowRange = useRef<LoadedRowRange | null>(null);
    const activeColumnResize = useRef<ActiveColumnResize | null>(null);
    const suppressSort = useRef(false);
    const keyboardRangeActive = useRef(false);
    const clearSortSuppressionTimer = useRef<number | null>(null);
    const filterTimer = useRef<number | null>(null);
    const { scrollHeight, logicalScrollTop, firstVisibleRow } = getCsvTableScrollGeometry(tableState.totalRowCount, scrollTop, rowViewportHeight);
    const visibleRowCount = Math.max(1, Math.ceil(rowViewportHeight / CSV_TABLE_ROW_HEIGHT));
    const renderedRowStart = Math.max(0, firstVisibleRow - ROW_OVERSCAN);
    const renderedRowEnd = Math.min(tableState.totalRowCount, firstVisibleRow + visibleRowCount + ROW_OVERSCAN);
    const closeFind = useCallback((): void => {
        findController.close();
        scrollElementRef.current?.focus({ preventScroll: true });
    }, [findController]);

    useEffect(() => {
        const handleFindKeyDown = (event: KeyboardEvent): void => {
            const command = getCsvTableFindCommand(event, navigator.platform, findState.open, event.target === findInputRef.current);
            if (command === null) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (command === 'close') {
                closeFind();
            } else {
                findController.open(selectedCell?.rowIndex ?? (selection.intervals.length === 0 ? null : selection.caret));
                if (command === 'open') {
                    findInputRef.current?.focus();
                    findInputRef.current?.select();
                } else {
                    findController.find(command);
                }
            }
        };
        window.addEventListener('keydown', handleFindKeyDown, true);
        return () => window.removeEventListener('keydown', handleFindKeyDown, true);
    }, [closeFind, findController, findState.open, selection, selectedCell]);

    useEffect(() => {
        const grid = scrollElementRef.current;
        if (grid === null) {
            return;
        }
        const trackFocus = (event: FocusEvent): void => {
            if (event.target instanceof HTMLElement && event.target !== document.body
                && event.target !== document.documentElement) {
                lastFocusedControl.current = event.target;
            }
        };
        const restoreFocus = (): void => {
            if (lastFocusedControl.current === grid && (document.activeElement === document.body
                || document.activeElement === document.documentElement || document.activeElement === null)) {
                grid.focus({ preventScroll: true });
            }
        };
        document.addEventListener('focusin', trackFocus);
        window.addEventListener('focus', restoreFocus);
        return () => {
            document.removeEventListener('focusin', trackFocus);
            window.removeEventListener('focus', restoreFocus);
        };
    }, []);

    useEffect(() => {
        if (contextMenuPosition !== null) {
            const menu = contextMenuRef.current;
            const firstItem = menu?.querySelector<HTMLButtonElement>('button:not(:disabled)');
            (firstItem ?? menu)?.focus({ preventScroll: true });
        }
    }, [contextMenuPosition]);

    useEffect(() => {
        const scrollElement = scrollElementRef.current;
        if (selectedCell === null || revealedCell.current === selectedCell || scrollElement === null) {
            return;
        }
        const top = getCsvTableRowRevealScrollTop(tableState.totalRowCount, scrollElement.scrollTop, rowViewportHeight, selectedCell.rowIndex);
        const cell = scrollElement.querySelector(`#csv-table-cell-${selectedCell.rowIndex}-${selectedCell.columnIndex}`);
        let left = scrollElement.scrollLeft;
        if (cell !== null) {
            const cellBounds = cell.getBoundingClientRect();
            const viewportLeft = scrollElement.getBoundingClientRect().left + scrollElement.clientLeft;
            const contentLeft = viewportLeft + (columnWidths[0] ?? getMinimumColumnWidth(0));
            const contentRight = viewportLeft + scrollElement.clientWidth;
            if (cellBounds.left < contentLeft) {
                left += cellBounds.left - contentLeft;
            } else if (cellBounds.right > contentRight) {
                left += cellBounds.right - contentRight;
            }
            revealedCell.current = selectedCell;
        }
        scrollElement.scrollTo({ top, left });
    }, [selectedCell, rows, scrollTop, rowViewportHeight, tableState.totalRowCount, columnWidths]);

    useEffect(() => {
        const scrollElement = scrollElementRef.current;
        const headerElement = tableHeaderRef.current;
        if (scrollElement === null || headerElement === null) {
            return;
        }
        const measure = (): void => {
            setRowViewportHeight(Math.max(CSV_TABLE_ROW_HEIGHT, scrollElement.clientHeight - headerElement.offsetHeight));
        };
        const observer = new ResizeObserver(measure);
        observer.observe(scrollElement);
        observer.observe(headerElement);
        measure();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const receiveMessage = (event: MessageEvent<CsvTableHostMessage>): void => {
            if (event.origin !== window.location.origin) {
                return;
            }
            const message = event.data;
            if (message.type === 'findResult') {
                findController.receive(message);
                return;
            }
            if (message.type === 'restoreFocus') {
                const control = lastFocusedControl.current;
                if (control?.isConnected) {
                    control.focus({ preventScroll: true });
                }
                return;
            }
            if (message.type === 'tableState') {
                findController.updateView(message);
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
                        loadedRowRange.current = null;
                        setRows([]);
                        setSelection(message.selection ?? EMPTY_ROW_SELECTION);
                        if (message.viewRevision !== previousState.viewRevision || message.loading
                            || message.columns.length !== previousState.columns.length
                            || message.columns.some((column, index) => column !== previousState.columns[index])) {
                            setSelectedCell(null);
                            setContextMenuPosition(null);
                        }
                        setTableRevision(revision => revision + 1);
                        setRowRequestVersion(version => version + 1);
                        setColumnWidths(widths => widths.length === message.columns.length + 1
                            ? widths
                            : Array.from({ length: message.columns.length + 1 }, (_, columnIndex) => getMinimumColumnWidth(columnIndex)));
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
                loadedRowRange.current = {
                    viewRevision: message.viewRevision,
                    start: message.start,
                    end: message.start + message.rows.length,
                };
                setRows(message.rows);
                setRowStart(message.start);
                setRenderedRequestId(message.requestId);
                setRowRequestVersion(version => version + 1);
            }
        };
        window.addEventListener('message', receiveMessage);
        vscode.postMessage({ type: 'ready' });
        return () => {
            window.removeEventListener('message', receiveMessage);
            findController.dispose();
        };
    }, [findController]);

    useEffect(() => {
        if (findState.open) {
            findInputRef.current?.focus();
            findInputRef.current?.select();
        }
    }, [findState.open]);

    useEffect(() => {
        const match = findState.match;
        const element = scrollElementRef.current;
        if (match !== null && element !== null) {
            element.scrollTop = getCsvTableRowRevealScrollTop(tableState.totalRowCount, element.scrollTop, rowViewportHeight, match.rowIndex);
            setScrollTop(element.scrollTop);
        }
    }, [findState.match, tableState.totalRowCount, rowViewportHeight]);

    useEffect(() => {
        const element = scrollElementRef.current;
        const cell = element?.querySelector<HTMLButtonElement>('.table-cell.find-active-cell');
        if (element === null || cell === undefined || cell === null) {
            return;
        }
        const viewport = element.getBoundingClientRect();
        const leftEdge = viewport.left + (element.querySelector('.row-index-cell')?.getBoundingClientRect().width ?? 0);
        const bounds = cell.getBoundingClientRect();
        if (bounds.left < leftEdge) {
            element.scrollLeft += bounds.left - leftEdge;
        } else if (bounds.right > viewport.right) {
            element.scrollLeft += Math.min(bounds.left - leftEdge, bounds.right - viewport.right);
        }
        const mark = cell.querySelector<HTMLElement>('.find-match.active');
        if (mark !== null) {
            cell.scrollLeft += mark.getBoundingClientRect().left - cell.getBoundingClientRect().left - 6;
            const matchBounds = mark.getBoundingClientRect();
            if (matchBounds.left < leftEdge) {
                element.scrollLeft += matchBounds.left - leftEdge;
            } else if (matchBounds.right > viewport.right) {
                element.scrollLeft += Math.min(matchBounds.left - leftEdge, matchBounds.right - viewport.right);
            }
        }
    }, [rows, findState.match, columnWidths]);

    useEffect(() => () => {
        if (clearSortSuppressionTimer.current !== null) {
            window.clearTimeout(clearSortSuppressionTimer.current);
        }
        if (filterTimer.current !== null) {
            window.clearTimeout(filterTimer.current);
        }
    }, []);

    useEffect(() => {
        vscode.postMessage({
            type: 'selectionChanged',
            intervals: selection.intervals,
            caret: selection.caret,
            anchor: selection.anchor,
        });
    }, [selection]);

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
        if (!shouldRequestRows(
            tableState.loading,
            rowRequestInFlight.current !== null,
            loadedRowRange.current,
            tableState.viewRevision,
            renderedRowStart,
            renderedRowEnd,
        )) {
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
        findController.suspend();
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
        findController.suspend();
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

    const updateClickSelection = (event: ReactMouseEvent<HTMLButtonElement>, rowIndex: number, columnIndex: number | null): boolean => {
        const target = getCsvTableClickTarget({
            selection,
            selectedCell,
            rowIndex,
            columnIndex,
            clickCount: event.detail,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            primaryModifier: isPrimaryModifierPressed(event, navigator.platform),
        });
        if (target === null) {
            return false;
        }
        setSelection(target.selection);
        setSelectedCell(target.columnIndex === null ? null : { rowIndex: target.rowIndex, columnIndex: target.columnIndex });
        scrollElementRef.current?.focus({ preventScroll: true });
        return true;
    };

    const selectCell = (rowIndex: number, columnIndex: number): void => {
        setSelectedCell({ rowIndex, columnIndex });
        setSelection({ intervals: [], caret: rowIndex, anchor: rowIndex });
        scrollElementRef.current?.focus({ preventScroll: true });
    };

    const moveSelection = (destination: number, movement: RowSelectionMovement): void => {
        const clampedDestination = Math.max(0, Math.min(destination, tableState.totalRowCount - 1));
        setSelection(current => moveRowCaret(current, clampedDestination, tableState.totalRowCount, movement));
        const scrollElement = scrollElementRef.current;
        if (scrollElement !== null) {
            const top = getCsvTableRowRevealScrollTop(tableState.totalRowCount, scrollElement.scrollTop, rowViewportHeight, clampedDestination);
            scrollElement.scrollTo({ top });
        }
    };

    const copySelectedRows = (): void => {
        if (selectedCell !== null) {
            vscode.postMessage({
                type: 'copyRows', viewRevision: tableState.viewRevision,
                intervals: [{ start: selectedCell.rowIndex, end: selectedCell.rowIndex }], columnIndex: selectedCell.columnIndex
            });
            return;
        }
        if (selection.intervals.length === 0) {
            return;
        }
        vscode.postMessage({ type: 'copyRows', viewRevision: tableState.viewRevision, intervals: selection.intervals });
    };

    const showContextMenu = (event: ReactMouseEvent<HTMLElement>, rowIndex?: number, columnIndex?: number): void => {
        event.preventDefault();
        setContextMenuPosition({
            x: event.clientX,
            y: event.clientY,
            ...(rowIndex === undefined ? {} : { rowIndex }),
            ...(columnIndex === undefined ? {} : { columnIndex }),
        });
    };

    const closeContextMenu = (): void => {
        setContextMenuPosition(null);
        scrollElementRef.current?.focus({ preventScroll: true });
    };

    const handleContextMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') {
                event.preventDefault();
            }
            closeContextMenu();
            return;
        }
        if (isContextMenuShortcut(event)) {
            event.preventDefault();
            return;
        }
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = items.findIndex(item => item === document.activeElement);
        const nextIndex = getCsvTableMenuItemIndex(event.key, index, items.length);
        if (nextIndex === null) {
            return;
        }
        event.preventDefault();
        items[nextIndex]?.focus({ preventScroll: true });
    };

    const copyContextTarget = (valueOnly: boolean): void => {
        if (contextMenuPosition?.rowIndex === undefined
            || (valueOnly && contextMenuPosition.columnIndex === undefined)) {
            return;
        }
        vscode.postMessage({
            type: 'copyRows',
            viewRevision: tableState.viewRevision,
            intervals: [{ start: contextMenuPosition.rowIndex, end: contextMenuPosition.rowIndex }],
            ...(valueOnly ? { columnIndex: contextMenuPosition.columnIndex } : {}),
        });
        closeContextMenu();
    };

    const handleTableKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.target instanceof HTMLElement && event.target.closest('.table-header') !== null) {
            return;
        }
        if (event.key === 'Alt') {
            event.preventDefault();
            return;
        }
        if (isContextMenuShortcut(event)) {
            event.preventDefault();
            const rowIndex = selectedCell?.rowIndex ?? selection.caret;
            const targetId = selectedCell === null
                ? `csv-table-row-${rowIndex}`
                : `csv-table-cell-${selectedCell.rowIndex}-${selectedCell.columnIndex}`;
            const target = event.currentTarget.querySelector(`#${targetId}`) ?? event.currentTarget;
            const bounds = target.getBoundingClientRect();
            setContextMenuPosition({
                x: bounds.left,
                y: bounds.bottom,
                ...(rowIndex === null ? {} : { rowIndex }),
                ...(selectedCell === null ? {} : { columnIndex: selectedCell.columnIndex }),
            });
            return;
        }
        const controlPressed = isPrimaryModifierPressed(event, navigator.platform);
        if (controlPressed && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            setSelectedCell(null);
            setSelection(current => selectAllRows(current, tableState.totalRowCount));
            return;
        }
        if (controlPressed && event.key.toLowerCase() === 'c' && (selectedCell !== null || selection.intervals.length > 0)) {
            event.preventDefault();
            copySelectedRows();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setContextMenuPosition(null);
            setSelectedCell(null);
            setSelection(clearSelectedRows);
            return;
        }
        if (tableState.totalRowCount === 0) {
            return;
        }
        const currentRow = selectedCell?.rowIndex ?? selection.caret ?? firstVisibleRow;
        if (controlPressed && (event.key === ' ' || event.code === 'Space')) {
            event.preventDefault();
            setSelectedCell(null);
            setSelection(current => toggleRow(current, current.caret ?? firstVisibleRow));
            return;
        }
        const visibleHeight = Math.max(CSV_TABLE_ROW_HEIGHT, (scrollElementRef.current?.clientHeight ?? CSV_TABLE_ROW_HEIGHT) - (tableHeaderRef.current?.offsetHeight ?? 0));
        const pageSize = Math.max(1, Math.floor(visibleHeight / CSV_TABLE_ROW_HEIGHT));
        const target = getCsvTableNavigationTarget({
            key: event.key,
            rowIndex: currentRow,
            columnIndex: selectedCell?.columnIndex ?? null,
            rowCount: tableState.totalRowCount,
            columnCount: tableState.columns.length,
            pageSize,
            shiftKey: event.shiftKey,
            primaryModifier: controlPressed,
        });
        if (target === null) {
            return;
        }
        event.preventDefault();
        if (target.columnIndex !== null) {
            selectCell(target.rowIndex, target.columnIndex);
        } else {
            setSelectedCell(null);
            keyboardRangeActive.current = target.movement === 'extend';
            moveSelection(target.rowIndex, target.movement);
        }
    };

    const handleTableKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.target === event.currentTarget && (isContextMenuShortcut(event) || event.key === 'Alt')) {
            event.preventDefault();
        }
        if (event.key === 'Shift' && keyboardRangeActive.current) {
            keyboardRangeActive.current = false;
            setSelection(commitRowSelectionCaret);
        }
    };

    const effectiveColumnWidths = columnWidths.length === tableState.columns.length + 1
        ? columnWidths
        : Array.from({ length: tableState.columns.length + 1 }, (_, columnIndex) => getMinimumColumnWidth(columnIndex));
    const gridTemplateColumns = effectiveColumnWidths.map((width, index) => index === effectiveColumnWidths.length - 1
        ? `minmax(${width}px, 1fr)`
        : `${width}px`).join(' ');
    const tableWidth = effectiveColumnWidths.reduce((width, columnWidth) => width + columnWidth, 0);
    const tableLayoutWidth = `max(100%, ${tableWidth}px)`;
    const activeRowIsRendered = selection.caret !== null
        && selection.caret >= renderedRowStart
        && selection.caret < renderedRowEnd;
    const findHasNoResults = findState.status === 'No results';
    const findNavigationDisabled = !findState.query || findState.pending || findHasNoResults || tableState.loading || tableState.indexing || tableState.updating || tableState.error !== undefined;
    return <main className="csv-table-viewer">
        {findState.open && <section className={findHasNoResults ? 'csv-find-bar no-results' : 'csv-find-bar'} role="search" aria-label="Find in CSV">
            <input ref={findInputRef} type="text" aria-label="Find in CSV" placeholder="Find" value={findState.query} onChange={event => findController.setQuery(event.target.value)} />
            <span className={findState.pending ? 'csv-find-status searching' : 'csv-find-status'} role="status" aria-live="polite">{findState.status}</span>
            <button type="button" aria-label="Previous match (Shift+Enter)" title="Previous match (Shift+Enter)" disabled={findNavigationDisabled} onClick={() => findController.find('previous')}>
                <span className="codicon codicon-arrow-up codicon-find-previous-match" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next match (Enter)" title="Next match (Enter)" disabled={findNavigationDisabled} onClick={() => findController.find('next')}>
                <span className="codicon codicon-arrow-down codicon-find-next-match" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Close Find (Escape)" title="Close Find (Escape)" onClick={closeFind}>
                <span className="codicon codicon-close codicon-widget-close" aria-hidden="true" />
            </button>
        </section>}
        <section className="table-frame" aria-label="CSV table">
            <div
                className="table-scroll"
                ref={scrollElementRef}
                role="grid"
                aria-label="CSV rows"
                aria-colcount={tableState.columns.length + 1}
                aria-rowcount={tableState.totalRowCount + 1}
                aria-multiselectable="true"
                aria-activedescendant={activeRowIsRendered
                    ? selectedCell === null ? `csv-table-row-${selection.caret}` : `csv-table-cell-${selectedCell.rowIndex}-${selectedCell.columnIndex}`
                    : undefined}
                tabIndex={0}
                onKeyDown={handleTableKeyDown}
                onKeyUp={handleTableKeyUp}
                style={{ scrollPaddingLeft: effectiveColumnWidths[0] }}
                onContextMenu={event => showContextMenu(event)}
                onPointerDown={() => setContextMenuPosition(null)}
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
                        const caret = selectedCell === null && selection.caret === rowIndex;
                        const rowTop = scrollTop + rowIndex * CSV_TABLE_ROW_HEIGHT - logicalScrollTop;
                        return <div
                            className={`table-row${selected ? ' selected' : ''}${caret ? ' caret' : ''}`}
                            id={`csv-table-row-${rowIndex}`}
                            key={row.sourceRowIndex}
                            role="row"
                            aria-rowindex={rowIndex + 2}
                            aria-selected={selected}
                            onContextMenu={event => {
                                event.stopPropagation();
                                setSelectedCell(null);
                                setSelection(current => selectRowForContextMenu(current, rowIndex, event.shiftKey || event.altKey));
                                showContextMenu(event, rowIndex);
                            }}
                            style={{ gridTemplateColumns, transform: `translateY(${rowTop}px)` }}
                        >
                            <button type="button" className="row-index-cell" role="gridcell" aria-colindex={1} tabIndex={-1}
                                onClick={event => { updateClickSelection(event, rowIndex, null); }}
                            >{row.sourceRowIndex}</button>
                            {row.cells.map((cellValue, columnIndex) => {
                                const active = findState.match?.rowIndex === rowIndex
                                    && findState.match.sourceRowIndex === row.sourceRowIndex
                                    && findState.match.columnIndex === columnIndex ? findState.match : null;
                                return <button
                                    type="button"
                                    className={`table-cell${selectedCell?.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex ? ' selected-cell' : ''}${active === null ? '' : ' find-active-cell'}`}
                                    id={`csv-table-cell-${rowIndex}-${columnIndex}`}
                                    key={`${row.sourceRowIndex}-${columnIndex}`}
                                    role="gridcell"
                                    aria-colindex={columnIndex + 2}
                                    aria-selected={selected || (selectedCell?.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex)}
                                    tabIndex={-1}
                                    onContextMenu={event => {
                                        event.stopPropagation();
                                        if (event.shiftKey || event.altKey) {
                                            setSelectedCell(null);
                                            setSelection(current => selectRowForContextMenu(current, rowIndex, true));
                                        } else if (selectedCell !== null || !selected) {
                                            selectCell(rowIndex, columnIndex);
                                        }
                                        showContextMenu(event, rowIndex, columnIndex);
                                    }}
                                    onClick={event => {
                                        if (!updateClickSelection(event, rowIndex, columnIndex)) {
                                            return;
                                        }
                                        if (isPrimaryModifierPressed(event, navigator.platform)) {
                                            vscode.postMessage({ type: 'cellSelected', sourceRowIndex: row.sourceRowIndex, columnIndex, columnName: tableState.columns[columnIndex], cellValue });
                                        }
                                    }}
                                >{findState.open ? renderCellText(cellValue, findState.query, active) : cellValue}</button>;
                            })}
                        </div>;
                    })}
                </div>
            </div>
            {contextMenuPosition !== null && <div
                className="table-context-menu"
                ref={contextMenuRef}
                role="menu"
                tabIndex={-1}
                aria-label="Table actions"
                style={{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }}
                onKeyDown={handleContextMenuKeyDown}
                onKeyUp={event => {
                    if (isContextMenuShortcut(event)) {
                        event.preventDefault();
                    }
                    handleTableKeyUp(event);
                }}
                onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                        setContextMenuPosition(null);
                    }
                }}
            >
                <button
                    type="button"
                    role="menuitem"
                    disabled={contextMenuPosition.columnIndex === undefined}
                    onClick={() => copyContextTarget(true)}
                >Copy Value</button>
                <button
                    type="button"
                    role="menuitem"
                    disabled={contextMenuPosition.rowIndex === undefined}
                    onClick={() => copyContextTarget(false)}
                >Copy Row</button>
            </div>}
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
