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
 *
 * Unit test for ComponentViewerTreeDataProvider.
 */
// generated with AI

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

describe('ComponentViewerTreeDataProvider coverage', () => {
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
        await provider.addGuiOut([root]);
        await provider.showModelData();

        await expect(provider.getChildren()).resolves.toEqual([root]);
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

        await expect(provider.getChildren(parent)).resolves.toEqual([childA, childB]);
    });

    it('returns empty children when element has none', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const parent = makeGui({
            nodeId: 'parent-empty',
            getGuiChildren: () => undefined as unknown as ScvdGuiInterface[],
        });

        await expect(provider.getChildren(parent)).resolves.toEqual([]);
    });

    it('handles empty caches and no gui output', async () => {
        const provider = new ComponentViewerTreeDataProvider();

        await provider.activate();
        expect(mockFire).toHaveBeenCalledTimes(1);
        await expect(provider.getChildren()).resolves.toEqual([]);

        await provider.addGuiOut(undefined);
        await provider.showModelData();
        await expect(provider.getChildren()).resolves.toEqual([]);

        provider.resetModelCache();
        await expect(provider.getChildren()).resolves.toEqual([]);
    });

    it('deletes models and refreshes', async () => {
        const provider = new ComponentViewerTreeDataProvider();
        const root = makeGui({ nodeId: 'root' });
        await provider.addGuiOut([root]);
        await provider.showModelData();
        expect(mockFire).toHaveBeenCalledTimes(1);

        await provider.deleteModels();
        expect(mockFire).toHaveBeenCalledTimes(2);
        await expect(provider.getChildren()).resolves.toEqual([]);
    });
});
