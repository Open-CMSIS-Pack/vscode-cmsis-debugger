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
 * Integration test for MemoryHost (pure byte store).
 */

import { MemoryHost } from '../../../data-host/memory-host';

describe('MemoryHost', () => {
    it('stores and retrieves numeric values with explicit offsets', () => {
        const host = new MemoryHost();

        host.setVariable('foo', 4, 0x12345678, 0);
        expect(host.read('foo', 0, 4)).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));

        host.setVariable('foo', 2, 0xabcd, 4);
        expect(host.read('foo', 4, 2)).toEqual(new Uint8Array([0xcd, 0xab]));
    });

    it('appends when offset is -1 and tracks element count', () => {
        const host = new MemoryHost();
        host.setVariable('arr', 4, 1, -1);
        host.setVariable('arr', 4, 2, -1);
        host.setVariable('arr', 4, 3, -1);

        expect(host.getArrayElementCount('arr')).toBe(3);
        expect(host.read('arr', 0, 4)).toEqual(new Uint8Array([1, 0, 0, 0]));
        expect(host.read('arr', 4, 4)).toEqual(new Uint8Array([2, 0, 0, 0]));
        expect(host.read('arr', 8, 4)).toEqual(new Uint8Array([3, 0, 0, 0]));
    });

    it('tracks target bases per element', () => {
        const host = new MemoryHost();
        host.setVariable('sym', 4, 1, -1, 0x1000);
        host.setVariable('sym', 4, 2, -1, 0x2000);

        expect(host.getElementTargetBase('sym', 0)).toBe(0x1000);
        expect(host.getElementTargetBase('sym', 1)).toBe(0x2000);
    });

    it('stores and reads byte arrays', () => {
        const host = new MemoryHost();
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);

        host.setVariable('blob', bytes.length, bytes, 0);
        const out = host.read('blob', 0, bytes.length);
        expect(out).toEqual(bytes);
    });

    it('writes and reads raw bytes at offsets', () => {
        const host = new MemoryHost();

        host.write('raw', 2, new Uint8Array([9, 8, 7, 6]));
        const out = host.read('raw', 2, 4);

        expect(out).toEqual(new Uint8Array([9, 8, 7, 6]));
    });

    it('round-trips via setVariable for a simple store', () => {
        const host = new MemoryHost();
        host.setVariable('simple', 2, 0x1234, 0);

        expect(host.read('simple', 0, 2)).toEqual(new Uint8Array([0x34, 0x12]));
    });

    it('preserves untouched bytes on partial overwrites', () => {
        const host = new MemoryHost();

        host.write('overlap', 0, new Uint8Array([1, 2, 3, 4]));
        host.write('overlap', 2, new Uint8Array([9, 8]));

        const out = host.read('overlap', 0, 4);
        expect(out).toEqual(new Uint8Array([1, 2, 9, 8]));
    });

    it('partial setVariable writes only affect the specified range', () => {
        const host = new MemoryHost();

        host.setVariable('window', 4, new Uint8Array([1, 2, 3, 4]), 0);
        host.setVariable('window', 2, new Uint8Array([9, 8]), 2);

        expect(host.read('window', 0, 2)).toEqual(new Uint8Array([1, 2]));
        expect(host.read('window', 2, 2)).toEqual(new Uint8Array([9, 8]));
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

    it('expands the backing buffer when writing beyond current size', () => {
        const host = new MemoryHost();

        host.write('grow', 0, new Uint8Array([1, 2]));
        host.write('grow', 6, new Uint8Array([9, 8]));

        expect(host.read('grow', 0, 2)).toEqual(new Uint8Array([1, 2]));
        expect(host.read('grow', 6, 2)).toEqual(new Uint8Array([9, 8]));
    });

    it('appends when offset is -1 and later writes can expand via the interface', () => {
        const host = new MemoryHost();

        host.setVariable('arr', 2, new Uint8Array([1, 2]), -1);
        host.setVariable('arr', 2, new Uint8Array([3, 4]), -1);

        host.write('arr', 4, new Uint8Array([5, 6]));

        expect(host.getArrayElementCount('arr')).toBe(2);
        expect(host.read('arr', 0, 2)).toEqual(new Uint8Array([1, 2]));
        expect(host.read('arr', 2, 2)).toEqual(new Uint8Array([3, 4]));
        expect(host.read('arr', 4, 2)).toEqual(new Uint8Array([5, 6]));
    });
});
