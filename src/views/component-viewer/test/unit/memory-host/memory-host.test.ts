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
 * Unit test for MemoryHost.
 */
// generated with AI

import { MemoryContainer, MemoryHost } from '../../../data-host/memory-host';
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

        const out = container.read(1, 2);
        expect(Array.from(out)).toEqual([2, 3]);

        container.clear();
        expect(container.byteLength).toBe(0);
    });

    it('zero-fills when virtualSize exceeds payload', () => {
        const container = new MemoryContainer('pad');
        container.write(0, new Uint8Array([9, 8]), 4);
        expect(Array.from(container.read(0, 4))).toEqual([9, 8, 0, 0]);
    });

    it('logs when container window is unavailable', () => {
        const container = new MemoryContainer('bad');
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        (container as unknown as { ensure: () => void }).ensure = () => {};

        expect(Array.from(container.read(0, 2))).toEqual([0, 0]);
        container.write(0, new Uint8Array([1]));

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('handles readValue float types and raw byte output', async () => {
        const host = new MemoryHost();
        const f32 = new DataView(new ArrayBuffer(4));
        f32.setFloat32(0, 1.25, true);
        host.setVariable('f32', 4, new Uint8Array(f32.buffer), 0);

        const f64 = new DataView(new ArrayBuffer(8));
        f64.setFloat64(0, 2.5, true);
        host.setVariable('f64', 8, new Uint8Array(f64.buffer), 0);
        host.setVariable('f16', 2, new Uint8Array([0x00, 0x80]), 0);

        const f32Ref = makeRef('f32', 4, 0, { kind: 'float' });
        const f64Ref = makeRef('f64', 8, 0, { kind: 'float' });
        const f16Ref = makeRef('f16', 2, 0, { kind: 'float' });

        expect(await host.readValue(f32Ref)).toBeCloseTo(1.25);
        expect(await host.readValue(f64Ref)).toBeCloseTo(2.5);
        expect(await host.readValue(f16Ref)).toBe(0x8000);

        const bigRef = makeRef('blob', 10);
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        await host.writeValue(bigRef, bytes);
        const out = await host.readValue(bigRef);
        expect(out).toEqual(bytes);
        expect(out).not.toBe(bytes);

        const raw = await host.readRaw(bigRef, 4);
        expect(raw).toEqual(new Uint8Array([1, 2, 3, 4]));
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
        expect(host.getArrayTargetBases('arr')).toEqual([0x1000, 0]);

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('returns variables with inferred sizes and validates ranges', async () => {
        const host = new MemoryHost();
        host.setVariable('item', 2, 0x1234, -1, undefined, 2);
        host.setVariable('item', 2, 0x5678, -1, undefined, 2);

        expect(host.getVariable('item')).toBe(0x1234);
        expect(host.getVariable('item', undefined, 0)).toBe(0x1234);
        expect(host.getVariable('item', undefined, 2)).toBe(0x5678);

        host.setVariable('wide', 4, 0x11223344, -1, undefined, 4);
        host.setVariable('wide', 4, 0x55667788, -1, undefined, 4);
        expect(host.getVariable('wide', undefined, 1)).toBeUndefined();
        expect(host.getVariable('item', 0, 0)).toBeUndefined();
        expect(host.getVariable('item', 2, -1)).toBeUndefined();
        expect(host.getVariable('item', 4, 2)).toBeUndefined();
        expect(host.getVariable('item', 2, 99)).toBeUndefined();
        expect(host.getVariable('missing')).toBeUndefined();

        const rawRef = makeRef('raw', 2);
        await host.writeValue(rawRef, new Uint8Array([0x34, 0x12]));
        expect(host.getVariable('raw', undefined, 0)).toBe(0x1234);
    });

    it('supports invalidate/clear operations', () => {
        const host = new MemoryHost();
        host.setVariable('clearme', 2, 0x1111, 0);
        expect(host.clearVariable('clearme')).toBe(true);
        host.invalidate('clearme');
        host.invalidate();
        expect(host.clearVariable('missing')).toBe(false);

        host.setVariable('temp', 2, 0x2222, 0);
        host.clear();
        expect(host.getArrayElementCount('temp')).toBe(1);
    });

    it('validates element base accessors', () => {
        const host = new MemoryHost();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(host.getElementTargetBase('none', 0)).toBeUndefined();
        expect(host.getArrayTargetBases('none')).toEqual([]);
        host.setVariable('bases', 1, 1, -1, 0x10);
        expect(host.getElementTargetBase('bases', 2)).toBeUndefined();

        host.setElementTargetBase('none', 0, 0x20);
        host.setElementTargetBase('bases', 2, 0x20);
        host.setElementTargetBase('bases', 0, -1);
        expect(host.getElementTargetBase('bases', 0)).toBe(0x10);
        host.setElementTargetBase('bases', 0, 0x20);
        expect(host.getElementTargetBase('bases', 0)).toBe(0x20);

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('computes array length from bytes when metadata is sparse', () => {
        const host = new MemoryHost();
        expect(host.getArrayLengthFromBytes('missing')).toBe(1);

        host.setVariable('len', 2, 1, -1);
        host.setVariable('len', 2, 2, -1);
        expect(host.getArrayLengthFromBytes('len')).toBe(2);

        const meta = { offsets: [], sizes: [], bases: [], elementSize: 4 };
        (host as unknown as { elementMeta: Map<string, unknown> }).elementMeta.set('stride', meta);
        const container = (host as unknown as { getContainer: (name: string) => MemoryContainer }).getContainer('stride');
        container.write(0, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
        expect(host.getArrayLengthFromBytes('stride')).toBe(2);

        (host as unknown as { elementMeta: Map<string, unknown> }).elementMeta.set('nostride', {
            offsets: [],
            sizes: [],
            bases: [],
            elementSize: 0,
        });
        expect(host.getArrayLengthFromBytes('nostride')).toBe(1);
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

    it('covers nullish byteLength fallbacks', () => {
        const host = new MemoryHost();
        const container = (host as unknown as { getContainer: (name: string) => MemoryContainer }).getContainer('nullish');
        Object.defineProperty(container, 'byteLength', { get: () => undefined });

        host.setVariable('nullish', 1, 1, -1);
        expect(host.getVariable('nullish', undefined, 0)).toBeUndefined();

        (host as unknown as { elementMeta: Map<string, unknown> }).elementMeta.set('nullishMeta', {
            offsets: [],
            sizes: [],
            bases: [],
            elementSize: 4,
        });
        const metaContainer = (host as unknown as { getContainer: (name: string) => MemoryContainer }).getContainer('nullishMeta');
        Object.defineProperty(metaContainer, 'byteLength', { get: () => undefined });
        expect(host.getArrayLengthFromBytes('nullishMeta')).toBe(1);
    });
});
