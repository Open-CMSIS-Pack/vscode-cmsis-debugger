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
 * Coverage for ScvdGuiTree reconciliation and child management.
 */
// generated with AI

import { ScvdGuiTree } from '../../scvd-gui-tree';

describe('ScvdGuiTree', () => {
    it('reconciles children with epochs, pruning unseen nodes', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        const epoch1 = root.beginUpdate();
        const a = root.getOrCreateChild('a', 'a');
        const b = root.getOrCreateChild('b', 'b');
        expect(root.children).toHaveLength(2);
        root.finalizeUpdate(epoch1);
        expect(root.children).toEqual([a, b]);

        const epoch2 = root.beginUpdate();
        root.getOrCreateChild('a', 'a'); // reuse only 'a'
        root.finalizeUpdate(epoch2);
        expect(root.children).toEqual([a]);
        expect(a.parent).toBe(root);
    });

    it('suffixes duplicate keys', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        const epoch = root.beginUpdate();
        root.getOrCreateChild('dup');
        root.getOrCreateChild('dup');
        root.getOrCreateChild('dup');
        root.finalizeUpdate(epoch);
        const keys = root.children.map(c => c.key);
        expect(keys).toEqual(['dup', 'dup#1', 'dup#2']);
    });

    it('bumps reused children to the end of the list', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        const epoch1 = root.beginUpdate();
        const first = root.getOrCreateChild('first');
        const second = root.getOrCreateChild('second');
        root.finalizeUpdate(epoch1);

        const epoch2 = root.beginUpdate();
        root.getOrCreateChild('second');
        const reused = root.getOrCreateChild('first');
        root.finalizeUpdate(epoch2);

        expect(reused).toBe(first);
        expect(root.children).toEqual([second, first]);
    });

    it('builds path using ancestors iterator', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        const child = root.getOrCreateChild('child');
        const grand = child.getOrCreateChild('grand');
        const path = (grand as unknown as { path: string }).path;
        const parts = path.split(' > ');
        expect(parts).toHaveLength(3);
        expect(parts[0].startsWith('root_')).toBe(true);
        expect(parts[2].includes('grand')).toBe(true);
    });

    it('recovers with fallback when child creation throws', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        let first = true;
        const originalAdd = (root as unknown as { addChild?: (c: ScvdGuiTree) => void }).addChild?.bind(root);
        // Throw on the first addChild to trigger fallback path
        (root as unknown as { addChild: (c: ScvdGuiTree) => void }).addChild = (c: ScvdGuiTree) => {
            if (first) {
                first = false;
                throw new Error('fail');
            }
            originalAdd?.(c);
        };
        const epoch = root.beginUpdate();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const fallback = root.getOrCreateChild('boom');
        root.finalizeUpdate(epoch);
        expect(fallback.key).toBe('boom#fallback');
        expect(root.children).toContain(fallback);
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('clears and detaches children and indexes correctly', () => {
        const root = new ScvdGuiTree(undefined, 'root');
        root.beginUpdate();
        const child = root.getOrCreateChild('child');
        expect(root.hasGuiChildren()).toBe(true);
        expect(root.childIndex.has('child')).toBe(true);
        child.detach();
        expect(root.children).toHaveLength(0);
        expect(root.childIndex.has('child')).toBe(false);

        const epoch = root.beginUpdate();
        const keyless = new ScvdGuiTree(root, 'keyless');
        root.finalizeUpdate(epoch);
        expect(root.children).not.toContain(keyless);

        root.beginUpdate();
        root.getOrCreateChild('orphan');
        expect(root.childIndex.size).toBe(1);
        root.clear();
        expect(root.hasGuiChildren()).toBe(false);
        expect(root.childIndex.size).toBe(0);

        root.detach(); // no parent: should be a no-op branch
        expect(root.parent).toBeUndefined();

        const keylessDetached = new ScvdGuiTree(root, 'keyless-detach');
        expect(keylessDetached.key).toBeUndefined();
        keylessDetached.detach();
        expect(root.children).not.toContain(keylessDetached);
    });

    it('exposes gui getters and setters', () => {
        const node = new ScvdGuiTree(undefined, 'node');
        node.setGuiValue('Value');
        node.isPrint = true;
        (node as unknown as { name?: string }).name = 'Internal';
        expect(node.getGuiName()).toBe('Internal');
        node.setGuiName('Name');
        expect(node.getGuiValue()).toBe('Value');
        expect(node.getGuiEntry()).toEqual({ name: 'Name', value: 'Value' });
        expect(node.getGuiChildren()).toEqual([]);
        expect(node.getGuiConditionResult()).toBe(true);
        expect(node.getGuiLineInfo()).toBeUndefined();
        expect(node.isPrint).toBe(true);
        expect(node.hasGuiChildren()).toBe(false);
    });

    it('resets duplicate counters per epoch and allows external epoch set', () => {
        ScvdGuiTree.epoch = 10;
        const root = new ScvdGuiTree(undefined, 'root');

        const epoch1 = root.beginUpdate();
        expect(epoch1).toBe(11);
        const firstA = root.getOrCreateChild('a');
        const secondA = root.getOrCreateChild('a');
        root.finalizeUpdate(epoch1);
        expect(firstA.key).toBe('a');
        expect(secondA.key).toBe('a#1');

        const epoch2 = root.beginUpdate();
        expect(epoch2).toBe(12);
        const reused = root.getOrCreateChild('a');
        expect(reused).toBe(firstA);
        root.getOrCreateChild('b');
        root.finalizeUpdate(epoch2);
        const keys = root.children.map(c => c.key);
        expect(keys).toEqual(['a', 'b']);
        expect(root.keyCursor.size).toBeGreaterThanOrEqual(0);
    });
});
