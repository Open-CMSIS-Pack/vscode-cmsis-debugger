/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

/**
 * Unit test for MemoryHost (pure byte store – no type interpretation).
 */

import { componentViewerLogger } from '../../../../../logger';
import { MemoryContainer, MemoryHost } from '../../../data-host/memory-host';

describe('MemoryHost', () => {
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

    it('roundtrips bytes via setVariable and read', () => {
        const host = new MemoryHost();
        host.setVariable('num', 4, 0x12345678, 0);
        const out = host.read('num', 0, 4);
        expect(out).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    });

    it('stores and reads byte arrays', () => {
        const host = new MemoryHost();
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        host.setVariable('blob', 10, bytes, 0);
        const out = host.read('blob', 0, 10);
        expect(out).toEqual(bytes);
        expect(out).not.toBe(bytes); // must be a copy
    });

    it('stores float bytes and reads back raw', () => {
        const host = new MemoryHost();
        const f32 = new DataView(new ArrayBuffer(4));
        f32.setFloat32(0, 1.25, true);
        host.setVariable('f32', 4, new Uint8Array(f32.buffer), 0);
        const out = host.read('f32', 0, 4);
        expect(out).toBeDefined();
        const dv = new DataView(out!.buffer, out!.byteOffset, out!.byteLength);
        expect(dv.getFloat32(0, true)).toBeCloseTo(1.25);
    });

    it('appends when offset is -1', () => {
        const host = new MemoryHost();
        host.setVariable('arr', 2, new Uint8Array([1, 2]), -1);
        host.setVariable('arr', 2, new Uint8Array([3, 4]), -1);

        const out = host.read('arr', 0, 4);
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

    it('returns partial buffers for oversized reads (size > 8)', () => {
        const host = new MemoryHost();
        host.setVariable('short', 4, new Uint8Array([1, 2, 3, 4]), 0);

        // size > 8 allows partial reads, zero-padded
        const out = host.read('short', 0, 12);
        expect(out).toEqual(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0]));
    });

    it('zero-pads partial reads when container is shorter than requested size', () => {
        const host = new MemoryHost();
        // Write only 6 bytes but request 10 (> 8 triggers readPartial path)
        host.setVariable('partial', 6, new Uint8Array([10, 20, 30, 40, 50, 60]), 0);

        const out = host.read('partial', 0, 10);
        expect(out).toEqual(new Uint8Array([10, 20, 30, 40, 50, 60, 0, 0, 0, 0]));
        expect(out?.length).toBe(10);
    });

    it('returns undefined for missing or invalid reads', () => {
        const host = new MemoryHost();
        expect(host.read('missing', 0, 4)).toBeUndefined();
        expect(host.read('', 0, 4)).toBeUndefined();
        expect(host.read('any', 0, 0)).toBeUndefined();
        expect(host.read('any', 0, -1)).toBeUndefined();
    });

    it('bigint values are stored as LE bytes', () => {
        const host = new MemoryHost();
        host.setVariable('big', 8, 0x0102030405060708n, 0);
        const out = host.read('big', 0, 8);
        expect(out).toEqual(new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]));
    });

    it('write and read raw bytes at offsets', () => {
        const host = new MemoryHost();
        host.write('raw', 2, new Uint8Array([9, 8, 7, 6]));
        const out = host.read('raw', 2, 4);
        expect(out).toEqual(new Uint8Array([9, 8, 7, 6]));
    });

    it('getByteLength returns correct size', () => {
        const host = new MemoryHost();
        expect(host.getByteLength('missing')).toBe(0);
        host.setVariable('v', 4, 0x12345678, 0);
        expect(host.getByteLength('v')).toBe(4);
        host.setVariable('v', 2, 0x9999, 4);
        expect(host.getByteLength('v')).toBe(6);
    });

    it('read returns a copy (no aliasing)', () => {
        const host = new MemoryHost();
        const data = new Uint8Array([1, 2, 3, 4]);
        host.setVariable('v', 4, data, 0);
        const bytes = host.read('v', 0, 4)!;
        expect(bytes).toEqual(data);
        // Must be a copy, not a reference to internal storage
        bytes[0] = 0xFF;
        expect(host.read('v', 0, 4)![0]).toBe(1);
    });

    it('write writes raw bytes with zero-fill', () => {
        const host = new MemoryHost();
        host.setVariable('buf', 8, new Uint8Array(8), 0);
        const payload = new Uint8Array([0x41, 0x42, 0x43]); // "ABC"
        host.write('buf', 0, payload, 8);
        const result = host.read('buf', 0, 8)!;
        expect(result.subarray(0, 3)).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
        expect(result.subarray(3, 8)).toEqual(new Uint8Array([0, 0, 0, 0, 0]));
    });

    it('handles setVariable metadata and error cases', () => {
        const host = new MemoryHost();
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});

        host.setVariable('badOffset', 1, 1, Number.NaN);
        host.setVariable('neg', 1, 1, -2);
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

    it('preserves const variables when clearing non-const data', () => {
        const host = new MemoryHost();
        host.setVariable('const', 2, 0x1111, 0, undefined, 2, true);
        host.setVariable('temp', 2, 0x2222, 0);

        host.clearNonConst();

        expect(host.read('const', 0, 2)).toEqual(new Uint8Array([0x11, 0x11]));
        expect(host.read('temp', 0, 2)).toBeUndefined();
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
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});

        expect(host.getElementTargetBase('none', 0)).toBeUndefined();
        host.setVariable('bases', 1, 1, -1, 0x10);
        expect(host.getElementTargetBase('bases', 2)).toBe(0x10);

        host.setVariable('bases', 1, 2, -1, 0x20);
        expect(host.getElementTargetBase('bases', 5)).toBeUndefined();

        expect(host.getElementTargetBase('bases', 0)).toBe(0x10);

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('handles empty reads after clearVariable', () => {
        const host = new MemoryHost();
        host.setVariable('empty', 2, 0x1234, 0);
        host.clearVariable('empty');
        expect(host.read('empty', 0, 2)).toBeUndefined();
    });

    it('zero-fills virtual size and supports writes into virtual space', () => {
        const host = new MemoryHost();

        host.setVariable('struct', 2, new Uint8Array([0xAA, 0xBB]), 0, undefined, 6);

        expect(host.read('struct', 0, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(host.read('struct', 2, 2)).toEqual(new Uint8Array([0x00, 0x00]));
        expect(host.read('struct', 4, 2)).toEqual(new Uint8Array([0x00, 0x00]));

        host.write('struct', 2, new Uint8Array([0x11, 0x22]));

        expect(host.read('struct', 0, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(host.read('struct', 2, 2)).toEqual(new Uint8Array([0x11, 0x22]));
        expect(host.read('struct', 4, 2)).toEqual(new Uint8Array([0x00, 0x00]));

        host.write('struct', 4, new Uint8Array([0x33, 0x44]));

        expect(host.read('struct', 0, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(host.read('struct', 2, 2)).toEqual(new Uint8Array([0x11, 0x22]));
        expect(host.read('struct', 4, 2)).toEqual(new Uint8Array([0x33, 0x44]));
    });
});
