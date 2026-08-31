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

import * as path from 'path';
import * as vscode from 'vscode';
import {
    GDBTargetDebugSession,
    GDBTargetDebugTracker
} from '../../debug-session';
import { ENABLE_TRACE_GENERATION_VIEW_SETTING } from '../../manifest';
import {
    PyTsProcessManager,
    PyTsProcessManagerLaunchOptions,
    PyTsProcessManagerOptions
} from '../../desktop/process/pyts-process-manager';
import { FileWatchManager } from '../../desktop/filesystem/file-watch-manager';
import { logger } from '../..';
import { normalizeFsPath } from '../../utils';

const CTRACE_CONFIGURATION_GLOB = '.cmsis/*.ctrace.{yml,yaml}';
const CTRACE_CONFIGURATION_WATCH_ID = 'pyts-ctrace-configuration';

interface PendingCTraceConversion {
    readonly cbuildRunFilePath: string | undefined;
    readonly conversionKey: string;
    readonly contents: Uint8Array;
    readonly watcherGeneration: number;
}

export class PyTsController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private readonly observedCTraceContents = new Map<string, Uint8Array>();
    private readonly successfulCTraceContents = new Map<string, Uint8Array>();
    private readonly contentReadPromises = new Map<string, Promise<boolean>>();
    private pendingConversion: PendingCTraceConversion | undefined;
    private conversionPromise: Promise<void> | undefined;
    private watcherGeneration = 0;

    public constructor(private readonly options: PyTsProcessManagerOptions = {}) { }

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker, fileWatchManager: FileWatchManager): void {
        this.fileWatchManager = fileWatchManager;
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session)),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration(ENABLE_TRACE_GENERATION_VIEW_SETTING)) {
                    this.updateCTraceConfigurationWatcher();
                }
            }),
            { dispose: () => this.removeCTraceConfigurationWatcher() }
        );
        this.updateCTraceConfigurationWatcher();
    }

    public async run(options: PyTsProcessManagerLaunchOptions = {}, shouldReloadCTrace: boolean = false): Promise<number | null> {
        const processManager = new PyTsProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: PyTsProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        const exitCode = await processManager.waitForExit();
        if (shouldReloadCTrace && exitCode === 0) {  // Only reload if pyTS exited successfully
            await this.reloadCTrace();
        }
        return exitCode;
    }

    public async reloadCTrace(): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        if (session) {
            await session.customRequest('evaluate', {
                expression: '> monitor ctrace reload',
                context: 'repl'
            });
        }
    }

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected async handleCTraceFileChanged(
        uri: vscode.Uri,
        watcherGeneration: number = this.watcherGeneration
    ): Promise<void> {
        const cbuildRunFilePath = this.activeSession?.getCbuildRunPath();
        if (!this.isCTraceFileForCBuildRun(uri, cbuildRunFilePath)) {
            return;
        }

        try {
            const normalizedPath = normalizeFsPath(uri.fsPath) ?? uri.fsPath;
            const conversionKey = this.getConversionKey(normalizedPath, cbuildRunFilePath);
            const previousRead = this.contentReadPromises.get(conversionKey) ?? Promise.resolve(false);
            const contentReadPromise = previousRead.catch(() => false).then(async () => {
                const contents = await vscode.workspace.fs.readFile(uri);
                if (watcherGeneration !== this.watcherGeneration) {
                    return false;
                }
                if (this.contentsEqual(this.observedCTraceContents.get(conversionKey), contents)
                    || this.contentsEqual(this.successfulCTraceContents.get(conversionKey), contents)) {
                    return false;
                }
                this.observedCTraceContents.set(conversionKey, contents);
                return true;
            });
            this.contentReadPromises.set(conversionKey, contentReadPromise);
            let contentsChanged: boolean;
            try {
                contentsChanged = await contentReadPromise;
            } finally {
                if (this.contentReadPromises.get(conversionKey) === contentReadPromise) {
                    this.contentReadPromises.delete(conversionKey);
                }
            }
            if (!contentsChanged) {
                return;
            }
            const contents = this.observedCTraceContents.get(conversionKey);
            if (contents === undefined) {
                return;
            }
            this.pendingConversion = { cbuildRunFilePath, conversionKey, contents, watcherGeneration };
            this.conversionPromise ??= this.processPendingConversions();
            await this.conversionPromise;
        } catch (error) {
            logger.error('Failed to process ctrace configuration change:', error);
        }
    }

    private async processPendingConversions(): Promise<void> {
        try {
            while (this.pendingConversion !== undefined) {
                const pendingConversion = this.pendingConversion;
                this.pendingConversion = undefined;
                const launchOptions: PyTsProcessManagerLaunchOptions = pendingConversion.cbuildRunFilePath === undefined
                    ? {}
                    : { cbuildRunFilePath: pendingConversion.cbuildRunFilePath };
                try {
                    const exitCode = await this.run(launchOptions, true);
                    if (exitCode === 0 && pendingConversion.watcherGeneration === this.watcherGeneration) {
                        this.successfulCTraceContents.set(pendingConversion.conversionKey, pendingConversion.contents);
                    } else {
                        logger.error(`pyTS process exited with code ${exitCode}`);
                    }
                } catch (error) {
                    logger.error('Failed to launch pyTS process:', error);
                } finally {
                    if (this.contentsEqual(
                        this.observedCTraceContents.get(pendingConversion.conversionKey),
                        pendingConversion.contents
                    )) {
                        this.observedCTraceContents.delete(pendingConversion.conversionKey);
                    }
                }
            }
        } finally {
            this.conversionPromise = undefined;
        }
    }

    private getConversionKey(ctracePath: string, cbuildRunFilePath: string | undefined): string {
        const normalizedCbuildRunPath = cbuildRunFilePath === undefined
            ? ''
            : normalizeFsPath(cbuildRunFilePath) ?? cbuildRunFilePath;
        return `${ctracePath}\0${normalizedCbuildRunPath}`;
    }

    private isCTraceFileForCBuildRun(uri: vscode.Uri, cbuildRunFilePath: string | undefined): boolean {
        if (cbuildRunFilePath === undefined || path.basename(path.dirname(cbuildRunFilePath)) !== 'out') {
            return true;
        }
        const suffix = '.cbuild-run.yml';
        const cbuildRunName = path.basename(cbuildRunFilePath);
        if (!cbuildRunName.endsWith(suffix)) {
            return true;
        }
        const projectName = cbuildRunName.slice(0, -suffix.length);
        const expectedDirectory = path.join(path.dirname(path.dirname(cbuildRunFilePath)), '.cmsis');
        return normalizeFsPath(path.dirname(uri.fsPath)) === normalizeFsPath(expectedDirectory) &&
            path.basename(uri.fsPath).startsWith(`${projectName}.ctrace.`);
    }

    private contentsEqual(previous: Uint8Array | undefined, current: Uint8Array): boolean {
        return previous !== undefined && previous.length === current.length &&
            previous.every((value, index) => value === current.at(index));
    }

    private updateCTraceConfigurationWatcher(): void {
        const traceEnabled = vscode.workspace.getConfiguration().get<boolean>(ENABLE_TRACE_GENERATION_VIEW_SETTING, false);
        if (traceEnabled) {
            this.addCTraceConfigurationWatcher();
        } else {
            this.removeCTraceConfigurationWatcher();
        }
    }

    private addCTraceConfigurationWatcher(): void {
        if (this.fileWatchManager === undefined) {
            return;
        }
        const ws = vscode.workspace.workspaceFolders?.[0];
        const watcherGeneration = this.watcherGeneration;
        this.fileWatchManager.addWatch({
            id: CTRACE_CONFIGURATION_WATCH_ID,
            globPattern: ws ? new vscode.RelativePattern(ws, CTRACE_CONFIGURATION_GLOB) : CTRACE_CONFIGURATION_GLOB,
            onDidCreate: uri => this.handleCTraceFileChanged(uri, watcherGeneration),
            onDidChange: uri => this.handleCTraceFileChanged(uri, watcherGeneration)
        });
    }

    private removeCTraceConfigurationWatcher(): void {
        if (this.fileWatchManager !== undefined) {
            this.fileWatchManager.removeWatch(CTRACE_CONFIGURATION_WATCH_ID);
        }
        this.watcherGeneration += 1;
        this.observedCTraceContents.clear();
        this.successfulCTraceContents.clear();
        this.contentReadPromises.clear();
        this.pendingConversion = undefined;
    }
}
