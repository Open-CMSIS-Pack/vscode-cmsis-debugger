/**
 * Copyright 2026 Arm Limited
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

/*
 * Component Viewer Tree (ordered exactly as provided by getGuiChildren())
 * - Root = model.objects?.objects?.[0]?.out?.[0]
 * - Label/description from node.getGuiEntry() -> { name, value }
 * - Children from node.getGuiChildren() (returned AS-IS, in order)
 * - Each item id = node.nodeId (no fallbacks)
 * - Activation via `await provider.activate()`; no constructor args
 * - View ID defaults to 'cmsis-debugger.componentViewer'
 */

import * as vscode from 'vscode';
import { ScvdGuiInterface } from './model/scvd-gui-interface';
//import { GDBTargetDebugSession, GDBTargetDebugTracker, SessionStackItem } from '../../debug-session';

interface ISCVDFiles {
    scvdGuiOut: ScvdGuiInterface[];
}

export class ComponentViewerTreeDataProvider implements vscode.TreeDataProvider<ScvdGuiInterface> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ScvdGuiInterface | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    //private _activeSession: GDBTargetDebugSession | undefined;
    private _objectOutRoots: ScvdGuiInterface[] = [];
    private _scvdModel: ISCVDFiles;

    constructor () {
        this._objectOutRoots = [];
        this._scvdModel = { scvdGuiOut: [] };
    }
    public async activate(): Promise<void> {
        await this.addRootObject();
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
        this._scvdModel.scvdGuiOut = [];
        this._objectOutRoots = [];
    }

    public async addGuiOut(guiOut: ScvdGuiInterface[] | undefined) {
        if (guiOut !== undefined) {
            guiOut.forEach(item => this._scvdModel.scvdGuiOut.push(item));
        }
    }

    public async showModelData() {
        await this.addRootObject();
        this.refresh();
    }

    public async deleteModels() {
        this._scvdModel.scvdGuiOut = [];
        this._objectOutRoots = [];
        this.refresh();
    }

    private async addRootObject(): Promise<void> {
        if (this._scvdModel?.scvdGuiOut.length === 0) {
            return;
        }
        this._objectOutRoots = [...this._scvdModel.scvdGuiOut];
    }
}
