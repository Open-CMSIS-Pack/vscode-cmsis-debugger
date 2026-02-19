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
import { componentViewerLogger, logger } from '../../logger';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';
import { perf, parsePerf } from './stats-config';
import { vscodeViewExists } from '../../vscode-utils';

export type UpdateReason = 'sessionChanged' | 'refreshTimer' | 'stackTrace' | 'stackItemChanged' | 'unlockingInstance';

export interface ComponentViewerInstancesWrapper {
    componentViewerInstance: ComponentViewerInstance;
    lockState: boolean;
    sessionId: string; // ID of the debug session this instance belongs to, used to clear instances when session changes
    dirtyWhileLocked: boolean; // Flag to indicate if an update was attempted while instance was locked, used to trigger an update when instance is unlocked
}

export class ComponentViewer {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instances: ComponentViewerInstancesWrapper[] = [];
    private _componentViewerTreeDataProvider: ComponentViewerTreeDataProvider;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _loadingCounter: number = 0;
    private _pendingUpdateTimer: NodeJS.Timeout | undefined;
    private _pendingUpdate: boolean = false;
    private _runningUpdate: boolean = false;
    private _refreshTimerEnabled: boolean = true;
    private static readonly pendingUpdateDelayMs = 150;

    public constructor(context: vscode.ExtensionContext, componentViewerTreeDataProvider: ComponentViewerTreeDataProvider) {
        this._context = context;
        this._componentViewerTreeDataProvider = componentViewerTreeDataProvider;
    }

    public async activate(tracker: GDBTargetDebugTracker): Promise<boolean> {
        // Register Component Viewer tree view
        logger.debug('Activating Component Viewer Tree View and commands');
        if (!await this.registerTreeView()) {
            logger.error('Component Viewer: Component Viewer cannot be registered, abort activation');
            return false;
        }
        // Subscribe to debug tracker events to update active session
        componentViewerLogger.debug('Subscribing to debug tracker events');
        this.subscribetoDebugTrackerEvents(tracker);
        return true;
    }

    protected async registerTreeView(): Promise<boolean> {
        if (!await vscodeViewExists('componentViewer')) {
            return false;
        }
        const treeProviderDisposable = vscode.window.registerTreeDataProvider('cmsis-debugger.componentViewer', this._componentViewerTreeDataProvider);
        componentViewerLogger.debug('Component Viewer: Registered tree data provider for Component Viewer Tree View id: cmsis-debugger.componentViewer');
        const lockInstanceCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.lockComponent', async (node) => {
            this.handleLockInstance(node);
        });
        const unlockInstanceCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.unlockComponent', async (node) => {
            this.handleLockInstance(node);
        });
        const enablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.enablePeriodicUpdate', async () => {
            this._refreshTimerEnabled = true;
            componentViewerLogger.info('Component Viewer: Auto refresh enabled');
        });
        const disablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand('vscode-cmsis-debugger.componentViewer.disablePeriodicUpdate', async () => {
            this._refreshTimerEnabled = false;
            componentViewerLogger.info('Component Viewer: Auto refresh disabled');
        });
        this._context.subscriptions.push(
            treeProviderDisposable,
            lockInstanceCommandDisposable,
            unlockInstanceCommandDisposable,
            enablePeriodicUpdateCommandDisposable,
            disablePeriodicUpdateCommandDisposable
        );
        return true;
    }

    protected handleLockInstance(node: ScvdGuiInterface): void {
        let shouldTriggerUpdate: boolean = false; // Unlocking a node should trigger an update
        const instance = this._instances.find((inst) => {
            const guiTree = inst.componentViewerInstance.getGuiTree();
            if (!guiTree || guiTree.length === 0) {
                return false;
            }
            // Check if the node belongs to this instance. We only care about parent nodes, as locking/unlocking a child node is not supported,
            // so we can skip checking the whole tree and just check if the node is one of the roots.
            return guiTree[0].getGuiId() === node.getGuiId();
        });
        if (!instance) {
            return;
        }
        if (instance.lockState === true) {
            shouldTriggerUpdate = true;
        }
        instance.lockState = !instance.lockState;
        componentViewerLogger.info(`Component Viewer: Instance lock state changed to ${instance.lockState}`);
        // If instance is locked, set isLocked flag to true for root nodes
        const guiTree = instance.componentViewerInstance.getGuiTree();
        if (!guiTree || guiTree.length === 0) {
            return;
        }
        const rootNode: ScvdGuiInterface = guiTree[0];
        rootNode.isLocked = instance.lockState;
        if (shouldTriggerUpdate && instance.dirtyWhileLocked) {
            this.schedulePendingUpdate('unlockingInstance');
            instance.dirtyWhileLocked = false;
        }
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
        parsePerf?.reset();
        const cbuildRunInstances: ComponentViewerInstance[] = [];
        for (const scvdFilePath of scvdFilesPaths) {
            const instance = new ComponentViewerInstance();
            if (this._activeSession !== undefined) {
                try {
                    await instance.readModel(URI.file(scvdFilePath), this._activeSession, tracker);
                } catch (error) {
                    componentViewerLogger.error(`Component Viewer: Failed to read SCVD file at ${scvdFilePath} - ${(error as Error).message}`);
                    // Show error message in a pop up to the user, but continue loading other instances if there are multiple SCVD files
                    vscode.window.showErrorMessage(`Component Viewer: cannot read SCVD file at ${scvdFilePath}`);
                    continue;
                }

                cbuildRunInstances.push(instance);
            }
        }
        parsePerf?.logSummary();
        // Store loaded instances, set default lock state to false
        this._instances.push(...cbuildRunInstances.map(instance => ({
            componentViewerInstance: instance,
            lockState: false,
            sessionId: session.session.id,
            dirtyWhileLocked: false
        })));
    }

    private async loadCbuildRunInstances(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker) : Promise<void | undefined> {
        this._loadingCounter++;
        componentViewerLogger.debug(`Loading SCVD files from cbuild-run, attempt #${this._loadingCounter}`);
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
        const onDidChangeActiveStackItemDisposable = tracker.onDidChangeActiveStackItem(async (session) => {
            await this.handleOnStackItemChanged(session.session);
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
            onDidChangeActiveStackItemDisposable,
            onWillStartSessionDisposable
        );
    }

    private async handleOnStackTrace(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is NOT the one being stopped
        if (this._activeSession?.session.id !== session.session.id) {
            throw new Error(`Component Viewer: Received stack trace event for session ${session.session.id} while active session is ${this._activeSession?.session.id}`);
        }
        // Update component viewer instance(s) if active session is stopped
        this.schedulePendingUpdate('stackTrace');
    }

    protected async handleOnStackItemChanged(session: GDBTargetDebugSession): Promise<void> {
        // If the active session is not the one being updated, update it.
        // This can happen when a session is started and stack trace/item events are emitted before the session is set as active in the component viewer.
        if (this._activeSession?.session.id !== session.session.id) {
            throw new Error(`Component Viewer: Received stack item changed event for session ${session.session.id} while active session is ${this._activeSession?.session.id}`);
        }
        this.schedulePendingUpdate('stackItemChanged');
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is the one being stopped
        if (this._activeSession?.session.id === session.session.id) {
            this._activeSession = undefined;
        }
        // Clear instances belonging to the stopped session and update tree view
        this._instances = this._instances.filter((instance) => {
            if (instance.sessionId === session.session.id) {
                return false;
            }
            return true;
        });
        this.schedulePendingUpdate('sessionChanged');
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => await this.handleRefreshTimerEvent(refreshSession));
    }

    private async handleOnConnected(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): Promise<void> {
        // Update debug session
        this._activeSession = session;
        // Load SCVD files from cbuild-run
        await this.loadCbuildRunInstances(session, tracker);
    }

    private async handleRefreshTimerEvent(session: GDBTargetDebugSession): Promise<void> {
        if(this._activeSession?.session.id !== session.session.id) {
            throw new Error(`Component Viewer: Received refresh timer event for session ${session.session.id} while active session is ${this._activeSession?.session.id}`);
        }
        if (this._refreshTimerEnabled) {
            // Update component viewer instance(s)
            this.schedulePendingUpdate('refreshTimer');
        }
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Update debug session
        this._activeSession = session;
    }

    private schedulePendingUpdate(updateReason: UpdateReason): void {
        this._pendingUpdate = true;
        if (this._pendingUpdateTimer) {
            clearTimeout(this._pendingUpdateTimer);
        }
        this._pendingUpdateTimer = setTimeout(() => {
            this._pendingUpdateTimer = undefined;
            void this.runUpdate(updateReason);
        }, ComponentViewer.pendingUpdateDelayMs);
    }

    private async runUpdate(updateReason: UpdateReason): Promise<void> {
        if (this._runningUpdate) {
            return;
        }
        this._runningUpdate = true;
        while (this._pendingUpdate) {
            this._pendingUpdate = false;
            try {
                await this.updateInstances(updateReason);
            } catch (error) {
                componentViewerLogger.error(`Component Viewer: Error during update - ${(error as Error).message}`);
            }
        }
        this._runningUpdate = false;
    }

    private shouldUpdateInstances(session: GDBTargetDebugSession): boolean {
        this._instanceUpdateCounter = 0;
        if (this._instances.length === 0) {
            return false;
        }
        if (session.targetState === 'unknown') {
            return false;
        }
        if (session.targetState === 'running') {
            if (this._refreshTimerEnabled === false ) {
                return false;
            }
            if (session.canAccessWhileRunning === false) {
                return false;
            }
        }
        return true;
    }

    private async updateInstances(updateReason: UpdateReason): Promise<void> {
        if (!this._activeSession) {
            this._componentViewerTreeDataProvider?.clear();
            return;
        }
        componentViewerLogger.debug(`Component Viewer: Queuing update due to '${updateReason}'`);
        this._instanceUpdateCounter = 0;

        if (!this.shouldUpdateInstances(this._activeSession)) {
            componentViewerLogger.debug(`Component Viewer: Skipping update due to '${updateReason}' - conditions not met`);
            return;
        }

        perf?.resetBackendStats();
        perf?.resetUiStats();
        const activeSessionID = this._activeSession.session.id;
        const roots: ScvdGuiInterface[] = [];
        for (const instance of this._instances) {
            // Check if instance belongs to the active session, if not skip it and clear its data from the tree view.
            // However, lockedState should be maintained.
            if (instance.sessionId !== activeSessionID) {
                instance.componentViewerInstance.getGuiTree()?.forEach(root => root.clear());
                continue;
            }
            this._instanceUpdateCounter++;
            componentViewerLogger.debug(`Updating Component Viewer Instance #${this._instanceUpdateCounter} due to '${updateReason}'`);

            // Check instance's lock state, skip update if locked
            if (!instance.lockState) {
                await instance.componentViewerInstance.update();
            } else {
                instance.dirtyWhileLocked = true;
            }
            const guiTree = instance.componentViewerInstance.getGuiTree();
            if (guiTree) {
                roots.push(...guiTree);
                // If instance is locked, set isLocked flag to true for root nodes
                roots[roots.length - 1].isLocked = !!instance.lockState;
                roots[roots.length - 1].isRootInstance = true;
            }
        }
        perf?.logSummaries();
        this._componentViewerTreeDataProvider?.setRoots(roots);
    }
}
