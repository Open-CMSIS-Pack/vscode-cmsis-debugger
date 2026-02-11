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
import { ScvdGuiInterface } from './model/scvd-gui-interface';
import { perf } from './stats-config';


export class ComponentViewerTreeDataProvider implements vscode.TreeDataProvider<ScvdGuiInterface> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ScvdGuiInterface | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _roots: ScvdGuiInterface[] = [];

    constructor () {
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
        const perfStartTime = perf?.startUi() ?? 0;
        const treeItemLabel = element.getGuiName() ?? 'UNKNOWN';
        const treeItem = new vscode.TreeItem(treeItemLabel);
        treeItem.collapsibleState = element.hasGuiChildren()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        // Needs fixing, getGuiValue() for ScvdNode returns 0 when undefined
        treeItem.description = element.getGuiValue() ?? '';
        const intermediateContextValue = element.isRootInstance ? 'parentInstance' : 'child';
        treeItem.contextValue = element.isLocked ? `locked.${intermediateContextValue}` : intermediateContextValue;
        const guiId = element.getGuiId();
        if (guiId !== undefined) {
            treeItem.id = guiId;
        }
        perf?.endUi(perfStartTime, 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');
        return treeItem;
    }

    public resolveTreeItem(item: vscode.TreeItem, element: ScvdGuiInterface): vscode.ProviderResult<vscode.TreeItem> {
        const perfStartTime = perf?.startUi() ?? 0;
        item.tooltip = new vscode.MarkdownString((element.getGuiName() ?? '') + '\n' + (element.getGuiValue() ?? ''));
        perf?.endUi(perfStartTime, 'treeViewResolveItemMs', 'treeViewResolveItemCalls');
        return item;
    }

    public getChildren(element?: ScvdGuiInterface): ScvdGuiInterface[] {
        const perfStartTime = perf?.startUi() ?? 0;
        if (!element) {
            const roots = this._roots;
            perf?.endUi(perfStartTime, 'treeViewGetChildrenMs', 'treeViewGetChildrenCalls');
            return roots;
        }

        const children = element.getGuiChildren() || [];
        perf?.endUi(perfStartTime, 'treeViewGetChildrenMs', 'treeViewGetChildrenCalls');
        return children;
    }

    public setRoots(roots: ScvdGuiInterface[] = []): void {
        this.logUiPerf();
        this._roots = roots;
        this.refresh();
    }

    public clear(): void {
        this.logUiPerf();
        this._roots = [];
        this.refresh();
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private logUiPerf(): void {
        perf?.captureUiSummary();
    }
}
