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
 * Unit test for ScvdGuiTree basic storage behavior.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';

describe('ScvdGuiTree', () => {
    it('adds children and links parents', () => {
        const root = new ScvdGuiTree(undefined);
        const child = root.getOrCreateChild('child');
        const grand = child.getOrCreateChild('grand');

        expect(root.children).toEqual([child]);
        expect(child.parent).toBe(root);
        expect(child.children).toEqual([grand]);
        expect(grand.parent).toBe(child);
    });

    it('detaches and clears children', () => {
        const root = new ScvdGuiTree(undefined);
        const child = root.getOrCreateChild('child');
        const sibling = root.getOrCreateChild('sibling');

        child.detach();
        expect(root.children).toEqual([sibling]);
        expect(child.parent).toBeUndefined();

        root.clear();
        expect(root.children).toEqual([]);
    });

    it('exposes GUI getters and setters', () => {
        const node = new ScvdGuiTree(undefined);
        node.setGuiName('Name');
        node.setGuiValue('Value');
        node.isPrint = true;

        expect(node.getGuiName()).toBe('Name');
        expect(node.getGuiValue()).toBe('Value');
        expect(node.getGuiEntry()).toEqual({ name: 'Name', value: 'Value' });
        expect(node.getGuiChildren()).toEqual([]);
        expect(node.getGuiConditionResult()).toBe(true);
        expect(node.getGuiLineInfo()).toBeUndefined();
        expect(node.isPrint).toBe(true);
        expect(node.hasGuiChildren()).toBe(false);
    });
});
