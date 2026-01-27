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
import { ContinuedEvent, GDBTargetDebugSession, GDBTargetDebugTracker, SessionStackItem, StoppedEvent } from '../../debug-session';
import { ComponentViewerInstance } from './component-viewer-instance';
import { URI } from 'vscode-uri';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { ScvdGuiTree } from './scvd-gui-tree';


export class ComponentViewer {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instances: ComponentViewerInstance[] = [];
    private _componentViewerTreeDataProvider: ComponentViewerTreeDataProvider | undefined;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _loadingCounter: number = 0;
    private _pendingUpdateSessionId: string | undefined;
    private _targetRunningBySessionId: Map<string, boolean> = new Map();
    private _updateInProgress: boolean = false;
    private _updateQueued: boolean = false;

    public constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public activate(tracker: GDBTargetDebugTracker): void {
        /* Create Tree Viewer */
        this._componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
        const treeProviderDisposable = vscode.window.registerTreeDataProvider('cmsis-debugger.componentViewer', this._componentViewerTreeDataProvider);
        this._context.subscriptions.push(
            treeProviderDisposable);
        // Subscribe to debug tracker events to update active session
        this.subscribetoDebugTrackerEvents(this._context, tracker);
    }

    protected async readScvdFiles(tracker: GDBTargetDebugTracker,session?: GDBTargetDebugSession): Promise<void> {
        if (!session) {
            return;
        }
        const cbuildRunReader = await session.getCbuildRun();
        if (!cbuildRunReader) {
            return;
        }
        // Get SCVD file paths from cbuild-run reader
        const scvdFilesPaths: string [] = cbuildRunReader.getScvdFilePaths();
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
        this._instances = cbuildRunInstances;
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
        const onDidChangeActiveStackItemDisposable = tracker.onDidChangeActiveStackItem(async (item) => {
            await this.handleOnDidChangeActiveStackItem(item);
        });
        const onWillStartSessionDisposable = tracker.onWillStartSession(async (session) => {
            await this.handleOnWillStartSession(session);
        });
        const onStoppedDisposable = tracker.onStopped(async (event) => {
            await this.handleOnStopped(event);
        });
        const onContinuedDisposable = tracker.onContinued(async (event) => {
            this.handleOnContinued(event);
        });
        // clear all disposables on extension deactivation
        context.subscriptions.push(
            onWillStopSessionDisposable,
            onConnectedDisposable,
            onDidChangeActiveDebugSessionDisposable,
            onDidChangeActiveStackItemDisposable,
            onWillStartSessionDisposable,
            onStoppedDisposable,
            onContinuedDisposable
        );
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is the one being stopped
        if (this._activeSession?.session.id === session.session.id) {
            this._activeSession = undefined;
        }
        if (this._pendingUpdateSessionId === session.session.id) {
            this._pendingUpdateSessionId = undefined;
        }
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => await this.handleRefreshTimerEvent(refreshSession));
    }

    private async handleOnConnected(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): Promise<void> {
        // if new session is not the current active session, erase old instances and read the new ones
        if (this._activeSession?.session.id !== session.session.id) {
            this._instances = [];
            this._componentViewerTreeDataProvider?.deleteModels();
        }
        // Update debug session
        this._activeSession = session;
        // Load SCVD files from cbuild-run
        await this.loadCbuildRunInstances(session, tracker);
    }

    private async handleRefreshTimerEvent(session: GDBTargetDebugSession): Promise<void> {
        if (this._activeSession?.session.id === session.session.id) {
            this.requestUpdate(session, { allowImmediate: true, allowPending: false });
        }
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Update debug session
        this._activeSession = session;
        if (this._pendingUpdateSessionId && this._pendingUpdateSessionId !== session?.session.id) {
            this._pendingUpdateSessionId = undefined;
        }
        if (!session) {
            this._componentViewerTreeDataProvider?.deleteModels();
            return;
        }
        this.requestUpdate(session, { allowImmediate: true, allowPending: true });
    }

    private async handleOnDidChangeActiveStackItem(item: SessionStackItem): Promise<void> {
        const frameId = (item.item as vscode.DebugStackFrame | undefined)?.frameId;
        if (frameId === undefined) {
            return;
        }
        if (this._pendingUpdateSessionId !== item.session.session.id) {
            return;
        }
        if (!this.canUpdateNow(item.session)) {
            return;
        }
        this._pendingUpdateSessionId = undefined;
        await this.updateInstances();
    }

    private async handleOnStopped(event: StoppedEvent): Promise<void> {
        if (!event.session) {
            return;
        }
        this._targetRunningBySessionId.set(event.session.session.id, false);
        if (this._activeSession?.session.id !== event.session.session.id) {
            return;
        }
        this.requestUpdate(event.session, { allowImmediate: false, allowPending: true });
    }

    private handleOnContinued(event: ContinuedEvent): void {
        if (!event.session) {
            return;
        }
        this._targetRunningBySessionId.set(event.session.session.id, true);
        if (this._pendingUpdateSessionId === event.session.session.id) {
            this._pendingUpdateSessionId = undefined;
        }
    }

    private canUpdateNow(session: GDBTargetDebugSession): boolean {
        if (this._activeSession?.session.id !== session.session.id) {
            return false;
        }
        if (this._targetRunningBySessionId.get(session.session.id) !== false) {
            return false;
        }
        const activeItem = vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined;
        if (!activeItem || activeItem.session.id !== session.session.id) {
            return false;
        }
        return activeItem.frameId !== undefined;
    }

    private requestUpdate(session: GDBTargetDebugSession, options: { allowImmediate: boolean; allowPending: boolean }): void {
        if (options.allowImmediate && this.canUpdateNow(session)) {
            void this.updateInstances();
            return;
        }
        if (options.allowPending) {
            this._pendingUpdateSessionId = session.session.id;
        }
    }

    private async updateInstances(): Promise<void> {
        if (this._updateInProgress) {
            this._updateQueued = true;
            return;
        }
        this._updateInProgress = true;
        do {
            this._updateQueued = false;
            this._instanceUpdateCounter = 0;
            if (!this._activeSession) {
                this._componentViewerTreeDataProvider?.deleteModels();
                continue;
            }
            if (this._instances.length === 0) {
                continue;
            }
            this._componentViewerTreeDataProvider?.beginUpdate();
            for (const instance of this._instances) {
                this._instanceUpdateCounter++;
                console.log(`Updating Component Viewer Instance #${this._instanceUpdateCounter}`);
                const instanceKey = instance.getInstanceKey();
                if (instanceKey) {
                    ScvdGuiTree.pushKeySuffix(instanceKey);
                }
                try {
                    await instance.update();
                } finally {
                    if (instanceKey) {
                        ScvdGuiTree.popKeySuffix();
                    }
                }
                this._componentViewerTreeDataProvider?.addGuiOut(instance.getGuiTree());
            }
            this._componentViewerTreeDataProvider?.showModelData();
        } while (this._updateQueued);
        this._updateInProgress = false;
    }
}
