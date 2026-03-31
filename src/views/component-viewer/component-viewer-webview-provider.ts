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

import * as vscode from 'vscode';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { componentViewerLogger } from '../../logger';

/**
 * Message types sent from the webview to the extension host.
 */
export interface WebviewToggleMessage {
    type: 'toggle';
    id: string;
    expanded: boolean;
}

export interface WebviewLockMessage {
    type: 'lock';
    id: string;
}

export type WebviewMessage = WebviewToggleMessage | WebviewLockMessage;

/**
 * Renders the Component Viewer tree as an HTML table inside a sidebar
 * {@link vscode.WebviewView}.  Two columns are shown:
 *
 * | Name (label) | Value (description) |
 *
 * Expand/collapse is handled via postMessage round-trips.
 */
export class ComponentViewerWebviewProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | undefined;
    private _dataChangeDisposable: vscode.Disposable | undefined;
    private _codiconCssUri: vscode.Uri | undefined;

    /**
     * Callback invoked when a tree node is toggled (expanded/collapsed) in the
     * webview.  Set by the owner (ComponentViewerBase) so it can delegate to
     * the tree-data-provider's expansion tracking.
     */
    public onToggle: ((id: string, expanded: boolean) => void) | undefined;

    /**
     * Callback invoked when the lock/unlock button is clicked.
     */
    public onLock: ((id: string) => void) | undefined;

    constructor(
        private readonly _dataProvider: ComponentViewerTreeDataProvider,
        private readonly _extensionUri: vscode.Uri,
    ) {}

    /* ------------------------------------------------------------------ */
    /*  vscode.WebviewViewProvider                                        */
    /* ------------------------------------------------------------------ */

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this._view = webviewView;
        const codiconPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
        this._codiconCssUri = webviewView.webview.asWebviewUri(codiconPath);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        // Listen for messages from the webview (expand/collapse, lock).
        webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
            this.handleMessage(msg);
        });

        // Re-render whenever the data model fires a change.
        this._dataChangeDisposable?.dispose();
        this._dataChangeDisposable = this._dataProvider.onDidChangeTreeData(() => {
            this.render();
        });

        // Also dispose the listener when the webview itself is disposed.
        webviewView.onDidDispose(() => {
            this._dataChangeDisposable?.dispose();
            this._dataChangeDisposable = undefined;
            this._view = undefined;
        });

        // Initial render.
        this.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Public helpers                                                     */
    /* ------------------------------------------------------------------ */

    /** Force a re-render (e.g. after external data changes). */
    public refresh(): void {
        this.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Internal rendering                                                */
    /* ------------------------------------------------------------------ */

    private render(): void {
        if (!this._view) {
            return;
        }
        const roots = this._dataProvider.getChildren();
        const bodyHtml = this.renderNodes(roots, 0);
        this._view.webview.html = this.wrapHtml(bodyHtml);
    }

    /**
     * Recursively render a list of sibling nodes as table rows.
     * Expanded parents have their children rendered immediately afterward
     * with an increased indent level.
     */
    private renderNodes(nodes: ScvdGuiInterface[], depth: number): string {
        let html = '';
        for (const node of nodes) {
            html += this.renderRow(node, depth);
            if (node.hasGuiChildren() && this._dataProvider.isExpanded(node)) {
                const children = this._dataProvider.getChildren(node);
                html += this.renderNodes(children, depth + 1);
            }
        }
        return html;
    }

    /** Build a single `<tr>` for one node. */
    private renderRow(node: ScvdGuiInterface, depth: number): string {
        const name = this.escapeHtml(node.getGuiName() ?? '');
        const value = this.escapeHtml(node.getGuiValue() ?? '');
        const rawId = node.getGuiId();
        if (!rawId) {
            return '';
        }
        const id = this.escapeHtml(rawId);
        const hasChildren = node.hasGuiChildren();
        const expanded = hasChildren && this._dataProvider.isExpanded(node);
        const indent = depth * 16; // px per nesting level

        // Expand/collapse toggle or leaf placeholder.
        let toggle: string;
        if (hasChildren) {
            const chevronClass = expanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
            toggle = `<span class="toggle" data-id="${id}" data-expanded="${expanded}"><i class="codicon ${chevronClass}"></i></span>`;
        } else {
            toggle = '<span class="toggle-placeholder"></span>';
        }

        // Lock button for root instances (rendered right-aligned).
        let lockBtn = '';
        if (node.isRootInstance) {
            if (node.isLocked) {
                lockBtn = `<span class="lock-btn" data-id="${id}" title="Include in updates"><i class="codicon codicon-lock lock-icon-default"></i><i class="codicon codicon-unlock lock-icon-hover"></i></span>`;
            } else {
                lockBtn = `<span class="lock-btn" data-id="${id}" title="Exclude from updates"><i class="codicon codicon-lock"></i></span>`;
            }
        }

        const tooltip = name && value ? `${name}\n${value}` : name || value;

        return `<tr class="row${expanded ? ' expanded' : ''}${node.isLocked ? ' locked' : ''}" data-row-id="${id}" title="${tooltip}">
            <td class="cell-name" style="padding-left:${indent + 4}px">
                ${toggle}<span class="name">${name}</span>${lockBtn}
            </td>
            <td class="cell-value">${value}</td>
        </tr>\n`;
    }

    /* ------------------------------------------------------------------ */
    /*  Full HTML document                                                */
    /* ------------------------------------------------------------------ */

    private wrapHtml(bodyRows: string): string {
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view?.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${this._view?.webview.cspSource};">
<link rel="stylesheet" href="${this._codiconCssUri}">
<style>
    :root {
        --row-height: 22px;
        --font-size: var(--vscode-font-size, 13px);
        --name-col-width: 50%;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
        font-family: var(--vscode-font-family, sans-serif);
        font-size: var(--font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
        display: flex;
        flex-direction: column;
    }
    .scroll-container {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
    }
    table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
    }
    th, td {
        text-align: left;
        padding: 0 6px;
        height: var(--row-height);
        line-height: var(--row-height);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
        color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
        font-weight: 600;
        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, transparent));
    }
    .cell-name { width: var(--name-col-width); }
    td.cell-value { color: var(--vscode-descriptionForeground, #888); }
    /* Column resize handle on the Name header */
    .resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 5px;
        height: 100%;
        cursor: col-resize;
        z-index: 3;
    }
    .resize-handle:hover,
    .resize-handle.active {
        background: var(--vscode-focusBorder, #007fd4);
    }
    tr.row:hover {
        background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
    }
    tr.row.selected {
        background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.08));
        color: var(--vscode-list-inactiveSelectionForeground, inherit);
    }
    tr.row.selected:hover {
        background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.08));
    }
    .toggle, .toggle-placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        text-align: center;
        cursor: pointer;
        user-select: none;
    }
    .toggle .codicon {
        font-size: 16px;
    }
    .toggle-placeholder { cursor: default; }
    .cell-name {
        position: relative;
    }
    .lock-btn {
        position: absolute;
        right: 4px;
        top: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: var(--row-height);
        cursor: pointer;
        user-select: none;
        visibility: hidden;
        /* Opaque background so the icon covers text underneath */
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    }
    /* Unlocked: show lock icon only on row hover */
    tr.row:hover .lock-btn {
        visibility: visible;
        background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
    }
    /* Locked: always show the lock button */
    tr.row.locked .lock-btn {
        visibility: visible;
    }
    /* Selected row: match selection background */
    tr.row.selected .lock-btn {
        background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.08));
    }
    tr.row.selected:hover .lock-btn {
        background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.08));
    }
    /* Locked rows: dual icons — lock shown by default, unlock shown on hover */
    .lock-btn .lock-icon-hover { display: none !important; }
    .lock-btn .lock-icon-default { display: inline !important; }
    tr.row.locked:hover .lock-btn .lock-icon-default { display: none !important; }
    tr.row.locked:hover .lock-btn .lock-icon-hover { display: inline !important; }
    .lock-btn .codicon {
        font-size: 14px;
        line-height: var(--row-height);
    }
    .name { margin-left: 2px; }
    .empty-state {
        padding: 16px;
        text-align: center;
        color: var(--vscode-descriptionForeground, #888);
    }
    /* Prevent text selection while resizing columns */
    body.resizing { cursor: col-resize; user-select: none; }
    body.resizing * { cursor: col-resize !important; }
</style>
</head>
<body>
    ${bodyRows.length > 0
        ? `<div class="scroll-container"><table><thead><tr><th class="cell-name">Name<div class="resize-handle" id="resizeHandle"></div></th><th class="cell-value">Value</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`
        : '<div class="empty-state">No component data available</div>'
}
<script>
    const vscode = acquireVsCodeApi();

    /* Restore selection and scroll anchor after a re-render.
     * Instead of restoring a raw scrollTop (which drifts when rows above
     * change), we remember which row was selected and where it sat
     * relative to the viewport, then scroll so the row lands back in
     * the same visual spot.  Falls back to raw scrollTop when the
     * anchor row is no longer in the DOM. */
    (function restoreState() {
        const state = vscode.getState();
        if (!state) return;
        const sc = document.querySelector('.scroll-container');
        // Restore column width
        if (state.nameColWidth) {
            document.documentElement.style.setProperty('--name-col-width', state.nameColWidth);
        }
        // Restore selection highlight
        let anchorRow = null;
        if (state.selectedId) {
            anchorRow = document.querySelector('tr[data-row-id="' + state.selectedId + '"]');
            if (anchorRow) { anchorRow.classList.add('selected'); }
        }

        // Restore scroll — prefer anchor-based, fall back to raw scrollTop
        if (anchorRow && sc && state.anchorOffsetTop !== undefined) {
            const newRowTop = anchorRow.getBoundingClientRect().top;
            const scTop = sc.getBoundingClientRect().top;
            const currentOffset = newRowTop - scTop;
            sc.scrollTop += currentOffset - state.anchorOffsetTop;
        } else if (sc && state.scrollTop !== undefined) {
            sc.scrollTop = state.scrollTop;
        }
    })();

    /* Persist scroll position and anchor info on every scroll event */
    (function trackScroll() {
        const sc = document.querySelector('.scroll-container');
        if (!sc) return;
        sc.addEventListener('scroll', () => {
            const state = vscode.getState() || {};
            const update = { ...state, scrollTop: sc.scrollTop };
            // Recompute anchor offset for the selected row
            if (state.selectedId) {
                const row = document.querySelector('tr[data-row-id="' + state.selectedId + '"]');
                if (row) {
                    update.anchorOffsetTop = row.getBoundingClientRect().top - sc.getBoundingClientRect().top;
                }
            }
            vscode.setState(update);
        });
    })();

    /* Row selection */
    function selectRow(rowId) {
        document.querySelectorAll('tr.row.selected').forEach(r => r.classList.remove('selected'));
        const state = vscode.getState() || {};
        const update = { ...state, selectedId: rowId };
        if (rowId) {
            const row = document.querySelector('tr[data-row-id="' + rowId + '"]');
            if (row) {
                row.classList.add('selected');
                const sc = document.querySelector('.scroll-container');
                if (sc) {
                    update.anchorOffsetTop = row.getBoundingClientRect().top - sc.getBoundingClientRect().top;
                }
            }
        }
        vscode.setState(update);
    }

    document.addEventListener('click', (e) => {
        const row = e.target.closest('tr.row');
        if (row) {
            selectRow(row.dataset.rowId);
        }
        const toggle = e.target.closest('.toggle');
        if (toggle) {
            const id = toggle.dataset.id;
            const wasExpanded = toggle.dataset.expanded === 'true';
            vscode.postMessage({ type: 'toggle', id, expanded: !wasExpanded });
            return;
        }
        const lockBtn = e.target.closest('.lock-btn');
        if (lockBtn) {
            const id = lockBtn.dataset.id;
            vscode.postMessage({ type: 'lock', id });
            return;
        }
    });

    /* Clean up stale resize state that may survive a re-render */
    document.body.classList.remove('resizing');

    /* Column resize logic */
    (function initColumnResize() {
        const handle = document.getElementById('resizeHandle');
        if (!handle) return;
        const table = document.querySelector('table');
        if (!table) return;

        let startX = 0;
        let startWidth = 0;

        function onMouseDown(e) {
            e.preventDefault();
            const nameTh = handle.parentElement;
            startX = e.clientX;
            startWidth = nameTh.offsetWidth;
            document.body.classList.add('resizing');
            handle.classList.add('active');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            const delta = e.clientX - startX;
            const newWidth = Math.max(40, startWidth + delta);
            const tableWidth = table.offsetWidth;
            const pct = Math.min(90, Math.max(10, (newWidth / tableWidth) * 100));
            const widthValue = pct + '%';
            document.documentElement.style.setProperty('--name-col-width', widthValue);
            const state = vscode.getState() || {};
            vscode.setState({ ...state, nameColWidth: widthValue });
        }

        function onMouseUp() {
            document.body.classList.remove('resizing');
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        handle.addEventListener('mousedown', onMouseDown);
    })();
</script>
</body>
</html>`;
    }

    /* ------------------------------------------------------------------ */
    /*  Message handling                                                   */
    /* ------------------------------------------------------------------ */

    private handleMessage(msg: WebviewMessage): void {
        switch (msg.type) {
            case 'toggle':
                componentViewerLogger.debug(`[WebviewProvider] Toggle: id=${msg.id} expanded=${msg.expanded}`);
                this.onToggle?.(msg.id, msg.expanded);
                break;
            case 'lock':
                componentViewerLogger.debug(`[WebviewProvider] Lock: id=${msg.id}`);
                this.onLock?.(msg.id);
                break;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Utilities                                                         */
    /* ------------------------------------------------------------------ */

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
