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
import { logger } from '../../logger';
import { filterSwoCsvRows, parseSwoCsv, parseSwoCsvLines, sortSwoCsvRows, type SwoCsvFilter, type SwoCsvRow, type SwoCsvSort, type SwoCsvTable } from './swo-csv-table';
import type { SwoCsvHostMessage, SwoCsvWebviewMessage } from './swo-csv-protocol';

export const SWO_CSV_EDITOR_VIEW_TYPE = 'vscode-cmsis-debugger.swoCsvTableViewer';
export const CSV_TABLE_EDITOR_VIEW_TYPE = 'vscode-cmsis-debugger.csvTableViewer';

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
        webviewPanel.webview.html = this.buildShell(webviewPanel.webview);

        let table: SwoCsvTable = { columns: [], rows: [], malformedRowCount: 0 };
        let filteredRows: readonly SwoCsvRow[] = [];
        let filters: readonly SwoCsvFilter[] = [];
        let sort: SwoCsvSort | null = null;
        let loadGeneration = 0;

        const updateRows = (): void => {
            filteredRows = sortSwoCsvRows(filterSwoCsvRows(table.rows, filters), sort);
        };

        const postMessage = (message: SwoCsvHostMessage): void => {
            void webviewPanel.webview.postMessage(message);
        };
        const postState = (loading: boolean, error?: string): void => {
            const message: SwoCsvHostMessage = {
                type: 'tableState',
                columns: table.columns,
                totalRowCount: filteredRows.length,
                malformedRowCount: table.malformedRowCount,
                loading,
                ...(error === undefined ? {} : { error }),
            };
            postMessage(message);
        };
        const load = async (): Promise<void> => {
            const generation = ++loadGeneration;
            postState(true);
            try {
                table = await this.readTable(document.uri);
                if (generation !== loadGeneration) {
                    return;
                }
                updateRows();
                postState(false);
            } catch (error) {
                if (generation === loadGeneration) {
                    postState(false, `Unable to load CSV: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        webviewPanel.webview.onDidReceiveMessage((message: SwoCsvWebviewMessage) => {
            switch (message.type) {
                case 'requestRows': {
                    const start = Math.max(0, message.start);
                    const end = Math.max(start, message.end);
                    postMessage({
                        type: 'rows',
                        requestId: message.requestId,
                        start,
                        rows: filteredRows.slice(start, end),
                        totalRowCount: filteredRows.length,
                    });
                    break;
                }
                case 'setFilters':
                    filters = message.filters;
                    updateRows();
                    postState(false);
                    break;
                case 'setSort':
                    sort = message.sort;
                    updateRows();
                    postState(false);
                    break;
                case 'cellSelected':
                    this.logCellSelection(message, table);
                    break;
            }
        });

        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(document.uri, '*'));
        watcher.onDidChange(uri => {
            if (uri.toString() === document.uri.toString()) {
                void load();
            }
        });
        webviewPanel.onDidDispose(() => watcher.dispose());
        await load();
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

    private async readTable(uri: vscode.Uri): Promise<SwoCsvTable> {
        if (uri.scheme !== 'file') {
            const bytes = await vscode.workspace.fs.readFile(uri);
            return parseSwoCsv(new TextDecoder().decode(bytes));
        }

        const decoder = new TextDecoder();
        const lines: string[] = [];
        let remainder = '';
        // The URI originates from VS Code's custom-editor lifecycle.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        for await (const chunk of createReadStream(uri.fsPath)) {
            const text = remainder + decoder.decode(chunk, { stream: true });
            const lineParts = text.split(/\r?\n/);
            remainder = lineParts.pop() ?? '';
            lines.push(...lineParts);
        }
        remainder += decoder.decode();
        if (remainder.length > 0) {
            lines.push(remainder);
        }
        return parseSwoCsvLines(lines);
    }

    private logCellSelection(message: Extract<SwoCsvWebviewMessage, { type: 'cellSelected' }>, table: SwoCsvTable): void {
        const row = table.rows[message.sourceRowIndex];
        if (row === undefined || table.columns[message.columnIndex] !== message.columnName || row.cells[message.columnIndex] !== message.cellValue) {
            logger.warn('[SwoCsvEditor] Ignored invalid cell selection message');
            return;
        }
        logger.debug(`[SwoCsvEditor] Cell selected: row=${message.sourceRowIndex} column=${message.columnIndex} name=${message.columnName} value=${message.cellValue}`);
    }
}
