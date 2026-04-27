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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatRow, HostToWebviewMessage, WebviewToHostMessage } from './types';
import { TreeRow } from './TreeRow';

export interface VsCodeApi {
    postMessage(msg: WebviewToHostMessage): void;
    getState(): Record<string, unknown> | undefined;
    setState(state: Record<string, unknown>): void;
}

type ViewState = 'loading' | 'empty' | 'data';

interface TreeTableProps {
    vscodeApi: VsCodeApi;
}

export function TreeTable({ vscodeApi }: TreeTableProps): React.ReactElement {
    const [rows, setRows] = useState<FlatRow[]>([]);
    const [viewState, setViewState] = useState<ViewState>('loading');
    const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
    const [lockable, setLockable] = useState(false);
    const [lockTooltip, setLockTooltip] = useState('Lock');
    const [unlockTooltip, setUnlockTooltip] = useState('Unlock');
    const [nameHeader, setNameHeader] = useState('Name');
    const [valueHeader, setValueHeader] = useState('Value');
    const [emptyMessage, setEmptyMessage] = useState('No data available');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const pendingScrollTop = useRef<number | undefined>(undefined);
    const scrollRafId = useRef<number>(0);
    const tooltipTimerId = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [tooltipHtml, setTooltipHtml] = useState<string | undefined>(undefined);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Restore state on mount and signal readiness to the extension host
    useEffect(() => {
        const state = vscodeApi.getState();
        if (state?.nameColWidth && typeof state.nameColWidth === 'string') {
            document.documentElement.style.setProperty('--name-col-width', state.nameColWidth);
        }
        if (state?.selectedId && typeof state.selectedId === 'string') {
            setSelectedId(state.selectedId);
        }
        if (state?.scrollTop && typeof state.scrollTop === 'number') {
            pendingScrollTop.current = state.scrollTop as number;
        }
        vscodeApi.postMessage({ type: 'ready' });
    }, []);

    // Restore scroll position once rows are rendered
    useEffect(() => {
        if (viewState === 'data' && pendingScrollTop.current !== undefined) {
            const top = pendingScrollTop.current;
            pendingScrollTop.current = undefined;
            requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = top;
                }
            });
        }
    }, [viewState]);

    // Listen for messages from the extension host
    useEffect(() => {
        function handleMessage(event: MessageEvent<HostToWebviewMessage>) {
            const msg = event.data;
            if (msg.type === 'update') {
                setRows(msg.rows);
                setLockable(msg.features?.lockable ?? false);
                setLockTooltip(msg.features?.lockTooltip ?? 'Lock');
                setUnlockTooltip(msg.features?.unlockTooltip ?? 'Unlock');
                setNameHeader(msg.nameHeader ?? 'Name');
                setValueHeader(msg.valueHeader ?? 'Value');
                setEmptyMessage(msg.emptyMessage ?? 'No data available');
                setViewState(msg.loading ? 'loading' : msg.rows.length > 0 ? 'data' : 'empty');
            }
        }
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleToggle = useCallback((id: string, expanded: boolean) => {
        vscodeApi.postMessage({ type: 'toggle', id, expanded });
    }, [vscodeApi]);

    const handleLock = useCallback((id: string) => {
        vscodeApi.postMessage({ type: 'lock', id });
    }, [vscodeApi]);

    const handleSelect = useCallback((id: string) => {
        setSelectedId(prev => {
            const newId = prev === id ? undefined : id;
            const state = vscodeApi.getState() ?? {};
            vscodeApi.setState({ ...state, selectedId: newId });
            return newId;
        });
    }, [vscodeApi]);

    const handleTooltipEnter = useCallback((content: string, e: React.MouseEvent) => {
        clearTimeout(tooltipTimerId.current);
        setTooltipHtml(content);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        setTooltipVisible(false);
        tooltipTimerId.current = setTimeout(() => setTooltipVisible(true), 1000);
    }, []);

    const handleTooltipLeave = useCallback(() => {
        clearTimeout(tooltipTimerId.current);
        setTooltipVisible(false);
        setTooltipHtml(undefined);
    }, []);

    // Clamp tooltip into viewport after it becomes visible
    useEffect(() => {
        const el = tooltipRef.current;
        if (!tooltipVisible || !el) return;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = tooltipPos.x + 12;
        let top = tooltipPos.y + 16;
        if (left + rect.width > vw) { left = Math.max(0, vw - rect.width - 4); }
        if (top + rect.height > vh) { top = Math.max(0, tooltipPos.y - rect.height - 8); }
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }, [tooltipVisible, tooltipPos]);

    // Throttle scroll persistence to once per animation frame
    const handleScroll = useCallback(() => {
        cancelAnimationFrame(scrollRafId.current);
        scrollRafId.current = requestAnimationFrame(() => {
            if (!scrollContainerRef.current) return;
            const state = vscodeApi.getState() ?? {};
            vscodeApi.setState({ ...state, scrollTop: scrollContainerRef.current.scrollTop });
        });
    }, [vscodeApi]);

    // Column resize
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const container = tableContainerRef.current;
        if (!container) return;
        const headerCell = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
        const startX = e.clientX;
        const startWidth = headerCell.offsetWidth;
        const containerWidth = container.offsetWidth;
        document.body.classList.add('resizing');

        function onMouseMove(ev: MouseEvent) {
            const delta = ev.clientX - startX;
            const newWidth = Math.max(40, startWidth + delta);
            const pct = Math.min(90, Math.max(10, (newWidth / containerWidth) * 100));
            const widthValue = `${pct}%`;
            document.documentElement.style.setProperty('--name-col-width', widthValue);
            const state = vscodeApi.getState() ?? {};
            vscodeApi.setState({ ...state, nameColWidth: widthValue });
        }

        function onMouseUp() {
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [vscodeApi]);

    if (viewState === 'loading') {
        return <div className="progress-container"><div className="progress-bar" /></div>;
    }

    return (
        <div className="tree-table" ref={tableContainerRef}>
            <div className="table-header">
                <div className="header-cell cell-name">
                    {nameHeader}
                    <div className="resize-handle" onMouseDown={handleResizeStart} />
                </div>
                <div className="header-cell cell-value">{valueHeader}</div>
            </div>
            <div className="scroll-container" ref={scrollContainerRef} onScroll={handleScroll}>
                {viewState === 'empty'
                    ? <div className="empty-state">{emptyMessage}</div>
                    : (
                        <table>
                            <tbody>
                                {rows.map(row => (
                                    <TreeRow
                                        key={row.id}
                                        row={row}
                                        lockable={lockable}
                                        lockTooltip={lockTooltip}
                                        unlockTooltip={unlockTooltip}
                                        selected={selectedId === row.id}
                                        onToggle={handleToggle}
                                        onLock={handleLock}
                                        onSelect={handleSelect}
                                        onTooltipEnter={handleTooltipEnter}
                                        onTooltipLeave={handleTooltipLeave}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>
            {tooltipVisible && tooltipHtml && (
                <div
                    ref={tooltipRef}
                    className="custom-tooltip visible"
                    style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 16 }}
                    dangerouslySetInnerHTML={{ __html: tooltipHtml }}
                />
            )}
        </div>
    );
}
