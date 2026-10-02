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
import { CapturedTraceResolver } from './captured-trace-resolver';

const RAW_TRACE_SAVE_WINDOW_MS = 2_000;
const RAW_TRACE_GLOB = '.trace/*.{SWO,TB}.raw';
const RAW_TRACE_WATCH_ID = 'ctrace-raw-trace';
const CAPTURED_TRACE_GLOB = '.trace/*.SWO.csv';
const CAPTURED_TRACE_WATCH_ID = 'ctrace-captured-trace';
const HAS_CAPTURED_TRACE_CONTEXT = 'vscode-cmsis-debugger.hasCapturedTrace';

interface PendingDecode {
    readonly cbuildRunFilePath: string | undefined;
    readonly stoppedAt: number;
}

export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private rawTraceWatcherGeneration = 0;
    private readonly pendingDecodes = new Map<string, PendingDecode>();
    private readonly rawTraceSaves = new Map<string, number>();

    public constructor(
        private readonly options: CTraceProcessManagerOptions = {},
        // Injected to make timing-based behavior deterministic in tests.
        private readonly now: () => number = Date.now,
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cmsisJsonWatcher?: CmsisJsonWatcher,
        private readonly capturedTraceResolver: CapturedTraceResolver = new CapturedTraceResolver(cbuildRunFileLocator)
    ) { }

    public getActiveCbuildRunFilePath(): string | undefined {
        return this.activeSession?.getCbuildRunPath();
    }

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
            tracker.onStopped(event => this.handleDecodeTrigger(event.session)),
            tracker.onWillStopSession(session => this.handleDecodeTrigger(session)),
            { dispose: () => this.removeTraceWatchers() },
            ...(activeSolutionChangeSubscription ? [activeSolutionChangeSubscription] : [])
        );
        await this.addTraceWatchers();
    }

    public async run(options: CTraceProcessManagerLaunchOptions = {}): Promise<number | null> {
        const processManager = new CTraceProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: CTraceProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        return processManager.waitForExit();
    }

    protected async handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): Promise<void> {
        this.activeSession = session;
        await this.updateCapturedTraceContext();
    }

    protected async handleRawTraceFileChanged(
        uri: vscode.Uri,
        watcherGeneration: number = this.rawTraceWatcherGeneration
    ): Promise<void> {
        if (watcherGeneration !== this.rawTraceWatcherGeneration) {
            return;
        }
        const savedAt = this.now();
        this.rawTraceSaves.set(uri.fsPath, savedAt);
        this.removeExpiredEvents(savedAt);
        await this.decodePendingTrace();
    }

    protected async handleDecodeTrigger(session: GDBTargetDebugSession | undefined): Promise<void> {
        const effectiveSession = session ?? this.activeSession;
        if (effectiveSession === undefined) {
            return;
        }
        const cbuildRunFile = await effectiveSession.getCbuildRun();
        const cbuildRunFilePath = cbuildRunFile?.getFilePath();
        const stoppedAt = this.now();
        this.removeExpiredEvents(stoppedAt);
        this.pendingDecodes.delete(effectiveSession.session.id);
        this.pendingDecodes.set(effectiveSession.session.id, {
            cbuildRunFilePath,
            stoppedAt,
        });
        await this.decodePendingTrace();
    }

    private removeExpiredEvents(now: number): void {
        const rawTraceSaves = [...this.rawTraceSaves.entries()];
        const expiredRawTraceSaves = rawTraceSaves
            .filter(([, savedAt]) => savedAt < now - RAW_TRACE_SAVE_WINDOW_MS);
        expiredRawTraceSaves.forEach(([filePath]) => this.rawTraceSaves.delete(filePath));
        const pendingDecodes = [...this.pendingDecodes.entries()];
        const expiredPendingDecodes = pendingDecodes
            .filter(([, pendingDecode]) => pendingDecode.stoppedAt < now - RAW_TRACE_SAVE_WINDOW_MS);
        expiredPendingDecodes.forEach(([sessionId]) => this.pendingDecodes.delete(sessionId));
    }

    private consumeNearbyRawTraceSaves(stoppedAt: number): boolean {
        const rawTraceSaves = [...this.rawTraceSaves.entries()];
        const nearbyRawTraceSaves = rawTraceSaves
            .filter(([, savedAt]) => Math.abs(savedAt - stoppedAt) <= RAW_TRACE_SAVE_WINDOW_MS);
        nearbyRawTraceSaves.forEach(([filePath]) => this.rawTraceSaves.delete(filePath));
        return nearbyRawTraceSaves.length > 0;
    }

    private async decodePendingTrace(): Promise<void> {
        const pendingDecodes = [...this.pendingDecodes.entries()].reverse();
        for (const [sessionId, pendingDecode] of pendingDecodes) {
            if (!this.consumeNearbyRawTraceSaves(pendingDecode.stoppedAt)) {
                continue;
            }
            this.pendingDecodes.delete(sessionId);
            try {
                const exitCode = await this.run({ cbuildRunFilePath: pendingDecode.cbuildRunFilePath });
                if (exitCode !== 0) {
                    logger.error(`ctrace process exited with code ${exitCode}`);
                    return;
                }
                const openCapturedTrace = vscode.workspace.getConfiguration()
                    .get<boolean>(OPEN_CAPTURED_TRACE_AFTER_DECODE_SETTING, true) ?? true;
                if (openCapturedTrace) {
                    try {
                        await this.capturedTraceResolver.open(pendingDecode.cbuildRunFilePath);
                    } catch (error) {
                        logger.error('Failed to open captured trace:', error);
                    }
                }
                return;
            } catch (error) {
                logger.error('Failed to launch ctrace process:', error);
            }
        }
    }

    private async addTraceWatchers(): Promise<void> {
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        await this.addRawTraceWatcher(activeSolutionFolder);
        await this.addCapturedTraceWatcher(activeSolutionFolder);
    }

    private async addRawTraceWatcher(activeSolutionFolder?: vscode.Uri): Promise<void> {
        const fileWatchManager = this.fileWatchManager;
        // A watcher cannot be registered before activation supplies its manager.
        if (fileWatchManager === undefined) {
            return;
        }
        const watcherGeneration = this.rawTraceWatcherGeneration;
        const resolvedActiveSolutionFolder = activeSolutionFolder ?? await this.cbuildRunFileLocator.getActiveSolutionFolder();
        // Ignore a stale registration after removal or reactivation supplied a new manager.
        if (watcherGeneration !== this.rawTraceWatcherGeneration || fileWatchManager !== this.fileWatchManager) {
            return;
        }
        const globPattern = resolvedActiveSolutionFolder
            ? new vscode.RelativePattern(resolvedActiveSolutionFolder, RAW_TRACE_GLOB)
            : RAW_TRACE_GLOB;
        fileWatchManager.addWatch({
            id: RAW_TRACE_WATCH_ID,
            globPattern,
            onDidCreate: uri => this.handleRawTraceFileChanged(uri, watcherGeneration),
            onDidChange: uri => this.handleRawTraceFileChanged(uri, watcherGeneration)
        });
    }

    private async addCapturedTraceWatcher(activeSolutionFolder?: vscode.Uri): Promise<void> {
        const fileWatchManager = this.fileWatchManager;
        if (fileWatchManager === undefined) {
            return;
        }
        const resolvedActiveSolutionFolder = activeSolutionFolder ?? await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (fileWatchManager !== this.fileWatchManager) {
            return;
        }
        fileWatchManager.addWatch({
            id: CAPTURED_TRACE_WATCH_ID,
            globPattern: resolvedActiveSolutionFolder
                ? new vscode.RelativePattern(resolvedActiveSolutionFolder, CAPTURED_TRACE_GLOB)
                : CAPTURED_TRACE_GLOB,
            onDidCreate: () => this.updateCapturedTraceContext(),
            onDidChange: () => this.updateCapturedTraceContext(),
            onDidDelete: () => this.updateCapturedTraceContext()
        });
        await this.updateCapturedTraceContext();
    }

    private removeTraceWatchers(): void {
        this.removeRawTraceWatcher();
        if (this.fileWatchManager === undefined) {
            return;
        }
        this.fileWatchManager.removeWatch(CAPTURED_TRACE_WATCH_ID);
    }

    private removeRawTraceWatcher(): void {
        this.rawTraceWatcherGeneration += 1;
        this.fileWatchManager?.removeWatch(RAW_TRACE_WATCH_ID);
    }

    private async handleActiveSolutionPathChanged(): Promise<void> {
        this.removeTraceWatchers();
        this.pendingDecodes.clear();
        this.rawTraceSaves.clear();
        await this.addTraceWatchers();
    }

    private async updateCapturedTraceContext(): Promise<void> {
        const hasCapturedTrace = await this.capturedTraceResolver.hasSwoCapture(this.activeSession?.getCbuildRunPath());
        await vscode.commands.executeCommand('setContext', HAS_CAPTURED_TRACE_CONTEXT, hasCapturedTrace);
    }
}
