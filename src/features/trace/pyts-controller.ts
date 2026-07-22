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
    PyTsProcessManager,
    PyTsProcessManagerLaunchOptions,
    PyTsProcessManagerOptions
} from '../../desktop/process/pyts-process-manager';
import { FileWatchManager } from '../../desktop/filesystem/file-watch-manager';

const CTRACE_CONFIGURATION_GLOB = '.cmsis/*.ctrace.{yml,yaml}';

export class PyTsController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;

    public constructor(private readonly options: PyTsProcessManagerOptions = {}) {}

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker, fileWatchManager: FileWatchManager): void {
        this.fileWatchManager = fileWatchManager;
        this.fileWatchManager.addWatch({
            globPattern: CTRACE_CONFIGURATION_GLOB,
            onDidCreate: uri => this.handleCTraceFileChanged(uri),
            onDidChange: uri => this.handleCTraceFileChanged(uri)
        });
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session))
        );
    }

    public async run(options: PyTsProcessManagerLaunchOptions = {}): Promise<void> {
        const processManager = new PyTsProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: PyTsProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        await processManager.waitForExit();
    }

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected async handleCTraceFileChanged(_uri: vscode.Uri): Promise<void> {
        // TODO: Match this is the ctrace file for the active session/expected cbuildrun file
        await this.run();
    }
}
