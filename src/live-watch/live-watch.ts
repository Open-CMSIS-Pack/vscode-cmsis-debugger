import * as vscode from 'vscode';

export interface LiveWatchNode {
  id: string;
  expression: string;
  value: string;
  parent?: LiveWatchNode;
  children?: LiveWatchNode[]; // keep for future grouping; flat list for now
}

export class LiveWatchTreeDataProvider implements vscode.TreeDataProvider<LiveWatchNode> {
    private readonly STORAGE_KEY = 'expressions.tree.items';

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LiveWatchNode | void>();
    readonly onDidChangeTreeData: vscode.Event<LiveWatchNode | void> = this._onDidChangeTreeData.event;

    private roots: LiveWatchNode[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.roots = this.context.globalState.get<LiveWatchNode[]>(this.STORAGE_KEY) ?? [];
    }

    getChildren(element?: LiveWatchNode): Thenable<LiveWatchNode[]> {
        if (!element) return Promise.resolve(this.roots);
        return Promise.resolve(element.children ?? []);
    }

    getTreeItem(element: LiveWatchNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.expression, vscode.TreeItemCollapsibleState.None);
        item.description = element.value || '';
        item.contextValue = 'expression';
        item.iconPath = new vscode.ThemeIcon('symbol-variable');
        return item;
    }

    async add(expression: string, value = '') {
        this.roots = [...this.roots, { id: this.uuid(), expression, value }];
        await this.save();
        this.refresh();
    }

    async clear() {
        this.roots = [];
        await this.save();
        this.refresh();
    }

    async delete(node: LiveWatchNode) {
        this.roots = this.roots.filter(n => n.id !== node.id);
        await this.save();
        this.refresh();
    }

    async rename(node: LiveWatchNode, newExpression: string) {
        this.roots = this.roots.map(n => (n.id === node.id ? { ...n, expression: newExpression } : n));
        await this.save();
        this.refresh();
    }

    refresh(node?: LiveWatchNode) { this._onDidChangeTreeData.fire(node); }

    private async save() {
        await this.context.globalState.update(this.STORAGE_KEY, this.roots);
    }

    private uuid() {
        return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
}
