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
 * Deep integration tests for MemoryHost:
 *  - 9-byte unaligned append items (mem_block_t style)
 *  - clearNonConst vs const preservation
 *  - _count / _addr meta-property correctness
 *  - readback of individual members (next, len, id) after append
 *
 * Models the real RTX SCVD scenario where:
 *   · mem_list_com appends 9-byte mem_block_t items via setVariable(..., -1)
 *   · Each item has targetBase = the address where it was read from
 *   · Members are accessed via read() at offsets within each element
 */

import { MemoryHost } from '../../../data-host/memory-host';
import { leToNumber } from '../../../data-host/byte-encoding';

// ---------- helpers ----------

/** Build a 9-byte mem_block_t: [next:4][len:4][id:1] in little-endian. */
function makeBlockBytes(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    view.setUint32(0, nextAddr, true);
    view.setUint32(4, len, true);
    buf[8] = id;
    return buf;
}

// ---------- tests ----------

describe('MemoryHost – 9-byte append items', () => {
    it('appends multiple 9-byte items and reads them back correctly', () => {
        const host = new MemoryHost();
        const blocks = [
            makeBlockBytes(0x20010d50, 41, 0xF5),
            makeBlockBytes(0x20010d78, 41, 0xF1),
            makeBlockBytes(0x20010da0, 41, 0xF1),
        ];

        for (const block of blocks) {
            host.setVariable('mem_list_com', 9, block, -1, undefined, 9);
        }

        // Element count should be 3
        expect(host.getArrayElementCount('mem_list_com')).toBe(3);

        // Read back each element's members
        for (let i = 0; i < blocks.length; i++) {
            const offset = i * 9;
            // next (offset 0, 4 bytes)
            const nextBytes = host.read('mem_list_com', offset, 4);
            expect(nextBytes).toBeDefined();
            const nextVal = leToNumber(nextBytes!);
            const blockData = blocks.at(i);
            if (blockData) {
                const expectedNext = new DataView(blockData.buffer).getUint32(0, true);
                expect(nextVal).toBe(expectedNext);
            }

            // len (offset 4, 4 bytes)
            const lenBytes = host.read('mem_list_com', offset + 4, 4);
            expect(lenBytes).toBeDefined();
            expect(leToNumber(lenBytes!)).toBe(41);

            // id (offset 8, 1 byte)
            const idBytes = host.read('mem_list_com', offset + 8, 1);
            expect(idBytes).toBeDefined();
            expect(idBytes![0]).toBe(blockData?.at(8));
        }
    });

    it('tracks target base addresses per 9-byte element', () => {
        const host = new MemoryHost();
        const addrs = [0x20010d28, 0x20010d50, 0x20010d78];

        for (const addr of addrs) {
            host.setVariable('mem_list_com', 9, makeBlockBytes(0, 0, 0), -1, addr, 9);
        }

        for (let i = 0; i < addrs.length; i++) {
            expect(host.getElementTargetBase('mem_list_com', i)).toBe(addrs.at(i));
        }
    });

    it('clears non-const 9-byte items but preserves const ones', () => {
        const host = new MemoryHost();

        // Non-const items (like mem_list_com — re-read each cycle)
        host.setVariable('mem_list_com', 9, makeBlockBytes(0x100, 41, 0xF1), -1, 0x1000, 9);
        host.setVariable('mem_list_com', 9, makeBlockBytes(0x200, 41, 0xF5), -1, 0x2000, 9);

        // Const item (like cfg_mp_mpool — read once)
        host.setVariable('cfg_const', 4, new Uint8Array([1, 2, 3, 4]), 0, 0x8000, 4, true);

        expect(host.getArrayElementCount('mem_list_com')).toBe(2);

        // Clear non-const
        host.clearNonConst();

        // mem_list_com should be gone
        expect(host.read('mem_list_com', 0, 9)).toBeUndefined();
        expect(host.getArrayElementCount('mem_list_com')).toBe(1); // defaults to 1 when unknown

        // cfg_const should survive
        expect(host.read('cfg_const', 0, 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('re-populates from scratch after clearNonConst', () => {
        const host = new MemoryHost();

        // Cycle 1: 3 items
        host.setVariable('items', 9, makeBlockBytes(0x100, 41, 0xF1), -1, 0x1000, 9);
        host.setVariable('items', 9, makeBlockBytes(0x200, 41, 0xF5), -1, 0x2000, 9);
        host.setVariable('items', 9, makeBlockBytes(0, 30000, 0), -1, 0x9000, 9);
        expect(host.getArrayElementCount('items')).toBe(3);

        // Cycle 2: clear and repopulate with 5 items
        host.clearNonConst();
        expect(host.getArrayElementCount('items')).toBe(1); // default

        host.setVariable('items', 9, makeBlockBytes(0x100, 41, 0xF1), -1, 0x1000, 9);
        host.setVariable('items', 9, makeBlockBytes(0x200, 41, 0xF5), -1, 0x2000, 9);
        host.setVariable('items', 9, makeBlockBytes(0x300, 41, 0xF1), -1, 0x3000, 9);
        host.setVariable('items', 9, makeBlockBytes(0x400, 41, 0xF3), -1, 0x4000, 9);
        host.setVariable('items', 9, makeBlockBytes(0, 28000, 0), -1, 0x9000, 9);
        expect(host.getArrayElementCount('items')).toBe(5);

        // Verify new data is correct
        expect(host.getElementTargetBase('items', 2)).toBe(0x3000);

        // Read id byte of 3rd element (index 2, offset = 2*9 + 8 = 26)
        const id = host.read('items', 26, 1);
        expect(id![0]).toBe(0xF1);
    });
});

describe('MemoryHost – read for mem_block_t members', () => {
    it('reads uint32 len field and uint8 id field from appended 9-byte items', () => {
        const host = new MemoryHost();
        const block = makeBlockBytes(0x20010d50, 0x29 | 1, 0xF1); // len=41, allocated
        host.setVariable('bl', 9, block, -1, 0x20010d28, 9);

        // Read len as uint32 (offset 4)
        const lenBytes = host.read('bl', 4, 4);
        expect(lenBytes).toBeDefined();
        const lenVal = leToNumber(lenBytes!);
        expect(lenVal).toBe(0x29 | 1);

        // Read id as uint8 (offset 8)
        const idBytes = host.read('bl', 8, 1);
        expect(idBytes).toBeDefined();
        expect(idBytes![0]).toBe(0xF1);

        // Check len & 1 (allocated flag)
        expect(lenVal & 1).toBe(1);
    });

    it('reads the last element (sentinel) len correctly', () => {
        const host = new MemoryHost();
        // Simulate appending: 2 allocated blocks + sentinel
        host.setVariable('bl', 9, makeBlockBytes(0x2000, 41 | 1, 0xF1), -1, 0x1000, 9);
        host.setVariable('bl', 9, makeBlockBytes(0x9000, 41 | 1, 0xF5), -1, 0x2000, 9);
        host.setVariable('bl', 9, makeBlockBytes(0, 6552, 0), -1, 0x9000, 9);

        const count = host.getArrayElementCount('bl');
        expect(count).toBe(3);

        // The SCVD calc: mem_head_com.max_used = mem_list_com[_count-1].len
        // Last element (index 2) len at offset = 2*9 + 4 = 22
        const lastLenBytes = host.read('bl', (count - 1) * 9 + 4, 4);
        expect(lastLenBytes).toBeDefined();
        expect(leToNumber(lastLenBytes!)).toBe(6552);
    });
});

describe('MemoryHost – virtual size with 9-byte items', () => {
    it('pads 9-byte data to virtualSize when virtualSize > data size', () => {
        const host = new MemoryHost();
        // virtualSize = 12 (pad 3 extra bytes)
        const block = makeBlockBytes(0x100, 41, 0xF5);
        host.setVariable('padded', 9, block, 0, undefined, 12);

        // Read 12 bytes: first 9 are data, last 3 are zero
        const raw = host.read('padded', 0, 12);
        expect(raw).toBeDefined();
        expect(raw!.subarray(0, 9)).toEqual(block);
        expect(raw!.subarray(9, 12)).toEqual(new Uint8Array([0, 0, 0]));
    });

    it('append with virtualSize=9 produces correct element offsets', () => {
        const host = new MemoryHost();
        host.setVariable('arr', 9, makeBlockBytes(0, 0, 0xF1), -1, 0x1000, 9);
        host.setVariable('arr', 9, makeBlockBytes(0, 0, 0xF2), -1, 0x2000, 9);
        host.setVariable('arr', 9, makeBlockBytes(0, 0, 0xF3), -1, 0x3000, 9);

        // Element 0 starts at offset 0, element 1 at offset 9, element 2 at offset 18
        expect(host.getElementTargetBase('arr', 0)).toBe(0x1000);
        expect(host.getElementTargetBase('arr', 1)).toBe(0x2000);
        expect(host.getElementTargetBase('arr', 2)).toBe(0x3000);
    });
});

describe('MemoryHost – edge cases with the readlist _count-1 pattern', () => {
    it('correctly handles _count and accessing last element in SCVD pattern', () => {
        const host = new MemoryHost();

        // Simulate the exact RTX pattern: append blocks, then access [_count-1]
        const blocks = [
            { addr: 0x20010d28, data: makeBlockBytes(0x20010d50, 41 | 1, 0xF5) },
            { addr: 0x20010d50, data: makeBlockBytes(0x20010d78, 41 | 1, 0xF1) },
            { addr: 0x20010d78, data: makeBlockBytes(0x20010da0, 41 | 1, 0xF1) },
            { addr: 0x20010da0, data: makeBlockBytes(0x20010dc8, 41 | 1, 0xF1) },
            { addr: 0x20010dc8, data: makeBlockBytes(0x20018d18, 41 | 1, 0xF1) },
            { addr: 0x20018d18, data: makeBlockBytes(0, 6552, 0) }, // sentinel
        ];

        for (const block of blocks) {
            host.setVariable('mem_list_com', 9, block.data, -1, block.addr, 9);
        }

        const count = host.getArrayElementCount('mem_list_com');
        expect(count).toBe(6);

        // List loop: i from 0 to _count-2 (skip sentinel)
        for (let i = 0; i < count - 1; i++) {
            const addr = host.getElementTargetBase('mem_list_com', i);
            const blockEntry = blocks.at(i);
            expect(addr).toBe(blockEntry?.addr);

            // Read len and id bytes to check condition (len & 1) && (id == 0xF1)
            const lenBytes = host.read('mem_list_com', i * 9 + 4, 4);
            const len = lenBytes ? leToNumber(lenBytes) : 0;
            const idBytes = host.read('mem_list_com', i * 9 + 8, 1);
            const id = idBytes ? idBytes[0] : 0;

            expect(len & 1).toBe(1); // all allocated
            expect(id).toBe(blockEntry?.data.at(8));
        }

        // max_used = last element's len
        const lastIdx = count - 1;
        const lastLenBytes = host.read('mem_list_com', lastIdx * 9 + 4, 4);
        expect(lastLenBytes).toBeDefined();
        expect(leToNumber(lastLenBytes!)).toBe(6552);
    });
});
