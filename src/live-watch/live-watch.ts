import * as vscode from 'vscode';

interface LiveWatchNode {
  id: number;
  expression: string;
  value: string;
  parent: LiveWatchNode | LiveWatchRoot;
  children?: LiveWatchNode[]; // keep for future grouping; flat list for now
}

interface LiveWatchRoot {
    numberOfNodes: number;
    children: LiveWatchNode[];
}

export class LiveWatchTreeDataProvider implements vscode.TreeDataProvider<LiveWatchNode> {
    private readonly STORAGE_KEY = 'cmsis-debugger-view.tree.items';

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LiveWatchNode | void>();
    readonly onDidChangeTreeData: vscode.Event<LiveWatchNode | void> = this._onDidChangeTreeData.event;

    private root: LiveWatchRoot;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.root = this.context.globalState.get<LiveWatchRoot>(this.STORAGE_KEY) ?? {numberOfNodes: 0, children: []};
    }

    getChildren(element?: LiveWatchNode): Promise<LiveWatchNode[]> {
        if (!element) {
            return Promise.resolve(this.root.children);
        }
        return Promise.resolve(element.children ?? []);
    }

    getTreeItem(element: LiveWatchNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.expression, vscode.TreeItemCollapsibleState.None);
        item.description = element.value || '';
        item.contextValue = 'expression';
        item.iconPath = new vscode.ThemeIcon('symbol-variable');
        return item;
    }

    getNumberOfNodes(): number {
        return this.root.children.length;
    }

    async add(expression: string, value = '', parent?: LiveWatchNode) {
        const newNode: LiveWatchNode = {
            id: this.root.numberOfNodes + 1,
            expression,
            value,
            parent: parent ?? this.root
        }
        await this.save();
        this.refresh();
    }

    async clear() {
        this.root = [];
        await this.save();
        this.refresh();
    }

    async delete(node: LiveWatchNode) {
        this.root = this.root.filter(n => n.id !== node.id);
        await this.save();
        this.refresh();
    }

    async rename(node: LiveWatchNode, newExpression: string) {
        this.root = this.root.map(n => (n.id === node.id ? { ...n, expression: newExpression } : n));
        await this.save();
        this.refresh();
    }

    refresh(node?: LiveWatchNode) { this._onDidChangeTreeData.fire(node); }

    private async save() {
        await this.context.globalState.update(this.STORAGE_KEY, this.root);
    }

    private uuid() {
        return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
}
