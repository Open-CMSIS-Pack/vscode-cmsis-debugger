/**
 * Copyright 2025-2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
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
    private _expandedIds: string[] = [];
    private _filterTokens: string[] | undefined;
    private _filterGeneration: number = 0;
    private _savedExpandedIds: string[] | undefined;

    constructor () {
    }

    /**
     * Set a filter pattern. When set, only nodes (and their ancestors)
     * whose name or value contains the pattern (case-insensitive) are shown.
     * Pass undefined or empty string to clear the filter.
     */
    public setFilter(pattern: string | undefined): void {
        if (pattern === undefined || pattern === '') {
            this._filterTokens = undefined;
            // Restore pre-filter expanded state
            if (this._savedExpandedIds !== undefined) {
                this._expandedIds = this._savedExpandedIds;
                this._savedExpandedIds = undefined;
            }
        } else {
            // Save expanded state before first filter application
            if (this._savedExpandedIds === undefined) {
                this._savedExpandedIds = [...this._expandedIds];
            }
            // Increment generation so tree item IDs change, forcing VS Code to
            // treat nodes as new and respect our Expanded collapsibleState.
            this._filterGeneration++;
            // Split into lowercase tokens for fuzzy word matching:
            // e.g. "ext int" matches "External Interrupt".
            this._filterTokens = pattern.toLowerCase().split(/\s+/).filter(Boolean);
        }
        this.refresh();
    }

    public get isFilterActive(): boolean {
        return this._filterTokens !== undefined;
    }

    /**
     * Returns true if every filter token appears somewhere in the node's
     * combined name and value text (case-insensitive).
     * Returns true when no filter is active (no match restriction).
     */
    private nodeMatchesFilter(node: ScvdGuiInterface): boolean {
        if (!this._filterTokens) {
            return true;
        }
        const text = `${node.getGuiName() ?? ''} ${node.getGuiValue() ?? ''}`.toLowerCase();
        return this._filterTokens.every(token => text.includes(token));
    }

    /**
     * Returns true if the node itself or any of its descendants match the filter.
     */
    private nodeOrDescendantMatchesFilter(node: ScvdGuiInterface): boolean {
        if (this.nodeMatchesFilter(node)) {
            return true;
        }
        const children = node.getGuiChildren() || [];
        return children.some(child => this.nodeOrDescendantMatchesFilter(child));
    }

    public onWillStopSession(sessionId: string): void {
        // Filter expanded elements by session ID encoded into unique GUI ID.
        this._expandedIds = this._expandedIds.filter(expandedId => !expandedId.startsWith(sessionId + '/'));
    }

    public setElementExpanded(element: ScvdGuiInterface, expanded: boolean): void {
        const hasChildren = element.hasGuiChildren();
        const elementId = element.getGuiId();
        if (elementId === undefined) {
            return;
        }
        const wasExpanded = this._expandedIds.find(expandedId => expandedId === elementId);
        if (hasChildren && expanded && wasExpanded === undefined) {
            this._expandedIds.push(elementId);
            return;
        } else if (wasExpanded) {
            this._expandedIds = this._expandedIds.filter(expandedId => expandedId !== elementId);
        }
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
        const perfStartTime = perf?.startUi() ?? 0;
        const treeItemLabel = element.getGuiName() ?? 'UNKNOWN';
        const guiId = element.getGuiId();
        const treeItem = new vscode.TreeItem(treeItemLabel);
        const hasChildren = element.hasGuiChildren();
        const wasExpanded = this._expandedIds.find(expandedId => expandedId === guiId);
        if (hasChildren) {
            // When a filter is active, auto-expand nodes that have matching descendants
            if (this._filterTokens && this.nodeOrDescendantMatchesFilter(element)) {
                treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            } else {
                treeItem.collapsibleState = wasExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
            }
        } else {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
            if (wasExpanded) {
                this._expandedIds = this._expandedIds.filter(expandedId => expandedId !== guiId);
            }
        }
        // Needs fixing, getGuiValue() for ScvdNode returns 0 when undefined
        treeItem.description = element.getGuiValue() ?? '';
        let intermediateContextValue = '';
        if (element.isRootInstance) {
            intermediateContextValue = 'parentInstance';
            if (element.isLocked) {
                treeItem.iconPath = new vscode.ThemeIcon('lock');
            }
        }

        treeItem.contextValue = element.isLocked ? `locked.${intermediateContextValue}` : intermediateContextValue;
        if (guiId !== undefined) {
            // When filter is active, use a generation-tagged ID so VS Code treats
            // nodes as new and respects our Expanded collapsibleState instead of
            // using its cached expansion state for the original ID.
            treeItem.id = this._filterTokens ? `f${this._filterGeneration}/${guiId}` : guiId;
        }
        perf?.endUi(perfStartTime, 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');
        return treeItem;
    }

    /**
     * Called by VS Code to lazily populate tooltip details for tree items.
     */
    public resolveTreeItem(item: vscode.TreeItem, element: ScvdGuiInterface): vscode.ProviderResult<vscode.TreeItem> {
        const perfStartTime = perf?.startUi() ?? 0;
        const guiName = element.getGuiName();
        const guiValue = element.getGuiValue();
        if (guiName && guiValue) {
            const tooltip = new vscode.MarkdownString(`**${guiName}**  \n${guiValue}`);
            tooltip.supportHtml = true;
            item.tooltip = tooltip;
        } else if (guiName) {
            item.tooltip = new vscode.MarkdownString(`**${guiName}**`);
        } else if(guiValue) {
            item.tooltip = guiValue;
        } else {
            item.tooltip = undefined;
        }
        perf?.endUi(perfStartTime, 'treeViewResolveItemMs', 'treeViewResolveItemCalls');
        return item;
    }

    public getChildren(element?: ScvdGuiInterface): ScvdGuiInterface[] {
        const perfStartTime = perf?.startUi() ?? 0;
        if (!element) {
            const roots = this._filterTokens
                ? this._roots.filter(root => this.nodeOrDescendantMatchesFilter(root))
                : this._roots;
            perf?.endUi(perfStartTime, 'treeViewGetChildrenMs', 'treeViewGetChildrenCalls');
            return roots;
        }

        const children = element.getGuiChildren() || [];
        const filtered = this._filterTokens
            ? children.filter(child => this.nodeOrDescendantMatchesFilter(child))
            : children;
        perf?.endUi(perfStartTime, 'treeViewGetChildrenMs', 'treeViewGetChildrenCalls');
        return filtered;
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
