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
 * Unit test for ScvdMember.
 */

import { Json } from '../../../model/scvd-base';
import { ScvdMember } from '../../../model/scvd-member';
import { ScvdExpression } from '../../../model/scvd-expression';

describe('ScvdMember', () => {
    it('exposes classname', () => {
        const member = new ScvdMember(undefined);
        expect(member.classname).toBe('ScvdMember');
    });

    it('reads XML and populates member metadata', () => {
        const member = new ScvdMember(undefined);
        expect(member.readXml(undefined as unknown as Json)).toBe(false);

        const xml: Json = {
            type: 'uint16_t',
            offset: '4',
            size: '2',
            enum: { value: '1' }
        };
        expect(member.readXml(xml)).toBe(true);
        expect(member.type).toBeDefined();
        expect(member.offset).toBeDefined();
        expect(member.size).toBeInstanceOf(ScvdExpression);
        expect(member.size?.expression).toBe('2');
        expect(member.enum).toHaveLength(1);
    });

    it('computes target size and pointer behavior', async () => {
        const member = new ScvdMember(undefined);
        member.type = 'uint32_t';
        member.size = '8';
        member.configure();
        expect(member.getTypeSize()).toBe(4);
        await expect(member.getArraySize()).resolves.toBe(8);
        await expect(member.getVirtualSize()).resolves.toBe(4);
        await expect(member.getTargetSize()).resolves.toBe(4);
        expect(member.getIsPointer()).toBe(false);

        const pointer = new ScvdMember(undefined);
        pointer.type = '*uint8_t';
        pointer.size = '8';
        pointer.configure();
        expect(pointer.getIsPointer()).toBe(true);
        await expect(pointer.getArraySize()).resolves.toBe(8);
        await expect(pointer.getTargetSize()).resolves.toBe(4);
        expect(pointer.isPointerRef()).toBe(true);

        const oversized = new ScvdMember(undefined);
        oversized.type = 'uint8_t';
        oversized.size = '70000';
        oversized.configure();
        await expect(oversized.getTargetSize()).resolves.toBe(1);
    });

    it('clamps invalid array sizes', async () => {
        const member = new ScvdMember(undefined);
        member.size = 'size';
        const sizeExpr = member.size as ScvdExpression;
        const sizeSpy = jest.spyOn(sizeExpr, 'getValue');

        sizeSpy.mockResolvedValueOnce(0);
        await expect(member.getArraySize()).resolves.toBe(1);

        sizeSpy.mockResolvedValueOnce(BigInt(2));
        await expect(member.getArraySize()).resolves.toBe(2);

        sizeSpy.mockResolvedValueOnce(Number.POSITIVE_INFINITY);
        await expect(member.getArraySize()).resolves.toBe(1);

        sizeSpy.mockResolvedValueOnce('bad');
        await expect(member.getArraySize()).resolves.toBe(1);

        sizeSpy.mockRestore();
    });

    it('finds enums and members via helper APIs', async () => {
        const member = new ScvdMember(undefined);
        member.type = 'uint8_t';
        const enumItem = member.addEnum();
        jest.spyOn(enumItem.value, 'getValue').mockResolvedValue(3);
        await expect(member.getEnum(3)).resolves.toBe(enumItem);
        await expect(member.getEnum(2)).resolves.toBeUndefined();

        const typeMember = { getMember: jest.fn().mockReturnValue(enumItem) };
        (member as unknown as { _type?: { getMember: (property: string) => unknown } })._type = typeMember;
        expect(member.getMember('field')).toBe(enumItem);
    });

    it('returns member offsets and defaults', async () => {
        const member = new ScvdMember(undefined);
        member.offset = '10';
        const offset = (member as unknown as { _offset?: ScvdExpression })._offset;
        if (!offset) {
            throw new Error('Expected offset to be set');
        }
        jest.spyOn(offset, 'getValue').mockResolvedValue(12);
        await expect(member.getMemberOffset()).resolves.toBe(12);

        jest.spyOn(offset, 'getValue').mockResolvedValue('x');
        await expect(member.getMemberOffset()).resolves.toBe(0);
    });

    it('handles missing type information', () => {
        const member = new ScvdMember(undefined);
        expect(member.getMember('field')).toBeUndefined();
        expect(member.getIsPointer()).toBe(false);
        expect(member.isPointerRef()).toBe(false);
        expect(member.getValueType()).toBeUndefined();
        return expect(member.getMemberOffset()).resolves.toBe(0);
    });

    it('covers undefined setters and size fallback', async () => {
        const member = new ScvdMember(undefined);
        member.type = undefined;
        member.offset = undefined;
        member.size = undefined;

        member.type = 'uint16_t';
        await expect(member.getTargetSize()).resolves.toBe(2);
    });

    it('returns undefined target size when type size is missing', async () => {
        const member = new ScvdMember(undefined);
        await expect(member.getTargetSize()).resolves.toBeUndefined();
    });
});
