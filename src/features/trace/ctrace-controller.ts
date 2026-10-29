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

import * as path from 'node:path';
import * as vscode from 'vscode';

import { CmsisJsonWatcher } from '../../cmsis-files';
import { CBuildRunFileLocator } from '../../cbuild-run';
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
import { OPEN_CAPTURED_TRACE_AFTER_DECODE_SETTING } from '../../manifest';
import { logger } from '../..';
import { fileExists, normalizeFsPath } from '../../utils';
import { CapturedTraceResolver } from './captured-trace-resolver';

/** Waits for one second without raw-file writes before decoding. */
const RAW_TRACE_DEBOUNCE_MS = 1_000;
/** Observes both raw trace channels in the active solution folder. */
const RAW_TRACE_GLOB = '.trace/*.{SWO,TB}.raw';
/** Identifies the shared raw trace watch. */
const RAW_TRACE_WATCH_ID = 'ctrace-raw-trace';
/** Observes decoded captures for command availability. */
const CAPTURED_TRACE_GLOB = '.trace/*.{SWO,TB,TB_*}.csv';
/** Identifies the decoded capture watch. */
const CAPTURED_TRACE_WATCH_ID = 'ctrace-captured-trace';
/** Controls whether the captured-trace command is available. */
const HAS_CAPTURED_TRACE_CONTEXT = 'vscode-cmsis-debugger.hasCapturedTrace';

/** Decodes raw-file updates independently of debugger stop events. */
export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private rawTraceWatcherGeneration = 0;
    private capturedTraceContextVersion = 0;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly pendingRawFiles = new Map<string, vscode.Uri>();
    private queuedDecodeGeneration: number | undefined;
    private conversionQueue: Promise<unknown> = Promise.resolve();

    /** Shares solution discovery while preserving session defaults for manual commands. */
    public constructor(
        private readonly options: CTraceProcessManagerOptions = {},
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cmsisJsonWatcher?: CmsisJsonWatcher,
        private readonly capturedTraceResolver: CapturedTraceResolver = new CapturedTraceResolver(cbuildRunFileLocator)
    ) { }

    /** Returns the active debugger's build path for existing manual commands. */
    public getActiveCbuildRunFilePath(): string | undefined {
        return this.activeSession?.getCbuildRunPath();
    }

    /** Installs solution-scoped watches without requiring a debug session. */
    public async activate(
        context: vscode.ExtensionContext,
        tracker: GDBTargetDebugTracker,
        fileWatchManager: FileWatchManager
    ): Promise<void> {
        this.fileWatchManager = fileWatchManager;
        const activeSolutionChangeSubscription = this.cmsisJsonWatcher?.onDidChangeActiveSolution(() => {
            this.removeTraceWatchers();
            void this.addTraceWatchers();
        });
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session)),
            { dispose: () => {
                this.removeTraceWatchers();
                this.fileWatchManager = undefined;
            } },
            ...(activeSolutionChangeSubscription ? [activeSolutionChangeSubscription] : [])
        );
        await this.addTraceWatchers();
    }

    /** Serializes manual conversions while retaining caller and active-session defaults. */
    public run(options: CTraceProcessManagerLaunchOptions = {}): Promise<number | null> {
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions = cbuildRunFilePath === undefined ? options : { ...options, cbuildRunFilePath };
        return this.enqueueConversion(() => this.launch(launchOptions));
    }

    /** Refreshes command availability when the active debugger changes. */
    protected async handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): Promise<void> {
        this.activeSession = session;
        await this.updateCapturedTraceContext();
    }

    /** Coalesces raw-file events across both channels into one quiet period. */
    private handleRawTraceFileChanged(uri: vscode.Uri, generation: number): void {
        if (!this.isCurrent(generation)) {
            return;
        }
        this.pendingRawFiles.set(uri.fsPath, uri);
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            if (this.queuedDecodeGeneration === generation) {
                return;
            }
            this.queuedDecodeGeneration = generation;
            void this.enqueueConversion(async () => {
                if (this.queuedDecodeGeneration !== generation) {
                    return;
                }
                this.queuedDecodeGeneration = undefined;
                await this.decodePendingTrace(generation);
            }).catch(error => logger.error('Failed to launch ctrace process:', error));
        }, RAW_TRACE_DEBOUNCE_MS);
    }

    /** Resolves the selected target when queued work starts and pins its conversion arguments. */
    private async decodePendingTrace(generation: number): Promise<void> {
        if (!this.isReadyToDecode(generation)) {
            return;
        }
        const files = [...this.pendingRawFiles.values()];
        const existingFiles = await Promise.all(files.map(async uri => await fileExists(uri) ? uri : undefined));
        if (!this.isReadyToDecode(generation)) {
            return;
        }
        if (!existingFiles.some(uri => uri !== undefined)) {
            this.pendingRawFiles.clear();
            return;
        }
        const cbuildRunFilePath = await this.cbuildRunFileLocator.getCBuildRunFileName(undefined, true);
        const solutionSet = await this.cbuildRunFileLocator.getDefaultSolutionSet(cbuildRunFilePath);
        const rawFile = existingFiles.find(uri => uri !== undefined && ['SWO', 'TB'].some(channel =>
            normalizeFsPath(path.basename(uri.fsPath)) === normalizeFsPath(`${solutionSet}.${channel}.raw`)));
        if (!this.isReadyToDecode(generation)) {
            return;
        }
        this.pendingRawFiles.clear();
        if (rawFile === undefined) {
            return;
        }
        const exitCode = await this.launch({ traceDir: path.dirname(rawFile.fsPath), solutionSet });
        if (exitCode !== 0) {
            logger.error(`ctrace process exited with code ${exitCode}`);
            return;
        }
        if (!this.isCurrent(generation)) {
            return;
        }
        await this.updateCapturedTraceContext(generation);
        const openCapturedTrace = vscode.workspace.getConfiguration()
            .get<boolean>(OPEN_CAPTURED_TRACE_AFTER_DECODE_SETTING, false);
        if (openCapturedTrace && this.isCurrent(generation) && this.pendingRawFiles.size === 0) {
            try {
                await this.capturedTraceResolver.open(cbuildRunFilePath, { preserveFocus: false }, async resolvedSolutionSet => {
                    if (!this.isCurrent(generation) || resolvedSolutionSet !== solutionSet) {
                        return false;
                    }
                    const activeSolutionSet = await this.cbuildRunFileLocator.getDefaultSolutionSet(cbuildRunFilePath);
                    return this.isCurrent(generation) && this.pendingRawFiles.size === 0 && activeSolutionSet === solutionSet;
                });
            } catch (error) {
                logger.error('Failed to open captured trace:', error);
            }
        }
    }

    /** Runs one decoder with arguments already selected by its caller. */
    private async launch(options: CTraceProcessManagerLaunchOptions): Promise<number | null> {
        const processManager = new CTraceProcessManager(this.options);
        await processManager.launch(options);
        return processManager.waitForExit();
    }

    /** Keeps later conversions runnable after a rejected conversion. */
    private enqueueConversion<T>(convert: () => Promise<T>): Promise<T> {
        const conversion = this.conversionQueue.then(convert);
        this.conversionQueue = conversion.catch(() => undefined);
        return conversion;
    }

    /** Registers both existing folder-wide watches, rejecting delayed registrations after a switch. */
    private async addTraceWatchers(): Promise<void> {
        const fileWatchManager = this.fileWatchManager;
        const generation = this.rawTraceWatcherGeneration;
        if (fileWatchManager === undefined) {
            return;
        }
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (!this.isCurrent(generation)) {
            return;
        }
        fileWatchManager.addWatch({
            id: RAW_TRACE_WATCH_ID,
            globPattern: activeSolutionFolder ? new vscode.RelativePattern(activeSolutionFolder, RAW_TRACE_GLOB) : RAW_TRACE_GLOB,
            onDidCreate: uri => this.handleRawTraceFileChanged(uri, generation),
            onDidChange: uri => this.handleRawTraceFileChanged(uri, generation)
        });
        fileWatchManager.addWatch({
            id: CAPTURED_TRACE_WATCH_ID,
            globPattern: activeSolutionFolder ? new vscode.RelativePattern(activeSolutionFolder, CAPTURED_TRACE_GLOB) : CAPTURED_TRACE_GLOB,
            onDidCreate: () => this.updateCapturedTraceContext(generation),
            onDidChange: () => this.updateCapturedTraceContext(generation),
            onDidDelete: () => this.updateCapturedTraceContext(generation)
        });
        await this.updateCapturedTraceContext(generation);
    }

    /** Cancels pending automatic work and invalidates callbacks from removed watches. */
    private removeTraceWatchers(): void {
        this.rawTraceWatcherGeneration += 1;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        this.pendingRawFiles.clear();
        this.queuedDecodeGeneration = undefined;
        this.fileWatchManager?.removeWatch(RAW_TRACE_WATCH_ID);
        this.fileWatchManager?.removeWatch(CAPTURED_TRACE_WATCH_ID);
    }

    /** Tests whether automatic work still belongs to the active watch lifetime. */
    private isCurrent(generation: number): boolean {
        return this.fileWatchManager !== undefined && generation === this.rawTraceWatcherGeneration;
    }

    /** Defers asynchronous lookups superseded by another raw-file quiet period. */
    private isReadyToDecode(generation: number): boolean {
        return this.isCurrent(generation) && this.debounceTimer === undefined && this.queuedDecodeGeneration !== generation;
    }

    /** Prevents delayed capture lookups from overwriting newer availability. */
    private async updateCapturedTraceContext(generation = this.rawTraceWatcherGeneration): Promise<void> {
        if (!this.isCurrent(generation)) {
            return;
        }
        const version = ++this.capturedTraceContextVersion;
        const hasCapturedTrace = await this.capturedTraceResolver.hasCapture(this.activeSession?.getCbuildRunPath());
        if (this.isCurrent(generation) && version === this.capturedTraceContextVersion) {
            await vscode.commands.executeCommand('setContext', HAS_CAPTURED_TRACE_CONTEXT, hasCapturedTrace);
        }
    }
}
