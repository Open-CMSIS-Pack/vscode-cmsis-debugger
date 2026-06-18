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
import type { FlatRow, HostToWebviewMessage, WebviewToHostMessage } from './tree-view/tree-table-protocol';

/**
 * Renders the Component Viewer tree as a React-based HTML table inside a
 * sidebar {@link vscode.WebviewView}.
 *
 * The React bundle (`dist/webviews/tree-table.js`) is loaded in the webview
 * shell and receives the tree state via `postMessage` whenever data changes.
 * The webview sends back `toggle` and `lock` messages.
 */
export class ComponentViewerWebviewProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | undefined;
    private _dataChangeDisposable: vscode.Disposable | undefined;
    private _codiconCssUri: vscode.Uri | undefined;
    private _styleUri: vscode.Uri | undefined;
    private _scriptUri: vscode.Uri | undefined;
    private _loading = false;
    private _emptyMessage = '';
    private _renderScheduled = false;
    private _pendingViewStateReset = false;

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

        const codiconPath = vscode.Uri.joinPath(
            this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'
        );
        this._codiconCssUri = webviewView.webview.asWebviewUri(codiconPath);

        const scriptPath = vscode.Uri.joinPath(
            this._extensionUri, 'dist', 'webviews', 'tree-table.js'
        );
        this._scriptUri = webviewView.webview.asWebviewUri(scriptPath);

        const stylePath = vscode.Uri.joinPath(
            this._extensionUri, 'dist', 'webviews', 'tree-table.css'
        );
        this._styleUri = webviewView.webview.asWebviewUri(stylePath);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        // Set the static HTML shell once — React mounts into <div id="root">.
        webviewView.webview.html = this.buildShell(
            webviewView.webview.cspSource ?? '',
            String(this._codiconCssUri),
            String(this._styleUri),
            String(this._scriptUri),
        );

        // Listen for messages from the webview (expand/collapse, lock).
        webviewView.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
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

        // Initial render — send tree data to the React app.
        this.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Public helpers                                                     */
    /* ------------------------------------------------------------------ */

    /** Force a re-render (e.g. after external data changes). */
    public refresh(): void {
        this.render();
    }

    /**
     * Set the loading state shown in the webview.  When `true`, an indeterminate
     * progress bar is shown instead of the table or the empty-state message.
     */
    public setLoading(loading: boolean): void {
        this._loading = loading;
        this.render();
    }

    /** Set the text shown when the view has no rows and is not loading. */
    public setEmptyMessage(message: string): void {
        this._emptyMessage = message;
        this.render();
    }

    /** Reset webview-local UI state such as column width and scroll position. */
    public resetViewState(): void {
        this._pendingViewStateReset = true;
        this.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Internal rendering                                                */
    /* ------------------------------------------------------------------ */

    /** Coalesce back-to-back state changes in the same tick into one render. */
    private render(): void {
        if (this._renderScheduled) {
            return;
        }
        this._renderScheduled = true;
        void Promise.resolve().then(() => {
            this._renderScheduled = false;
            this.flushRender();
        });
    }

    private flushRender(): void {
        if (!this._view) {
            return;
        }

        const roots = this._dataProvider.getChildren();
        const rows = this.serializeNodes(roots, 0);
        // Show the filter-specific message only when an active filter filtered
        // out all rows from a non-empty underlying tree.
        const emptyMessage = this._dataProvider.isFilterActive && this._dataProvider.hasRoots && rows.length === 0
            ? 'No matching filter results'
            : this._emptyMessage;

        const message: HostToWebviewMessage = {
            type: 'update', rows, loading: this._loading,
            features: {
                lockable: true,
                lockTooltip: 'Exclude from updates',
                unlockTooltip: 'Include in updates',
            },
            emptyMessage,
            resetViewState: this._pendingViewStateReset,
        };
        this._pendingViewStateReset = false;
        void this._view.webview.postMessage(message);
    }

    /**
     * Recursively flatten the tree into an array of {@link FlatRow} objects.
     * Expanded parents have their children serialized immediately afterward
     * with an increased depth level.
     */
    private serializeNodes(nodes: ScvdGuiInterface[], depth: number): FlatRow[] {
        const result: FlatRow[] = [];
        for (const node of nodes) {
            const rawId = node.getGuiId();
            if (!rawId) {
                continue;
            }
            const hasChildren = node.hasGuiChildren();
            const expanded = hasChildren && this._dataProvider.isExpanded(node);
            result.push({
                id: rawId,
                depth,
                hasChildren,
                expanded,
                name: node.getGuiName() ?? '',
                value: node.getGuiValue() ?? '',
                lockEnabled: node.isRootInstance ?? false,
                locked: node.isLocked ?? false,
            });
            if (expanded) {
                const children = this._dataProvider.getChildren(node);
                result.push(...this.serializeNodes(children, depth + 1));
            }
        }
        return result;
    }

    /* ------------------------------------------------------------------ */
    /*  HTML shell                                                        */
    /* ------------------------------------------------------------------ */

    private buildShell(cspSource: string, codiconCssUri: string, styleUri: string, scriptUri: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource}; font-src ${cspSource};">
<link rel="stylesheet" href="${codiconCssUri}">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="root"></div>
<script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /* ------------------------------------------------------------------ */
    /*  Message handling                                                   */
    /* ------------------------------------------------------------------ */

    private handleMessage(msg: WebviewToHostMessage): void {
        switch (msg.type) {
            case 'ready':
                // The React app has mounted — send the current data so it isn't missed.
                componentViewerLogger.debug('[WebviewProvider] Webview ready, sending initial data');
                this.render();
                break;
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
}
