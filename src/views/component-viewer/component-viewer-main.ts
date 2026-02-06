/**
 * Copyright 2025-2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode';
import { GDBTargetDebugTracker, GDBTargetDebugSession } from '../../debug-session';
import { ComponentViewerInstance } from './component-viewer-instance';
import { GuiInstanceRoot, GuiInstanceLockHandle } from './gui-instance-root';
import { URI } from 'vscode-uri';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { logger } from '../../logger';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';
import type { ScvdGuiTree } from './scvd-gui-tree';

export type fifoUpdateReason = 'sessionChanged' | 'refreshTimer' | 'stackTrace';
interface UpdateQueueItem {
    updateId: number;
    debugSession: GDBTargetDebugSession;
    updateReason: fifoUpdateReason;
}

class ComponentViewerInstanceSlot implements GuiInstanceLockHandle {
    public readonly instance: ComponentViewerInstance;
    private _locked = false;
    private _guiTree: ScvdGuiTree[] | undefined;

    public constructor(instance: ComponentViewerInstance) {
        this.instance = instance;
    }

    public get locked(): boolean {
        return this._locked;
    }

    public toggleLock(): void {
        this._locked = !this._locked;
    }

    public get guiTree(): ScvdGuiTree[] | undefined {
        return this._guiTree;
    }

    public set guiTree(value: ScvdGuiTree[] | undefined) {
        this._guiTree = value;
    }
}

export class ComponentViewer {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instanceSlots: ComponentViewerInstanceSlot[] = [];
    private _componentViewerTreeDataProvider: ComponentViewerTreeDataProvider | undefined;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _loadingCounter: number = 0;
    // Update queue is currently used for logging purposes only
    private _updateQueue: UpdateQueueItem[] = [];
    private _pendingUpdateTimer: NodeJS.Timeout | undefined;
    private _pendingUpdate: boolean = false;
    private _runningUpdate: boolean = false;
    private static readonly pendingUpdateDelayMs = 200;

    public constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public activate(tracker: GDBTargetDebugTracker): void {
        this._componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
        const treeProviderDisposable = vscode.window.registerTreeDataProvider('cmsis-debugger.componentViewer', this._componentViewerTreeDataProvider);
        this._context.subscriptions.push(treeProviderDisposable);
        const lockDisposable = vscode.commands.registerCommand(
            'vscode-cmsis-debugger.componentViewer.lock',
            (root?: GuiInstanceRoot) => this.setRootLock(root, true)
        );
        const unlockDisposable = vscode.commands.registerCommand(
            'vscode-cmsis-debugger.componentViewer.unlock',
            (root?: GuiInstanceRoot) => this.setRootLock(root, false)
        );
        this._context.subscriptions.push(lockDisposable, unlockDisposable);
        // Subscribe to debug tracker events to update active session
        this.subscribetoDebugTrackerEvents(this._context, tracker);
    }

    protected async readScvdFiles(tracker: GDBTargetDebugTracker,session?: GDBTargetDebugSession): Promise<void> {
        if (!session) {
            return;
        }
        const cbuildRunReader = await session.getCbuildRun();
        const pname = await session.getPname();
        if (!cbuildRunReader) {
            return;
        }
        // Get SCVD file paths from cbuild-run reader
        const scvdFilesPaths: string [] = cbuildRunReader.getScvdFilePaths(undefined, pname);
        if (scvdFilesPaths.length === 0) {
            return undefined;
        }
        const cbuildRunInstances: ComponentViewerInstanceSlot[] = [];
        for (const scvdFilePath of scvdFilesPaths) {
            const instance = new ComponentViewerInstance();
            if (this._activeSession !== undefined) {
                await instance.readModel(URI.file(scvdFilePath), this._activeSession, tracker);
                cbuildRunInstances.push(new ComponentViewerInstanceSlot(instance));
            }
        }
        this._instanceSlots = cbuildRunInstances;
    }

    private async loadCbuildRunInstances(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker) : Promise<void | undefined> {
        this._loadingCounter++;
        console.log(`Loading SCVD files from cbuild-run, attempt #${this._loadingCounter}`);
        // Try to read SCVD files from cbuild-run file first
        await this.readScvdFiles(tracker, session);
        // Are there any SCVD files found in cbuild-run?
        if (this._instanceSlots.length === 0) {
            return undefined;
        }
    }

    private subscribetoDebugTrackerEvents(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker): void {
        const onWillStopSessionDisposable = tracker.onWillStopSession(async (session) => {
            await this.handleOnWillStopSession(session);
        });
        const onConnectedDisposable = tracker.onConnected(async (session) => {
            await this.handleOnConnected(session, tracker);
        });
        const onDidChangeActiveDebugSessionDisposable = tracker.onDidChangeActiveDebugSession(async (session) => {
            await this.handleOnDidChangeActiveDebugSession(session);
        });
        const onStackTraceDisposable = tracker.onStackTrace(async (session) => {
            await this.handleOnStackTrace(session.session);
        });
        const onWillStartSessionDisposable = tracker.onWillStartSession(async (session) => {
            await this.handleOnWillStartSession(session);
        });
        // clear all disposables on extension deactivation
        context.subscriptions.push(
            onWillStopSessionDisposable,
            onConnectedDisposable,
            onDidChangeActiveDebugSessionDisposable,
            onStackTraceDisposable,
            onWillStartSessionDisposable
        );
    }

    private async handleOnStackTrace(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is NOT the one being stopped
        if (this._activeSession?.session.id !== session.session.id) {
            this._activeSession = undefined;
        }
        // Update component viewer instance(s)
        this.schedulePendingUpdate('stackTrace');
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is the one being stopped
        if (this._activeSession?.session.id === session.session.id) {
            this._activeSession = undefined;
        }
        // Clearing update queue
        this._updateQueue = [];
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => await this.handleRefreshTimerEvent(refreshSession));
    }

    private async handleOnConnected(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): Promise<void> {
        // if new session is not the current active session, erase old instances and read the new ones
        if (this._activeSession?.session.id !== session.session.id) {
            this._instanceSlots = [];
            this._componentViewerTreeDataProvider?.clear();
        }
        // Update debug session
        this._activeSession = session;
        // Load SCVD files from cbuild-run
        await this.loadCbuildRunInstances(session, tracker);
    }

    private async handleRefreshTimerEvent(session: GDBTargetDebugSession): Promise<void> {
        if (this._activeSession?.session.id === session.session.id) {
            // Update component viewer instance(s)
            this.schedulePendingUpdate('refreshTimer');
        }
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Update debug session
        this._activeSession = session;
        if (session === undefined) {
            return;
        }
        // update active debug session for all instances
        this._instanceSlots.forEach((slot) => slot.instance.updateActiveSession(session));
        this.schedulePendingUpdate('sessionChanged');
    }

    private schedulePendingUpdate(updateReason: fifoUpdateReason): void {
        this._pendingUpdate = true;
        if (this._pendingUpdateTimer) {
            clearTimeout(this._pendingUpdateTimer);
        }
        this._pendingUpdateTimer = setTimeout(() => {
            this._pendingUpdateTimer = undefined;
            void this.runUpdate(updateReason);
        }, ComponentViewer.pendingUpdateDelayMs);
    }

    private async runUpdate(updateReason: fifoUpdateReason): Promise<void> {
        if (this._runningUpdate) {
            return;
        }
        this._runningUpdate = true;
        while (this._pendingUpdate) {
            this._pendingUpdate = false;
            try {
                await this.updateInstances(updateReason);
            } finally {
                this._runningUpdate = false;
                logger.error('Component Viewer: Error during update');
            }
        }
        this._runningUpdate = false;
    }

    private async updateInstances(updateReason: fifoUpdateReason): Promise<void> {
        if (!this._activeSession) {
            this._componentViewerTreeDataProvider?.clear();
            return;
        }
        logger.debug(`Component Viewer: Queuing update due to '${updateReason}', that is update #${this._updateQueue.length + 1} in the queue`);
        this._updateQueue.push({
            updateId: this._updateQueue.length + 1,
            debugSession: this._activeSession,
            updateReason: updateReason
        });
        this._instanceUpdateCounter = 0;
        if (this._instanceSlots.length === 0) {
            return;
        }
        const roots: ScvdGuiInterface[] = [];
        for (const slot of this._instanceSlots) {
            this._instanceUpdateCounter++;
            logger.debug(`Updating Component Viewer Instance #${this._instanceUpdateCounter} due to '${updateReason}' (queue position #${this._updateQueue.length})`);
            console.log(`Updating Component Viewer Instance #${this._instanceUpdateCounter}`);
            if (!slot.locked) {
                await slot.instance.update();
                slot.guiTree = slot.instance.getGuiTree();
            }
            const guiTree = slot.guiTree ?? slot.instance.getGuiTree();
            if (guiTree) {
                roots.push(...guiTree.map((root) => new GuiInstanceRoot(root, slot)));
            }
        }
        this._componentViewerTreeDataProvider?.setRoots(roots);
    }

    private setRootLock(root: GuiInstanceRoot | undefined, locked: boolean): void {
        if (!root || root.isLocked() === locked) {
            return;
        }
        root.toggleLock();
        this._componentViewerTreeDataProvider?.refresh();
        if (!locked) {
            this.schedulePendingUpdate('refreshTimer');
        }
    }
}
