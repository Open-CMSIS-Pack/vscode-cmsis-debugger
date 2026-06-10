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
import { ComponentViewerWebviewProvider } from './component-viewer-webview-provider';
import { componentViewerLogger, logger } from '../../logger';
import type { ScvdGuiInterface } from './model/scvd-gui-interface';
import { perf, parsePerf } from './stats-config';
import { vscodeViewExists } from '../../vscode-utils';
import { EXTENSION_NAME, VIEW_PREFIX } from '../../manifest';
import { ExtendedGDBTargetConfiguration } from '../../debug-configuration/gdbtarget-configuration';
import { readComponentViewerState, writeComponentViewerState } from '../dynamic-view-states';

export interface ScvdCollector {
    getScvdFilePaths(session: GDBTargetDebugSession): Promise<string[]>;
}

export type UpdateReason = 'sessionChanged' | 'refreshTimer' | 'stackTrace' | 'stackItemChanged' | 'unlockingInstance' | 'invalidated' | 'memoryEvent';

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
    private _webviewProvider: ComponentViewerWebviewProvider | undefined;
    private _context: vscode.ExtensionContext;
    private _instanceUpdateCounter: number = 0;
    private _loadingCounter: number = 0;
    private _pendingUpdateTimer: NodeJS.Timeout | undefined;
    private _pendingUpdate: boolean = false;
    private _runningUpdate: boolean = false;
    private _refreshTimerEnabled: boolean = true;
    private _activeInputBox: vscode.InputBox | undefined;
    private _filterDebounceTimer: NodeJS.Timeout | undefined;
    private static readonly filterDebounceMs = 1000;
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

        // Register the webview-based view that renders a two-column table.
        const webviewProvider = new ComponentViewerWebviewProvider(this._componentViewerTreeDataProvider, this._context.extensionUri);
        this._webviewProvider = webviewProvider;
        webviewProvider.onToggle = (id, expanded) => {
            this._componentViewerTreeDataProvider.toggleById(id, expanded);
        };
        webviewProvider.onLock = (id) => {
            this.handleLockInstanceById(id);
        };

        const webviewRegistration = vscode.window.registerWebviewViewProvider(fullViewId, webviewProvider);
        componentViewerLogger.debug(`${this._viewName}: Registered ${this._viewName} webview provider with id: ${fullViewId}`);
        const lockInstanceCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.lockComponent`, async (node) => {
            this.handleLockInstance(node);
        });
        const unlockInstanceCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.unlockComponent`, async (node) => {
            this.handleLockInstance(node);
        });
        const enablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.enablePeriodicUpdate`, async () => {
            this._refreshTimerEnabled = true;
            await this.saveCurrentState();
            await vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, true);
            componentViewerLogger.info(`${this._viewName}: Auto refresh enabled`);
        });
        const disablePeriodicUpdateCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.disablePeriodicUpdate`, async () => {
            this._refreshTimerEnabled = false;
            await this.saveCurrentState();
            await vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, false);
            componentViewerLogger.info(`${this._viewName}: Auto refresh disabled`);
        });
        const expandAllCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.expandAll`, async () => {
            componentViewerLogger.debug(`${this._viewName}: Expand all tree items`);
            await this.handleExpandAll();
        });
        const collapseAllCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.collapseAll`, () => {
            componentViewerLogger.debug(`${this._viewName}: Collapse all tree items`);
            this._componentViewerTreeDataProvider.collapseAllElements();
        });
        const filterTreeCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.filterTree`, () => {
            this.handleFilterTree();
        });
        const clearFilterCommandDisposable = vscode.commands.registerCommand(`${commandPrefix}.clearFilter`, async () => {
            this.handleClearFilter();
        });
        this._context.subscriptions.push(
            webviewRegistration,
            lockInstanceCommandDisposable,
            unlockInstanceCommandDisposable,
            enablePeriodicUpdateCommandDisposable,
            disablePeriodicUpdateCommandDisposable,
            expandAllCommandDisposable,
            collapseAllCommandDisposable,
            filterTreeCommandDisposable,
            clearFilterCommandDisposable
        );
        vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, true);
        this.setSessionContext(undefined);
        return true;
    }

    private setSessionContext(session: GDBTargetDebugSession | undefined): void {
        void vscode.commands.executeCommand('setContext', `${this._viewId}.activeDebugSession`, !!session);
        void vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateAvailable`, session?.canAccessWhileRunning === true);
    }

    protected async handleExpandAll(): Promise<void> {
        this._componentViewerTreeDataProvider.expandAllElements();
    }

    /**
     * Find a root GUI node by its ID (used by the webview lock callback).
     */
    protected handleLockInstanceById(id: string): void {
        // Walk the current roots to find the matching node.
        const roots = this._componentViewerTreeDataProvider.getChildren();
        const node = roots.find(r => r.getGuiId() === id);
        if (node) {
            this.handleLockInstance(node);
        }
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
        const originalFilter = this._componentViewerTreeDataProvider.filterPattern;
        let accepted = false;
        inputBox.placeholder = 'Type a text pattern to filter nodes...';
        inputBox.prompt = `Filter ${this._viewName} tree`;
        inputBox.value = originalFilter ?? '';
        inputBox.ignoreFocusOut = false;
        this._activeInputBox = inputBox;

        const applyFilter = (value: string): void => {
            if (value === '') {
                this._componentViewerTreeDataProvider.setFilter(undefined);
                void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, false);
            } else {
                componentViewerLogger.info(`${this._viewName}: Filter set to '${value}'`);
                this._componentViewerTreeDataProvider.setFilter(value);
                void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, true);
            }
            // Reset the timer so the view state is saved only after the user stops typing for filterDebounceMs.
            if (this._filterDebounceTimer) {
                clearTimeout(this._filterDebounceTimer);
            }
            this._filterDebounceTimer = setTimeout(() => {
                this._filterDebounceTimer = undefined;
                void this.saveCurrentState();
            }, ComponentViewerBase.filterDebounceMs);
        };

        inputBox.onDidChangeValue(value => {
            applyFilter(value);
        });

        inputBox.onDidAccept(() => {
            accepted = true;
            applyFilter(inputBox.value);
            inputBox.hide();
        });

        inputBox.onDidHide(() => {
            if (!accepted && this._activeInputBox === inputBox) {
                if (this._filterDebounceTimer) {
                    clearTimeout(this._filterDebounceTimer);
                    this._filterDebounceTimer = undefined;
                }
                this._componentViewerTreeDataProvider.setFilter(originalFilter);
                void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, originalFilter !== undefined);
                void this.saveCurrentState();
            }
            this._activeInputBox = undefined;
            inputBox.dispose();
        });

        inputBox.show();
    }

    protected handleClearFilter(): void {
        componentViewerLogger.info(`${this._viewName}: Filter cleared`);
        this._componentViewerTreeDataProvider.setFilter(undefined);
        void vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, false);
        if (this._activeInputBox) {
            const activeInputBox = this._activeInputBox;
            this._activeInputBox = undefined;
            activeInputBox.hide();
        }
        // Cancel any pending debounced save and persist the cleared state immediately.
        if (this._filterDebounceTimer) {
            clearTimeout(this._filterDebounceTimer);
            this._filterDebounceTimer = undefined;
        }
        void this.saveCurrentState();
    }

    protected async readScvdFiles(tracker: GDBTargetDebugTracker, session?: GDBTargetDebugSession): Promise<void> {
        if (!session) {
            return;
        }
        const scvdFilesPaths = await this._scvdCollector.getScvdFilePaths(session);
        if (scvdFilesPaths.length === 0) {
            return;
        }

        // Get SVD file path from session configuration
        const svdPath = (session.session.configuration as ExtendedGDBTargetConfiguration | undefined)?.definitionPath;

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

                // Set SVD path on instance for lazy interrupt table loading via printf "%Q" format specifier
                if (svdPath) {
                    instance.setSvdPath(svdPath);
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
        const onMemoryDisposable = tracker.onMemory(async (event) => {
            const session = event.session;
            await this.handleOnMemoryEvent(session);
        });
        const onInvalidatedDisposable = tracker.onInvalidated(async (event) => {
            const session = event.session;
            await this.handleOnInvalidated(session);
        });
        // clear all disposables on extension deactivation
        this._context.subscriptions.push(
            onWillStopSessionDisposable,
            onConnectedDisposable,
            onDidChangeActiveDebugSessionDisposable,
            onStackTraceDisposable,
            onDidChangeActiveStackItemDisposable,
            onWillStartSessionDisposable,
            onMemoryDisposable,
            onInvalidatedDisposable
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

    protected async handleOnMemoryEvent(session: GDBTargetDebugSession): Promise<void> {
        if (this._activeSession?.session.id !== session.session.id) {
            return;
        }
        this.schedulePendingUpdate('memoryEvent');
    }

    protected async handleOnInvalidated(session: GDBTargetDebugSession): Promise<void> {
        if (this._activeSession?.session.id !== session.session.id) {
            return;
        }
        this.schedulePendingUpdate('invalidated');
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
            this.setSessionContext(undefined);
            this._webviewProvider?.setEmptyMessage('');
            this._webviewProvider?.setLoading(false);
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
        if (!this._activeSession) {
            // Update debug session during launch connection but not during attach
            this._activeSession = session;
        }

        if (this._activeSession.session.id === session.session.id) {
            this.setSessionContext(this._activeSession);
            this._webviewProvider?.setLoading(true);
            await this.restorePeriodicUpdateAndFilter(session);
        }
        // Load SCVD files from cbuild-run
        await this.loadScvdFiles(session, tracker);
        // updateInstances completes the loading lifecycle (spinner + empty message).
        this.schedulePendingUpdate('sessionChanged');
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
        this.setSessionContext(session);
        if (session) {
            this._webviewProvider?.setLoading(true);
            await this.restorePeriodicUpdateAndFilter(session);
            // Render whatever we already have cached for this session.
            this.renderCachedRoots(session.session.id);
            // updateInstances completes the loading lifecycle (clears the spinner).
            this.schedulePendingUpdate('sessionChanged');
        }
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
        if (!this._instances.some(i => i.sessionId === session.session.id)) {
            return false;
        }
        if (session.targetState === 'unknown') {
            return false;
        }
        if (session.targetState === 'running') {
            if (this._refreshTimerEnabled === false) {
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
            const emptyMessage = this.emptyMessageForActiveSession();
            this._webviewProvider?.setEmptyMessage(emptyMessage);
            // An empty message means a transient startup state. Keep the spinner until a definitive state arrives.
            if (emptyMessage !== '') {
                this._webviewProvider?.setLoading(false); // update conditions not met
            }
            return;
        }

        perf?.resetBackendStats();
        perf?.resetUiStats();
        const activeSessionID = this._activeSession.session.id;
        // A live read on a running core (Periodic Update on) can stall until the target stops.
        // Don't let the spinner wait on it.
        if (this._activeSession.targetState === 'running') {
            this._webviewProvider?.setLoading(false); // target running
        }
        const roots: ScvdGuiInterface[] = [];
        for (const instance of this._instances) {
            // Skip instances that don't belong to the active session.
            if (instance.sessionId !== activeSessionID) {
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
            if (guiTree && guiTree.length > 0) {
                roots.push(...guiTree);
                // If instance is locked, set isLocked flag to true for root nodes
                roots[roots.length - 1].isLocked = !!instance.lockState;
                roots[roots.length - 1].isRootInstance = true;
            }
        }
        perf?.logSummaries();
        // The active session may have changed while awaiting slow GDB reads above.
        // Don't write this session's roots over whatever the new active session shows.
        if (this._activeSession?.session.id !== activeSessionID) {
            return;
        }
        this._webviewProvider?.setEmptyMessage(this.emptyMessageForActiveSession());
        this._componentViewerTreeDataProvider.setRoots(roots);
        this._webviewProvider?.setLoading(false); // data ready (target stopped)
    }

    private emptyMessageForActiveSession(): string {
        const session = this._activeSession;
        if (!session) {
            return '';
        }
        if (session.targetState === 'unknown') {
            // Session just connected; target state not known yet.
            return '';
        }
        if (!this._instances.some(i => i.sessionId === session.session.id)) {
            return 'No component data available';
        }
        if (session.targetState === 'running') {
            if (session.canAccessWhileRunning === false) {
                return 'Target is running...\nPause target to load data';
            }
            if (this._refreshTimerEnabled === false) {
                return 'Target is running...\nPause target or enable Periodic Update to load data';
            }
        }
        return '';
    }

    private renderCachedRoots(sessionId: string): void {
        const roots: ScvdGuiInterface[] = [];
        for (const instance of this._instances) {
            if (instance.sessionId !== sessionId) {
                continue;
            }
            const guiTree = instance.componentViewerInstance.getGuiTree();
            if (guiTree && guiTree.length > 0) {
                roots.push(...guiTree);
                roots[roots.length - 1].isLocked = !!instance.lockState;
                roots[roots.length - 1].isRootInstance = true;
            }
        }
        this._componentViewerTreeDataProvider.setRoots(roots);
    }

    private async saveCurrentState(): Promise<void> {
        if (!this._activeSession) {
            return;
        }
        const configStateKey = await this._activeSession.getConfigStateKey();
        const filterPattern = this._componentViewerTreeDataProvider.filterPattern;
        await writeComponentViewerState(this._viewId, configStateKey, this._refreshTimerEnabled, filterPattern);
    }

    private async restorePeriodicUpdateAndFilter(session: GDBTargetDebugSession): Promise<void> {
        // Always reset to defaults before applying saved state to prevent state leaking while switching sessions
        this._refreshTimerEnabled = true;
        vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, true);
        this._componentViewerTreeDataProvider.setFilter(undefined);
        vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, false);

        const state = readComponentViewerState(this._viewId, await session.getConfigStateKey());
        if (!state) {
            return;
        }
        if (state.periodicUpdateEnabled !== undefined) {
            this._refreshTimerEnabled = state.periodicUpdateEnabled;
            vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, state.periodicUpdateEnabled);
            componentViewerLogger.info(`${this._viewName}: Restored periodicUpdateEnabled=${state.periodicUpdateEnabled}`);
        }
        if (state.filterPattern !== undefined) {
            this._componentViewerTreeDataProvider.setFilter(state.filterPattern);
            vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, true);
            componentViewerLogger.info(`${this._viewName}: Restored filterPattern='${state.filterPattern}'`);
        }
    }

    public async resetViewState(): Promise<void> {
        // Reset in-memory state to defaults.
        this._refreshTimerEnabled = true;
        vscode.commands.executeCommand('setContext', `${this._viewId}.periodicUpdateEnabled`, true);
        this._componentViewerTreeDataProvider.setFilter(undefined);
        this._componentViewerTreeDataProvider.collapseAllElements();
        vscode.commands.executeCommand('setContext', `${this._viewId}.filterActive`, false);
        // Unlock all locked instances
        for (const wrapper of this._instances) {
            wrapper.lockState = false;
            const guiTree = wrapper.componentViewerInstance.getGuiTree();
            if (guiTree?.length) {
                const rootNode: ScvdGuiInterface = guiTree[0];
                rootNode.isLocked = false;
            }
        }
        // Reset webview state (e.g. scroll and column positions)
        this._webviewProvider?.resetViewState();

        this.schedulePendingUpdate('sessionChanged');
        componentViewerLogger.info(`${this._viewName}: View state reset`);
    }
}
