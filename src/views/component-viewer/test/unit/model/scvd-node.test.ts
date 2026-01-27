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
 * Unit test for ScvdNode.
 */

import { ScvdNode } from '../../../model/scvd-node';
import { Json, ScvdBase } from '../../../model/scvd-base';

class TestNode extends ScvdNode {
    constructor(parent: ScvdBase | undefined) {
        super(parent);
    }

    public exposeSymbolsCache(key: string, value: ScvdNode | undefined): ScvdNode | undefined {
        return this.symbolsCache(key, value);
    }

    public exposeClearSymbolsCache(): void {
        this.clearSymbolsCache();
    }

    public exposeClearSymbolCachesRecursive(): void {
        this.clearSymbolCachesRecursive();
    }
}

class UndefinedTagNode extends TestNode {
    private _overrideTag: string | undefined;
    public override get tag(): string | undefined {
        return this._overrideTag;
    }
    public override set tag(value: string | undefined) {
        this._overrideTag = value;
    }
}

describe('ScvdNode', () => {
    it('reads XML metadata with explicit tags', () => {
        const node = new TestNode(undefined);
        const xml = { __line: '10', '#Name': 'Tag', name: 'Name', info: 'Info' };

        expect(node.readXml(xml)).toBe(true);
        expect(node.lineNo).toBe('10');
        expect(node.tag).toBe('Tag');
        expect(node.name).toBe('Name');
        expect(node.info).toBe('Info');
    });

    it('handles XML arrays and missing tags', () => {
        const arrayTag = new TestNode(undefined);
        expect(arrayTag.readXml([{ tag: 'item' }] as unknown as Json)).toBe(true);
        expect(arrayTag.tag).toBe('item[]');

        const arrayUnknown = new TestNode(undefined);
        expect(arrayUnknown.readXml([{}] as unknown as Json)).toBe(true);
        expect(arrayUnknown.tag).toBe('Array[]');

        const defaultTag = new TestNode(undefined);
        expect(defaultTag.readXml({})).toBe(true);
        expect(defaultTag.tag).toBe('Internal Object');

        const missingTag = new UndefinedTagNode(undefined);
        expect(missingTag.readXml({})).toBe(true);
        expect(missingTag.tag).toBe('unknown-tag');
    });

    it('returns false when XML is undefined', () => {
        const node = new TestNode(undefined);
        expect(node.readXml(undefined as unknown as Json)).toBe(false);
        expect(node.tag).toBe('XML undefined');
    });

    it('delegates symbols to parent chain', () => {
        const parent = new TestNode(undefined);
        const child = new TestNode(parent);
        const symbol = new TestNode(undefined);
        jest.spyOn(parent, 'addToSymbolContext');

        child.addToSymbolContext('name', symbol);
        expect(parent.getSymbol('missing')).toBeUndefined();
    });

    it('exposes default behaviors and GUI helpers', async () => {
        const node = new TestNode(undefined);
        node.name = 'Name';

        expect(node.getMember('x')).toBeUndefined();
        expect(node.getElementRef()).toBeUndefined();
        expect(node.resolveAndLink(() => undefined)).toBe(false);
        expect(node.applyInit()).toBe(true);
        await expect(node.getConditionResult()).resolves.toBe(true);
        await expect(node.getValue()).resolves.toBeUndefined();
        await expect(node.setValue(3)).resolves.toBe(3);
        expect(node.isPointerRef()).toBe(false);

        await expect(node.getGuiName()).resolves.toBe('Name');
        await expect(node.getGuiValue()).resolves.toBeUndefined();
        expect(node.getGuiConditionResult()).toBe(true);
        expect(node.getGuiLineInfo()).toContain('Tag');
    });

    it('formats GUI values for numbers and strings', async () => {
        const node = new TestNode(undefined);
        node.name = 'Node';

        (node as unknown as { getValue: () => Promise<unknown> }).getValue = async () => 5;
        await expect(node.getGuiValue()).resolves.toBe('5');

        const stringNode = new TestNode(undefined);
        (stringNode as unknown as { getValue: () => Promise<unknown> }).getValue = async () => 'text';
        await expect(stringNode.getGuiValue()).resolves.toBe('text');

        const otherNode = new TestNode(undefined);
        (otherNode as unknown as { getValue: () => Promise<unknown> }).getValue = async () => new Uint8Array([1, 2, 3]);
        await expect(otherNode.getGuiValue()).resolves.toBeUndefined();
    });

    it('caches symbols and clears recursively', () => {
        const node = new TestNode(undefined);
        const child = new TestNode(node);
        const symbol = new TestNode(undefined);

        expect(node.exposeSymbolsCache('k', symbol)).toBe(symbol);
        expect(node.exposeSymbolsCache('k', undefined)).toBe(symbol);

        node.exposeClearSymbolCachesRecursive();
        expect(node.exposeSymbolsCache('k', undefined)).toBeUndefined();
        expect(child.exposeSymbolsCache('k', undefined)).toBeUndefined();
    });

    it('logs default errors for unimplemented accessors', async () => {
        const node = new TestNode(undefined);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(node.writeAt(0, 8, 1)).toBeUndefined();
        expect(node.readAt(0, 8)).toBeUndefined();
        await expect(node.getTargetSize()).resolves.toBeUndefined();
        expect(node.getTypeSize()).toBeUndefined();
        await expect(node.getVirtualSize()).resolves.toBeUndefined();
        expect(node.getIsPointer()).toBe(false);
        await expect(node.getArraySize()).resolves.toBeUndefined();
        await expect(node.getMemberOffset()).resolves.toBeUndefined();
        expect(node.getElementBitWidth()).toBeUndefined();
        expect(node.getValueType()).toBeUndefined();

        errorSpy.mockRestore();
    });
});
