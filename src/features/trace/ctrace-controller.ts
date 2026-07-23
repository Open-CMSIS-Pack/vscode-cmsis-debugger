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
    GDBTargetDebugSession,
    GDBTargetDebugTracker
} from '../../debug-session';
import {
    CTraceProcessManager,
    CTraceProcessManagerLaunchOptions,
    CTraceProcessManagerOptions
} from '../../desktop/process/ctrace-process-manager';
import { FileWatchManager } from '../../desktop/filesystem/file-watch-manager';
import { waitForMs } from '../../utils';

const PRE_DECODE_DELAY = 750;
const RAW_TRACE_GLOB = '.trace/*.{SWO,TB}.raw';

export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;

    public constructor(private readonly options: CTraceProcessManagerOptions = {}) {}

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker, fileWatchManager: FileWatchManager): void {
        this.fileWatchManager = fileWatchManager;
        // TODO: Check what CMSIS Solution extension does regarding workspacefolders.
        const ws = vscode.workspace.workspaceFolders?.[0];
        this.fileWatchManager.addWatch({
            globPattern: ws ? new vscode.RelativePattern(ws, RAW_TRACE_GLOB) : RAW_TRACE_GLOB,
            onDidCreate: uri => this.handleRawTraceFileChanged(uri),
            onDidChange: uri => this.handleRawTraceFileChanged(uri)
        });
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session)),
            tracker.onStopped(event => this.handleDecodeTrigger(event.session)),
            tracker.onWillStopSession(session => this.handleDecodeTrigger(session))
        );
    }

    public async run(options: CTraceProcessManagerLaunchOptions = {}): Promise<void> {
        const processManager = new CTraceProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: CTraceProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        await processManager.waitForExit();
    }

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected async handleRawTraceFileChanged(_uri: vscode.Uri): Promise<void> {
        // TODO: Put some proper logic in
        // await this.run({ rawFilePath: uri.fsPath });
    }

    protected async handleDecodeTrigger(session: GDBTargetDebugSession | undefined): Promise<void> {
        const effectiveSession = session ?? this.activeSession;
        const cbuildRunFile = await effectiveSession?.getCbuildRun();
        const cbuildRunFilePath = cbuildRunFile?.getFilePath();
        // TODO: Check if this can become event driven
        await waitForMs(PRE_DECODE_DELAY);
        await this.run({ cbuildRunFilePath });  // Use active session *.cbuild-run.yml file
    }
}
