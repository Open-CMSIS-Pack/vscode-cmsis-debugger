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
 * Unit test for ScvdRead.
 */

import { ScvdCondition } from '../../../model/scvd-condition';
import { ScvdEndian } from '../../../model/scvd-endian';
import { ScvdExpression } from '../../../model/scvd-expression';
import { ScvdRead } from '../../../model/scvd-read';
import { ScvdSymbol } from '../../../model/scvd-symbol';
import { Json } from '../../../model/scvd-base';

describe('ScvdRead', () => {
    it('exposes classname', () => {
        const read = new ScvdRead(undefined);
        expect(read.classname).toBe('ScvdRead');
    });

    it('returns false when XML is undefined', () => {
        const read = new ScvdRead(undefined);
        expect(read.readXml(undefined as unknown as Json)).toBe(false);
        expect(read.tag).toBe('XML undefined');
    });

    it('reads XML fields into typed members', () => {
        const read = new ScvdRead(undefined);
        const condSpy = jest.spyOn(ScvdCondition.prototype, 'getResult').mockResolvedValue(false);

        const xml = {
            type: 'uint32_t',
            symbol: 'sym',
            offset: '4',
            const: '1',
            cond: '0',
            size: '2',
            endian: 'B'
        };

        expect(read.readXml(xml)).toBe(true);
        expect(read.type).toBeDefined();
        expect(read.symbol).toBeInstanceOf(ScvdSymbol);
        expect(read.offset).toBeDefined();
        expect(read.const).toBe(true);
        expect(read.cond).toBeInstanceOf(ScvdCondition);
        expect(read.size).toBeDefined();
        expect(read.endian).toBeInstanceOf(ScvdEndian);

        read.endian = 'L';
        expect(read.endian?.endian).toBe('L');

        read.symbol = 'again';
        expect(read.symbol?.symbol).toBe('sym');

        return read.getConditionResult().then(result => {
            expect(result).toBe(false);
            condSpy.mockRestore();
        });
    });

    it('handles array size values and pointer flag', async () => {
        const read = new ScvdRead(undefined);

        (read as unknown as { _size?: { getValue: () => Promise<unknown> } })._size = {
            getValue: async () => 7n
        };
        await expect(read.getArraySize()).resolves.toBe(7);

        (read as unknown as { _size?: { getValue: () => Promise<unknown> } })._size = {
            getValue: async () => 3
        };
        await expect(read.getArraySize()).resolves.toBe(3);

        (read as unknown as { _size?: { getValue: () => Promise<unknown> } })._size = {
            getValue: async () => 'bad'
        };
        await expect(read.getArraySize()).resolves.toBe(1);

        (read as unknown as { _type?: { getIsPointer: () => boolean } })._type = {
            getIsPointer: () => true
        };
        expect(read.getIsPointer()).toBe(true);
    });

    it('ignores undefined setters for optional fields', () => {
        const read = new ScvdRead(undefined);
        read.type = undefined;
        read.symbol = undefined;
        read.offset = undefined;
        read.const = undefined;
        read.cond = undefined;
        read.size = undefined;
        read.endian = undefined;

        expect(read.type).toBeUndefined();
        expect(read.symbol).toBeUndefined();
        expect(read.offset).toBeUndefined();
        expect(read.cond).toBeUndefined();
        expect(read.size).toBeUndefined();
        expect(read.endian).toBeUndefined();
    });

    it('parses const flags and default pointer state', () => {
        const read = new ScvdRead(undefined);
        read.const = '0';
        expect(read.const).toBe(false);
        expect(read.getIsPointer()).toBe(false);
    });

    it('falls back to default condition result when no cond is set', async () => {
        const read = new ScvdRead(undefined);
        await expect(read.getConditionResult()).resolves.toBe(true);
    });

    it('delegates size and member lookups to the type', async () => {
        const read = new ScvdRead(undefined);
        const member = new ScvdRead(read);
        (read as unknown as { _type?: { getTypeSize: () => number; getVirtualSize: () => number; getIsPointer: () => boolean; getMember: (n: string) => ScvdRead; getValueType: () => string } })._type = {
            getTypeSize: () => 4,
            getVirtualSize: () => 8,
            getIsPointer: () => false,
            getMember: () => member,
            getValueType: () => 'uint32'
        };

        await expect(read.getTargetSize()).resolves.toBe(4);
        await expect(read.getVirtualSize()).resolves.toBe(8);
        expect(read.getMember('m')).toBe(member);
        expect(read.getValueType()).toBe('uint32');
    });

    it('keeps target size as element size', async () => {
        const read = new ScvdRead(undefined);
        read.size = '3';
        (read as unknown as { _type?: { getTypeSize: () => number; getIsPointer: () => boolean } })._type = {
            getTypeSize: () => 2,
            getIsPointer: () => false
        };
        await expect(read.getTargetSize()).resolves.toBe(2);
    });

    it('returns pointer size for pointer types', async () => {
        const read = new ScvdRead(undefined);
        (read as unknown as { _type?: { getTypeSize: () => number; getIsPointer: () => boolean } })._type = {
            getTypeSize: () => 1,
            getIsPointer: () => true
        };
        await expect(read.getTargetSize()).resolves.toBe(4);
    });

    it('returns undefined when type size is missing', async () => {
        const read = new ScvdRead(undefined);
        (read as unknown as { _type?: { getTypeSize: () => number | undefined; getIsPointer: () => boolean } })._type = {
            getTypeSize: () => undefined,
            getIsPointer: () => false
        };
        await expect(read.getTargetSize()).resolves.toBeUndefined();
    });

    it('clamps invalid array sizes and logs an error', async () => {
        const read = new ScvdRead(undefined);
        read.size = 'size';
        const expr = read.size as ScvdExpression;
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const valueSpy = jest.spyOn(expr, 'getValue');

        valueSpy.mockResolvedValueOnce(0);
        await expect(read.getArraySize()).resolves.toBe(1);

        valueSpy.mockResolvedValueOnce(70000);
        await expect(read.getArraySize()).resolves.toBe(65536);

        valueSpy.mockResolvedValueOnce(NaN);
        await expect(read.getArraySize()).resolves.toBe(1);

        expect(errorSpy).toHaveBeenCalled();
        valueSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
