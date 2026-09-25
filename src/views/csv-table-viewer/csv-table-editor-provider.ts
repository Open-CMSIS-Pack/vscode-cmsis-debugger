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
import * as path from 'node:path';
import { logger } from '../../logger';
import { copyCsvTableRows } from './copy-csv-table-rows';
import { resolveCTraceRunReference } from './ctrace-run-resolver';
import { IndexedCsvTableRowStore } from './indexed-csv-table-row-store';
import { InMemoryCsvTableRowStore, type CsvTableRowStore } from './csv-table-row-store';
import { parseCsvTable, parseCsvTableChunks, type CsvTableFilter, type CsvTableSort } from './csv-table';
import type { CsvTableHostMessage, CsvTableWebviewMessage } from './csv-table-protocol';

export const CSV_TABLE_EDITOR_VIEW_TYPE = 'vscode-cmsis-debugger.csvTableViewer';
const IN_MEMORY_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const INDEX_PROGRESS_UPDATE_INTERVAL_MS = 250;

const formatMilliseconds = (milliseconds: number): string => `${milliseconds.toFixed(1)}ms`;
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

export class CsvTableEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly focusCTraceReference?: (solutionSet: string, ctraceRef: string, ctraceFilePath?: string) => Promise<boolean>
    ) { }

    public activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(CSV_TABLE_EDITOR_VIEW_TYPE, this, {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            }),
        );
    }

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
        let rowStore: CsvTableRowStore = new InMemoryCsvTableRowStore({ columns: [], rows: [], malformedRowCount: 0 });
        let filters: readonly CsvTableFilter[] = [];
        let sort: CsvTableSort | null = null;
        let loadGeneration = 0;
        let updateGeneration = 0;
        let viewRevision = 0;
        let disposed = false;
        let pendingFirstRender: Omit<PendingFirstRender, 'rowsRequestedAt'> | null = null;
        const firstRenderRequests = new Map<number, PendingFirstRender>();
        let pendingViewRender: Omit<PendingViewRender, 'rowsRequestedAt'> | null = null;
        const viewRenderRequests = new Map<number, PendingViewRender>();
        let disposeIndexProgressListener: (() => void) | undefined;
        let indexProgressTimer: ReturnType<typeof setTimeout> | undefined;
        let viewUpdateController: AbortController | undefined;

        const postMessage = (message: CsvTableHostMessage): void => {
            void webviewPanel.webview.postMessage(message);
        };
        const postState = (loading: boolean, error?: string, loadingMessage?: string, updating = false): void => {
            const message: CsvTableHostMessage = {
                type: 'tableState',
                viewRevision,
                columns: rowStore.columns,
                totalRowCount: rowStore.rowCount,
                malformedRowCount: rowStore.malformedRowCount,
                loading,
                indexing: rowStore.isIndexing,
                updating,
                ...(loadingMessage === undefined ? {} : { loadingMessage }),
                ...(error === undefined ? {} : { error }),
            };
            postMessage(message);
        };
        const clearIndexProgressUpdates = (): void => {
            disposeIndexProgressListener?.();
            disposeIndexProgressListener = undefined;
            if (indexProgressTimer !== undefined) {
                clearTimeout(indexProgressTimer);
                indexProgressTimer = undefined;
            }
        };
        const scheduleIndexProgressUpdate = (generation: number): void => {
            if (indexProgressTimer !== undefined) {
                return;
            }
            indexProgressTimer = setTimeout(() => {
                indexProgressTimer = undefined;
                if (!disposed && generation === loadGeneration) {
                    if (filters.some(filter => filter.value.length > 0) && sort === null) {
                        void updateRowsWithProgress('Filtering indexed rows...', 'filter');
                    } else {
                        postState(false);
                    }
                }
            }, INDEX_PROGRESS_UPDATE_INTERVAL_MS);
        };
        const updateRowsWithProgress = async (loadingMessage: string, operation: 'filter' | 'sort'): Promise<void> => {
            viewUpdateController?.abort();
            const controller = new AbortController();
            viewUpdateController = controller;
            const generation = ++updateGeneration;
            const updateStartedAt = performance.now();
            const operationLabel = operation === 'filter' ? 'Filter' : 'Sort';
            const requestedStore = rowStore;
            const activeFilters = filters.filter(filter => filter.value.length > 0);
            postState(false, undefined, loadingMessage, true);
            logger.debug(`[CsvTableEditor] ${operationLabel} ${generation} started: column=${sort?.columnIndex ?? 'sourceRowIndex'} direction=${sort?.direction ?? 'none'} filters=${activeFilters.length} filterLengths=${activeFilters.map(filter => filter.value.length).join(',') || 'none'} indexedSourceRows=${rowStore.sourceRowCount} activeViewRows=${rowStore.rowCount} partial=${rowStore.isIndexing}`);
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            if (operation === 'sort' && requestedStore.isIndexing) {
                await requestedStore.waitForIndexing();
            }
            if (generation !== updateGeneration || requestedStore !== rowStore || controller.signal.aborted) {
                return;
            }
            let timing;
            try {
                timing = await requestedStore.applyView(filters, sort, controller.signal);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }
                throw error;
            } finally {
                if (viewUpdateController === controller) {
                    viewUpdateController = undefined;
                }
            }
            if (generation !== updateGeneration || requestedStore !== rowStore) {
                return;
            }
            viewRevision += 1;
            pendingViewRender = { generation, operation: operationLabel, operationStartedAt: updateStartedAt };
            const externalTiming = timing.store === 'external-merge'
                ? ` runs=${timing.runCount} runCreation=${formatMilliseconds(timing.writeRunsMs ?? 0)} mergeRuns=${formatMilliseconds(timing.mergeRunsMs ?? 0)}`
                : '';
            logger.debug(`[CsvTableEditor] ${operationLabel} ${generation} host complete: total=${formatMilliseconds(performance.now() - updateStartedAt)} store=${timing.store} scan=${formatMilliseconds(timing.scanMs)} sort=${formatMilliseconds(timing.sortMs)} materialize=${formatMilliseconds(timing.materializeMs)} indexedSourceRows=${rowStore.sourceRowCount} activeViewRows=${rowStore.rowCount} matchedRows=${timing.matchedRows} partial=${rowStore.isIndexing}${externalTiming}`);
            postState(false);
        };
        const load = async (): Promise<void> => {
            viewUpdateController?.abort();
            viewUpdateController = undefined;
            const generation = ++loadGeneration;
            const loadStartedAt = performance.now();
            postState(true);
            logger.debug(`[CsvTableEditor] Load ${generation} started: uri=${document.uri.toString()}`);
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
                viewRevision += 1;
                clearIndexProgressUpdates();
                disposeIndexProgressListener = rowStore.onDidIndexProgress(() => scheduleIndexProgressUpdate(generation));
                await previousStore.dispose();
                const initializeRowsStartedAt = performance.now();
                await rowStore.applyView(filters, sort);
                const initializeRowsMs = performance.now() - initializeRowsStartedAt;
                postState(false);
                pendingFirstRender = { loadGeneration: generation, loadStartedAt };
                logger.debug(`[CsvTableEditor] Load ${generation} host complete: total=${formatMilliseconds(performance.now() - loadStartedAt)} readAndParse=${formatMilliseconds(readAndParseMs)} initializeRows=${formatMilliseconds(initializeRowsMs)} rows=${rowStore.rowCount} malformedRows=${rowStore.malformedRowCount}`);
            } catch (error) {
                if (generation === loadGeneration) {
                    postState(false, `Unable to load CSV: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        webviewPanel.webview.onDidReceiveMessage(async (message: CsvTableWebviewMessage) => {
            switch (message.type) {
                case 'ready':
                    void load();
                    break;
                case 'requestRows': {
                    if (message.viewRevision !== viewRevision) {
                        break;
                    }
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
                        viewRevision,
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
                        logger.debug(`[CsvTableEditor] Load ${timing.loadGeneration} first rows rendered: total=${formatMilliseconds(renderedAt - timing.loadStartedAt)} requestToRender=${formatMilliseconds(renderedAt - timing.rowsRequestedAt)}`);
                        firstRenderRequests.delete(message.requestId);
                    }
                    const viewTiming = viewRenderRequests.get(message.requestId);
                    if (viewTiming !== undefined) {
                        const renderedAt = performance.now();
                        logger.debug(`[CsvTableEditor] ${viewTiming.operation} ${viewTiming.generation} first rows rendered: total=${formatMilliseconds(renderedAt - viewTiming.operationStartedAt)} requestToRender=${formatMilliseconds(renderedAt - viewTiming.rowsRequestedAt)}`);
                        viewRenderRequests.delete(message.requestId);
                    }
                    break;
                }
                case 'setFilters':
                    filters = message.filters;
                    void updateRowsWithProgress('Filtering CSV...', 'filter');
                    break;
                case 'cancelViewUpdate':
                    updateGeneration += 1;
                    viewUpdateController?.abort();
                    viewUpdateController = undefined;
                    break;
                case 'setSort':
                    sort = message.sort;
                    void updateRowsWithProgress('Sorting CSV...', 'sort');
                    break;
                case 'cellSelected':
                    await this.handleCellSelection(document.uri, message, rowStore);
                    break;
                case 'copyRows': {
                    if (message.viewRevision !== viewRevision) {
                        logger.warn('[CsvTableEditor] Ignored stale copy rows message');
                        break;
                    }
                    const requestedStore = rowStore;
                    const requestedRevision = viewRevision;
                    const result = await copyCsvTableRows(
                        message.intervals,
                        requestedStore,
                        value => vscode.env.clipboard.writeText(value),
                        () => !disposed && requestedStore === rowStore && requestedRevision === viewRevision,
                    );
                    if (result === 'invalid') {
                        logger.warn('[CsvTableEditor] Ignored invalid copy rows message');
                    } else if (result === 'too-large') {
                        void vscode.window.showWarningMessage('The selected rows are too large to copy. Refine the selection or export the rows to a file.');
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
            viewUpdateController?.abort();
            watcher.dispose();
            clearIndexProgressUpdates();
            void rowStore.dispose();
        });
    }

    private buildShell(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'csv-table-viewer.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'csv-table-viewer.css'));
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

    private async readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> {
        if (uri.scheme !== 'file') {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return new InMemoryCsvTableRowStore(parseCsvTable(new TextDecoder().decode(bytes)));
        }

        // The URI originates from VS Code's custom-editor lifecycle.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fileStat = await stat(uri.fsPath);
        if (fileStat.size > IN_MEMORY_FILE_SIZE_LIMIT) {
            return await IndexedCsvTableRowStore.create(uri.fsPath);
        }

        // The URI originates from VS Code's custom-editor lifecycle.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const stream = createReadStream(uri.fsPath, { encoding: 'utf8' });
        try {
            return new InMemoryCsvTableRowStore(await parseCsvTableChunks(stream));
        } finally {
            stream.destroy();
        }
    }

    private async handleCellSelection(
        uri: vscode.Uri,
        message: Extract<CsvTableWebviewMessage, { type: 'cellSelected' }>,
        rowStore: CsvTableRowStore
    ): Promise<void> {
        const row = await rowStore.getSourceRow(message.sourceRowIndex);
        if (row === undefined || rowStore.columns[message.columnIndex] !== message.columnName || row.cells[message.columnIndex] !== message.cellValue) {
            logger.warn('[CsvTableEditor] Ignored invalid cell selection message');
            return;
        }
        logger.debug(`[CsvTableEditor] Cell selected: row=${message.sourceRowIndex} column=${message.columnIndex} name=${message.columnName} value=${message.cellValue}`);
        try {
            const match = await resolveCTraceRunReference(uri, rowStore.columns, row);
            if (match) {
                const solutionFolder = path.dirname(path.dirname(uri.fsPath));
                const ctraceFilePath = path.join(solutionFolder, '.cmsis', `${match.solutionSet}.ctrace.yml`);
                const focused = await this.focusCTraceReference?.(match.solutionSet, match.ctraceRef, ctraceFilePath);
                if (focused === false) {
                    logger.warn(`[CsvTableEditor] Failed to focus trace configuration reference: ${match.ctraceRef}`);
                }
            }
        } catch (error) {
            logger.error(`[CsvTableEditor] Failed to resolve trace configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

}
