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

import { extensionContextFactory } from '../../__test__/vscode.factory';
import { TraceConfigurationModel } from './trace-configuration-model';
import { TraceWebviewToHostMessage } from './trace-configuration-protocol';
import { VIEW_ID } from './trace-configuration-types';
import { TraceConfigurationWebviewProvider } from './trace-configuration-webview-provider';

type MessageHandler = (message: TraceWebviewToHostMessage) => void;
type DisposeHandler = () => void;

interface FakeWebviewView {
    webview: {
        options?: vscode.WebviewOptions;
        html?: string;
        cspSource: string;
        asWebviewUri: jest.Mock;
        onDidReceiveMessage: jest.Mock;
        postMessage: jest.Mock;
    };
    onDidDispose: jest.Mock;
}

class FakeTraceConfigurationModel {
    public readonly setOnDidChange = jest.fn((callback: () => void) => {
        this.onDidChange = callback;
    });
    public readonly dispose = jest.fn();
    public readonly disposeViewResources = jest.fn();
    public readonly loadInitialFile = jest.fn().mockResolvedValue(undefined);
    public readonly refreshFile = jest.fn().mockResolvedValue(undefined);
    public readonly saveCurrentDocument = jest.fn().mockResolvedValue(undefined);
    public readonly openFile = jest.fn().mockResolvedValue(undefined);
    public readonly updateExpandedState = jest.fn();
    public readonly updateValue = jest.fn().mockResolvedValue(undefined);
    public readonly addItem = jest.fn().mockResolvedValue(undefined);
    public readonly removeItem = jest.fn().mockResolvedValue(undefined);
    public readonly reportError = jest.fn();
    public readonly createState = jest.fn(() => ({
        fileName: 'target.ctrace.yml',
        dirty: false,
        diagnostics: [],
        rows: []
    }));
    private onDidChange: (() => void) | undefined;

    public fireDidChange(): void {
        this.onDidChange?.();
    }
}

function asModel(model: FakeTraceConfigurationModel): TraceConfigurationModel {
    return model as unknown as TraceConfigurationModel;
}

function createWebviewView(): {
    view: vscode.WebviewView;
    fake: FakeWebviewView;
    sendMessage: (message: TraceWebviewToHostMessage) => void;
    disposeView: () => void;
    } {
    let messageHandler: MessageHandler | undefined;
    let disposeHandler: DisposeHandler | undefined;
    const fake: FakeWebviewView = {
        webview: {
            cspSource: 'vscode-resource:',
            asWebviewUri: jest.fn((uri: vscode.Uri) => `webview:${uri.path}`),
            onDidReceiveMessage: jest.fn((handler: MessageHandler) => {
                messageHandler = handler;
                return { dispose: jest.fn() };
            }),
            postMessage: jest.fn().mockResolvedValue(true)
        },
        onDidDispose: jest.fn((handler: DisposeHandler) => {
            disposeHandler = handler;
            return { dispose: jest.fn() };
        })
    };
    return {
        view: fake as unknown as vscode.WebviewView,
        fake,
        sendMessage: (message: TraceWebviewToHostMessage) => {
            messageHandler?.(message);
        },
        disposeView: () => {
            disposeHandler?.();
        }
    };
}

describe('TraceConfigurationWebviewProvider', () => {
    beforeEach(() => {
        vscode.Uri.joinPath = jest.fn((base: vscode.Uri, ...pathSegments: string[]) =>
            vscode.Uri.file([base.fsPath, ...pathSegments].join('/')));
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('registers the trace generation webview provider and disposes the model with the extension context', () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const context = extensionContextFactory();

        provider.activate(context);
        context.subscriptions.forEach(disposable => disposable.dispose());

        expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(VIEW_ID, provider);
        expect(model.dispose).toHaveBeenCalledTimes(1);
    });

    it('configures the webview shell and loads the initial file when resolved', () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, fake } = createWebviewView();

        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        expect(fake.webview.options?.enableScripts).toBe(true);
        expect(fake.webview.options?.localResourceRoots?.map(uri => uri.path)).toEqual(['/extension']);
        expect(fake.webview.html).toContain('trace-configuration.js');
        expect(fake.webview.html).toContain('trace-configuration.css');
        expect(fake.webview.html).toContain('codicon.css');
        expect(fake.webview.onDidReceiveMessage).toHaveBeenCalled();
        expect(model.loadInitialFile).toHaveBeenCalledTimes(1);
    });

    it('posts model state when the webview is ready or the model changes', () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, fake, sendMessage } = createWebviewView();
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        sendMessage({ type: 'ready' });
        model.fireDidChange();

        expect(fake.webview.postMessage).toHaveBeenCalledTimes(2);
        expect(fake.webview.postMessage).toHaveBeenCalledWith({
            type: 'update',
            state: {
                fileName: 'target.ctrace.yml',
                dirty: false,
                diagnostics: [],
                rows: []
            }
        });
    });

    it('routes webview messages to model operations', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, sendMessage } = createWebviewView();
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        sendMessage({ type: 'refresh' });
        sendMessage({ type: 'save' });
        sendMessage({ type: 'toggle', id: 'row-1', expanded: true });
        sendMessage({ type: 'updateValue', path: ['ctrace', 'setup', 0, 'pname'], value: 'cm33' });
        sendMessage({ type: 'addItem', path: ['ctrace', 'setup', 0, 'data'], addChildKind: 'data' });
        sendMessage({ type: 'removeItem', path: ['ctrace', 'setup', 0, 'data', 0] });
        await Promise.resolve();

        expect(model.refreshFile).toHaveBeenCalledTimes(1);
        expect(model.saveCurrentDocument).toHaveBeenCalledTimes(1);
        expect(model.updateExpandedState).toHaveBeenCalledWith('row-1', true);
        expect(model.updateValue).toHaveBeenCalledWith(['ctrace', 'setup', 0, 'pname'], 'cm33');
        expect(model.addItem).toHaveBeenCalledWith(['ctrace', 'setup', 0, 'data'], 'data');
        expect(model.removeItem).toHaveBeenCalledWith(['ctrace', 'setup', 0, 'data', 0]);
    });

    it('opens the file selected by the user', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, sendMessage } = createWebviewView();
        const selectedFile = vscode.Uri.file('/workspace/target.ctrace.yml');
        (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([selectedFile]);
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        sendMessage({ type: 'openFile' });
        await Promise.resolve();

        expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'CMSIS Trace YAML': ['yml', 'yaml']
            },
            title: 'Open CMSIS Trace Configuration'
        });
        expect(model.openFile).toHaveBeenCalledWith(selectedFile.fsPath);
    });

    it('does not open a file when the user cancels the picker', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, sendMessage } = createWebviewView();
        (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        sendMessage({ type: 'openFile' });
        await Promise.resolve();

        expect(model.openFile).not.toHaveBeenCalled();
    });

    it('reports model errors raised while handling webview messages', async () => {
        const model = new FakeTraceConfigurationModel();
        const expectedError = new Error('save failed');
        model.saveCurrentDocument.mockRejectedValue(expectedError);
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, sendMessage } = createWebviewView();
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        sendMessage({ type: 'save' });
        await Promise.resolve();

        expect(model.reportError).toHaveBeenCalledWith(expectedError, 'Trace Configuration: Webview action failed');
    });

    it('disposes view resources and stops posting updates after the webview is disposed', () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, fake, disposeView } = createWebviewView();
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        disposeView();
        model.fireDidChange();

        expect(model.disposeViewResources).toHaveBeenCalledTimes(1);
        expect(model.dispose).not.toHaveBeenCalled();
        expect(fake.webview.postMessage).not.toHaveBeenCalled();
    });
});
