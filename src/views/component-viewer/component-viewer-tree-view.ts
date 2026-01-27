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

type GuiId = string;

class GuiNode implements ScvdGuiInterface {
    public readonly nodeId: GuiId;
    private _data: ScvdGuiInterface;
    private _children: GuiNode[] = [];

    public constructor(nodeId: GuiId, data: ScvdGuiInterface) {
        this.nodeId = nodeId;
        this._data = data;
    }

    public update(data: ScvdGuiInterface, children: GuiNode[]): void {
        this._data = data;
        this._children = children;
    }

    public getGuiEntry(): { name: string | undefined; value: string | undefined } {
        return this._data.getGuiEntry();
    }

    public getGuiChildren(): ScvdGuiInterface[] {
        return this._children;
    }

    public getGuiName(): string | undefined {
        return this._data.getGuiName();
    }

    public getGuiValue(): string | undefined {
        return this._data.getGuiValue();
    }

    public getGuiConditionResult(): boolean {
        return this._data.getGuiConditionResult();
    }

    public getGuiLineInfo(): string | undefined {
        return this._data.getGuiLineInfo();
    }

    public hasGuiChildren(): boolean {
        return this._children.length > 0;
    }
}


export class ComponentViewerTreeDataProvider implements vscode.TreeDataProvider<ScvdGuiInterface> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ScvdGuiInterface | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _guiRoots: ScvdGuiInterface[] = [];
    private _stagedGuiRoots: ScvdGuiInterface[] = [];
    private _nodeById: Map<GuiId, GuiNode> = new Map();
    private _nextNodeById: Map<GuiId, GuiNode> | undefined;
    private _fallbackIdCounter = 0;

    constructor () {
    }

    public activate(): void {
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
        const nodeId = (element as unknown as { nodeId?: string }).nodeId;
        if (nodeId) {
            treeItem.id = nodeId;
        }
        return treeItem;
    }

    public getChildren(element?: ScvdGuiInterface): Promise<ScvdGuiInterface[]> {
        if (!element) {
            return Promise.resolve(this._guiRoots);
        }

        const children = element.getGuiChildren() || [];
        return Promise.resolve(children);
    }

    private refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public resetModelCache(): void {
        this._stagedGuiRoots = [];
        this._guiRoots = [];
        this._nextNodeById = new Map();
    }

    public beginUpdate(): void {
        this._stagedGuiRoots = [];
        this._nextNodeById = new Map();
    }

    public addGuiOut(guiOut: ScvdGuiInterface[] | undefined) {
        if (guiOut !== undefined) {
            guiOut.forEach(item => this._stagedGuiRoots.push(this.reconcileNode(item)));
        }
    }

    public showModelData() {
        if (this._stagedGuiRoots.length === 0) {
            return;
        }
        this.applyStagedRoots();
        if (this._nextNodeById) {
            this._nodeById = this._nextNodeById;
            this._nextNodeById = undefined;
        }
        this.refresh();
    }

    public deleteModels() {
        this._stagedGuiRoots = [];
        this._guiRoots = [];
        this._nodeById.clear();
        this._nextNodeById = undefined;
        this.refresh();
    }

    private applyStagedRoots(): void {
        if (this._stagedGuiRoots.length === 0) {
            return;
        }
        this._guiRoots.length = 0;
        this._guiRoots.push(...this._stagedGuiRoots);
    }

    private reconcileNode(node: ScvdGuiInterface): GuiNode {
        const nodeId = (node as unknown as { nodeId?: string }).nodeId;
        if (!nodeId) {
            const fallback = new GuiNode(`fallback-${this._fallbackIdCounter++}`, node);
            return fallback;
        }
        const nextMap = this._nextNodeById ?? (this._nextNodeById = new Map());
        let cached = this._nodeById.get(nodeId);
        if (!cached) {
            cached = new GuiNode(nodeId, node);
        }
        const children = node.getGuiChildren()?.map(child => this.reconcileNode(child)) ?? [];
        cached.update(node, children);
        nextMap.set(nodeId, cached);
        return cached;
    }
}
