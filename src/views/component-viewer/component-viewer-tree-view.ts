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


export class ComponentViewerTreeDataProvider implements vscode.TreeDataProvider<ScvdGuiInterface> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ScvdGuiInterface | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _roots: ScvdGuiInterface[] = [];

    constructor () {
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
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
        return treeItem;
    }

    /**
     * Called by VS Code to lazily populate tooltip details for tree items.
     */
    public resolveTreeItem(treeItem: vscode.TreeItem, element: ScvdGuiInterface): vscode.TreeItem {
        treeItem.tooltip = element.getGuiLineInfo() ?? '';
        return treeItem;
    }

    public getChildren(element?: ScvdGuiInterface): ScvdGuiInterface[] {
        if (!element) {
            return this._roots;
        }

        return element.getGuiChildren() || [];
    }

    public setRoots(roots: ScvdGuiInterface[] = []): void {
        this._roots = roots;
        this.refresh();
    }

    public clear(): void {
        this._roots = [];
        this.refresh();
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
