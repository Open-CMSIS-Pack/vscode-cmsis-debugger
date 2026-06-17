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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatRow, HostToWebviewMessage, TooltipContent, WebviewToHostMessage } from './types';
import { TreeRow } from './tree-row';

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
    const defaultVscodeContext = JSON.stringify({
        preventDefaultContextMenuItems: true,
    });
    const [rows, setRows] = useState<FlatRow[]>([]);
    const [viewState, setViewState] = useState<ViewState>('empty');
    const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
    const [lockable, setLockable] = useState(false);
    const [lockTooltip, setLockTooltip] = useState('Lock');
    const [unlockTooltip, setUnlockTooltip] = useState('Unlock');
    const [emptyMessage, setEmptyMessage] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const pendingScrollTop = useRef<number | undefined>(undefined);
    const scrollRafId = useRef<number>(0);
    const tooltipTimerId = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [tooltipContent, setTooltipContent] = useState<TooltipContent | undefined>(undefined);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const resetLocalViewState = useCallback(() => {
        const firstRow = tableContainerRef.current?.querySelector('tr');
        const columnCount = firstRow?.children.length ?? 2;
        const nameColWidth = `${100 / Math.max(1, columnCount)}%`;
        document.documentElement.style.setProperty('--name-col-width', nameColWidth);
        setSelectedId(undefined);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
            scrollContainerRef.current.style.setProperty('--scroll-top', '0px');
        }
        vscodeApi.setState({ nameColWidth, scrollTop: 0 });
    }, [vscodeApi]);

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
                    scrollContainerRef.current.style.setProperty('--scroll-top', `${top}px`);
                }
            });
        }
    }, [viewState]);

    // Keep the resize handle aligned after expand/collapse/filter changes alter
    // the scrollable height without necessarily firing a scroll event.
    useEffect(() => {
        if (viewState !== 'data') {
            return;
        }
        const rafId = requestAnimationFrame(() => {
            const scrollContainer = scrollContainerRef.current;
            if (!scrollContainer) {
                return;
            }
            const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height'));
            const contentHeight = rows.length * (Number.isFinite(rowHeight) ? rowHeight : 22);
            const maxScrollTop = Math.max(0, contentHeight - scrollContainer.clientHeight);
            const scrollTop = Math.min(scrollContainer.scrollTop, maxScrollTop);
            if (scrollContainer.scrollTop !== scrollTop) {
                scrollContainer.scrollTop = scrollTop;
            }
            scrollContainer.style.setProperty('--scroll-top', `${scrollTop}px`);
            const state = vscodeApi.getState() ?? {};
            vscodeApi.setState({ ...state, scrollTop });
        });
        return () => cancelAnimationFrame(rafId);
    }, [rows, viewState, vscodeApi]);

    // Listen for messages from the extension host
    useEffect(() => {
        function handleMessage(event: MessageEvent<HostToWebviewMessage>) {
            const msg = event.data;
            if (msg.type === 'update') {
                setRows(msg.rows);
                setLockable(msg.features?.lockable ?? false);
                setLockTooltip(msg.features?.lockTooltip ?? 'Lock');
                setUnlockTooltip(msg.features?.unlockTooltip ?? 'Unlock');
                setEmptyMessage(msg.emptyMessage ?? '');
                setViewState(msg.loading ? 'loading' : msg.rows.length > 0 ? 'data' : 'empty');
                if (msg.resetViewState) {
                    resetLocalViewState();
                }
            }
        }
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [resetLocalViewState]);

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

    const handleTooltipEnter = useCallback((content: TooltipContent, e: React.MouseEvent) => {
        clearTimeout(tooltipTimerId.current);
        setTooltipContent(content);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        setTooltipVisible(false);
        tooltipTimerId.current = setTimeout(() => setTooltipVisible(true), 1000);
    }, []);

    const handleTooltipLeave = useCallback(() => {
        clearTimeout(tooltipTimerId.current);
        setTooltipVisible(false);
        setTooltipContent(undefined);
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
            const scrollTop = scrollContainerRef.current.scrollTop;
            scrollContainerRef.current.style.setProperty('--scroll-top', `${scrollTop}px`);
            vscodeApi.setState({ ...state, scrollTop });
        });
    }, [vscodeApi]);

    // Column resize
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;
        const containerRect = scrollContainer.getBoundingClientRect();
        const containerWidth = scrollContainer.clientWidth;
        const dividerLeft = (e.currentTarget as HTMLElement).offsetLeft;
        // Preserve the cursor-to-divider offset captured at mousedown.
        const grabOffset = e.clientX - containerRect.left - dividerLeft;
        document.body.classList.add('resizing');

        function onMouseMove(ev: MouseEvent) {
            const newWidth = ev.clientX - containerRect.left - grabOffset;
            const clampedWidth = Math.round(Math.min(containerWidth * 0.85, Math.max(containerWidth * 0.15, newWidth)));
            const widthValue = `${(clampedWidth / containerWidth) * 100}%`;
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
        return <div className="progress-container" data-vscode-context={defaultVscodeContext}><div className="progress-bar" /></div>;
    }

    return (
        <div className="tree-table" ref={tableContainerRef} data-vscode-context={defaultVscodeContext}>
            <div className="scroll-container" ref={scrollContainerRef} onScroll={handleScroll}>
                {viewState === 'data' && <div className="column-resize-handle" onMouseDown={handleResizeStart} />}
                {viewState === 'empty'
                    ? emptyMessage ? <div className="empty-state">{emptyMessage}</div> : null
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
            {tooltipVisible && tooltipContent && (
                <div
                    ref={tooltipRef}
                    className="custom-tooltip visible"
                >
                    {tooltipContent.head && <strong>{tooltipContent.head}</strong>}
                    {tooltipContent.bodyLines?.map((line, i) => (
                        <React.Fragment key={i}>
                            {(i > 0 || tooltipContent.head) && <br />}
                            {line}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
