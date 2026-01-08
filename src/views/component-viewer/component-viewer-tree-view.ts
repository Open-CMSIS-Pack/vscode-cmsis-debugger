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
    //public async activate(tracker: GDBTargetDebugTracker): Promise<void> {
        /*
        // Subscribe to the debug tracker relevant events
        const onDidChangeActiveDebugSessionDisposable = tracker.onDidChangeActiveDebugSession(
            async (session) => await this.handleOnDidChangeActiveDebugSession(session)
        );
        const onWillStartSessionDisposable = tracker.onWillStartSession(
            async (session) => await this.handleOnWillStartSession(session)
        );
        const onWillStopSessionDisposable = tracker.onWillStopSession(
            async (session) => await this.handleOnWillStopSession(session)
        );
        const onDidChangeActiveStackItemDisposable = tracker.onDidChangeActiveStackItem(
            async (stackFrame) => await this.handleOnDidChangeActiveStackItem(stackFrame)
        );
        // Extracts out data from objects inside of the scvd model
        if (!this._scvdModel) {
            console.warn('No SCVD model set in ComponentViewerTreeDataProvider');
            return;
        }
            */
        this.addRootObject();
        this.refresh();
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
        const treeItemLabel = element.getGuiName() ?? 'UNKNOWN';
        const treeItem = new vscode.TreeItem(treeItemLabel);
        treeItem.collapsibleState = element.hasGuiChildren()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        // Needs fixing, getGuiValue() for ScvdBase returns 0 when undefined
        treeItem.description = element.getGuiValue() ?? '';
        treeItem.tooltip = element.getGuiLineInfo() ?? '';
        return treeItem;
    }

    public getChildren(element?: ScvdGuiInterface): Promise<ScvdGuiInterface[]> {
        if (!element) {
            return Promise.resolve(this._objectOutRoots);
        }

        return Promise.resolve(element.getGuiChildren() || []);
    }
    /*
    private async handleOnDidChangeActiveDebugSession(session: GDBTargetDebugSession | undefined): Promise<void> {
        // Handle changes to the active debug session if needed
        this.refresh();
    }

    private async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        // Handle actions before a debug session starts if needed
        this.refresh();
    }

    private async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        // Handle actions before a debug session stops if needed
        this.refresh();
    }

    private async handleOnDidChangeActiveStackItem(stackFrame: SessionStackItem): Promise<void> {
        // Handle changes to the active stack frame if needed
        this.refresh();
    }
    */
    private refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async addGuiOut(guiOut: ScvdGuiInterface[] | undefined) {
        if(guiOut !== undefined) {
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
        if(this._scvdModel?.scvdGuiOut.length === 0) {
            return;
        }
        this._scvdModel.scvdGuiOut.forEach(guiOut => {
            this._objectOutRoots.push(guiOut);
        });
    }
}
