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
 * Unit test for MemoryHost.
 */

import { MemoryContainer, MemoryHost, __test__ as memoryHostTest } from '../../../data-host/memory-host';
import { RefContainer } from '../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../model/scvd-node';

class NamedStubBase extends ScvdNode {
    constructor(name: string) {
        super(undefined);
        this.name = name;
    }
}

const makeRef = (
    name: string,
    widthBytes: number,
    offsetBytes = 0,
    valueType?: RefContainer['valueType'],
    withAnchor = true
): RefContainer => {
    const ref = new NamedStubBase(name);
    return {
        base: ref,
        anchor: withAnchor ? ref : undefined,
        current: ref,
        offsetBytes,
        widthBytes,
        valueType: valueType ?? undefined,
    };
};

describe('MemoryHost', () => {
    it('roundtrips numeric values', async () => {
        const host = new MemoryHost();
        const ref = makeRef('num', 4);

        await host.writeValue(ref, 0x12345678);

        const out = await host.readValue(ref);
        expect(out).toBe(0x12345678 >>> 0);
    });

    it('reads and writes via MemoryContainer', () => {
        const container = new MemoryContainer('blob');
        container.write(0, new Uint8Array([1, 2, 3, 4]));

        const out = container.readExact(1, 2);
        expect(out).toBeDefined();
        expect(Array.from(out as Uint8Array)).toEqual([2, 3]);

        container.clear();
        expect(container.byteLength).toBe(0);
    });

    it('returns undefined for invalid MemoryContainer access', () => {
        const container = new MemoryContainer('invalid');
        expect(container.readExact(-1, 1)).toBeUndefined();
        expect(container.readExact(0, 0)).toBeUndefined();
        expect(container.readPartial(-1, 1)).toBeUndefined();
        expect(container.readPartial(0, 0)).toBeUndefined();
        container.write(-1, new Uint8Array([1]));
        container.write(0, new Uint8Array(), -1);
        expect(container.byteLength).toBe(0);
    });

    it('zero-fills when virtualSize exceeds payload', () => {
        const container = new MemoryContainer('pad');
        container.write(0, new Uint8Array([9, 8]), 4);
        const out = container.readExact(0, 4);
        expect(out).toBeDefined();
        expect(Array.from(out as Uint8Array)).toEqual([9, 8, 0, 0]);
    });

    it('returns undefined when reading an unwritten range', () => {
        const container = new MemoryContainer('bad');
        expect(container.readExact(0, 2)).toBeUndefined();
        container.write(0, new Uint8Array([1]));
        expect(container.readExact(0, 1)).toEqual(new Uint8Array([1]));
        expect(container.readExact(1, 1)).toBeUndefined();
        expect(container.readPartial(0, 2)).toEqual(new Uint8Array([1]));
    });

    it('handles readValue float types and raw byte output', async () => {
        const host = new MemoryHost();
        const f32 = new DataView(new ArrayBuffer(4));
        f32.setFloat32(0, 1.25, true);
        host.setVariable('f32', 4, new Uint8Array(f32.buffer), 0);

        const f64 = new DataView(new ArrayBuffer(8));
        f64.setFloat64(0, 2.5, true);
        host.setVariable('f64', 8, new Uint8Array(f64.buffer), 0);
        host.setVariable('f16', 2, new Uint8Array([0x00, 0x3c]), 0);

        const f32Ref = makeRef('f32', 4, 0, { kind: 'float' });
        const f64Ref = makeRef('f64', 8, 0, { kind: 'float' });
        const f16Ref = makeRef('f16', 2, 0, { kind: 'float' });

        expect(await host.readValue(f32Ref)).toBeCloseTo(1.25);
        expect(await host.readValue(f64Ref)).toBeCloseTo(2.5);
        expect(await host.readValue(f16Ref)).toBeCloseTo(1.0);

        const bigRef = makeRef('blob', 10);
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        await host.writeValue(bigRef, bytes);
        const out = await host.readValue(bigRef);
        expect(out).toEqual(bytes);
        expect(out).not.toBe(bytes);

        const raw = await host.readRaw(bigRef, 4);
        expect(raw).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('falls back to raw bytes for non-standard float widths', async () => {
        const host = new MemoryHost();
        host.setVariable('f6', 6, new Uint8Array([1, 2, 3, 4, 5, 6]), 0);
        const ref = makeRef('f6', 6, 0, { kind: 'float' });

        const out = await host.readValue(ref);
        expect(out).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('appends when offset is -1', async () => {
        const host = new MemoryHost();
        host.setVariable('arr', 2, new Uint8Array([1, 2]), -1);
        host.setVariable('arr', 2, new Uint8Array([3, 4]), -1);

        const out = await host.readRaw(makeRef('arr', 4), 4);
        expect(out).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('handles undefined byteLength when appending', () => {
        const host = new MemoryHost();
        host.setVariable('arr', 2, new Uint8Array([1, 2]), 0);
        const cache = host as unknown as { cache: { get: (key: string) => MemoryContainer | undefined } };
        const container = cache.cache.get('arr');
        if (container) {
            Object.defineProperty(container, 'byteLength', { value: undefined });
        }
        host.setVariable('arr', 2, new Uint8Array([3, 4]), -1);
    });

    it('covers float16 edge cases', async () => {
        const host = new MemoryHost();
        host.setVariable('f16zero', 2, new Uint8Array([0x00, 0x00]), 0);
        host.setVariable('f16negzero', 2, new Uint8Array([0x00, 0x80]), 0);
        host.setVariable('f16sub', 2, new Uint8Array([0x01, 0x00]), 0);
        host.setVariable('f16inf', 2, new Uint8Array([0x00, 0x7c]), 0);
        host.setVariable('f16nan', 2, new Uint8Array([0x01, 0x7c]), 0);

        const f16Ref = (name: string) => makeRef(name, 2, 0, { kind: 'float' });
        expect(await host.readValue(f16Ref('f16zero'))).toBe(0);
        expect(Object.is(await host.readValue(f16Ref('f16negzero')), -0)).toBe(true);
        expect(await host.readValue(f16Ref('f16sub'))).toBeGreaterThan(0);
        expect(await host.readValue(f16Ref('f16inf'))).toBe(Infinity);
        expect(Number.isNaN(await host.readValue(f16Ref('f16nan')) as number)).toBe(true);

        expect(Number.isNaN(memoryHostTest.leToFloat16(new Uint8Array([0x00])))).toBe(true);
    });

    it('sign-extends int scalar reads', async () => {
        const host = new MemoryHost();
        host.setVariable('i8', 1, new Uint8Array([0x80]), 0);
        host.setVariable('i16', 2, new Uint8Array([0x00, 0x80]), 0);
        host.setVariable('i32', 4, new Uint8Array([0x00, 0x00, 0x00, 0x80]), 0);
        host.setVariable('i8pos', 1, new Uint8Array([0x7f]), 0);

        expect(await host.readValue(makeRef('i8', 1, 0, { kind: 'int' }))).toBe(-128);
        expect(await host.readValue(makeRef('i16', 2, 0, { kind: 'int' }))).toBe(-32768);
        expect(await host.readValue(makeRef('i32', 4, 0, { kind: 'int' }))).toBe(-2147483648);
        expect(await host.readValue(makeRef('i8pos', 1, 0, { kind: 'int' }))).toBe(127);

        expect(await host.readValue(makeRef('i8', 1, 0, { kind: 'uint' }))).toBe(128);
    });

    it('returns partial buffers for oversized reads', async () => {
        const host = new MemoryHost();
        host.setVariable('short', 4, new Uint8Array([1, 2, 3, 4]), 0);

        const largeRef = makeRef('short', 12);
        const out = await host.readValue(largeRef);
        expect(out).toEqual(new Uint8Array([1, 2, 3, 4]));

        const raw = await host.readRaw(makeRef('short', 4), 10);
        expect(raw).toEqual(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0, 0, 0]));
    });

    it('handles bigint reads and non-little endianness branch', async () => {
        const host = new MemoryHost();
        const ref = makeRef('big', 8);
        await host.writeValue(ref, 0x0102030405060708n);
        const out = await host.readValue(ref);
        expect(out).toBe(0x0102030405060708n);

        (host as unknown as { endianness: string }).endianness = 'big';
        expect(await host.readValue(ref)).toBe(0x0102030405060708n);
    });

    it('returns undefined for invalid readValue/readRaw inputs', async () => {
        const host = new MemoryHost();
        const missing = makeRef('missing', 4, 0, undefined, false);

        expect(await host.readValue(missing)).toBeUndefined();
        expect(await host.readValue(makeRef('missing', 4))).toBeUndefined();
        expect(await host.readValue(makeRef('bad', 0))).toBeUndefined();
        const undefWidth: RefContainer = {
            ...makeRef('undef', 1),
            widthBytes: undefined,
        };
        expect(await host.readValue(undefWidth)).toBeUndefined();
        expect(await host.readRaw(missing, 4)).toBeUndefined();
        expect(await host.readRaw(makeRef('bad', 4), 0)).toBeUndefined();

        await host.writeValue(makeRef('bad', 0), 1);
    });

    it('writes values with coercion and validates virtualSize', async () => {
        const host = new MemoryHost();
        const ref = makeRef('bytes', 4);
        await host.writeValue(ref, new Uint8Array([1, 2]));
        expect(await host.readRaw(ref, 4)).toEqual(new Uint8Array([1, 2, 0, 0]));

        await host.writeValue(ref, true);
        expect(await host.readValue(ref)).toBe(1);
        await host.writeValue(ref, false);
        expect(await host.readValue(ref)).toBe(0);

        const bigRef = makeRef('bigint', 8);
        await host.writeValue(bigRef, 0x0102n);
        expect(await host.readValue(bigRef)).toBe(0x0102n);

        await host.writeValue(ref, new Uint8Array([9, 8, 7, 6]));
        expect(await host.readRaw(ref, 4)).toEqual(new Uint8Array([9, 8, 7, 6]));

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await host.writeValue(ref, 'bad' as unknown as number);
        await host.writeValue(ref, 5, 2);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('handles setVariable metadata and error cases', () => {
        const host = new MemoryHost();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        host.setVariable('badOffset', 1, 1, Number.NaN);
        host.setVariable('neg', 1, 1, -2);
        host.setVariable('badType', 1, 'oops' as unknown as number, 0);
        host.setVariable('badSize', 1, 1, 0, undefined, 0);

        host.setVariable('arr', 2, 1, -1, 0x1000, 4);
        host.setVariable('arr', 2, 2n, -1, -5, 6);
        host.setVariable('buf', 4, new Uint8Array([1, 2, 3, 4]), 0);
        host.setVariable('buf', 4, new Uint8Array([5, 6]), 4);
        expect(host.getArrayElementCount('arr')).toBe(2);
        expect(host.getElementTargetBase('arr', 0)).toBe(0x1000);
        expect(host.getElementTargetBase('arr', 1)).toBeUndefined();

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('supports invalidate/clear operations', () => {
        const host = new MemoryHost();
        host.setVariable('clearme', 2, 0x1111, 0);
        expect(host.clearVariable('clearme')).toBe(true);
        expect(host.clearVariable('missing')).toBe(false);
    });

    it('preserves const variables when clearing non-const data', async () => {
        const host = new MemoryHost();
        host.setVariable('const', 2, 0x1111, 0, undefined, 2, true);
        host.setVariable('temp', 2, 0x2222, 0);

        host.clearNonConst();

        const constRef = makeRef('const', 2, 0);
        const tempRef = makeRef('temp', 2, 0);
        expect(await host.readRaw(constRef, 2)).toEqual(new Uint8Array([0x11, 0x11]));
        expect(await host.readRaw(tempRef, 2)).toBeUndefined();
    });

    it('handles clearNonConst entries without clear methods and empty element counts', () => {
        const host = new MemoryHost();
        host.setVariable('temp', 2, 0x2222, 0);
        const cache = host as unknown as { cache: Map<string, { value?: { clear?: () => void }; isConst?: boolean }> };
        cache.cache.set('noclear', { value: {}, isConst: false });

        host.clearNonConst();

        expect(host.getArrayElementCount('missing')).toBe(1);
    });

    it('validates element base accessors', () => {
        const host = new MemoryHost();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(host.getElementTargetBase('none', 0)).toBeUndefined();
        host.setVariable('bases', 1, 1, -1, 0x10);
        expect(host.getElementTargetBase('bases', 2)).toBeUndefined();

        expect(host.getElementTargetBase('bases', 0)).toBe(0x10);

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('exercises nullish defaults for offsets and sizes', async () => {
        const host = new MemoryHost();
        const ref = makeRef('defaults', 2);
        const customRef: RefContainer = {
            ...ref,
            offsetBytes: undefined,
            widthBytes: undefined,
        };
        await host.writeValue(customRef, 1);

        const readRef: RefContainer = {
            ...ref,
            offsetBytes: undefined,
        };
        await host.writeValue(readRef, new Uint8Array([0xAA, 0xBB]));
        expect(await host.readRaw(readRef, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));

        const readValueRef: RefContainer = {
            ...readRef,
            widthBytes: 2,
        };
        expect(await host.readValue(readValueRef)).toBe(0xBBAA);
    });

    it('handles empty raw reads after clearVariable', async () => {
        const host = new MemoryHost();
        const ref = makeRef('empty', 2, 0);
        host.setVariable('empty', 2, 0x1234, 0);
        host.clearVariable('empty');
        expect(await host.readRaw(ref, 2)).toBeUndefined();
    });
});
