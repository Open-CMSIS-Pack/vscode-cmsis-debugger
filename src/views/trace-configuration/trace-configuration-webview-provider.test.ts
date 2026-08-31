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
import {
    TRACE_CONFIGURATION_SHOW_CTRACE_REFS_SETTING,
    TRACE_CONFIGURATION_VIEW_ID
} from '../../manifest';
import { TraceConfigurationModel } from './trace-configuration-model';
import { TraceWebviewToHostMessage } from './trace-configuration-protocol';
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
    public readonly watchForGeneratedCBuildRunFiles = jest.fn();
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
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
            isActive: true,
            activate: jest.fn()
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('registers the trace generation webview provider, initializes its model, and disposes it with the extension context', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const context = extensionContextFactory();

        await provider.activate(context);
        context.subscriptions.forEach(disposable => disposable.dispose());

        expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(TRACE_CONFIGURATION_VIEW_ID, provider);
        expect(vscode.extensions.getExtension).toHaveBeenCalledWith('Arm.cmsis-csolution');
        expect(model.watchForGeneratedCBuildRunFiles).toHaveBeenCalledTimes(1);
        expect(model.loadInitialFile).toHaveBeenCalledTimes(1);
        expect(model.dispose).toHaveBeenCalledTimes(1);
    });

    it('observes CMSIS Solution activation without blocking CMSIS Debugger activation', async () => {
        let completeActivation: (() => void) | undefined;
        const cmsisSolutionActivation = new Promise<void>(resolve => {
            completeActivation = resolve;
        });
        const activateCmsisSolution = jest.fn().mockReturnValue(cmsisSolutionActivation);
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
            isActive: false,
            activate: activateCmsisSolution
        });
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const activation = provider.activate(extensionContextFactory());

        await Promise.resolve();

        expect(activation).toBeUndefined();
        expect(model.watchForGeneratedCBuildRunFiles).toHaveBeenCalledTimes(1);
        expect(model.watchForGeneratedCBuildRunFiles.mock.invocationCallOrder[0]).toBeLessThan(
            activateCmsisSolution.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
        );
        expect(activateCmsisSolution).toHaveBeenCalledTimes(1);
        expect(model.loadInitialFile).not.toHaveBeenCalled();

        completeActivation?.();
        await cmsisSolutionActivation;
        await Promise.resolve();

        expect(model.loadInitialFile).toHaveBeenCalledTimes(1);
    });

    it('reports CMSIS Solution activation failures without rejecting extension activation', async () => {
        const expectedError = new Error('activation failed');
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
            isActive: false,
            activate: jest.fn().mockRejectedValue(expectedError)
        });
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));

        expect(provider.activate(extensionContextFactory())).toBeUndefined();
        await Promise.resolve();
        await Promise.resolve();

        expect(model.reportError).toHaveBeenCalledWith(
            expectedError,
            'Trace Configuration: Failed to initialize after CMSIS Solution activation'
        );
        expect(model.loadInitialFile).not.toHaveBeenCalled();
    });

    it('configures the webview shell without repeating activation initialization', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, fake } = createWebviewView();

        await provider.activate(extensionContextFactory());
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

    it('posts fresh state when the ctrace-ref tooltip setting changes', async () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const context = extensionContextFactory();
        const { view, fake } = createWebviewView();
        await provider.activate(context);
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
        const configurationHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0] as
            (event: vscode.ConfigurationChangeEvent) => void;
        const event = {
            affectsConfiguration: jest.fn((setting: string) => setting === TRACE_CONFIGURATION_SHOW_CTRACE_REFS_SETTING)
        } as vscode.ConfigurationChangeEvent;

        configurationHandler(event);

        expect(event.affectsConfiguration).toHaveBeenCalledWith(TRACE_CONFIGURATION_SHOW_CTRACE_REFS_SETTING);
        expect(model.loadInitialFile).toHaveBeenCalledTimes(1);
        expect(fake.webview.postMessage).toHaveBeenCalledTimes(1);
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

    it('stops posting updates after the webview is disposed', () => {
        const model = new FakeTraceConfigurationModel();
        const provider = new TraceConfigurationWebviewProvider(vscode.Uri.file('/extension'), asModel(model));
        const { view, fake, disposeView } = createWebviewView();
        provider.resolveWebviewView(view, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

        disposeView();
        model.fireDidChange();

        expect(model.dispose).not.toHaveBeenCalled();
        expect(fake.webview.postMessage).not.toHaveBeenCalled();
    });
});
