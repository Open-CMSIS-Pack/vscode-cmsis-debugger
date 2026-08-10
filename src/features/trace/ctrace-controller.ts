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

const RAW_TRACE_SAVE_WINDOW_MS = 2_000;
const RAW_TRACE_GLOB = '.trace/*.{SWO,TB}.raw';

interface PendingDecode {
    readonly cbuildRunFilePath: string | undefined;
    readonly stoppedAt: number;
}

export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;
    private fileWatchManager: FileWatchManager | undefined;
    private readonly pendingDecodes = new Map<string, PendingDecode>();
    private readonly rawTraceSaves = new Map<string, number>();

    public constructor(
        private readonly options: CTraceProcessManagerOptions = {},
        // Injected to make timing-based behavior deterministic in tests.
        private readonly now: () => number = Date.now
    ) {}

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

    protected async handleRawTraceFileChanged(uri: vscode.Uri): Promise<void> {
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
            await this.run({ cbuildRunFilePath: pendingDecode.cbuildRunFilePath });
            return;
        }
    }
}
