/**
 * Copyright 2026 Arm Limited
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
// generated with AI

/**
 * Unit test for ComponentViewerTreeDataProvider.
 */

import * as vscode from 'vscode';
import type { ScvdGuiInterface } from '../../model/scvd-gui-interface';

const mockFire = jest.fn();

jest.mock('vscode', () => {
    class EventEmitter {
        public fire = mockFire;
        public event = jest.fn();
    }

    class ThemeIcon {
        public id: string;

        constructor(id: string) {
            this.id = id;
        }
    }
    class MarkdownString {
        public value: string;
        public supportHtml = false;

        constructor(value: string) {
            this.value = value;
        }
    }

    class TreeItem {
        public label: string;
        public collapsibleState: number | undefined;
        public description: string | undefined;
        public tooltip: string | MarkdownString | undefined;
        public id: string | undefined;
        public contextValue: string | undefined;
        public iconPath: vscode.ThemeIcon | undefined;

        constructor(label: string) {
            this.label = label;
        }
    }

    return {
        EventEmitter,
        MarkdownString,
        TreeItem,
        ThemeIcon,
        TreeItemCollapsibleState: {
            Collapsed: 1,
            Expanded: 2,
            None: 0,
        },
    };
});

jest.mock('../../../../logger', () => ({
    logger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
    componentViewerLogger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

import { ComponentViewerTreeDataProvider } from '../../component-viewer-tree-view';

type TestGui = ScvdGuiInterface & {
    getGuiName: () => string | undefined;
    getGuiValue: () => string | undefined;
    getGuiId: () => string | undefined;
    getGuiLineInfo: () => string | undefined;
    hasGuiChildren: () => boolean;
    getGuiChildren: () => ScvdGuiInterface[];
    getGuiEntry: () => { name: string | undefined; value: string | undefined };
    getGuiConditionResult: () => boolean;
    isRootInstance?: boolean;
    isLocked?: boolean;
};

type TestGuiOptions = Partial<Omit<TestGui, 'getGuiChildren'>> & {
    getGuiChildren?: () => ScvdGuiInterface[];
};

const makeGui = (options: TestGuiOptions): TestGui => ({
    getGuiName: options.getGuiName ?? (() => 'Node'),
    getGuiValue: options.getGuiValue ?? (() => 'Value'),
    getGuiId: options.getGuiId ?? (() => 'id-1'),
    getGuiLineInfo: options.getGuiLineInfo ?? (() => 'Line 1'),
    hasGuiChildren: options.hasGuiChildren ?? (() => false),
    getGuiChildren: options.getGuiChildren ?? (() => [] as ScvdGuiInterface[]),
    getGuiEntry: options.getGuiEntry ?? (() => ({ name: 'Node', value: 'Value' })),
    getGuiConditionResult: options.getGuiConditionResult ?? (() => true),
    isRootInstance: options.isRootInstance ?? false,
    isLocked: options.isLocked ?? false,
});

describe('ComponentViewerTreeDataProvider', () => {
    let provider: ComponentViewerTreeDataProvider;
    beforeEach(() => {
        mockFire.mockClear();
        provider = new ComponentViewerTreeDataProvider();
    });

    it('builds tree items with fallbacks and collapsible state', () => {
        const withChildren = makeGui({
            hasGuiChildren: () => true,
        });
        const withoutChildren = makeGui({
            getGuiName: () => undefined,
            getGuiValue: () => undefined,
            getGuiLineInfo: () => undefined,
            getGuiId: () => undefined,
        });

        const treeItemWithChildren = provider.getTreeItem(withChildren);
        expect(treeItemWithChildren.label).toBe('Node');
        expect(treeItemWithChildren.collapsibleState).toBe(1);
        expect(treeItemWithChildren.description).toBe('Value');
        expect(treeItemWithChildren.id).toBe('id-1');
        const resolvedWith = provider.resolveTreeItem(treeItemWithChildren, withChildren) as vscode.TreeItem;
        expect(resolvedWith.tooltip).toBeInstanceOf(vscode.MarkdownString);
        const tooltipWith = resolvedWith.tooltip as { value: string; supportHtml: boolean };
        expect(tooltipWith.value).toBe('**Node**  \nValue');
        expect(tooltipWith.supportHtml).toBe(true);

        const treeItemWithout = provider.getTreeItem(withoutChildren);
        expect(treeItemWithout.label).toBe('UNKNOWN');
        expect(treeItemWithout.collapsibleState).toBe(0);
        expect(treeItemWithout.description).toBe('');
        expect(treeItemWithout.id).toBeUndefined();
        const resolvedWithout = provider.resolveTreeItem(treeItemWithout, withoutChildren) as vscode.TreeItem;
        expect(resolvedWithout.tooltip).toBeUndefined();
    });

    it('formats tooltip for name-only, value-only, and empty values', () => {
        const nameOnly = makeGui({ getGuiValue: () => undefined });
        const valueOnly = makeGui({ getGuiName: () => undefined });
        const emptyBoth = makeGui({ getGuiName: () => undefined, getGuiValue: () => undefined });

        const nameItem = provider.resolveTreeItem(new vscode.TreeItem('Label'), nameOnly) as vscode.TreeItem;
        expect(nameItem.tooltip).toBeInstanceOf(vscode.MarkdownString);
        const nameTooltip = nameItem.tooltip as { value: string; supportHtml: boolean };
        expect(nameTooltip.value).toBe('**Node**');
        expect(nameTooltip.supportHtml).toBe(false);

        const valueItem = provider.resolveTreeItem(new vscode.TreeItem('Label'), valueOnly) as vscode.TreeItem;
        expect(valueItem.tooltip).toBe('Value');

        const emptyItem = provider.resolveTreeItem(new vscode.TreeItem('Label'), emptyBoth) as vscode.TreeItem;
        expect(emptyItem.tooltip).toBeUndefined();
    });

    it('assigns locked context values for root and child nodes', () => {
        const rootLocked = makeGui({ isRootInstance: true, isLocked: true });
        const childUnlocked = makeGui({ isRootInstance: false, isLocked: false });

        const rootItem = provider.getTreeItem(rootLocked);
        expect(rootItem.contextValue).toBe('locked.parentInstance');

        const childItem = provider.getTreeItem(childUnlocked);
        expect(childItem.contextValue).toBe('');
    });

    it('assigns lock icon for locked root nodes', () => {
        const rootLocked = makeGui({ isRootInstance: true, isLocked: true });
        const rootUnLocked = makeGui({ isRootInstance: true, isLocked: false });

        const rootItem = provider.getTreeItem(rootLocked);
        expect(rootItem.iconPath).toBeInstanceOf(vscode.ThemeIcon);
        const rootIcon = rootItem.iconPath as { id: string };
        expect(rootIcon.id).toBe('lock');

        const rootUnLockedItem = provider.getTreeItem(rootUnLocked);
        expect(rootUnLockedItem.iconPath).toBeUndefined();
    });

    it('returns root children when no element is provided', async () => {
        const root = makeGui({});
        provider.setRoots([root]);

        expect(provider.getChildren()).toEqual([root]);
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('defaults to empty roots when none are provided', async () => {
        provider.setRoots();

        expect(provider.getChildren()).toEqual([]);
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('returns element children in order', async () => {
        const childA = makeGui({});
        const childB = makeGui({});
        const parent = makeGui({
            getGuiChildren: () => [childA, childB],
        });

        expect(provider.getChildren(parent)).toEqual([childA, childB]);
    });

    it('returns empty children when element has none', async () => {
        const parent = makeGui({
            getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
        });

        expect(provider.getChildren(parent)).toEqual([]);
    });

    it('handles empty caches and no gui output', async () => {
        provider.setRoots([]);
        expect(mockFire).toHaveBeenCalledTimes(1);
        expect(provider.getChildren()).toEqual([]);

        provider.clear();
        expect(provider.getChildren()).toEqual([]);
    });

    it('clears models and refreshes', async () => {
        const root = makeGui({});
        provider.setRoots([root]);
        expect(mockFire).toHaveBeenCalledTimes(1);

        provider.clear();
        expect(mockFire).toHaveBeenCalledTimes(2);
        expect(provider.getChildren()).toEqual([]);
    });

    it('updates expanded state for GUI element with children and gets the correct tree item', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
        });
        provider.setRoots([root]);

        let treeItem: vscode.TreeItem;

        // Initially collapsed
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

        // Expand element
        provider.setElementExpanded(root, true);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

        // Collapse element again
        provider.setElementExpanded(root, false);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('keeps non state for GUI element without children and gets the correct tree item', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => false,
        });
        provider.setRoots([root]);

        let treeItem: vscode.TreeItem;

        // Initially collapsed
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);

        // Send expand element
        provider.setElementExpanded(root, true);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);

        // Collapse element again
        provider.setElementExpanded(root, false);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    });

    it('clears expand state on session end', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
        });
        provider.setRoots([root]);

        let treeItem: vscode.TreeItem;

        // Initially collapsed
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

        // Send expand element
        provider.setElementExpanded(root, true);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

        // End session, item should be removed from expanded state list and hence "show" as collapsed
        provider.onWillStopSession('session1');
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('onWillStopSession keeps expanded state for other sessions', () => {
        const session1Root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
        });
        const session2Root = makeGui({
            getGuiId: () => 'session2/root',
            hasGuiChildren: () => true,
        });
        provider.setRoots([session1Root, session2Root]);

        provider.setElementExpanded(session1Root, true);
        provider.setElementExpanded(session2Root, true);

        // End session1 — session2's expanded state must survive
        provider.onWillStopSession('session1');
        expect(provider.getTreeItem(session1Root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(provider.getTreeItem(session2Root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('removes expand state if element loses children and gets them back (e.g. in a dynamic thread list)', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
        });
        provider.setRoots([root]);

        let treeItem: vscode.TreeItem;

        // Send expand element
        provider.setElementExpanded(root, true);
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

        // Simulate element lost children
        root.hasGuiChildren = () => false;
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);

        // Simulate element gets new children, state is back to collapsed
        root.hasGuiChildren = () => true;
        treeItem = provider.getTreeItem(root);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('getParent returns undefined for root elements', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
        });
        provider.setRoots([root]);

        expect(provider.getParent(root)).toBeUndefined();
    });

    it('getParent returns correct parent for child elements', () => {
        const child = makeGui({
            getGuiId: () => 'session1/child',
            hasGuiChildren: () => false,
        });
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);

        expect(provider.getParent(child)).toBe(root);
    });

    it('getParent returns undefined for element with no id', () => {
        const noId = makeGui({ getGuiId: () => undefined });
        expect(provider.getParent(noId)).toBeUndefined();
    });

    it('getParent returns correct parent for deeply nested grandchild', () => {
        const grandchild = makeGui({
            getGuiId: () => 'session1/grandchild',
            hasGuiChildren: () => false,
        });
        const child = makeGui({
            getGuiId: () => 'session1/child',
            hasGuiChildren: () => true,
            getGuiChildren: () => [grandchild],
        });
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);

        expect(provider.getParent(grandchild)).toBe(child);
    });

    it('getParent returns undefined for element not in the tree', () => {
        const root = makeGui({
            getGuiId: () => 'session1/root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [],
        });
        const orphan = makeGui({ getGuiId: () => 'session1/orphan' });
        provider.setRoots([root]);

        expect(provider.getParent(orphan)).toBeUndefined();
    });

    it('getAllCollapsibleElements returns empty array for empty tree', () => {
        provider.setRoots([]);
        expect(provider.getAllCollapsibleElements()).toEqual([]);
    });

    it('getAllCollapsibleElements returns only elements with children', () => {
        const leaf = makeGui({
            getGuiId: () => 'leaf',
            hasGuiChildren: () => false,
        });
        const parent = makeGui({
            getGuiId: () => 'parent',
            hasGuiChildren: () => true,
            getGuiChildren: () => [leaf],
        });
        provider.setRoots([parent, leaf]);

        const result = provider.getAllCollapsibleElements();
        expect(result).toEqual([parent]);
    });

    it('getAllCollapsibleElements collects nested collapsible elements in top-down order', () => {
        const grandchild = makeGui({
            getGuiId: () => 'grandchild',
            hasGuiChildren: () => false,
        });
        const child = makeGui({
            getGuiId: () => 'child',
            hasGuiChildren: () => true,
            getGuiChildren: () => [grandchild],
        });
        const root = makeGui({
            getGuiId: () => 'root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);

        const result = provider.getAllCollapsibleElements();
        expect(result).toEqual([root, child]);
    });

    it('getAllCollapsibleElements handles multiple roots with mixed children', () => {
        const childA = makeGui({
            getGuiId: () => 'childA',
            hasGuiChildren: () => false,
        });
        const rootA = makeGui({
            getGuiId: () => 'rootA',
            hasGuiChildren: () => true,
            getGuiChildren: () => [childA],
        });
        const rootB = makeGui({
            getGuiId: () => 'rootB',
            hasGuiChildren: () => false,
        });
        provider.setRoots([rootA, rootB]);

        const result = provider.getAllCollapsibleElements();
        expect(result).toEqual([rootA]);
    });

    it('ignores setElementExpanded when element has undefined id', () => {
        const noId = makeGui({
            getGuiId: () => undefined,
            hasGuiChildren: () => true,
        });
        provider.setRoots([noId]);

        // Should not throw and should not affect expanded state
        provider.setElementExpanded(noId, true);
        const treeItem = provider.getTreeItem(noId);
        expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('expandAllElements marks all collapsible elements as expanded in one refresh', () => {
        const grandchild = makeGui({
            getGuiId: () => 'grandchild',
            hasGuiChildren: () => false,
        });
        const child = makeGui({
            getGuiId: () => 'child',
            hasGuiChildren: () => true,
            getGuiChildren: () => [grandchild],
        });
        const root = makeGui({
            getGuiId: () => 'root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);
        mockFire.mockClear();

        provider.expandAllElements();

        // Both collapsible nodes should now be expanded
        const rootItem = provider.getTreeItem(root);
        expect(rootItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        const childItem = provider.getTreeItem(child);
        expect(childItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        // Single refresh fired
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('expandAllElements is idempotent', () => {
        const child = makeGui({
            getGuiId: () => 'child',
            hasGuiChildren: () => false,
        });
        const root = makeGui({
            getGuiId: () => 'root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);
        provider.setElementExpanded(root, true);
        mockFire.mockClear();

        provider.expandAllElements();

        const rootItem = provider.getTreeItem(root);
        expect(rootItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        // Still only one refresh
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('expandAllElements uses generation-tagged IDs so VS Code treats nodes as new', () => {
        const child = makeGui({
            getGuiId: () => 'child',
            hasGuiChildren: () => false,
        });
        const root = makeGui({
            getGuiId: () => 'root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);

        // Before expand-all, IDs are plain
        expect(provider.getTreeItem(root).id).toBe('root');

        // After expand-all, IDs are generation-tagged
        provider.expandAllElements();
        const id1 = provider.getTreeItem(root).id;
        expect(id1).toMatch(/^\d+\/root$/);

        // Calling expand-all again bumps the generation
        provider.expandAllElements();
        const id2 = provider.getTreeItem(root).id;
        expect(id2).toMatch(/^\d+\/root$/);
        expect(id2).not.toBe(id1);
    });

    it('expand-all and filter share a single generation counter', () => {
        const root = makeGui({
            getGuiName: () => 'Root',
            getGuiId: () => 'r1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [],
        });
        provider.setRoots([root]);

        // Expand all bumps generation
        provider.expandAllElements();
        const idAfterExpand = provider.getTreeItem(root).id;
        expect(idAfterExpand).toMatch(/^\d+\/r1$/);

        // Apply filter bumps generation again
        provider.setFilter('Root');
        const idAfterFilter = provider.getTreeItem(root).id;
        expect(idAfterFilter).toMatch(/^\d+\/r1$/);
        expect(idAfterFilter).not.toBe(idAfterExpand);

        // Clear filter bumps generation again
        provider.setFilter(undefined);
        const idAfterClear = provider.getTreeItem(root).id;
        expect(idAfterClear).toMatch(/^\d+\/r1$/);
        expect(idAfterClear).not.toBe(idAfterFilter);
    });

    it('expandAllElements bumps generation when filter is active', () => {
        const child = makeGui({
            getGuiName: () => 'Child',
            getGuiId: () => 'c1',
            hasGuiChildren: () => false,
        });
        const root = makeGui({
            getGuiName: () => 'Root',
            getGuiId: () => 'r1',
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });
        provider.setRoots([root]);

        // Apply filter
        provider.setFilter('Root');
        const idBeforeExpand = provider.getTreeItem(root).id;
        expect(idBeforeExpand).toMatch(/^\d+\/r1$/);

        // Expand all while filter is active — bumps generation
        provider.expandAllElements();
        const idAfterExpand = provider.getTreeItem(root).id;
        expect(idAfterExpand).toMatch(/^\d+\/r1$/);
        expect(idAfterExpand).not.toBe(idBeforeExpand);
    });

    describe('filter', () => {
        it('isFilterActive returns false by default', () => {
            expect(provider.isFilterActive).toBe(false);
        });

        it('isFilterActive returns true after setFilter with a pattern', () => {
            provider.setFilter('test');
            expect(provider.isFilterActive).toBe(true);
        });

        it('isFilterActive returns false after clearing the filter', () => {
            provider.setFilter('test');
            provider.setFilter(undefined);
            expect(provider.isFilterActive).toBe(false);
        });

        it('isFilterActive returns false when setFilter is called with empty string', () => {
            provider.setFilter('test');
            provider.setFilter('');
            expect(provider.isFilterActive).toBe(false);
        });

        it('nodeMatchesFilter returns true for any node when no filter is active', () => {
            const node = makeGui({ getGuiName: () => 'Anything', getGuiId: () => 'n1' });
            // Access private method to exercise the guard branch
            const nodeMatchesFilter = (provider as unknown as { nodeMatchesFilter: (n: ScvdGuiInterface) => boolean }).nodeMatchesFilter.bind(provider);
            expect(nodeMatchesFilter(node)).toBe(true);
        });

        it('filters root nodes by name', () => {
            const matchRoot = makeGui({ getGuiName: () => 'MatchingNode', getGuiId: () => 'r1' });
            const noMatchRoot = makeGui({ getGuiName: () => 'Other', getGuiId: () => 'r2' });
            provider.setRoots([matchRoot, noMatchRoot]);

            provider.setFilter('Matching');
            expect(provider.getChildren()).toEqual([matchRoot]);
        });

        it('filters root nodes by value', () => {
            const matchRoot = makeGui({ getGuiName: () => 'A', getGuiValue: () => 'TargetValue', getGuiId: () => 'r1' });
            const noMatchRoot = makeGui({ getGuiName: () => 'B', getGuiValue: () => 'Nope', getGuiId: () => 'r2' });
            provider.setRoots([matchRoot, noMatchRoot]);

            provider.setFilter('Target');
            expect(provider.getChildren()).toEqual([matchRoot]);
        });

        it('filter is case-insensitive', () => {
            const root = makeGui({ getGuiName: () => 'HelloWorld', getGuiId: () => 'r1' });
            provider.setRoots([root]);

            provider.setFilter('helloworld');
            expect(provider.getChildren()).toEqual([root]);
        });

        it('matches plain substring across multiple roots', () => {
            const root1 = makeGui({ getGuiName: () => 'Thread_1', getGuiId: () => 'r1' });
            const root2 = makeGui({ getGuiName: () => 'Thread_2', getGuiId: () => 'r2' });
            const root3 = makeGui({ getGuiName: () => 'Mutex_1', getGuiId: () => 'r3' });
            provider.setRoots([root1, root2, root3]);

            provider.setFilter('Thread_');
            expect(provider.getChildren()).toEqual([root1, root2]);
        });

        it('matches special characters as literal substrings', () => {
            const root = makeGui({ getGuiName: () => 'some[value', getGuiId: () => 'r1' });
            const other = makeGui({ getGuiName: () => 'other', getGuiId: () => 'r2' });
            provider.setRoots([root, other]);

            provider.setFilter('some[value');
            expect(provider.getChildren()).toEqual([root]);
        });

        it('matches fuzzy with multiple space-separated tokens', () => {
            const root1 = makeGui({ getGuiName: () => 'External Interrupt', getGuiId: () => 'r1' });
            const root2 = makeGui({ getGuiName: () => 'Internal Timer', getGuiId: () => 'r2' });
            const root3 = makeGui({ getGuiName: () => 'External Timer', getGuiId: () => 'r3' });
            provider.setRoots([root1, root2, root3]);

            provider.setFilter('ext int');
            expect(provider.getChildren()).toEqual([root1]);
        });

        it('matches tokens across name and value', () => {
            const root = makeGui({ getGuiName: () => 'Counter', getGuiValue: () => '42 active', getGuiId: () => 'r1' });
            const other = makeGui({ getGuiName: () => 'Counter', getGuiValue: () => '0 idle', getGuiId: () => 'r2' });
            provider.setRoots([root, other]);

            provider.setFilter('counter active');
            expect(provider.getChildren()).toEqual([root]);
        });

        it('ignores extra whitespace in filter pattern', () => {
            const root = makeGui({ getGuiName: () => 'External Interrupt', getGuiId: () => 'r1' });
            provider.setRoots([root]);

            provider.setFilter('  ext   int  ');
            expect(provider.getChildren()).toEqual([root]);
        });

        it('shows parent if a child matches', () => {
            const child = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            const noMatchRoot = makeGui({ getGuiName: () => 'Unrelated', getGuiId: () => 'r2' });
            provider.setRoots([parent, noMatchRoot]);

            provider.setFilter('MatchChild');
            // Parent should be included because it has a matching descendant
            expect(provider.getChildren()).toEqual([parent]);
        });

        it('filters children of a node when filter is active', () => {
            const matchChild = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const otherChild = makeGui({ getGuiName: () => 'OtherChild', getGuiId: () => 'c2' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [matchChild, otherChild],
            });
            provider.setRoots([parent]);

            provider.setFilter('MatchChild');
            // getChildren for parent should only return matching children
            expect(provider.getChildren(parent)).toEqual([matchChild]);
        });

        it('filters children even when parent directly matches the filter', () => {
            const matchChild = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const otherChild = makeGui({ getGuiName: () => 'OtherChild', getGuiId: () => 'c2' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [matchChild, otherChild],
            });
            provider.setRoots([parent]);

            // 'Parent' directly matches the filter → but children are still filtered
            provider.setFilter('Parent');
            expect(provider.getChildren()).toEqual([parent]);
            expect(provider.getChildren(parent)).toEqual([]);
        });

        it('filters children even when ancestor matches the filter', () => {
            const grandchild = makeGui({ getGuiName: () => 'Grandchild', getGuiId: () => 'g1' });
            const child = makeGui({
                getGuiName: () => 'Child',
                getGuiId: () => 'c1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [grandchild],
            });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([parent]);

            // 'Parent' matches; child and grandchild do not
            provider.setFilter('Parent');
            // Parent is visible
            expect(provider.getChildren()).toEqual([parent]);
            // Children are filtered: child doesn't match 'Parent'
            expect(provider.getChildren(parent)).toEqual([]);
        });

        it('still filters children when only a descendant (not the node itself) matches', () => {
            const matchChild = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const otherChild = makeGui({ getGuiName: () => 'OtherChild', getGuiId: () => 'c2' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [matchChild, otherChild],
            });
            provider.setRoots([parent]);

            // 'Parent' does NOT match; 'MatchChild' does → parent's children still filtered
            provider.setFilter('MatchChild');
            expect(provider.getChildren(parent)).toEqual([matchChild]);
        });

        it('shows deeply nested matching node with full ancestor path', () => {
            const deepChild = makeGui({ getGuiName: () => 'DeepMatch', getGuiId: () => 'd1' });
            const midChild = makeGui({
                getGuiName: () => 'MidLevel',
                getGuiId: () => 'm1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [deepChild],
            });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [midChild],
            });
            const unrelated = makeGui({ getGuiName: () => 'Unrelated', getGuiId: () => 'r2' });
            provider.setRoots([root, unrelated]);

            provider.setFilter('DeepMatch');
            expect(provider.getChildren()).toEqual([root]);
            expect(provider.getChildren(root)).toEqual([midChild]);
            expect(provider.getChildren(midChild)).toEqual([deepChild]);
        });

        it('returns all nodes when filter is cleared', () => {
            const root1 = makeGui({ getGuiName: () => 'Xylophone', getGuiValue: () => 'xval', getGuiId: () => 'r1' });
            const root2 = makeGui({ getGuiName: () => 'Banana', getGuiValue: () => 'bval', getGuiId: () => 'r2' });
            provider.setRoots([root1, root2]);

            provider.setFilter('Xylophone');
            expect(provider.getChildren()).toEqual([root1]);

            provider.setFilter(undefined);
            expect(provider.getChildren()).toEqual([root1, root2]);
        });

        it('calls refresh when setting filter', () => {
            provider.setFilter('test');
            // setRoots was not called, so the only fire is from setFilter
            expect(mockFire).toHaveBeenCalledTimes(1);
        });

        it('calls refresh when clearing filter', () => {
            provider.setFilter('test');
            mockFire.mockClear();
            provider.setFilter(undefined);
            expect(mockFire).toHaveBeenCalledTimes(1);
        });

        it('auto-expands ancestor when filter matches a descendant', () => {
            const child = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([parent]);

            // Without filter, parent is collapsed
            let treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

            // With filter matching the child, parent auto-expands to reveal match
            provider.setFilter('MatchChild');
            treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Clear filter, parent goes back to collapsed
            provider.setFilter(undefined);
            treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });

        it('auto-expands ancestor chain but keeps matched leaf collapsed', () => {
            const leaf = makeGui({ getGuiName: () => 'DeepTarget', getGuiId: () => 'l1' });
            const mid = makeGui({
                getGuiName: () => 'Mid',
                getGuiId: () => 'm1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [leaf],
            });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [mid],
            });
            provider.setRoots([root]);

            provider.setFilter('DeepTarget');
            // Ancestors are auto-expanded to reveal the match
            expect(provider.getTreeItem(root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
            expect(provider.getTreeItem(mid).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        });

        it('shows unfiltered children when user manually expands a matched node', () => {
            const grandchild = makeGui({ getGuiName: () => 'GC', getGuiId: () => 'gc1' });
            const matchNode = makeGui({
                getGuiName: () => 'MatchMe',
                getGuiId: () => 'm1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [grandchild],
            });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [matchNode],
            });
            provider.setRoots([root]);

            provider.setFilter('MatchMe');
            // Root is expanded (ancestor), matched node stays collapsed
            expect(provider.getTreeItem(root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
            expect(provider.getTreeItem(matchNode).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

            // Before manual toggle, children are filtered (GC doesn't match 'MatchMe')
            expect(provider.getChildren(matchNode)).toEqual([]);

            // User collapses the node, then re-expands:
            // getChildren is called before onDidExpandElement, so the collapse
            // alone marks the node for unfiltered display on next getChildren call
            provider.setElementExpanded(matchNode, false);
            expect(provider.getChildren(matchNode)).toEqual([grandchild]);
        });

        it('uses generation-tagged IDs when filter is active so VS Code treats nodes as new', () => {
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [],
            });
            provider.setRoots([root]);

            // Without filter, ID is the original
            expect(provider.getTreeItem(root).id).toBe('r1');

            // With filter, ID is generation-tagged
            provider.setFilter('Root');
            const filteredId = provider.getTreeItem(root).id;
            expect(filteredId).toMatch(/^\d+\/r1$/);

            // Changing the filter bumps the generation
            provider.setFilter('Roo');
            const filteredId2 = provider.getTreeItem(root).id;
            expect(filteredId2).toMatch(/^\d+\/r1$/);
            expect(filteredId2).not.toBe(filteredId);

            // Clearing the filter bumps generation again (IDs stay tagged)
            provider.setFilter(undefined);
            const clearedId = provider.getTreeItem(root).id;
            expect(clearedId).toMatch(/^\d+\/r1$/);
            expect(clearedId).not.toBe(filteredId2);
        });

        it('restores pre-filter expanded state when filter is cleared', () => {
            const child = makeGui({ getGuiName: () => 'Child', getGuiId: () => 'c1' });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'session1/root',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([root]);

            // Manually expand root
            provider.setElementExpanded(root, true);
            let treeItem = provider.getTreeItem(root);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Apply filter — expanded state is saved
            provider.setFilter('Child');
            treeItem = provider.getTreeItem(root);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // During filtering, simulate VS Code tracking expansion via setElementExpanded
            // (which would normally happen from onDidExpandElement events)
            provider.setElementExpanded(root, false); // user collapses during filter

            // Clear filter — pre-filter expanded state is restored (root was expanded before filter)
            provider.setFilter(undefined);
            treeItem = provider.getTreeItem(root);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        });

        it('collapse-then-expand cycle bypasses filter and shows all children', () => {
            // Build a tree where a parent has 3 children but only 1 matches the filter
            const matchLeaf = makeGui({ getGuiName: () => 'Enable IRQ', getGuiId: () => 'leaf1' });
            const otherLeaf1 = makeGui({ getGuiName: () => 'Status Register', getGuiId: () => 'leaf2' });
            const otherLeaf2 = makeGui({ getGuiName: () => 'Priority Level', getGuiId: () => 'leaf3' });
            const parent = makeGui({
                getGuiName: () => 'Interrupt Controller',
                getGuiId: () => 'parent1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [matchLeaf, otherLeaf1, otherLeaf2],
            });
            const root = makeGui({
                getGuiName: () => 'Peripherals',
                getGuiId: () => 'root1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [parent],
            });
            provider.setRoots([root]);

            // Step 1: Apply filter "enable" — only the matching leaf should appear
            provider.setFilter('enable');

            // Root and parent are visible (ancestors of match)
            expect(provider.getChildren()).toEqual([root]);
            expect(provider.getChildren(root)).toEqual([parent]);

            // Parent's children: only the matching leaf
            const filteredChildren = provider.getChildren(parent);
            expect(filteredChildren).toEqual([matchLeaf]);
            expect(filteredChildren).not.toContain(otherLeaf1);
            expect(filteredChildren).not.toContain(otherLeaf2);

            // Ancestors are auto-expanded to reveal matches
            expect(provider.getTreeItem(root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
            expect(provider.getTreeItem(parent).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Step 2: User collapses parent, then re-expands
            // (simulates the VS Code toggle events)
            mockFire.mockClear();
            provider.setElementExpanded(parent, false);

            // Collapsing during filter must fire a targeted tree-data-change
            // so VS Code invalidates its cached children and re-queries
            // getChildren() on re-expansion (the real fix for the bug).
            expect(mockFire).toHaveBeenCalledWith(parent);

            // After collapse, getTreeItem must NOT auto-expand the node again
            expect(provider.getTreeItem(parent).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

            // Re-expand: VS Code calls getChildren(parent) again (cache invalidated)
            // and now gets ALL children unfiltered
            const unfilteredChildren = provider.getChildren(parent);
            expect(unfilteredChildren).toEqual([matchLeaf, otherLeaf1, otherLeaf2]);
        });

        it('collapse-then-expand preserves child filter state', () => {
            // Deep tree: root → mid → sub → [leaf(match), otherLeaf]
            //                   mid → collapsedSub → [x]
            const leaf = makeGui({ getGuiName: () => 'Enable Feature', getGuiId: () => 'leaf1' });
            const otherLeaf = makeGui({ getGuiName: () => 'Other Setting', getGuiId: () => 'leaf2' });
            const sub = makeGui({
                getGuiName: () => 'SubGroup',
                getGuiId: () => 'sub1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [leaf, otherLeaf],
            });
            const collapsedSub = makeGui({
                getGuiName: () => 'CollapsedGroup',
                getGuiId: () => 'csub1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [makeGui({ getGuiName: () => 'X', getGuiId: () => 'x1' })],
            });
            const mid = makeGui({
                getGuiName: () => 'MidGroup',
                getGuiId: () => 'mid1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [sub, collapsedSub],
            });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'root1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [mid],
            });
            provider.setRoots([root]);

            // Apply filter — ancestors and sub auto-expanded
            provider.setFilter('enable');

            // Simulate VS Code tracking auto-expansion events
            provider.setElementExpanded(root, true);
            provider.setElementExpanded(mid, true);
            provider.setElementExpanded(sub, true);
            // collapsedSub was not expanded (not on filter path)

            // User collapses mid
            provider.setElementExpanded(mid, false);

            // Re-expand mid: ALL children shown (unfiltered at this level)
            const midChildren = provider.getChildren(mid);
            expect(midChildren).toEqual([sub, collapsedSub]);

            // Sub keeps its filter auto-expansion (has matching descendant 'Enable Feature')
            expect(provider.getTreeItem(sub).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Sub's children still filtered — only the matching leaf shown
            expect(provider.getChildren(sub)).toEqual([leaf]);

            // CollapsedSub has no matching descendants → stays collapsed
            expect(provider.getTreeItem(collapsedSub).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });
    });

    describe('coverage: edge cases', () => {
        let provider: ComponentViewerTreeDataProvider;

        beforeEach(() => {
            provider = new ComponentViewerTreeDataProvider();
        });

        it('filterPattern getter returns undefined when no filter set', () => {
            expect(provider.filterPattern).toBeUndefined();
        });

        it('filterPattern getter returns current pattern', () => {
            provider.setFilter('test');
            expect(provider.filterPattern).toBe('test');
        });

        it('clearing filter when no saved state does not throw', () => {
            // Call setFilter(undefined) without ever setting a filter first
            provider.setFilter(undefined);
            expect(provider.isFilterActive).toBe(false);
        });

        it('nodeMatchesFilter handles null name and value', () => {
            const node = makeGui({
                getGuiName: () => undefined,
                getGuiValue: () => undefined,
                getGuiId: () => 'n1',
            });
            provider.setRoots([node]);
            provider.setFilter('something');
            // Node with null name/value should not match
            expect(provider.getChildren()).toEqual([]);
        });

        it('nodeOrDescendantMatchesFilter handles falsy getGuiChildren', () => {
            const node = makeGui({
                getGuiName: () => 'NoMatch',
                getGuiId: () => 'n1',
                hasGuiChildren: () => true,
                getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
            });
            provider.setRoots([node]);
            provider.setFilter('xyz');
            expect(provider.getChildren()).toEqual([]);
        });

        it('hasMatchingDescendant handles falsy getGuiChildren', () => {
            const node = makeGui({
                getGuiName: () => 'Match',
                getGuiId: () => 'n1',
                hasGuiChildren: () => true,
                getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
            });
            provider.setRoots([node]);
            provider.setFilter('Match');
            // Node matches directly but has no children → collapsed (no descendant)
            expect(provider.getTreeItem(node).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });

        it('isManuallyExpandedZone returns false for parent with undefined id during getChildren and getTreeItem', () => {
            const child = makeGui({ getGuiName: () => 'Match', getGuiId: () => 'c1' });
            const noIdParent = makeGui({
                getGuiName: () => 'NoIdParent',
                getGuiId: () => undefined,
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([noIdParent]);
            provider.setFilter('Match');
            // noIdParent has undefined id → isManuallyExpandedZone returns false,
            // so getChildren applies filtering normally
            expect(provider.getChildren(noIdParent)).toEqual([child]);
            // getTreeItem also calls isManuallyExpandedZone for auto-expand check
            const item = provider.getTreeItem(noIdParent);
            expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        });

        it('indexParentsRecursively handles child with falsy getGuiChildren', () => {
            const child = makeGui({
                getGuiName: () => 'Child',
                getGuiId: () => 'c1',
                hasGuiChildren: () => true,
                getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
            });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([parent]);
            // Should not throw — falsy getGuiChildren is handled with || []
            expect(provider.getParent(child)).toBe(parent);
        });

        it('markAllExpanded skips elements with undefined id', () => {
            const noIdNode = makeGui({
                getGuiName: () => 'NoId',
                getGuiId: () => undefined,
                hasGuiChildren: () => true,
                getGuiChildren: () => [],
            });
            provider.setRoots([noIdNode]);
            // expandAllElements calls markAllExpanded → skips elements without id
            provider.expandAllElements();
            expect(provider.getTreeItem(noIdNode).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });

        it('collectCollapsibleElements handles falsy getGuiChildren', () => {
            const node = makeGui({
                getGuiName: () => 'Node',
                getGuiId: () => 'n1',
                hasGuiChildren: () => true,
                getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
            });
            provider.setRoots([node]);
            const collapsible = provider.getAllCollapsibleElements();
            expect(collapsible).toEqual([node]);
        });

        it('rebuildParentIndex handles child with undefined id', () => {
            const noIdChild = makeGui({
                getGuiName: () => 'NoIdChild',
                getGuiId: () => undefined,
            });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [noIdChild],
            });
            provider.setRoots([parent]);
            // getParent for noIdChild returns undefined (no id to look up)
            expect(provider.getParent(noIdChild)).toBeUndefined();
        });

        it('rebuildParentIndex handles child without grandchildren', () => {
            const leaf = makeGui({ getGuiName: () => 'Leaf', getGuiId: () => 'l1' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [leaf],
            });
            provider.setRoots([parent]);
            expect(provider.getParent(leaf)).toBe(parent);
        });

        it('findParentInTree fallback finds deeply nested element', () => {
            const grandchild = makeGui({ getGuiName: () => 'GC', getGuiId: () => 'gc1' });
            const child = makeGui({
                getGuiName: () => 'Child',
                getGuiId: () => 'c1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [grandchild],
            });
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([root]);
            // Clear _parentById to force findParentInTree fallback

            (provider as unknown as { _parentById: Map<string, unknown> })._parentById.clear();
            expect(provider.getParent(grandchild)).toBe(child);
        });

        it('findParentInTree returns undefined for element not in tree', () => {
            const root = makeGui({
                getGuiName: () => 'Root',
                getGuiId: () => 'r1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [],
            });
            const orphan = makeGui({ getGuiName: () => 'Orphan', getGuiId: () => 'o1' });
            provider.setRoots([root]);

            (provider as unknown as { _parentById: Map<string, unknown> })._parentById.clear();
            expect(provider.getParent(orphan)).toBeUndefined();
        });

        it('findParentInTree skips elements without children', () => {
            const leaf = makeGui({ getGuiName: () => 'Leaf', getGuiId: () => 'l1' });
            const orphan = makeGui({ getGuiName: () => 'Orphan', getGuiId: () => 'o1' });
            provider.setRoots([leaf]);

            (provider as unknown as { _parentById: Map<string, unknown> })._parentById.clear();
            expect(provider.getParent(orphan)).toBeUndefined();
        });
    });

});
