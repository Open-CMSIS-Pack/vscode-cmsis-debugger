/**
 * Copyright 2025-2026 Arm Limited
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
 * Unit test for ScvdVar.
 */

import { ScvdVar } from '../../../model/scvd-var';
import { Json } from '../../../model/scvd-base';
import { ScvdExpression } from '../../../model/scvd-expression';

describe('ScvdVar', () => {
    it('exposes classname', () => {
        const item = new ScvdVar(undefined);
        expect(item.classname).toBe('ScvdVar');
    });

    it('returns false when XML is undefined', () => {
        const item = new ScvdVar(undefined);
        expect(item.readXml(undefined as unknown as Json)).toBe(false);
        expect(item.tag).toBe('XML undefined');
    });

    it('reads XML and exposes type/size fields', () => {
        const item = new ScvdVar(undefined);
        expect(item.readXml({ value: '1', type: 'uint32_t', size: '2', enum: { value: '1' } })).toBe(true);
        expect(item.value).toBeDefined();
        expect(item.type).toBeDefined();
        const sizeExpr = item.size;
        expect(sizeExpr).toBeInstanceOf(ScvdExpression);
        if (!sizeExpr) {
            throw new Error('Expected size expression to be defined');
        }
        expect(sizeExpr.expression).toBe('2');
        expect(item.enum).toHaveLength(1);

        item.size = undefined;
        expect(item.size).toBe(sizeExpr);
        expect(sizeExpr.expression).toBe('2');

        const prevValue = item.value;
        item.value = undefined;
        expect(item.value).toBe(prevValue);

        const expression = new ScvdExpression(item, '4', 'size');
        item.size = expression;
        expect(item.size).toBe(expression);
    });

    it('reads value and size from injected expression', async () => {
        const item = new ScvdVar(undefined);
        await expect(item.getValue()).resolves.toBeUndefined();

        (item as unknown as { _value?: { getValue: () => Promise<unknown> } })._value = {
            getValue: async () => 3
        };
        await expect(item.getValue()).resolves.toBe(3);

        (item as unknown as { _value?: { getValue: () => Promise<unknown> } })._value = {
            getValue: async () => 'bad'
        };
        await expect(item.getValue()).resolves.toBeUndefined();
    });

    it('computes sizes, member lookups, and offsets', async () => {
        const item = new ScvdVar(undefined);
        const member = new ScvdVar(item);
        item.size = '2';
        item.configure();
        await expect(item.getTargetSize()).resolves.toBe(1);
        await expect(item.getArraySize()).resolves.toBe(2);
        item.size = undefined;
        item.configure();
        await expect(item.getTargetSize()).resolves.toBe(1);
        expect(item.getIsPointer()).toBe(false);
        expect(item.getMember('m')).toBeUndefined();
        expect(item.getElementRef()).toBeUndefined();

        const typeStub = {
            getTypeSize: () => 4,
            getIsPointer: () => true,
            getMember: () => member,
            getValueType: () => 'uint32'
        };
        (item as unknown as { _type?: { getTypeSize: () => number; getIsPointer: () => boolean; getMember: (p: string) => ScvdVar; getValueType: () => string } })._type = typeStub;
        item.size = '3';
        item.configure();

        expect(item.getTypeSize()).toBe(4);
        await expect(item.getTargetSize()).resolves.toBe(4);
        await expect(item.getArraySize()).resolves.toBe(3);
        await expect(item.getVirtualSize()).resolves.toBe(4);
        expect(item.getIsPointer()).toBe(true);
        expect(item.getMember('m')).toBe(member);
        expect(item.getElementRef()).toBe(typeStub);
        expect(item.getValueType()).toBe('uint32');

        item.offset = '4';
        expect(item.offset).toBeDefined();
        item.offset = undefined;
        expect(item.offset).toBeDefined();

        (item as unknown as { _offset?: { getValue: () => Promise<unknown> } })._offset = {
            getValue: async () => 8
        };
        await expect(item.getMemberOffset()).resolves.toBe(8);

        (item as unknown as { _offset?: { getValue: () => Promise<unknown> } })._offset = {
            getValue: async () => 'bad'
        };
        await expect(item.getMemberOffset()).resolves.toBe(0);

        (item as unknown as { _offset?: undefined })._offset = undefined;
        await expect(item.getMemberOffset()).resolves.toBe(0);
    });

    it('returns type size for non-pointer types', async () => {
        const item = new ScvdVar(undefined);
        (item as unknown as { _type?: { getTypeSize: () => number; getIsPointer: () => boolean } })._type = {
            getTypeSize: () => 2,
            getIsPointer: () => false
        };
        await expect(item.getTargetSize()).resolves.toBe(2);
    });

    it('defaults target size to 1 when no size or type is set', async () => {
        const item = new ScvdVar(undefined);
        await expect(item.getTargetSize()).resolves.toBe(1);
        await expect(item.getArraySize()).resolves.toBe(1);
    });

    it('clamps invalid array sizes', async () => {
        const item = new ScvdVar(undefined);
        item.size = 'size';
        const sizeExpr = item.size as ScvdExpression;
        const sizeSpy = jest.spyOn(sizeExpr, 'getValue');

        sizeSpy.mockResolvedValueOnce('bad');
        await expect(item.getArraySize()).resolves.toBe(1);

        sizeSpy.mockResolvedValueOnce(2048);
        await expect(item.getArraySize()).resolves.toBe(1024);

        sizeSpy.mockRestore();
    });

    it('finds enums via helper APIs', async () => {
        const item = new ScvdVar(undefined);
        const enumItem = item.addEnum();
        jest.spyOn(enumItem.value, 'getValue').mockResolvedValue(3);
        await expect(item.getEnum(3)).resolves.toBe(enumItem);
        await expect(item.getEnum(2)).resolves.toBeUndefined();
    });

    it('updates the data type when set repeatedly', () => {
        const item = new ScvdVar(undefined);
        item.type = 'uint32_t';
        const type = item.type;
        item.type = 'uint16_t';
        expect(item.type).toBe(type);

        item.type = undefined;
        expect(item.type).toBe(type);
    });
});
