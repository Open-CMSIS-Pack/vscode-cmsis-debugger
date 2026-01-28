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
        root.setId('file');
        const child = root.getOrCreateChild('child', 'L1:Test');
        const grand = child.getOrCreateChild('grand', 'L2:Test');

        expect(root.children).toEqual([child]);
        expect(child.parent).toBe(root);
        expect(child.children).toEqual([grand]);
        expect(grand.parent).toBe(child);
        expect(child.getGuiId()).toBe('file/L1:Test');
        expect(grand.getGuiId()).toBe('file/L1:Test/L2:Test');
    });

    it('detaches and clears children', () => {
        const root = new ScvdGuiTree(undefined);
        root.setId('file');
        const child = root.getOrCreateChild('child', 'L1:Test');
        const sibling = root.getOrCreateChild('sibling', 'L1:Test');

        child.detach();
        expect(root.children).toEqual([sibling]);
        expect(child.parent).toBeUndefined();
        expect(sibling.getGuiId()).toBe('file/L1:Test-1');

        root.clear();
        expect(root.children).toEqual([]);
        const reset = root.getOrCreateChild('child', 'L1:Test');
        expect(reset.getGuiId()).toBe('file/L1:Test');
    });

    it('reuses a child with the same key and segment base', () => {
        const root = new ScvdGuiTree(undefined);
        root.setId('file');
        const first = root.getOrCreateChild('child', 'L1:Test');
        const second = root.getOrCreateChild('child', 'L1:Test');

        expect(second).toBe(first);
        expect(root.children).toEqual([first]);
        expect(first.getGuiId()).toBe('file/L1:Test');
    });

    it('exposes GUI getters and setters', () => {
        const node = new ScvdGuiTree(undefined);
        node.setId('file');
        node.setGuiName('Name');
        node.setGuiValue('Value');
        node.setGuiLineInfo('Line');
        node.isPrint = true;

        expect(node.getGuiName()).toBe('Name');
        expect(node.getGuiValue()).toBe('Value');
        expect(node.getGuiId()).toBe('file');
        expect(node.getGuiEntry()).toEqual({ name: 'Name', value: 'Value' });
        expect(node.getGuiChildren()).toEqual([]);
        expect(node.getGuiConditionResult()).toBe(true);
        expect(node.getGuiLineInfo()).toBe('Line');
        expect(node.isPrint).toBe(true);
        expect(node.hasGuiChildren()).toBe(false);
    });
});
