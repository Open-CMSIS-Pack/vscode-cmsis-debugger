/**
 * Copyright 2026 Arm Limited
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


export class ComponentViewerController {
    private activeSession: GDBTargetDebugSession | undefined;
    private instances: ComponentViewerInstance[] = [];
    private componentViewerTreeDataProvider: ComponentViewerTreeDataProvider | undefined;
    private _context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public async activate(tracker: GDBTargetDebugTracker): Promise<void> {
        /* Create Tree Viewer */
        this.componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
        const treeProviderDisposable = vscode.window.registerTreeDataProvider('cmsis-debugger.componentViewer', this.componentViewerTreeDataProvider);
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
            if (this.activeSession !== undefined) {
                await instance.readModel(URI.file(scvdFilePath), this.activeSession, tracker);
                cbuildRunInstances.push(instance);
            }
        }
        this.instances = cbuildRunInstances;
    }

    private loadingCounter: number = 0;
    private async loadCbuildRunInstances(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker) : Promise<void> {
        this.loadingCounter++;
        console.log(`Loading SCVD files from cbuild-run, attempt #${this.loadingCounter}`);
        // Try to read SCVD files from cbuild-run file first
        await this.readScvdFiles(tracker, session);
        // Are there any SCVD files found in cbuild-run?
        if (this.instances.length > 0) {
            // Add all models from cbuild-run to the tree view
            /*for (const instance of this.instances) {
                await instance.update();
                await this.componentViewerTreeDataProvider?.addGuiOut(instance.getGuiTree());
            }
            await this.componentViewerTreeDataProvider?.showModelData();*/
            return;
        }
    }

    private subscribetoDebugTrackerEvents(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker): void {
        const onWillStopSessionDisposable = tracker.onWillStopSession(async (session) => {
            await this.handleOnWillStopSession(session);
        });
        const onConnectedDisposable = tracker.onConnected(async (session) => {
            await this.handleOnConnected(session, tracker);
        });
        //const onWillStartSessionDisposable = tracker.onWillStartSession(async (session) => {
        //    await this.handleOnWillStartSession(session);
        //});
        const onDidChangeActiveStackItemDisposable = tracker.onDidChangeActiveStackItem(async (stackTraceItem) => {
            await this.handleOnDidChangeActiveStackItem(stackTraceItem);
        });
        const onDidChangeActiveDebugSessionDisposable = tracker.onDidChangeActiveDebugSession(async (session) => {
            await this.handleOnDidChangeActiveDebugSession(session);
        });
        const onStopped = tracker.onStopped(async (session) => {
            await this.handleOnStopped(session.session);
        });
        // clear all disposables on extension deactivation
        context.subscriptions.push(
            onWillStopSessionDisposable,
            //onWillStartSessionDisposable,
            onConnectedDisposable,
            onDidChangeActiveStackItemDisposable,
            onDidChangeActiveDebugSessionDisposable,
            onStopped
        );
    }

    private async handleOnStopped(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is NOT the one being stopped
        if (this.activeSession?.session.id !== session.session.id) {
            this.activeSession = undefined;
        }
        // Update component viewer instance(s)
        //await this.updateInstances();
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Clear active session if it is the one being stopped
        if (this.activeSession?.session.id === session.session.id) {
            this.activeSession = undefined;
        }
        // Update component viewer instance(s)
        //await this.updateInstances();
    }

    private async handleOnConnected(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): Promise<void> {
        // if new session is not the current active session, erase old instances and read the new ones
        if (this.activeSession?.session.id !== session.session.id) {
            this.instances = [];
            await this.componentViewerTreeDataProvider?.deleteModels();
        }
        // Update debug session
        this.activeSession = session;
        // Load SCVD files from cbuild-run
        await this.loadCbuildRunInstances(session, tracker);
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => {
            if (this.activeSession?.session.id === refreshSession.session.id) {
                // Update component viewer instance(s)
                //await this.updateInstances();
            }
        });
    }

    private async handleOnDidChangeActiveStackItem(stackTraceItem: SessionStackItem): Promise<void> {
        if ((stackTraceItem.item as vscode.DebugStackFrame).frameId !== undefined) {
            // Update instance(s) with new stack frame info
            await this.updateInstances();
        }
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Update debug session
        this.activeSession = session;
        // Update component viewer instance(s)
        //await this.updateInstances();
    }
    private instanceUpdateCounter: number = 0;
    private updateSymaphorFlag: boolean = false;
    private async updateInstances(): Promise<void> {
        if (this.updateSymaphorFlag) {
            return;
        }
        this.updateSymaphorFlag = true;
        this.instanceUpdateCounter = 0;
        if (!this.activeSession) {
            await this.componentViewerTreeDataProvider?.deleteModels();
            this.updateSymaphorFlag = false;
            return;
        }
        if (this.instances.length === 0) {
            this.updateSymaphorFlag = false;
            return;
        }
        this.componentViewerTreeDataProvider?.resetModelCache();
        for (const instance of this.instances) {
            this.instanceUpdateCounter++;
            console.log(`Updating Component Viewer Instance #${this.instanceUpdateCounter}`);
            await instance.update();
            await this.componentViewerTreeDataProvider?.addGuiOut(instance.getGuiTree());
        }
        await this.componentViewerTreeDataProvider?.showModelData();
        this.updateSymaphorFlag = false;
    }
}
