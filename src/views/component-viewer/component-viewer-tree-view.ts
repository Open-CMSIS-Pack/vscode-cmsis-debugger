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
    private _expandedIds = new Set<string>();
    private readonly _parentById: Map<string, ScvdGuiInterface> = new Map();
    private _filterTokens: string[] | undefined;
    private _idGeneration: number = 0;
    private _savedExpandedIds: Set<string> | undefined;

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
            // Bump generation so VS Code sees new IDs and respects the
            // restored collapsibleState instead of its cached filter state.
            this._idGeneration++;
        } else {
            // Save expanded state before first filter application
            if (this._savedExpandedIds === undefined) {
                this._savedExpandedIds = new Set(this._expandedIds);
            }
            // Increment generation so tree item IDs change, forcing VS Code to
            // treat nodes as new and respect our Expanded collapsibleState.
            this._idGeneration++;
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
        const prefix = sessionId + '/';
        for (const id of this._expandedIds) {
            if (id.startsWith(prefix)) {
                this._expandedIds.delete(id);
            }
        }
    }

    public setElementExpanded(element: ScvdGuiInterface, expanded: boolean): void {
        const elementId = element.getGuiId();
        if (elementId === undefined) {
            return;
        }
        if (expanded && element.hasGuiChildren()) {
            this._expandedIds.add(elementId);
        } else {
            this._expandedIds.delete(elementId);
        }
    }

    public getTreeItem(element: ScvdGuiInterface): vscode.TreeItem {
        const perfStartTime = perf?.startUi() ?? 0;
        const treeItemLabel = element.getGuiName() ?? 'UNKNOWN';
        const guiId = element.getGuiId();
        const treeItem = new vscode.TreeItem(treeItemLabel);
        const hasChildren = element.hasGuiChildren();
        if (hasChildren) {
            // When a filter is active, auto-expand nodes that have matching descendants
            const isExpanded = (this._filterTokens && this.nodeOrDescendantMatchesFilter(element))
                || (guiId !== undefined && this._expandedIds.has(guiId));
            treeItem.collapsibleState = isExpanded
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
            if (guiId !== undefined) {
                this._expandedIds.delete(guiId);
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
            // Use a generation-tagged ID so VS Code treats nodes as new and
            // respects our collapsibleState instead of using its cached state.
            treeItem.id = this._idGeneration > 0
                ? `${this._idGeneration}/${guiId}`
                : guiId;
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

    /**
     * Required by {@link vscode.TreeView.reveal} to resolve the tree path to an element.
     * Uses a cached childId → parent index for fast lookup, with a recursive fallback.
     */
    public getParent(element: ScvdGuiInterface): ScvdGuiInterface | undefined {
        const targetId = element.getGuiId();
        if (targetId === undefined) {
            return undefined;
        }
        const cachedParent = this._parentById.get(targetId);
        if (cachedParent !== undefined) {
            return cachedParent;
        }
        return this.findParentInTree(this._roots, targetId);
    }

    /**
     * Recursively collects all elements that have children, for use with
     * {@link vscode.TreeView.reveal} to expand the whole tree.
     */
    public getAllCollapsibleElements(): ScvdGuiInterface[] {
        const result: ScvdGuiInterface[] = [];
        this.collectCollapsibleElements(this._roots, result);
        return result;
    }

    /**
     * Marks every collapsible element as expanded and fires a single
     * {@link refresh} so the tree re-renders once instead of per-node.
     */
    public expandAllElements(): void {
        this.markAllExpanded();
        // Increment generation so tree item IDs change, forcing VS Code to
        // treat nodes as new and respect our Expanded collapsibleState.
        this._idGeneration++;
        this.refresh();
    }

    private markAllExpanded(): void {
        for (const element of this.getAllCollapsibleElements()) {
            const elementId = element.getGuiId();
            if (elementId !== undefined) {
                this._expandedIds.add(elementId);
            }
        }
    }

    public setRoots(roots: ScvdGuiInterface[] = []): void {
        this.logUiPerf();
        this._roots = roots;
        this.rebuildParentIndex();
        this.refresh();
    }

    public clear(): void {
        this.logUiPerf();
        this._roots = [];
        this._parentById.clear();
        this.refresh();
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private collectCollapsibleElements(elements: ScvdGuiInterface[], result: ScvdGuiInterface[]): void {
        for (const element of elements) {
            if (element.hasGuiChildren()) {
                result.push(element);
                const children = element.getGuiChildren() || [];
                this.collectCollapsibleElements(children, result);
            }
        }
    }

    private rebuildParentIndex(): void {
        this._parentById.clear();
        const roots = this._roots;
        for (const root of roots) {
            if (!root.hasGuiChildren()) {
                continue;
            }
            const children = root.getGuiChildren() || [];
            this.indexParentsRecursively(root, children);
        }
    }

    private indexParentsRecursively(parent: ScvdGuiInterface, children: ScvdGuiInterface[]): void {
        for (const child of children) {
            const childId = child.getGuiId();
            if (childId !== undefined) {
                this._parentById.set(childId, parent);
            }
            if (child.hasGuiChildren()) {
                const grandChildren = child.getGuiChildren() || [];
                this.indexParentsRecursively(child, grandChildren);
            }
        }
    }

    private findParentInTree(elements: ScvdGuiInterface[], targetId: string): ScvdGuiInterface | undefined {
        for (const element of elements) {
            if (element.hasGuiChildren()) {
                const children = element.getGuiChildren();
                for (const child of children) {
                    if (child.getGuiId() === targetId) {
                        return element;
                    }
                }
                const found = this.findParentInTree(children, targetId);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    }

    private logUiPerf(): void {
        perf?.captureUiSummary();
    }
}
