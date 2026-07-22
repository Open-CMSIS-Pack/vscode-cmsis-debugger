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
import {
    TraceHostToWebviewMessage,
    TraceWebviewToHostMessage
} from './trace-configuration-protocol';
import { TraceConfigurationModel } from './trace-configuration-model';
import { VIEW_ID } from './trace-configuration-types';

/**
 * The TraceConfigurationWebviewProvider owns the VS Code sidebar webview shell
 * for editing ctrace.yml files. File discovery, YAML mutation, capability
 * filtering, and row serialization live in TraceConfigurationModel so this
 * class stays focused on webview lifecycle and message routing.
 */
export class TraceConfigurationWebviewProvider implements vscode.WebviewViewProvider {
    private webviewView: vscode.WebviewView | undefined;
    private readonly model: TraceConfigurationModel;

    /**
     * The constructor stores the extension URI for webview asset loading and
     * creates the model with a state-change callback. VS Code webviews cannot
     * load arbitrary extension file paths directly, so buildShell later turns
     * local extension files into webview-safe URIs.
     */
    public constructor(
        private readonly extensionUri: vscode.Uri,
        model?: TraceConfigurationModel
    ) {
        this.model = model ?? new TraceConfigurationModel();
        this.model.setOnDidChange(() => this.postState());
    }

    /**
     * activate registers this object as the provider for the contributed view.
     * The model is also registered for disposal so any active file watcher is
     * released when the extension deactivates.
     */
    public activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(VIEW_ID, this),
            { dispose: () => this.model.dispose() }
        );
    }

    /**
     * resolveWebviewView is called by VS Code when the sidebar view is first
     * opened. The method configures CSP-safe HTML, installs message handlers,
     * cleans up webview-only state on dispose, and asks the model to load the
     * initial ctrace.yml file.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.buildShell(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message: TraceWebviewToHostMessage) => {
            void this.handleMessage(message);
        });
        webviewView.onDidDispose(() => {
            this.webviewView = undefined;
            this.model.dispose();
        });
        void this.model.loadInitialFile();
    }

    /**
     * handleMessage is the webview-to-extension dispatcher. It keeps browser
     * protocol knowledge in the provider and delegates all trace data work to
     * the model, which owns the non-webview behavior.
     */
    private async handleMessage(message: TraceWebviewToHostMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.postState();
                    break;
                case 'refresh':
                    await this.model.refreshFile();
                    break;
                case 'save':
                    await this.model.saveCurrentDocument({ reloadBeforeSave: true, skipWhenReloaded: true });
                    break;
                case 'openFile':
                    await this.promptAndOpenFile();
                    break;
                case 'toggle':
                    this.model.updateExpandedState(message.id, message.expanded);
                    break;
                case 'updateValue':
                    await this.model.updateValue(message.path, message.value);
                    break;
                case 'addItem':
                    await this.model.addItem(message.path, message.addChildKind);
                    break;
                case 'removeItem':
                    await this.model.removeItem(message.path);
                    break;
            }
        } catch (error) {
            this.model.reportError(error, 'Trace Configuration: Webview action failed');
        }
    }

    /**
     * promptAndOpenFile lets the user manually pick a ctrace file when automatic
     * discovery found nothing or chose the wrong file. The provider owns the VS
     * Code dialog because it is UI plumbing, then hands the selected path to the
     * model for validation and loading.
     */
    private async promptAndOpenFile(): Promise<void> {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'CMSIS Trace YAML': ['yml', 'yaml']
            },
            title: 'Open CMSIS Trace Configuration'
        });
        const file = selected?.at(0);
        if (!file) {
            return;
        }
        await this.model.openFile(file.fsPath);
    }

    /**
     * postState serializes the current model state and sends it to the webview.
     * The browser side is intentionally stateless with respect to file contents:
     * every host update replaces the rendered rows.
     */
    private postState(): void {
        if (!this.webviewView) {
            return;
        }
        const message: TraceHostToWebviewMessage = {
            type: 'update',
            state: this.model.createState()
        };
        void this.webviewView.webview.postMessage(message);
    }

    /**
     * buildShell returns the static webview HTML that loads the compiled CSS and
     * JavaScript bundle. It also sets a restrictive Content Security Policy so
     * the webview can run only extension-provided scripts and styles.
     */
    private buildShell(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'webviews', 'trace-configuration.js'
        ));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'webviews', 'trace-configuration.css'
        ));
        const codiconCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'
        ));
        const cspSource = webview.cspSource ?? '';
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
}
