import * as vscode from 'vscode';

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
    
    activate() {
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
        // get the active debug session
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            return '';
        }
        try {
            // using the 'evaluate' request to get the value of the expression
            const result = await session.customRequest('evaluate', { expression, context: 'watch' });
            return result.result;
        } catch (error) {
            // Handle errors gracefully by viewing the error message as the value
            return error instanceof Error ? error.message : String(error);
        }
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

    refresh(node?: LiveWatchNode) { 
        this._onDidChangeTreeData.fire(node); 
    }

    private async save() {
        await this.context.globalState.update(this.STORAGE_KEY, this.roots);
    }
}
