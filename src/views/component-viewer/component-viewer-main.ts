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
import { GDBTargetDebugTracker, GDBTargetDebugSession, SessionStackItem } from '../../debug-session';
import { ComponentViewerInstance } from './component-viewer-instance';
import { URI } from 'vscode-uri';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';


export class ComponentViewer {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instances: ComponentViewerInstance[] = [];
    private _componentViewerTreeDataProvider: ComponentViewerTreeDataProvider | undefined;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _updateSemaphoreFlag: boolean = false;
    private _loadingCounter: number = 0;

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
        const onStackTraceDisposable = tracker.onStackTrace(async (session) => {
            await this.handleOnStackTrace(session.session);
        });
        // clear all disposables on extension deactivation
        context.subscriptions.push(
            onWillStopSessionDisposable,
            onConnectedDisposable,
            onDidChangeActiveDebugSessionDisposable,
            onStackTraceDisposable
        );
    }

    private async handleOnStackTrace(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is NOT the one being stopped
        if (this._activeSession?.session.id !== session.session.id) {
            this._activeSession = undefined;
        }
        // Update component viewer instance(s)
        await this.updateInstances();
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is the one being stopped
        if (this._activeSession?.session.id === session.session.id) {
            this._activeSession = undefined;
        }
        // Update component viewer instance(s)
        //await this.updateInstances();
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
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => {
            await this.handleRefreshTimerEvent(refreshSession);
        }
        );
    }

    private async handleRefreshTimerEvent(session: GDBTargetDebugSession): Promise<void> {
        if (this._activeSession?.session.id === session.session.id) {
            // Update component viewer instance(s)
            await this.updateInstances();
        }
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Update debug session
        this._activeSession = session;
        // Update component viewer instance(s)
        await this.updateInstances();
    }

    private async updateInstances(): Promise<void> {
        if (this._updateSemaphoreFlag) {
            return;
        }
        this._updateSemaphoreFlag = true;
        this._instanceUpdateCounter = 0;
        if (!this._activeSession) {
            this._componentViewerTreeDataProvider?.deleteModels();
            this._updateSemaphoreFlag = false;
            return;
        }
        if (this._instances.length === 0) {
            this._updateSemaphoreFlag = false;
            return;
        }
        this._componentViewerTreeDataProvider?.resetModelCache();
        for (const instance of this._instances) {
            this._instanceUpdateCounter++;
            console.log(`Updating Component Viewer Instance #${this._instanceUpdateCounter}`);
            await instance.update();
            this._componentViewerTreeDataProvider?.addGuiOut(instance.getGuiTree());
        }
        this._componentViewerTreeDataProvider?.showModelData();
        this._updateSemaphoreFlag = false;
    }
}
