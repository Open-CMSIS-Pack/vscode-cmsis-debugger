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

import { CmsisJsonWatcher } from '../../cmsis-files';
import { CBuildRunFileLocator } from '../../cbuild-run';
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
import { logger } from '../..';
import { normalizeFsPath } from '../../utils';

const CTRACE_CONFIGURATION_GLOB = '.cmsis/[!~]*.ctrace.{yml,yaml}';
const CTRACE_CONFIGURATION_WATCH_ID = 'pyts-ctrace-configuration';

interface CTraceConversionRequest {
    readonly cbuildRunFilePath: string | undefined;
    readonly conversionKey: string;
    contents: Uint8Array;
    watcherGeneration: number | undefined;
    explicit: boolean;
}

interface PendingCTraceConversion extends CTraceConversionRequest {
    readonly resolveWaiters: Array<() => void>;
}

export class PyTsController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private readonly observedCTraceContents = new Map<string, Uint8Array>();
    private readonly contentReadPromises = new Map<string, Promise<Uint8Array | undefined>>();
    private readonly pendingConversions = new Map<string, PendingCTraceConversion>();
    private activeConversion: PendingCTraceConversion | undefined;
    private conversionPromise: Promise<void> | undefined;
    private watcherGeneration = 0;

    public constructor(
        private readonly options: PyTsProcessManagerOptions = {},
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cmsisJsonWatcher?: CmsisJsonWatcher
    ) { }

    public async activate(
        context: vscode.ExtensionContext,
        tracker: GDBTargetDebugTracker,
        fileWatchManager: FileWatchManager
    ): Promise<void> {
        this.fileWatchManager = fileWatchManager;
        const activeSolutionChangeSubscription = this.cmsisJsonWatcher?.onDidChangeActiveSolution(() => {
            void this.handleActiveSolutionPathChanged();
        });
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session)),
            { dispose: () => this.removeCTraceConfigurationWatcher() },
            ...(activeSolutionChangeSubscription ? [activeSolutionChangeSubscription] : [])
        );
        await this.addCTraceConfigurationWatcher();
    }

    public async run(options: PyTsProcessManagerLaunchOptions = {}): Promise<number | null> {
        const processManager = new PyTsProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: PyTsProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        return processManager.waitForExit();
    }

    /** Requests a conversion independently of the ctrace file watcher and waits for its completion. */
    public convertCTrace(ctraceUri: vscode.Uri, cbuildRunFilePath: string): Promise<void> {
        return this.processConversionRequest(ctraceUri, cbuildRunFilePath, undefined, true);
    }

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected async handleCTraceFileChanged(
        uri: vscode.Uri,
        watcherGeneration: number = this.watcherGeneration
    ): Promise<void> {
        if (watcherGeneration !== this.watcherGeneration) {
            return;
        }
        const cbuildRunFilePath = this.activeSession?.getCbuildRunPath();
        try {
            if (!await this.isCTraceFileForCBuildRun(uri, cbuildRunFilePath)) {
                return;
            }
            await this.processConversionRequest(uri, cbuildRunFilePath, watcherGeneration, false);
        } catch (error) {
            logger.error('Failed to process ctrace configuration change:', error);
        }
    }

    private async processConversionRequest(
        uri: vscode.Uri,
        cbuildRunFilePath: string | undefined,
        watcherGeneration: number | undefined,
        explicit: boolean
    ): Promise<void> {
        const normalizedPath = normalizeFsPath(uri.fsPath) ?? uri.fsPath;
        const conversionKey = this.getConversionKey(normalizedPath, cbuildRunFilePath);
        const previousRead = this.contentReadPromises.get(conversionKey) ?? Promise.resolve(undefined);
        // Catch a previous read failure so a later request can still proceed.
        const contentReadPromise = previousRead.catch(() => undefined).then(async () => {
            const contents = await vscode.workspace.fs.readFile(uri);
            if (watcherGeneration !== undefined && watcherGeneration !== this.watcherGeneration) {
                return undefined;
            }
            if (!explicit && this.contentsEqual(this.observedCTraceContents.get(conversionKey), contents)) {
                return undefined;
            }
            this.observedCTraceContents.set(conversionKey, contents);
            return contents;
        });
        this.contentReadPromises.set(conversionKey, contentReadPromise);
        let contents: Uint8Array | undefined;
        try {
            contents = await contentReadPromise;
        } finally {
            if (this.contentReadPromises.get(conversionKey) === contentReadPromise) {
                this.contentReadPromises.delete(conversionKey);
            }
        }
        if (contents === undefined) {
            return;
        }
        await this.submitConversion({
            cbuildRunFilePath,
            conversionKey,
            contents,
            watcherGeneration,
            explicit
        });
    }

    private submitConversion(request: CTraceConversionRequest): Promise<void> {
        const completion = new Promise<void>(resolve => {
            const activeConversion = this.activeConversion;
            if (activeConversion?.conversionKey === request.conversionKey
                && this.contentsEqual(activeConversion.contents, request.contents)) {
                activeConversion.resolveWaiters.push(resolve);
                return;
            }
            const pendingConversion = this.pendingConversions.get(request.conversionKey);
            if (pendingConversion !== undefined) {
                pendingConversion.contents = request.contents;
                pendingConversion.explicit ||= request.explicit;
                pendingConversion.watcherGeneration = request.watcherGeneration ?? pendingConversion.watcherGeneration;
                pendingConversion.resolveWaiters.push(resolve);
                return;
            }
            this.pendingConversions.set(request.conversionKey, { ...request, resolveWaiters: [resolve] });
        });
        this.conversionPromise ??= this.processPendingConversions();
        return completion;
    }

    private async processPendingConversions(): Promise<void> {
        try {
            while (this.pendingConversions.size > 0) {
                const pendingConversion = this.pendingConversions.values().next().value;
                if (pendingConversion === undefined) {
                    break;
                }
                this.pendingConversions.delete(pendingConversion.conversionKey);
                if (!pendingConversion.explicit && pendingConversion.watcherGeneration !== this.watcherGeneration) {
                    pendingConversion.resolveWaiters.forEach(resolve => resolve());
                    continue;
                }
                this.activeConversion = pendingConversion;
                const launchOptions: PyTsProcessManagerLaunchOptions = pendingConversion.cbuildRunFilePath === undefined
                    ? {}
                    : { cbuildRunFilePath: pendingConversion.cbuildRunFilePath };
                try {
                    const exitCode = await this.run(launchOptions);
                    if (exitCode !== 0) {
                        logger.error(`pyTS process exited with code ${exitCode}`);
                    }
                } catch (error) {
                    logger.error('Failed to launch pyTS process:', error);
                } finally {
                    await this.contentReadPromises.get(pendingConversion.conversionKey)?.catch(() => undefined);
                    if (this.contentsEqual(
                        this.observedCTraceContents.get(pendingConversion.conversionKey),
                        pendingConversion.contents
                    )) {
                        this.observedCTraceContents.delete(pendingConversion.conversionKey);
                    }
                    pendingConversion.resolveWaiters.forEach(resolve => resolve());
                    this.activeConversion = undefined;
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

    private async isCTraceFileForCBuildRun(ctraceUri: vscode.Uri, cbuildRunFilePath: string | undefined): Promise<boolean> {
        if (path.basename(ctraceUri.fsPath).startsWith('~')) {
            return false;
        }
        if (cbuildRunFilePath === undefined) {
            return true;
        }
        const suffix = '.cbuild-run.yml';
        const cbuildRunName = normalizeFsPath(path.basename(cbuildRunFilePath)) ?? path.basename(cbuildRunFilePath);
        if (!cbuildRunName.endsWith(suffix)) {
            return true;
        }
        const cbuildRunProjectName = cbuildRunName.slice(0, -suffix.length);
        const ctraceUriBasename = path.basename(ctraceUri.fsPath);
        const ctraceName = normalizeFsPath(ctraceUriBasename) ?? ctraceUriBasename;
        const ctraceSuffix = ctraceName.endsWith('.ctrace.yaml') ? '.ctrace.yaml' : '.ctrace.yml';
        const ctraceSolutionSetName = ctraceName.slice(0, -ctraceSuffix.length);
        const cbuildRunTargetSetPrefix = `${cbuildRunProjectName}@`;
        // Check whether the ctrace could belong to this cbuild-run based on their
        // filename stems.
        const exactBaseMatch = ctraceSolutionSetName === cbuildRunProjectName;
        const ctraceCanBelongToCbuildRun = ctraceSolutionSetName.startsWith(cbuildRunTargetSetPrefix) && ctraceSolutionSetName.length > cbuildRunTargetSetPrefix.length;
        if (!exactBaseMatch && !ctraceCanBelongToCbuildRun) {
            return false;
        }
        // Check if location of ctrace file matches the expected location within
        // the active solution folder.
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (activeSolutionFolder === undefined) {
            return true;
        }
        return normalizeFsPath(path.dirname(ctraceUri.fsPath)) ===
                normalizeFsPath(path.join(activeSolutionFolder.fsPath, '.cmsis'));
    }

    private contentsEqual(previous: Uint8Array | undefined, current: Uint8Array): boolean {
        return previous !== undefined && previous.length === current.length &&
            previous.every((value, index) => value === current.at(index));
    }

    protected async addCTraceConfigurationWatcher(): Promise<void> {
        const fileWatchManager = this.fileWatchManager;
        // A watcher cannot be registered before activation supplies its manager.
        if (fileWatchManager === undefined) {
            return;
        }
        const watcherGeneration = this.watcherGeneration;
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        // Ignore a stale registration after removal or reactivation changes the watcher context.
        if (watcherGeneration !== this.watcherGeneration || fileWatchManager !== this.fileWatchManager) {
            return;
        }
        fileWatchManager.addWatch({
            id: CTRACE_CONFIGURATION_WATCH_ID,
            globPattern: activeSolutionFolder
                ? new vscode.RelativePattern(activeSolutionFolder, CTRACE_CONFIGURATION_GLOB)
                : CTRACE_CONFIGURATION_GLOB,
            onDidCreate: uri => this.handleCTraceFileChanged(uri, watcherGeneration),
            onDidChange: uri => this.handleCTraceFileChanged(uri, watcherGeneration)
        });
    }

    protected removeCTraceConfigurationWatcher(): void {
        if (this.fileWatchManager !== undefined) {
            this.fileWatchManager.removeWatch(CTRACE_CONFIGURATION_WATCH_ID);
        }
        this.watcherGeneration += 1;
        this.observedCTraceContents.clear();
        this.contentReadPromises.clear();
        for (const [conversionKey, pendingConversion] of this.pendingConversions) {
            if (!pendingConversion.explicit) {
                this.pendingConversions.delete(conversionKey);
                pendingConversion.resolveWaiters.forEach(resolve => resolve());
            }
        }
    }

    private async handleActiveSolutionPathChanged(): Promise<void> {
        this.removeCTraceConfigurationWatcher();
        await this.addCTraceConfigurationWatcher();
    }
}
