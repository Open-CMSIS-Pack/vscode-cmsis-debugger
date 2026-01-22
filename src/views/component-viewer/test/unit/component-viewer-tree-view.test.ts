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

import { ComponentViewerTreeDataProvider } from '../../component-viewer-tree-view';
import type { ScvdGuiInterface } from '../../model/scvd-gui-interface';

const mockFire = jest.fn();

jest.mock('vscode', () => {
    class EventEmitter {
        public fire = mockFire;
        public event = jest.fn();
    }

    class TreeItem {
        public label: string;
        public collapsibleState: number | undefined;
        public description: string | undefined;
        public tooltip: string | undefined;
        public id: string | undefined;

        constructor(label: string) {
            this.label = label;
        }
    }

    return {
        EventEmitter,
        TreeItem,
        TreeItemCollapsibleState: {
            Collapsed: 1,
            None: 0,
        },
    };
});

type TestGui = ScvdGuiInterface & {
    nodeId: string;
    getGuiName: () => string | undefined;
    getGuiValue: () => string | undefined;
    getGuiLineInfo: () => string | undefined;
    hasGuiChildren: () => boolean;
    getGuiChildren: () => ScvdGuiInterface[];
    getGuiEntry: () => { name: string | undefined; value: string | undefined };
    getGuiConditionResult: () => boolean;
};

type TestGuiOptions = Partial<Omit<TestGui, 'getGuiChildren'>> & {
    getGuiChildren?: () => ScvdGuiInterface[];
};

const makeGui = (options: TestGuiOptions): TestGui => ({
    nodeId: options.nodeId ?? 'node-1',
    getGuiName: options.getGuiName ?? (() => 'Node'),
    getGuiValue: options.getGuiValue ?? (() => 'Value'),
    getGuiLineInfo: options.getGuiLineInfo ?? (() => 'Line 1'),
    hasGuiChildren: options.hasGuiChildren ?? (() => false),
    getGuiChildren: options.getGuiChildren ?? (() => [] as ScvdGuiInterface[]),
    getGuiEntry: options.getGuiEntry ?? (() => ({ name: 'Node', value: 'Value' })),
    getGuiConditionResult: options.getGuiConditionResult ?? (() => true),
});

describe('ComponentViewerTreeDataProvider', () => {
    beforeEach(() => {
        mockFire.mockClear();
    });

    it('builds tree items with fallbacks and collapsible state', () => {
        const provider = new ComponentViewerTreeDataProvider();
        const withChildren = makeGui({
            nodeId: 'node-a',
            hasGuiChildren: () => true,
        });
        const withoutChildren = makeGui({
            nodeId: 'node-b',
            getGuiName: () => undefined,
            getGuiValue: () => undefined,
            getGuiLineInfo: () => undefined,
        });

        const treeItemWithChildren = provider.getTreeItem(withChildren);
        expect(treeItemWithChildren.label).toBe('Node');
        expect(treeItemWithChildren.collapsibleState).toBe(1);
        expect(treeItemWithChildren.description).toBe('Value');
        expect(treeItemWithChildren.tooltip).toBe('Line 1');
        expect(treeItemWithChildren.id).toBe('node-a');

        const treeItemWithout = provider.getTreeItem(withoutChildren);
        expect(treeItemWithout.label).toBe('UNKNOWN');
        expect(treeItemWithout.collapsibleState).toBe(0);
        expect(treeItemWithout.description).toBe('');
        expect(treeItemWithout.tooltip).toBe('');
        expect(treeItemWithout.id).toBe('node-b');
    });

    it('returns root children when no element is provided', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const root = makeGui({ nodeId: 'root' });
        provider.addGuiOut([root]);
        provider.showModelData();

        expect(provider.getChildren()).resolves.toEqual([root]);
        expect(mockFire).toHaveBeenCalledTimes(1);
    });

    it('returns element children in order', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const childA = makeGui({ nodeId: 'child-a' });
        const childB = makeGui({ nodeId: 'child-b' });
        const parent = makeGui({
            nodeId: 'parent',
            getGuiChildren: () => [childA, childB],
        });

        expect(provider.getChildren(parent)).resolves.toEqual([childA, childB]);
    });

    it('returns empty children when element has none', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const parent = makeGui({
            nodeId: 'parent-empty',
            getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
        });

        expect(provider.getChildren(parent)).resolves.toEqual([]);
    });

    it('handles empty caches and no gui output', async () => {
        const provider = new ComponentViewerTreeDataProvider();

        provider.activate();
        expect(mockFire).toHaveBeenCalledTimes(1);
        expect(provider.getChildren()).resolves.toEqual([]);

        provider.addGuiOut(undefined);
        provider.showModelData();
        expect(provider.getChildren()).resolves.toEqual([]);

        provider.resetModelCache();
        expect(provider.getChildren()).resolves.toEqual([]);
    });

    it('deletes models and refreshes', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const root = makeGui({ nodeId: 'root' });
        provider.addGuiOut([root]);
        provider.showModelData();
        expect(mockFire).toHaveBeenCalledTimes(1);

        provider.deleteModels();
        expect(mockFire).toHaveBeenCalledTimes(2);
        expect(provider.getChildren()).resolves.toEqual([]);
    });

    it('filters by name/value and keeps ancestor chain', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const grandchild = makeGui({ nodeId: 'grand', getGuiName: () => 'Gamma' });
        const childA = makeGui({ nodeId: 'child-a', getGuiName: () => 'Alpha' });
        const childB = makeGui({
            nodeId: 'child-b',
            getGuiName: () => 'Beta',
            hasGuiChildren: () => true,
            getGuiChildren: () => [grandchild],
        });
        const root = makeGui({
            nodeId: 'root',
            hasGuiChildren: () => true,
            getGuiChildren: () => [childA, childB],
        });

        provider.addGuiOut([root]);
        provider.showModelData();
        provider.setFilterText('gAm');

        await expect(provider.getChildren()).resolves.toEqual([root]);
        await expect(provider.getChildren(root)).resolves.toEqual([childB]);
        await expect(provider.getChildren(childB)).resolves.toEqual([grandchild]);
    });

    it('filters matching parents without showing non-matching children', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const child = makeGui({ nodeId: 'child', getGuiName: () => 'Child' });
        const parent = makeGui({
            nodeId: 'parent',
            getGuiEntry: () => ({ name: 'Match', value: '' }),
            hasGuiChildren: () => true,
            getGuiChildren: () => [child],
        });

        provider.addGuiOut([parent]);
        provider.showModelData();
        provider.setFilterText('match');

        await expect(provider.getChildren()).resolves.toEqual([parent]);
        await expect(provider.getChildren(parent)).resolves.toEqual([]);
    });
});
