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
            None: 0,
            Expanded: 2,
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

        it('auto-expands parent nodes when filter matches a descendant', () => {
            const child = makeGui({ getGuiName: () => 'MatchChild', getGuiId: () => 'c1' });
            const parent = makeGui({
                getGuiName: () => 'Parent',
                getGuiId: () => 'p1',
                hasGuiChildren: () => true,
                getGuiChildren: () => [child],
            });
            provider.setRoots([parent]);

            // Without filter, parent is collapsed (not manually expanded)
            let treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

            // With filter matching the child, parent should auto-expand
            provider.setFilter('MatchChild');
            treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

            // Clear filter, parent goes back to collapsed
            provider.setFilter(undefined);
            treeItem = provider.getTreeItem(parent);
            expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        });

        it('auto-expands deeply nested ancestor chain when filter matches a leaf', () => {
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
            expect(provider.getTreeItem(root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
            expect(provider.getTreeItem(mid).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
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
            expect(filteredId).toMatch(/^f\d+\/r1$/);

            // Changing the filter bumps the generation
            provider.setFilter('Roo');
            const filteredId2 = provider.getTreeItem(root).id;
            expect(filteredId2).toMatch(/^f\d+\/r1$/);
            expect(filteredId2).not.toBe(filteredId);

            // Clearing the filter restores original ID
            provider.setFilter(undefined);
            expect(provider.getTreeItem(root).id).toBe('r1');
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
    });
});
