import * as vscode from 'vscode';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../debug-session';

interface LiveWatchNode {
  id: number;
  expression: string;
  value: string;
  parent: LiveWatchNode | undefined; // if undefined, it's a root node
  children?: LiveWatchNode[]; // keep for future grouping; flat list for now
}

export class LiveWatchTreeDataProvider implements vscode.TreeDataProvider<LiveWatchNode> {
    private readonly STORAGE_KEY = 'cmsis-debugger-view.tree.items';

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LiveWatchNode | void>();
    readonly onDidChangeTreeData: vscode.Event<LiveWatchNode | void> = this._onDidChangeTreeData.event;
    
    private roots: LiveWatchNode[] = [];
    private _context: vscode.ExtensionContext;
    private continueEvaluate: boolean = true;
    public activeSession: GDBTargetDebugSession | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.roots = this.context.globalState.get<LiveWatchNode[]>(this.STORAGE_KEY) ?? [];
        this._context = context;
    }

    getChildren(element?: LiveWatchNode): Promise<LiveWatchNode[]> {
        if (!element) {
            return Promise.resolve(this.roots);
        }
        return Promise.resolve(element.children ?? []);
    }

    getTreeItem(element: LiveWatchNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.expression, vscode.TreeItemCollapsibleState.None);
        item.description = element.value || '';
        item.contextValue = 'expression';
        return item;
    }

    getNumberOfNodes(): number {
        return this.roots.length;
    }

    activate(tracker: GDBTargetDebugTracker): void {
        this.addVSCodeCommands();
        const onDidChangeActiveDebugSession = tracker.onDidChangeActiveDebugSession((session) => {
            this.activeSession = session;
            this.continueEvaluate = false;
        });
        const onWillStartSession =  tracker.onWillStartSession(session => this.handleOnWillStartSession(session));
        this._context.subscriptions.push(onDidChangeActiveDebugSession);
        this._context.subscriptions.push(onWillStartSession);
    }

    handleOnWillStartSession(session: GDBTargetDebugSession): void {
        session.refreshTimer.onRefresh(async (refreshSession) => {
            this.activeSession = refreshSession;
            this.refresh()
        });
    }
    addVSCodeCommands() {
        this._context.subscriptions.push(
            vscode.window.registerTreeDataProvider('cmsis-debugger-view', this)
        );
        this._context.subscriptions.push(
            vscode.commands.registerCommand('cmsis-debugger-view.add', async () => {
                const expression = await vscode.window.showInputBox({ prompt: 'Expression' });
                if (!expression) return;
                await this.add(expression);
            }),

            vscode.commands.registerCommand('cmsis-debugger-view.clear', async () => {
                const confirm = await vscode.window.showWarningMessage('Clear all expressions?', { modal: true }, 'Yes');
                if (confirm === 'Yes') await this.clear();
            }),

            vscode.commands.registerCommand('cmsis-debugger-view.delete', async (node) => {
                if (!node) return;
                await this.delete(node);
            }),

            vscode.commands.registerCommand('cmsis-debugger-view.refresh', () => this.refresh()),

            vscode.commands.registerCommand('cmsis-debugger-view.rename', async (node) => {
                if (!node) return;
                const expression = await vscode.window.showInputBox({ prompt: 'Expression', value: node.expression });
                if (!expression) return;
                await this.rename(node, expression);
            })
        );
    }
    async evaluate(expression: string): Promise<string> {
        if (!this.activeSession) {
            return 'No active session';
        }
        const result = await this.activeSession.evaluateGlobalExpression(expression);
        return result;
    }

    async add(expression: string, parent?: LiveWatchNode) {
        // Create a new node with a unique ID and evaluate its value
        const newNode: LiveWatchNode = {
            id: this.roots.length + 1,
            expression,
            value : await this.evaluate(expression),
            parent: parent ?? undefined
        };
        if (!parent) {
            this.roots.push(newNode);
        } else {
            parent.children?.push(newNode);
        }
        await this.save();
        this.refresh();
    }

    async clear() {
        // Clear all nodes by resetting the roots array
        this.roots = [];
        await this.save();
        this.refresh();
    }

    async delete(node: LiveWatchNode) {
        // Delete a specific node by filtering it out from the roots array
        this.roots = this.roots.filter(n => n.id !== node.id);
        await this.save();
        this.refresh();
    }

    async rename(node: LiveWatchNode, newExpression: string) {
        // Rename a specific node and re-evaluate its value
        node.expression = newExpression;
        await this.save();
        this.refresh(node);
    }

    async refresh(node?: LiveWatchNode) {
        if (node) {
            node.value = await this.evaluate(node.expression);
            this._onDidChangeTreeData.fire(node);
            return;
        }
        this._onDidChangeTreeData.fire();
        for (const n of this.roots) {
            if (!this.continueEvaluate) {
                break;
            }
            n.value = await this.evaluate(n.expression);
        }
        this.continueEvaluate = true;
    }

    private async save() {
        await this.context.globalState.update(this.STORAGE_KEY, this.roots);
    }
}
