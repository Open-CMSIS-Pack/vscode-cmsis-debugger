/**
 * Copyright 2025-2026 Arm Limited
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

import * as vscode from 'vscode';
import { GDBTargetDebugTracker, GDBTargetDebugSession } from '../../debug-session';
import { ComponentViewerInstance } from './component-viewer-instance';
import { URI } from 'vscode-uri';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { componentViewerLogger, logger } from '../../logger';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';
import { perf, parsePerf } from './stats-config';
import { vscodeViewExists } from '../../vscode-utils';
import { EXTENSION_NAME, VIEW_PREFIX } from '../../manifest';

export interface ScvdCollector {
    getScvdFilePaths(session: GDBTargetDebugSession): Promise<string[]>;
}

export type UpdateReason = 'sessionChanged' | 'refreshTimer' | 'stackTrace' | 'stackItemChanged' | 'unlockingInstance';

export interface ComponentViewerInstancesWrapper {
    componentViewerInstance: ComponentViewerInstance;
    lockState: boolean;
    sessionId: string; // ID of the debug session this instance belongs to, used to clear instances when session changes
    dirtyWhileLocked: boolean; // Flag to indicate if an update was attempted while instance was locked, used to trigger an update when instance is unlocked
}

export class ComponentViewerBase {
    private _activeSession: GDBTargetDebugSession | undefined;
    private _instances: ComponentViewerInstancesWrapper[] = [];
    private _componentViewerTreeDataProvider: ComponentViewerTreeDataProvider;
    private _treeView: vscode.TreeView<ScvdGuiInterface> | undefined;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _loadingCounter: number = 0;
    private _pendingUpdateTimer: NodeJS.Timeout | undefined;
    private _pendingUpdate: boolean = false;
    private _runningUpdate: boolean = false;
    private _refreshTimerEnabled: boolean = true;
    private static readonly pendingUpdateDelayMs = 150;

    public constructor(
        context: vscode.ExtensionContext,
        componentViewerTreeDataProvider: ComponentViewerTreeDataProvider,
        protected readonly _scvdCollector: ScvdCollector,
        protected readonly _viewName: string,
        protected readonly _viewId: string
    ) {
        this._context = context;
        this._componentViewerTreeDataProvider = componentViewerTreeDataProvider;
    }

    public async activate(tracker: GDBTargetDebugTracker): Promise<boolean> {
        // Register Component Viewer tree view
        logger.debug(`Activating ${this._viewName} Tree View and commands`);
        if (!await this.registerTreeView()) {
            logger.error(`${this._viewName}: ${this._viewName} cannot be registered, abort activation`);
            return false;
        }
        // Subscribe to debug tracker events to update active session
        componentViewerLogger.debug(`${this._viewName}: Subscribing to debug tracker events`);
        this.subscribetoDebugTrackerEvents(tracker);
        return true;
    }

    protected async registerTreeView(): Promise<boolean> {
        if (!await vscodeViewExists(this._viewId)) {
            return false;
        }
        const fullViewId = `${VIEW_PREFIX}.${this._viewId}`;
        const commandPrefix = `${EXTENSION_NAME}.${this._viewId}`;
        const treeView = vscode.window.createTreeView(fullViewId, {
            treeDataProvider: this._componentViewerTreeDataProvider,
            showCollapseAll: true
        });
        this._treeView = treeView;
        componentViewerLogger.debug(`${this._viewName}: Created ${this._viewName} tree view with id: ${fullViewId}`);
        const onDidExpandElementDisposable = treeView.onDidExpandElement(event => this.handleOnDidToggleExpand(event, true));
        const onDidCollapseElementDisposable = treeView.onDidCollapseElement(event => this.handleOnDidToggleExpand(event, false));
        const lockInstanceCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.lockComponent`, async (node) => {
            this.handleLockInstance(node);
        });
        const unlockInstanceCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.unlockComponent`, async (node) => {
            this.handleLockInstance(node);
        });
        const enablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.enablePeriodicUpdate`, async () => {
            this._refreshTimerEnabled = true;
            componentViewerLogger.info(`${this._viewName}: Auto refresh enabled`);
        });
        const disablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.disablePeriodicUpdate`, async () => {
            this._refreshTimerEnabled = false;
            componentViewerLogger.info(`${this._viewName}: Auto refresh disabled`);
        });
        const expandAllCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.expandAll`, async () => {
            componentViewerLogger.debug(`${this._viewName}: Expand all tree items`);
            await this.handleExpandAll();
        });
        const filterTreeCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.filterTree`, () => {
            this.handleFilterTree();
        });
        const clearFilterCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.clearFilter`, async () => {
            this.handleClearFilter();
        });
        this._context.subscriptions.push(
            treeView,
            onDidExpandElementDisposable,
            onDidCollapseElementDisposable,
            lockInstanceCommandDisposable,
            unlockInstanceCommandDisposable,
            enablePeriodicUpdateCommandDisposable,
            disablePeriodicUpdateCommandDisposable,
            expandAllCommandDisposable,
            filterTreeCommandDisposable,
            clearFilterCommandDisposable
        );
        return true;
    }

    protected async handleExpandAll(): Promise<void> {
        if (!this._treeView) {
            return;
        }

        const fullViewId = `${VIEW_PREFIX}.${this._viewId}`;
        await vscode.window.withProgress(
            { location: { viewId: fullViewId } },
            () => this.expandAllNodes()
        );
    }

    private async expandAllNodes(): Promise<void> {
        if (!this._treeView) {
            return;
        }

        // Remember the current selection so we can keep it in view
        const selectedElement = this._treeView.selection[0];

        // Mark all elements as expanded and refresh the tree in one go.
        this._componentViewerTreeDataProvider.expandAllElements();

        // Reveal the previously selected element to keep it in focus,
        // or scroll back to the root when nothing was selected.
        const roots = this._componentViewerTreeDataProvider.getChildren();
        const revealTarget = selectedElement ?? roots[0];
        if (revealTarget) {
            try {
                await this._treeView.reveal(revealTarget, { select: !!selectedElement, focus: false, expand: false });
            } catch {
                // Element may not be accessible in the tree view
            }
        }
    }

    protected handleOnDidToggleExpand(expansionEvent: vscode.TreeViewExpansionEvent<ScvdGuiInterface>, expand: boolean): void {
        const expandStateString = expand ? 'expanded' : 'collapsed';
        const elementName = expansionEvent.element.getGuiName() ?? 'unknown';
        componentViewerLogger.debug(`${this._viewName}: Tree item ${expandStateString} - ${elementName}`);
        this._componentViewerTreeDataProvider.setElementExpanded(expansionEvent.element, expand);
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
        componentViewerLogger.info(`${this._viewName}: Instance lock state changed to ${instance.lockState}`);
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
        this._componentViewerTreeDataProvider.refresh();
    }

    protected handleFilterTree(): void {
        const inputBox = vscode.window.createInputBox();
        inputBox.placeholder = 'Type a text pattern to filter nodes...';
        inputBox.prompt = `Filter ${this._viewName} tree`;
        inputBox.value = '';
        inputBox.ignoreFocusOut = false;

        const applyFilter = (value: string): void => {
            if (value === '') {
                this.handleClearFilter();
            } else {
                componentViewerLogger.info(`${this._viewName}: Filter set to '${value}'`);
                this._componentViewerTreeDataProvider.setFilter(value);
                void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, true);
            }
        };

        inputBox.onDidChangeValue(value => {
            if (value.length === 0) {
                this.handleClearFilter();
            } else {
                applyFilter(value);
            }
        });

        inputBox.onDidAccept(() => {
            applyFilter(inputBox.value);
            inputBox.hide();
        });

        inputBox.onDidHide(() => {
            inputBox.dispose();
        });

        inputBox.show();
    }

    protected handleClearFilter(): void {
        componentViewerLogger.info(`${this._viewName}: Filter cleared`);
        this._componentViewerTreeDataProvider.setFilter(undefined);
        void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, false);
    }

    protected async readScvdFiles(tracker: GDBTargetDebugTracker, session?: GDBTargetDebugSession): Promise<void> {
        if (!session) {
            return;
        }
        const scvdFilesPaths = await this._scvdCollector.getScvdFilePaths(session);
        if (scvdFilesPaths.length === 0) {
            return;
        }
        parsePerf?.reset();
        const cbuildRunInstances: ComponentViewerInstance[] = [];
        for (const scvdFilePath of scvdFilesPaths) {
            const instance = new ComponentViewerInstance();
            if (this._activeSession !== undefined) {
                try {
                    await instance.readModel(URI.file(scvdFilePath), this._activeSession, tracker);
                } catch (error) {
                    componentViewerLogger.error(`${this._viewName}: Failed to read SCVD file at ${scvdFilePath} - ${(error as Error).message}`);
                    // Show error message in a pop up to the user, but continue loading other instances if there are multiple SCVD files
                    vscode.window.showErrorMessage(`${this._viewName}: cannot read SCVD file at ${scvdFilePath}`);
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

    private async loadScvdFiles(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker) : Promise<void | undefined> {
        this._loadingCounter++;
        componentViewerLogger.debug(`${this._viewName}: Loading SCVD files, attempt #${this._loadingCounter}`);
        // Try to read SCVD files
        await this.readScvdFiles(tracker, session);
        // Are there any SCVD files found and loaded?
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
            throw new Error(`${this._viewName}: Received stack trace event for session ${session.session.id} while active session is ${this._activeSession?.session.id}`);
        }
        // Update component viewer instance(s) if active session is stopped
        this.schedulePendingUpdate('stackTrace');
    }

    protected async handleOnStackItemChanged(session: GDBTargetDebugSession): Promise<void> {
        // If the active session is not the one being updated, update it.
        // This can happen when a session is started and stack trace/item events are emitted before the session is set as active in the component viewer.
        if (this._activeSession?.session.id !== session.session.id) {
            throw new Error(`${this._viewName}: Received stack item changed event for session ${session.session.id} while active session is ${this._activeSession?.session.id}`);
        }
        this.schedulePendingUpdate('stackItemChanged');
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Cancel any in-progress executeAll for the session being stopped.
        // JS is single-threaded, so this flag will be picked up at the next
        // await point (i.e. the next GDB read) inside any running loop.
        for (const instance of this._instances) {
            if (instance.sessionId === session.session.id) {
                instance.componentViewerInstance.cancelExecution('debug session ended');
            }
        }

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
        this._componentViewerTreeDataProvider.onWillStopSession(session.session.id);
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        // Subscribe to refresh events of the started session
        session.refreshTimer.onRefresh(async (refreshSession) => await this.handleRefreshTimerEvent(refreshSession));
    }

    private async handleOnConnected(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): Promise<void> {
        // Update debug session
        this._activeSession = session;
        // Load SCVD files from cbuild-run
        await this.loadScvdFiles(session, tracker);
    }

    private async handleRefreshTimerEvent(session: GDBTargetDebugSession): Promise<void> {
        if(this._activeSession?.session.id !== session.session.id) {
            // Don't throw an error here, just return. Refresh timer events don't know about currently active session.
            return;
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
        }, ComponentViewerBase.pendingUpdateDelayMs);
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
                componentViewerLogger.error(`${this._viewName}: Error during update - ${(error as Error).message}`);
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
            this._componentViewerTreeDataProvider.clear();
            return;
        }
        componentViewerLogger.debug(`${this._viewName}: Queuing update due to '${updateReason}'`);
        this._instanceUpdateCounter = 0;

        if (!this.shouldUpdateInstances(this._activeSession)) {
            componentViewerLogger.debug(`${this._viewName}: Skipping update due to '${updateReason}' - conditions not met`);
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
            componentViewerLogger.debug(`${this._viewName}: Updating ${this._viewName} Instance #${this._instanceUpdateCounter} due to '${updateReason}'`);

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
        this._componentViewerTreeDataProvider.setRoots(roots);
    }
}
