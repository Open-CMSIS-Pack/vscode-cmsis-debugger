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
import { DebugProtocol } from '@vscode/debugprotocol';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';

interface LiveWatchNode {
  id: number;
  expression: string;
  parent: LiveWatchNode | undefined; // if undefined, it's a root node
  children: LiveWatchNode[];
  value: LiveWatchValue
}

export interface LiveWatchValue {
    result: string;
    variablesReference: number;
    type?: string;
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

    public async getChildren(element?: LiveWatchNode): Promise<LiveWatchNode[]> {
        if (!element) {
            return Promise.resolve(this.roots);
        }
        try {
            const children = await this._activeSession?.session.customRequest('variables', { variablesReference: element.value.variablesReference });
            const childNodes = children?.variables.map((child: DebugProtocol.Variable) => ({
                id: this.nodeID++,
                expression: child.name,
                children: [],
                parent: element,
                value: {
                    result: child.value,
                    variablesReference: child.variablesReference
                }
            })) ?? [];

            // We do not store children of nodes in the tree, as they are dynamic
            return childNodes;
        } catch (error) {
            console.error('Error fetching children:', error);
            return [];
        }
    }

    public getTreeItem(element: LiveWatchNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.expression + ' = ');
        item.description = element.value.result;
        item.contextValue = 'expression';
        item.tooltip = element.value.type;
        item.collapsibleState = element.value.variablesReference !== 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        return item;
    }

    public get activeSession(): GDBTargetDebugSession | undefined {
        return this._activeSession;
    }

    public async activate(tracker: GDBTargetDebugTracker): Promise<void> {
        this.addVSCodeCommands();
        const onDidChangeActiveDebugSession = tracker.onDidChangeActiveDebugSession(async (session) => await this.handleOnDidChangeActiveDebugSession(session));
        const onWillStartSession =  tracker.onWillStartSession(async (session) => await this.handleOnWillStartSession(session));
        // Using this event because this is when the threadId is available for evaluations
        const onStackTrace = tracker.onDidChangeActiveStackItem(async (item) => {
            if ((item.item as vscode.DebugStackFrame).frameId !== undefined) {
                await this.refresh();
            }
        });
        // Clearing active session on closing the session
        const onWillStopSession = tracker.onWillStopSession(async (session) => {
            if (this.activeSession?.session.id && this.activeSession?.session.id === session.session.id) {
                this._activeSession = undefined;
            }
            await this.refresh();
            await this.save();
        });
        this._context.subscriptions.push(
            onDidChangeActiveDebugSession,
            onWillStartSession,
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
            if (this._activeSession?.session.id === refreshSession.session.id) {
                await this.refresh();
            }
        });
    }

    private addVSCodeCommands() {
        const registerLiveWatchView = vscode.window.registerTreeDataProvider('cmsis-debugger.liveWatch', this);
        const addCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.add', async () => await this.registerAddCommand());
        const deleteAllCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.deleteAll', async () => await this.registerDeleteAllCommand());
        const deleteCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.delete', async (node) => await this.registerDeleteCommand(node));
        const refreshCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.refresh', async () => await this.refresh());
        const modifyCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.modify', async (node) => await this.registerRenameCommand(node));
        const copyCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.copy', async (node) => { await this.registerCopyCommand(node); });
        const addToLiveWatchCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromTextEditor', async () => { await this.registerAddFromSelectionCommand(); });
        /* I am using the same callback function for both watch window and variables view, as they have the same payload structure for now. 
           However, I believe the payload structure will change for the watch window in the future as the developer who created the PR for contributing to watch window context menu
           mentioned he used variables' window payload structure for simplicity.
           Find the PR here:
           https://github.com/microsoft/vscode/pull/237751
        */
        const addToLiveWatchFromWatchWindowCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow', async (payload: { container: DebugProtocol.Scope; variable: DebugProtocol.Variable; }) => { await this.registerAddToLiveWatchFromVariablesView(payload); });
        const addToLiveWatchFromVariablesViewCommand = vscode.commands.registerCommand('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView', async (payload: { container: DebugProtocol.Scope; variable: DebugProtocol.Variable; }) => { await this.registerAddToLiveWatchFromVariablesView(payload); });
        this._context.subscriptions.push(registerLiveWatchView,
            addCommand,
            deleteAllCommand, deleteCommand, refreshCommand, modifyCommand, copyCommand, addToLiveWatchCommand, addToLiveWatchFromWatchWindowCommand, addToLiveWatchFromVariablesViewCommand);
    }

    private async registerAddCommand() {
        const expression = await vscode.window.showInputBox({ prompt: 'Expression' });
        if (!expression) {
            return;
        }
        await this.addToRoots(expression);
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

    private async registerCopyCommand(node: LiveWatchNode) {
        if(!node) {
            return;
        }
        await vscode.env.clipboard.writeText(node.expression);
    }

    private async registerAddFromSelectionCommand() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.selection;
        const document = editor.document;
        const range = document.getWordRangeAtPosition(selection.active);
        const selectedText = range ? document.getText(range).trim() : '';
        //const selectedText = editor.document.getText(selection[0]).trim();
        if (!selectedText) {
            return;
        }
        await this.addToRoots(selectedText);
    }

    private async registerAddToLiveWatchFromVariablesView(payload: { container: DebugProtocol.Scope; variable: DebugProtocol.Variable;}) {
        if (!payload || !payload.variable) {
            return;
        }
        await this.addToRoots(payload.variable.name);
    }

    private async evaluate(expression: string): Promise<LiveWatchValue> {
        const response: LiveWatchValue = { result: '', variablesReference: 0 };
        if (!this._activeSession) {
            response.result = 'No active session';
            return response;
        }
        const result = await this._activeSession.evaluateGlobalExpression(expression, 'watch');
        if (typeof result == 'string') {
            response.result = result;
            return response;
        }
        response.result = result.result;
        response.variablesReference = result.variablesReference;
        response.type = result.type ?? '';
        return response;
    }

    private async addToRoots(expression: string, parent?: LiveWatchNode) {
        // Create a new node with a unique ID and evaluate its value
        const newNode: LiveWatchNode = {
            id: this.nodeID++,
            children: [],
            expression,
            parent: parent ?? undefined,
            value: await this.evaluate(expression)
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
        await this.context.workspaceState.update(this.STORAGE_KEY, undefined);
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
        for (const node of this.roots) {
            node.value = await this.evaluate(node.expression);
        }
        this._onDidChangeTreeData.fire();
    }

    private async save() {
        await this.context.workspaceState.update(this.STORAGE_KEY, this.roots);
    }
}

