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
import { URI } from 'vscode-uri';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { logger } from '../../logger';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';

export type fifoUpdateReason = 'sessionChanged' | 'refreshTimer' | 'stackTrace';
interface UpdateQueueItem {
    updateId: number;
    debugSession: GDBTargetDebugSession;
    updateReason: fifoUpdateReason;
}

interface ComponentViewerInstancesWrapper {
    componentViewerInstance: ComponentViewerInstance;
    lockState: boolean;
}

export class ComponentViewer {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instances: ComponentViewerInstancesWrapper[] = [];
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
        // Register Component Viewer tree view
        this.registerTreeView();
        // Subscribe to debug tracker events to update active session
        this.subscribetoDebugTrackerEvents(tracker);
    }

    protected registerTreeView(): void {
        this._componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
        const treeProviderDisposable = vscode.window.registerTreeDataProvider('cmsis-debugger.componentViewer', this._componentViewerTreeDataProvider);
        const lockInstanceCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.lockComponent', async (node) => {
            this.handleLockInstance(node);
        });
        const unlockInstanceCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.unlockComponent', async (node) => {
            this.handleLockInstance(node);
        });
        this._context.subscriptions.push(
            treeProviderDisposable,
            lockInstanceCommandDisposable,
            unlockInstanceCommandDisposable
        );
    }

    protected handleLockInstance(node: ScvdGuiInterface): void {
        const instance = this._instances.find((inst) => {
            const guiTree = inst.componentViewerInstance.getGuiTree();
            if (!guiTree) {
                return false;
            }
            // Check if the node belongs to this instance. We only care about parent nodes, as locking/unlocking a child node is not supported,
            // so we can skip checking the whole tree and just check if the node is one of the roots.
            return guiTree[0].getGuiId() === node.getGuiId(); 
        });
        if (!instance) {
            return;
        }
        instance.lockState = !instance.lockState;
        logger.info(`Component Viewer: Instance lock state changed to ${instance.lockState}`);
        // If instance is locked, set isLocked flag to true for root nodes
        const guiTree = instance.componentViewerInstance.getGuiTree();
        if (!guiTree) {
            return;
        }
        const rootNode: ScvdGuiInterface = guiTree[0];
        rootNode.isLocked = instance.lockState;
        this._componentViewerTreeDataProvider?.refresh();
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
        const cbuildRunInstances: ComponentViewerInstance[] = [];
        for (const scvdFilePath of scvdFilesPaths) {
            const instance = new ComponentViewerInstance();
            if (this._activeSession !== undefined) {
                await instance.readModel(URI.file(scvdFilePath), this._activeSession, tracker);
                cbuildRunInstances.push(instance);
            }
        }
        // Store loaded instances, set default lock state to false
        this._instances.push(...cbuildRunInstances.map(instance => ({
            componentViewerInstance: instance,
            lockState: false
        })));  
    }

    private async loadCbuildRunInstances(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker) : Promise<void | undefined> {
        this._loadingCounter++;
        console.log(`Loading SCVD files from cbuild-run, attempt #${this._loadingCounter}`);
        // Try to read SCVD files from cbuild-run file first
        await this.readScvdFiles(tracker, session);
        // Are there any SCVD files found in cbuild-run?
        if (this._instances.length === 0) {
            return undefined;
        }
    }

    private subscribetoDebugTrackerEvents(tracker: GDBTargetDebugTracker): void {
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
        this._context.subscriptions.push(
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
            this._instances = [];
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
        this._instances.forEach((instance) => instance.componentViewerInstance.updateActiveSession(session));
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
        if (this._instances.length === 0) {
            return;
        }
        const roots: ScvdGuiInterface[] = [];
        for (const instance of this._instances) {
            this._instanceUpdateCounter++;
            logger.debug(`Updating Component Viewer Instance #${this._instanceUpdateCounter} due to '${updateReason}' (queue position #${this._updateQueue.length})`);
            console.log(`Updating Component Viewer Instance #${this._instanceUpdateCounter}`);
            // Check instance's lock state, skip update if locked
            if (!instance.lockState) {
                await instance.componentViewerInstance.update();
            }
            const guiTree = instance.componentViewerInstance.getGuiTree();
            if (guiTree) {
                roots.push(...guiTree);
                // If instance is locked, set isLocked flag to true for root nodes
                roots[roots.length - 1].isLocked = instance.lockState;
            }
        }
        // Set isRootInstance flag for all roots to true
        roots.forEach((root) => {
            root.isRootInstance = true;
        });
        this._componentViewerTreeDataProvider?.setRoots(roots);
    }
}

