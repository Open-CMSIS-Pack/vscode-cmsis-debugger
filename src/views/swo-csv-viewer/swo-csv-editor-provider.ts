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

import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { stat } from 'node:fs/promises';
import { logger } from '../../logger';
import { copySwoCsvRows } from './copy-swo-csv-rows';
import { IndexedSwoCsvRowStore } from './indexed-swo-csv-row-store';
import { InMemorySwoCsvRowStore, type SwoCsvRowStore } from './swo-csv-row-store';
import { parseSwoCsv, parseSwoCsvChunks, type SwoCsvFilter, type SwoCsvSort } from './swo-csv-table';
import type { SwoCsvHostMessage, SwoCsvWebviewMessage } from './swo-csv-protocol';

export const SWO_CSV_EDITOR_VIEW_TYPE = 'vscode-cmsis-debugger.swoCsvTableViewer';
const IN_MEMORY_FILE_SIZE_LIMIT = 20 * 1024 * 1024;

interface PendingFirstRender {
    readonly loadGeneration: number;
    readonly loadStartedAt: number;
    readonly rowsRequestedAt: number;
}

interface PendingViewRender {
    readonly generation: number;
    readonly operation: 'Filter' | 'Sort';
    readonly operationStartedAt: number;
    readonly rowsRequestedAt: number;
}

export class SwoCsvEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public constructor(private readonly extensionUri: vscode.Uri) { }

    public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => undefined };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        let rowStore: SwoCsvRowStore = new InMemorySwoCsvRowStore({ columns: [], rows: [], malformedRowCount: 0 });
        let filters: readonly SwoCsvFilter[] = [];
        let sort: SwoCsvSort | null = null;
        let loadGeneration = 0;
        let updateGeneration = 0;
        let disposed = false;
        let pendingFirstRender: Omit<PendingFirstRender, 'rowsRequestedAt'> | null = null;
        const firstRenderRequests = new Map<number, PendingFirstRender>();
        let pendingViewRender: Omit<PendingViewRender, 'rowsRequestedAt'> | null = null;
        const viewRenderRequests = new Map<number, PendingViewRender>();

        const postMessage = (message: SwoCsvHostMessage): void => {
            void webviewPanel.webview.postMessage(message);
        };
        const postState = (loading: boolean, error?: string, loadingMessage?: string): void => {
            const message: SwoCsvHostMessage = {
                type: 'tableState',
                columns: rowStore.columns,
                totalRowCount: rowStore.rowCount,
                malformedRowCount: rowStore.malformedRowCount,
                loading,
                ...(loadingMessage === undefined ? {} : { loadingMessage }),
                ...(error === undefined ? {} : { error }),
            };
            postMessage(message);
        };
        const updateRowsWithProgress = async (loadingMessage: string, operation: 'filter' | 'sort'): Promise<void> => {
            const generation = ++updateGeneration;
            const updateStartedAt = performance.now();
            const operationLabel = operation === 'filter' ? 'Filter' : 'Sort';
            const activeFilters = filters.filter(filter => filter.value.length > 0);
            postState(true, undefined, loadingMessage);
            logger.debug(`[SwoCsvEditor] ${operationLabel} ${generation} started: column=${sort?.columnIndex ?? 'sourceRowIndex'} direction=${sort?.direction ?? 'none'} filters=${activeFilters.length} filterLengths=${activeFilters.map(filter => filter.value.length).join(',') || 'none'} sourceRows=${rowStore.rowCount}`);
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            if (generation !== updateGeneration) {
                return;
            }
            const timing = await rowStore.applyView(filters, sort);
            if (generation !== updateGeneration) {
                return;
            }
            pendingViewRender = { generation, operation: operationLabel, operationStartedAt: updateStartedAt };
            const externalTiming = timing.store === 'external-merge'
                ? ` runs=${timing.runCount} writeRuns=${formatMilliseconds(timing.writeRunsMs ?? 0)} mergeRuns=${formatMilliseconds(timing.mergeRunsMs ?? 0)}`
                : '';
            logger.debug(`[SwoCsvEditor] ${operationLabel} ${generation} host complete: total=${formatMilliseconds(performance.now() - updateStartedAt)} store=${timing.store} scan=${formatMilliseconds(timing.scanMs)} sort=${formatMilliseconds(timing.sortMs)} materialize=${formatMilliseconds(timing.materializeMs)} matchedRows=${timing.matchedRows}${externalTiming}`);
            postState(false);
        };
        const load = async (): Promise<void> => {
            const generation = ++loadGeneration;
            const loadStartedAt = performance.now();
            postState(true);
            logger.debug(`[SwoCsvEditor] Load ${generation} started: uri=${document.uri.toString()}`);
            try {
                const readStartedAt = performance.now();
                const loadedStore = await this.readRowStore(document.uri);
                const readAndParseMs = performance.now() - readStartedAt;
                if (disposed || generation !== loadGeneration) {
                    await loadedStore.dispose();
                    return;
                }
                const previousStore = rowStore;
                rowStore = loadedStore;
                await previousStore.dispose();
                const initializeRowsStartedAt = performance.now();
                await rowStore.applyView(filters, sort);
                const initializeRowsMs = performance.now() - initializeRowsStartedAt;
                postState(false);
                pendingFirstRender = { loadGeneration: generation, loadStartedAt };
                logger.debug(`[SwoCsvEditor] Load ${generation} host complete: total=${formatMilliseconds(performance.now() - loadStartedAt)} readAndParse=${formatMilliseconds(readAndParseMs)} initializeRows=${formatMilliseconds(initializeRowsMs)} rows=${rowStore.rowCount} malformedRows=${rowStore.malformedRowCount}`);
            } catch (error) {
                if (generation === loadGeneration) {
                    postState(false, `Unable to load CSV: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        webviewPanel.webview.onDidReceiveMessage(async (message: SwoCsvWebviewMessage) => {
            switch (message.type) {
                case 'ready':
                    void load();
                    break;
                case 'requestRows': {
                    const start = Math.max(0, message.start);
                    const end = Math.max(start, message.end);
                    const requestedStore = rowStore;
                    if (pendingFirstRender !== null) {
                        firstRenderRequests.set(message.requestId, {
                            ...pendingFirstRender,
                            rowsRequestedAt: performance.now(),
                        });
                        pendingFirstRender = null;
                    }
                    if (pendingViewRender !== null) {
                        viewRenderRequests.set(message.requestId, {
                            ...pendingViewRender,
                            rowsRequestedAt: performance.now(),
                        });
                        pendingViewRender = null;
                    }
                    const rows = await requestedStore.getRows(start, end);
                    if (disposed || requestedStore !== rowStore) {
                        break;
                    }
                    postMessage({
                        type: 'rows',
                        requestId: message.requestId,
                        start,
                        rows,
                        totalRowCount: requestedStore.rowCount,
                    });
                    break;
                }
                case 'rowsRendered': {
                    const timing = firstRenderRequests.get(message.requestId);
                    if (timing !== undefined) {
                        const renderedAt = performance.now();
                        logger.debug(`[SwoCsvEditor] Load ${timing.loadGeneration} first rows rendered: total=${formatMilliseconds(renderedAt - timing.loadStartedAt)} requestToRender=${formatMilliseconds(renderedAt - timing.rowsRequestedAt)}`);
                        firstRenderRequests.delete(message.requestId);
                    }
                    const viewTiming = viewRenderRequests.get(message.requestId);
                    if (viewTiming !== undefined) {
                        const renderedAt = performance.now();
                        logger.debug(`[SwoCsvEditor] ${viewTiming.operation} ${viewTiming.generation} first rows rendered: total=${formatMilliseconds(renderedAt - viewTiming.operationStartedAt)} requestToRender=${formatMilliseconds(renderedAt - viewTiming.rowsRequestedAt)}`);
                        viewRenderRequests.delete(message.requestId);
                    }
                    break;
                }
                case 'setFilters':
                    filters = message.filters;
                    void updateRowsWithProgress('Filtering CSV...', 'filter');
                    break;
                case 'setSort':
                    sort = message.sort;
                    void updateRowsWithProgress('Sorting CSV...', 'sort');
                    break;
                case 'cellSelected':
                    await this.logCellSelection(message, rowStore);
                    break;
                case 'copyRows': {
                    const requestedStore = rowStore;
                    const result = await copySwoCsvRows(
                        message.intervals,
                        requestedStore,
                        value => vscode.env.clipboard.writeText(value),
                        () => !disposed && requestedStore === rowStore,
                    );
                    if (result === 'invalid') {
                        logger.warn('[SwoCsvEditor] Ignored invalid copy rows message');
                    }
                    break;
                }
            }
        });

        webviewPanel.webview.html = this.buildShell(webviewPanel.webview);

        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(document.uri, '*'));
        watcher.onDidChange(uri => {
            if (uri.toString() === document.uri.toString()) {
                void load();
            }
        });
        webviewPanel.onDidDispose(() => {
            disposed = true;
            loadGeneration += 1;
            updateGeneration += 1;
            watcher.dispose();
            void rowStore.dispose();
        });
    }

    private buildShell(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'swo-csv-viewer.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'swo-csv-viewer.css'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="root"></div>
<script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private async readRowStore(uri: vscode.Uri): Promise<SwoCsvRowStore> {
        if (uri.scheme !== 'file') {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return new InMemorySwoCsvRowStore(parseSwoCsv(new TextDecoder().decode(bytes)));
        }

        // The URI originates from VS Code's custom-editor lifecycle.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fileStat = await stat(uri.fsPath);
        if (fileStat.size > IN_MEMORY_FILE_SIZE_LIMIT) {
            return await IndexedSwoCsvRowStore.create(uri.fsPath);
        }

        // The URI originates from VS Code's custom-editor lifecycle.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const stream = createReadStream(uri.fsPath, { encoding: 'utf8' });
        try {
            return new InMemorySwoCsvRowStore(await parseSwoCsvChunks(stream));
        } finally {
            stream.destroy();
        }
    }

    private async logCellSelection(message: Extract<SwoCsvWebviewMessage, { type: 'cellSelected' }>, rowStore: SwoCsvRowStore): Promise<void> {
        const row = await rowStore.getSourceRow(message.sourceRowIndex);
        if (row === undefined || rowStore.columns[message.columnIndex] !== message.columnName || row.cells[message.columnIndex] !== message.cellValue) {
            logger.warn('[SwoCsvEditor] Ignored invalid cell selection message');
            return;
        }
        logger.debug(`[SwoCsvEditor] Cell selected: row=${message.sourceRowIndex} column=${message.columnIndex} name=${message.columnName} value=${message.cellValue}`);
    }

}

const formatMilliseconds = (milliseconds: number): string => `${milliseconds.toFixed(1)}ms`;
