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

        constructor(label: string) {
            this.label = label;
        }
    }

    return {
        EventEmitter,
        MarkdownString,
        TreeItem,
        TreeItemCollapsibleState: {
            Collapsed: 1,
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
    beforeEach(() => {
        mockFire.mockClear();
    });

    it('builds tree items with fallbacks and collapsible state', () => {
        const provider = new ComponentViewerTreeDataProvider();
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
        const provider = new ComponentViewerTreeDataProvider();
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
        const provider = new ComponentViewerTreeDataProvider();
        const rootLocked = makeGui({ isRootInstance: true, isLocked: true });
        const childUnlocked = makeGui({ isRootInstance: false, isLocked: false });

        const rootItem = provider.getTreeItem(rootLocked);
        expect(rootItem.contextValue).toBe('locked.parentInstance');

        const childItem = provider.getTreeItem(childUnlocked);
        expect(childItem.contextValue).toBe('child');
    });

    it('returns root children when no element is provided', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const root = makeGui({});
        provider.setRoots([root]);

        expect(provider.getChildren()).toEqual([root]);
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('defaults to empty roots when none are provided', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        provider.setRoots();

        expect(provider.getChildren()).toEqual([]);
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('returns element children in order', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const childA = makeGui({});
        const childB = makeGui({});
        const parent = makeGui({
            getGuiChildren: () => [childA, childB],
        });

        expect(provider.getChildren(parent)).toEqual([childA, childB]);
    });

    it('returns empty children when element has none', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const parent = makeGui({
            getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
        });

        expect(provider.getChildren(parent)).toEqual([]);
    });

    it('handles empty caches and no gui output', async () => {
        const provider = new ComponentViewerTreeDataProvider();

        provider.setRoots([]);
        expect(mockFire).toHaveBeenCalledTimes(1);
        expect(provider.getChildren()).toEqual([]);

        provider.clear();
        expect(provider.getChildren()).toEqual([]);
    });

    it('clears models and refreshes', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const root = makeGui({});
        provider.setRoots([root]);
        expect(mockFire).toHaveBeenCalledTimes(1);

        provider.clear();
        expect(mockFire).toHaveBeenCalledTimes(2);
        expect(provider.getChildren()).toEqual([]);
    });
});
