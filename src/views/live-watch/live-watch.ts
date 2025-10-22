/**
 * Copyright 2025 Arm Limited
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
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';

interface LiveWatchNode {
  id: number;
  expression: string;
  value: string;
  parent: LiveWatchNode | undefined; // if undefined, it's a root node
  children?: LiveWatchNode[]; // keep for future grouping; flat list for now
}

export class LiveWatchTreeDataProvider implements vscode.TreeDataProvider<LiveWatchNode> {
    private readonly STORAGE_KEY = 'cmsis-debugger.liveWatch.tree.items';

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LiveWatchNode | void>();
    readonly onDidChangeTreeData: vscode.Event<LiveWatchNode | void> = this._onDidChangeTreeData.event;

    private roots: LiveWatchNode[] = [];
    private nodeID: number;
    private _context: vscode.ExtensionContext;
    private _activeSession: GDBTargetDebugSession | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.roots = this.context.workspaceState.get<LiveWatchNode[]>(this.STORAGE_KEY) ?? [];
        this._context = context;
        this.nodeID = 0;
        for (const node of this.roots) {
            node.id = this.nodeID++;
        }
    }

    public getChildren(element?: LiveWatchNode): Promise<LiveWatchNode[]> {
        if (!element) {
            return Promise.resolve(this.roots);
        }
        return Promise.resolve(element.children ?? []);
    }

    public getTreeItem(element: LiveWatchNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.expression + ' = ', vscode.TreeItemCollapsibleState.None);
        item.description = element.value || '';
        item.contextValue = 'expression';
        return item;
    }

    public get activeSession(): GDBTargetDebugSession | undefined {
        return this._activeSession;
    }

    public async activate(tracker: GDBTargetDebugTracker): Promise<void> {
        this.addVSCodeCommands();
        const onDidChangeActiveDebugSession = tracker.onDidChangeActiveDebugSession(async (session) => await this.handleOnDidChangeActiveDebugSession(session));
        const onWillStartSession =  tracker.onWillStartSession(async (session) => await this.handleOnWillStartSession(session));
        // Doing a refresh on pausing to ensure we have the latest data
        const onStopped = tracker.onStopped(async () => await this.refresh());
        // Using this event because this is when the threadId is available for evaluations
        const onStackTrace = tracker.onDidChangeActiveStackItem(async () => await this.refresh());
        // Clearing active session on closing the session
        const onWillStopSession = tracker.onWillStopSession(async (session) => {
            this._activeSession = session;
            await this.refresh();
            await this.save();
        });
        //
        const onContinued = tracker.onContinued(async () => {
            await this.refresh();
        });
        this._context.subscriptions.push(onContinued,
            onDidChangeActiveDebugSession,
            onWillStartSession,
            onStopped,
            onStackTrace,
            onWillStopSession);
    }

    public async deactivate(): Promise<void> {
        await this.save();
    }

    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        this._activeSession = session;
        await this.refresh();
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        session.refreshTimer.onRefresh(async (refreshSession) => {
            this._activeSession = refreshSession;
            await this.refresh();
        });
    }

    private addVSCodeCommands() {
        const registerLiveWatchView = vscode.window.registerTreeDataProvider('cmsis-debugger.liveWatch', this);
        const addCommand = vscode.commands.registerCommand('cmsis-debugger.liveWatch.add', async () => await this.registerAddCommand());
        const deleteAllCommand = vscode.commands.registerCommand('cmsis-debugger.liveWatch.deleteAll', async () => await this.registerDeleteAllCommand());
        const deleteCommand = vscode.commands.registerCommand('cmsis-debugger.liveWatch.delete', async (node) => await this.registerDeleteCommand(node));
        const refreshCommand = vscode.commands.registerCommand('cmsis-debugger.liveWatch.refresh', async () => await this.refresh());
        const modifyCommand = vscode.commands.registerCommand('cmsis-debugger.liveWatch.modify', async (node) => await this.registerRenameCommand(node));
        this._context.subscriptions.push(registerLiveWatchView,
            addCommand,
            deleteAllCommand, deleteCommand, refreshCommand, modifyCommand);
    }

    private async registerAddCommand() {
        const expression = await vscode.window.showInputBox({ prompt: 'Expression' });
        if (!expression) {
            return;
        }
        await this.add(expression);
    }

    private async registerDeleteAllCommand() {
        await this.clear();
    }

    private async registerDeleteCommand(node: LiveWatchNode) {
        if (!node) {
            return;
        }
        await this.delete(node);
    }

    private async registerRenameCommand(node: LiveWatchNode) {
        if (!node) {
            return;
        }
        const expression = await vscode.window.showInputBox({ prompt: 'Expression', value: node.expression });
        if (!expression) {
            return;
        }
        await this.rename(node, expression);
    }

    private async evaluate(expression: string): Promise<string> {
        if (!this._activeSession) {
            return 'No active session';
        }
        const result = await this._activeSession.evaluateGlobalExpression(expression, 'watch');
        return result;
    }

    private async add(expression: string, parent?: LiveWatchNode) {
        // Create a new node with a unique ID and evaluate its value
        const newNode: LiveWatchNode = {
            id: ++this.nodeID,
            expression,
            value : await this.evaluate(expression),
            parent: parent ?? undefined
        };
        if (!parent) {
            this.roots.push(newNode);
        } else {
            parent.children?.push(newNode);
        }
        await this.refresh();
    }

    private async clear() {
        // Clear all nodes by resetting the roots array
        this.roots = [];
        await this.refresh();
    }

    private async delete(node: LiveWatchNode) {
        // Delete a specific node by filtering it out from the roots array
        this.roots = this.roots.filter(n => n.id !== node.id);
        await this.refresh();
    }

    private async rename(node: LiveWatchNode, newExpression: string) {
        // Rename a specific node and re-evaluate its value
        node.expression = newExpression;
        await this.refresh(node);
    }

    private async refresh(node?: LiveWatchNode) {
        if (node) {
            node.value = await this.evaluate(node.expression);
            this._onDidChangeTreeData.fire(node);
            return;
        }
        for (const n of this.roots) {
            n.value = await this.evaluate(n.expression);
        }
        this._onDidChangeTreeData.fire();
    }

    private async save() {
        await this.context.workspaceState.update(this.STORAGE_KEY, this.roots);
    }
}
