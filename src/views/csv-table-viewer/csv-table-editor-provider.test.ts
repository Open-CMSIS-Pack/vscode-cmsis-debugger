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
import * as path from 'node:path';

import { extensionContextFactory } from '../../__test__/vscode.factory';
import { InMemoryCsvTableRowStore, type CsvTableRowStore } from './csv-table-row-store';
import { CSV_TABLE_EDITOR_VIEW_TYPE, CsvTableEditorProvider } from './csv-table-editor-provider';
import type { CsvTableHostMessage, CsvTableWebviewMessage } from './csv-table-protocol';

interface TestableCsvTableEditorProvider {
    handleCellSelection(
        uri: vscode.Uri,
        message: Extract<CsvTableWebviewMessage, { type: 'cellSelected' }>,
        rowStore: CsvTableRowStore
    ): Promise<void>;
}

type MessageHandler = (message: CsvTableWebviewMessage) => Promise<void>;

function createWebviewPanel(): {
    readonly panel: vscode.WebviewPanel;
    readonly webview: {
        options?: vscode.WebviewOptions;
        html?: string;
        readonly postMessage: jest.Mock;
    };
    sendMessage(message: CsvTableWebviewMessage): Promise<void>;
    dispose(): void;
} {
    let messageHandler: MessageHandler | undefined;
    let disposeHandler: (() => void) | undefined;
    const webview = {
        cspSource: 'vscode-resource:',
        asWebviewUri: jest.fn((uri: vscode.Uri) => `webview:${uri.path}`),
        onDidReceiveMessage: jest.fn((handler: MessageHandler) => {
            messageHandler = handler;
            return { dispose: jest.fn() };
        }),
        postMessage: jest.fn().mockResolvedValue(true),
    };
    const panel = {
        webview,
        onDidDispose: jest.fn((handler: () => void) => {
            disposeHandler = handler;
            return { dispose: jest.fn() };
        }),
    };
    return {
        panel: panel as unknown as vscode.WebviewPanel,
        webview,
        async sendMessage(message: CsvTableWebviewMessage): Promise<void> {
            await messageHandler?.(message);
        },
        dispose(): void {
            disposeHandler?.();
        },
    };
}

async function waitFor(assertion: () => void): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            if (attempt === 9) {
                throw error;
            }
            await new Promise(resolve => setImmediate(resolve));
        }
    }
}

describe('CsvTableEditorProvider', () => {
    beforeEach(() => {
        vscode.Uri.joinPath = jest.fn((base: vscode.Uri, ...pathSegments: string[]) =>
            vscode.Uri.file(path.join(base.fsPath, ...pathSegments)));
    });

    afterEach(() => jest.restoreAllMocks());

    it('registers itself as a retained custom editor provider', () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        const context = extensionContextFactory();

        provider.activate(context);

        expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
            CSV_TABLE_EDITOR_VIEW_TYPE,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
        expect(context.subscriptions).toHaveLength(1);
    });

    it('configures the webview, loads rows, and serves the active view', async () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        const rowStore = new InMemoryCsvTableRowStore({
            columns: ['time', 'event'],
            rows: [
                { sourceRowIndex: 0, cells: ['1', 'start'] },
                { sourceRowIndex: 1, cells: ['2', 'stop'] },
            ],
            malformedRowCount: 1,
        });
        const readRowStore = jest.spyOn(provider as unknown as { readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> }, 'readRowStore')
            .mockResolvedValue(rowStore);
        const fixture = createWebviewPanel();
        const document = { uri: vscode.Uri.file('/workspace/.trace/demo.SWO.csv'), dispose: jest.fn() };

        await provider.resolveCustomEditor(document, fixture.panel, {} as vscode.CancellationToken);
        await fixture.sendMessage({ type: 'ready' });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(2));

        expect(fixture.webview.options?.enableScripts).toBe(true);
        expect(fixture.webview.options?.localResourceRoots?.map(uri => uri.path)).toEqual(['/extension']);
        expect(fixture.webview.html).toContain('csv-table-viewer.js');
        expect(readRowStore).toHaveBeenCalledWith(document.uri);
        expect(fixture.webview.postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
            type: 'tableState', loading: true, totalRowCount: 0,
        }));
        expect(fixture.webview.postMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
            type: 'tableState', viewRevision: 1, columns: ['time', 'event'], totalRowCount: 2, malformedRowCount: 1, loading: false,
        }));

        await fixture.sendMessage({ type: 'requestRows', requestId: 4, viewRevision: 1, start: -2, end: 1 });

        expect(fixture.webview.postMessage).toHaveBeenLastCalledWith({
            type: 'rows', requestId: 4, viewRevision: 1, start: 0,
            rows: [{ sourceRowIndex: 0, cells: ['1', 'start'] }], totalRowCount: 2,
        } satisfies CsvTableHostMessage);
    });

    it('ignores row requests that do not match the current view revision', async () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        const rowStore = new InMemoryCsvTableRowStore({ columns: ['time'], rows: [], malformedRowCount: 0 });
        jest.spyOn(provider as unknown as { readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> }, 'readRowStore')
            .mockResolvedValue(rowStore);
        const fixture = createWebviewPanel();
        const document = { uri: vscode.Uri.file('/workspace/.trace/demo.SWO.csv'), dispose: jest.fn() };

        await provider.resolveCustomEditor(document, fixture.panel, {} as vscode.CancellationToken);
        await fixture.sendMessage({ type: 'ready' });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(2));
        fixture.webview.postMessage.mockClear();

        await fixture.sendMessage({ type: 'requestRows', requestId: 4, viewRevision: 0, start: 0, end: 10 });

        expect(fixture.webview.postMessage).not.toHaveBeenCalled();
    });

    it('filters the active view and exposes its new revision to row requests', async () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        const rowStore = new InMemoryCsvTableRowStore({
            columns: ['event'],
            rows: [
                { sourceRowIndex: 0, cells: ['start'] },
                { sourceRowIndex: 1, cells: ['stop'] },
            ],
            malformedRowCount: 0,
        });
        jest.spyOn(provider as unknown as { readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> }, 'readRowStore')
            .mockResolvedValue(rowStore);
        const fixture = createWebviewPanel();
        const document = { uri: vscode.Uri.file('/workspace/.trace/demo.SWO.csv'), dispose: jest.fn() };

        await provider.resolveCustomEditor(document, fixture.panel, {} as vscode.CancellationToken);
        await fixture.sendMessage({ type: 'ready' });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(2));

        await fixture.sendMessage({ type: 'setFilters', filters: [{ columnIndex: 0, value: 'stop' }] });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(4));
        await fixture.sendMessage({ type: 'requestRows', requestId: 5, viewRevision: 2, start: 0, end: 10 });

        expect(fixture.webview.postMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({
            type: 'tableState', viewRevision: 1, updating: true, loadingMessage: 'Filtering CSV...',
        }));
        expect(fixture.webview.postMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({
            type: 'tableState', viewRevision: 2, totalRowCount: 1, updating: false,
        }));
        expect(fixture.webview.postMessage).toHaveBeenLastCalledWith({
            type: 'rows', requestId: 5, viewRevision: 2, start: 0,
            rows: [{ sourceRowIndex: 1, cells: ['stop'] }], totalRowCount: 1,
        } satisfies CsvTableHostMessage);
    });

    it('reports a row-store loading error to the webview', async () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        jest.spyOn(provider as unknown as { readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> }, 'readRowStore')
            .mockRejectedValue(new Error('invalid CSV'));
        const fixture = createWebviewPanel();
        const document = { uri: vscode.Uri.file('/workspace/.trace/demo.SWO.csv'), dispose: jest.fn() };

        await provider.resolveCustomEditor(document, fixture.panel, {} as vscode.CancellationToken);
        await fixture.sendMessage({ type: 'ready' });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(2));

        expect(fixture.webview.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
            type: 'tableState', loading: false, error: 'Unable to load CSV: invalid CSV',
        }));
    });

    it('disposes the active row store when the editor panel closes', async () => {
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'));
        const rowStore = new InMemoryCsvTableRowStore({ columns: ['time'], rows: [], malformedRowCount: 0 });
        const dispose = jest.spyOn(rowStore, 'dispose');
        jest.spyOn(provider as unknown as { readRowStore(uri: vscode.Uri): Promise<CsvTableRowStore> }, 'readRowStore')
            .mockResolvedValue(rowStore);
        const fixture = createWebviewPanel();
        const document = { uri: vscode.Uri.file('/workspace/.trace/demo.SWO.csv'), dispose: jest.fn() };

        await provider.resolveCustomEditor(document, fixture.panel, {} as vscode.CancellationToken);
        await fixture.sendMessage({ type: 'ready' });
        await waitFor(() => expect(fixture.webview.postMessage).toHaveBeenCalledTimes(2));
        fixture.dispose();
        await waitFor(() => expect(dispose).toHaveBeenCalled());

        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(expect.any(vscode.RelativePattern));
    });

    it('focuses the first trace configuration reference matching a selected CSV row', async () => {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from([
            'ctrace-run:',
            '  ctrace-refs:',
            '    - ctrace-ref: data#0',
            '      type: dwt',
            '      stream: 1',
            '      source: 0',
            '    - ctrace-ref: data#1',
            '      type: dwt',
            '      stream: 1',
            '      source: 0',
            ''
        ].join('\n')));
        const focusCTraceReference = jest.fn().mockResolvedValue(true);
        const provider = new CsvTableEditorProvider(vscode.Uri.file('/extension'), focusCTraceReference);
        const rowStore = new InMemoryCsvTableRowStore({
            columns: ['cycles', 'stream', 'type', 'source'],
            rows: [{ sourceRowIndex: 0, cells: ['1', '1', 'dwt', '0'] }],
            malformedRowCount: 0
        });
        const message: Extract<CsvTableWebviewMessage, { type: 'cellSelected' }> = {
            type: 'cellSelected',
            sourceRowIndex: 0,
            columnIndex: 2,
            columnName: 'type',
            cellValue: 'dwt'
        };

        await (provider as unknown as TestableCsvTableEditorProvider).handleCellSelection(
            vscode.Uri.file('/workspace/.trace/demo+target.SWO.csv'),
            message,
            rowStore
        );

        expect(focusCTraceReference).toHaveBeenCalledWith(
            'demo+target',
            'data#0',
            path.join('/workspace', '.cmsis', 'demo+target.ctrace.yml')
        );
    });
});
