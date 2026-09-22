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
import { ENABLE_TRACE_GENERATION_VIEW_SETTING } from '../../manifest';
import {
    CTraceProcessManager,
    CTraceProcessManagerLaunchOptions,
    CTraceProcessManagerOptions
} from '../../desktop/process/ctrace-process-manager';
import { FileWatchManager } from '../../desktop/filesystem/file-watch-manager';
import { logger } from '../..';

const RAW_TRACE_SAVE_WINDOW_MS = 2_000;
const RAW_TRACE_GLOB = '.trace/*.{SWO,TB}.raw';
const RAW_TRACE_WATCH_ID = 'ctrace-raw-trace';

interface PendingDecode {
    readonly cbuildRunFilePath: string | undefined;
    readonly stoppedAt: number;
}

export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private traceEnabled = false;
    private rawTraceWatcherGeneration = 0;
    private readonly pendingDecodes = new Map<string, PendingDecode>();
    private readonly rawTraceSaves = new Map<string, number>();

    public constructor(
        private readonly options: CTraceProcessManagerOptions = {},
        // Injected to make timing-based behavior deterministic in tests.
        private readonly now: () => number = Date.now,
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cmsisJsonWatcher?: CmsisJsonWatcher
    ) {}

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
            vscode.workspace.onDidChangeConfiguration(async event => {
                if (event.affectsConfiguration(ENABLE_TRACE_GENERATION_VIEW_SETTING)) {
                    await this.updateRawTraceWatcher();
                }
            }),
            { dispose: () => this.removeRawTraceWatcher() },
            ...(activeSolutionChangeSubscription ? [activeSolutionChangeSubscription] : [])
        );
        await this.updateRawTraceWatcher();
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

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected async handleRawTraceFileChanged(
        uri: vscode.Uri,
        watcherGeneration: number = this.rawTraceWatcherGeneration
    ): Promise<void> {
        if (!this.traceEnabled || watcherGeneration !== this.rawTraceWatcherGeneration) {
            return;
        }
        const savedAt = this.now();
        this.rawTraceSaves.set(uri.fsPath, savedAt);
        this.removeExpiredEvents(savedAt);
        await this.decodePendingTrace();
    }

    protected async handleDecodeTrigger(session: GDBTargetDebugSession | undefined): Promise<void> {
        if (!this.traceEnabled) {
            return;
        }
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
                }
                return;
            } catch (error) {
                logger.error('Failed to launch ctrace process:', error);
            }
        }
    }

    private async updateRawTraceWatcher(): Promise<void> {
        this.traceEnabled = vscode.workspace.getConfiguration().get<boolean>(ENABLE_TRACE_GENERATION_VIEW_SETTING, false);
        if (this.traceEnabled) {
            await this.addRawTraceWatcher();
        } else {
            this.removeRawTraceWatcher();
            this.pendingDecodes.clear();
            this.rawTraceSaves.clear();
        }
    }

    private async addRawTraceWatcher(): Promise<void> {
        const fileWatchManager = this.fileWatchManager;
        // A watcher cannot be registered before activation supplies its manager.
        if (fileWatchManager === undefined) {
            return;
        }
        const watcherGeneration = this.rawTraceWatcherGeneration;
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        // Ignore a stale registration after tracing was disabled or reactivation supplied a new manager.
        if (!this.traceEnabled || watcherGeneration !== this.rawTraceWatcherGeneration || fileWatchManager !== this.fileWatchManager) {
            return;
        }
        const globPattern = activeSolutionFolder
            ? new vscode.RelativePattern(activeSolutionFolder, RAW_TRACE_GLOB)
            : RAW_TRACE_GLOB;
        fileWatchManager.addWatch({
            id: RAW_TRACE_WATCH_ID,
            globPattern,
            onDidCreate: uri => this.handleRawTraceFileChanged(uri, watcherGeneration),
            onDidChange: uri => this.handleRawTraceFileChanged(uri, watcherGeneration)
        });
    }

    private removeRawTraceWatcher(): void {
        this.rawTraceWatcherGeneration += 1;
        if (this.fileWatchManager === undefined) {
            return;
        }
        this.fileWatchManager.removeWatch(RAW_TRACE_WATCH_ID);
    }

    private async handleActiveSolutionPathChanged(): Promise<void> {
        if (!this.traceEnabled) {
            return;
        }
        this.removeRawTraceWatcher();
        this.pendingDecodes.clear();
        this.rawTraceSaves.clear();
        await this.addRawTraceWatcher();
    }
}
