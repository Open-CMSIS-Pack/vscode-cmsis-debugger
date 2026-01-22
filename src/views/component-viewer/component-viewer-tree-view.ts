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
    private _objectOutRoots: ScvdGuiInterface[] = [];
    private _scvdModel: ScvdGuiInterface[] = [];
    private _filterText = '';
    private _filteredRoots: ScvdGuiInterface[] = [];
    private _filteredChildren = new Map<ScvdGuiInterface, ScvdGuiInterface[]>();

    constructor () {
    }

    public activate(): void {
        this.addRootObject();
        this.refresh();
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
        const treeItemLabel = element.getGuiName() ?? 'UNKNOWN';
        const treeItem = new vscode.TreeItem(treeItemLabel);
        treeItem.collapsibleState = element.hasGuiChildren()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        // Needs fixing, getGuiValue() for ScvdNode returns 0 when undefined
        treeItem.description = element.getGuiValue() ?? '';
        treeItem.tooltip = element.getGuiLineInfo() ?? '';
        treeItem.id = (element as unknown as { nodeId: string }).nodeId;
        return treeItem;
    }

    public getChildren(element?: ScvdGuiInterface): Promise<ScvdGuiInterface[]> {
        if (this._filterText.trim() !== '') {
            if (!element) {
                return Promise.resolve(this._filteredRoots);
            }

            return Promise.resolve(this._filteredChildren.get(element) ?? []);
        }

        if (!element) {
            return Promise.resolve(this._objectOutRoots);
        }

        const children = element.getGuiChildren() || [];
        return Promise.resolve(children);
    }

    private refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public resetModelCache(): void {
        this._scvdModel = [];
        this._objectOutRoots = [];
        this._filteredRoots = [];
        this._filteredChildren.clear();
    }

    public addGuiOut(guiOut: ScvdGuiInterface[] | undefined) {
        if (guiOut !== undefined) {
            guiOut.forEach(item => this._scvdModel.push(item));
        }
    }

    public showModelData() {
        this.addRootObject();
        this.rebuildFilterCache();
        this.refresh();
    }

    public deleteModels() {
        this._scvdModel = [];
        this._objectOutRoots = [];
        this._filteredRoots = [];
        this._filteredChildren.clear();
        this.refresh();
    }

    private addRootObject(): void {
        if (this._scvdModel.length === 0) {
            return;
        }
        this._objectOutRoots = [...this._scvdModel];
    }

    public getFilterText(): string {
        return this._filterText;
    }

    public setFilterText(filterText: string): void {
        this._filterText = filterText;
        this.rebuildFilterCache();
        this.refresh();
    }

    private rebuildFilterCache(): void {
        const normalizedFilter = this._filterText.trim().toLowerCase();
        this._filteredRoots = [];
        this._filteredChildren.clear();

        if (normalizedFilter === '') {
            return;
        }

        for (const root of this._objectOutRoots) {
            if (this.filterNode(root, normalizedFilter)) {
                this._filteredRoots.push(root);
            }
        }
    }

    private filterNode(node: ScvdGuiInterface, normalizedFilter: string): boolean {
        const children = node.getGuiChildren() || [];
        const matchingChildren: ScvdGuiInterface[] = [];
        for (const child of children) {
            if (this.filterNode(child, normalizedFilter)) {
                matchingChildren.push(child);
            }
        }

        const nodeMatches = this.nodeMatchesFilter(node, normalizedFilter);
        if (nodeMatches || matchingChildren.length > 0) {
            this._filteredChildren.set(node, matchingChildren);
            return true;
        }

        return false;
    }

    private nodeMatchesFilter(node: ScvdGuiInterface, normalizedFilter: string): boolean {
        const entry = node.getGuiEntry();
        const candidateName = entry.name ?? node.getGuiName() ?? '';
        const candidateValue = entry.value ?? node.getGuiValue() ?? '';
        return `${candidateName} ${candidateValue}`.toLowerCase().includes(normalizedFilter);
    }
}
