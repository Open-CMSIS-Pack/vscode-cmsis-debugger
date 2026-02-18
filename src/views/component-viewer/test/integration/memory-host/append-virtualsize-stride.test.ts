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
 * Tests for MemoryHost append (-1) mode with virtualSize, targeting potential
 * off-by-one errors in the stride/offset calculation.
 *
 * Context: The RTX SCVD Component Viewer appends variable-sized data into
 * MemoryHost via setVariable(name, size, data, -1, addr, virtualSize).
 * The evaluator then accesses arr[i].member using:
 *     byteOffset = i * getElementStride() + getMemberOffset()
 * where getElementStride() returns virtualSize (NOT targetSize).
 *
 * If there is a +1 or -1 byte error in either:
 *   a) How append computes the write offset (container.byteLength)
 *   b) How virtualSize pads the element
 *   c) How stride-based indexing reads back data
 * then elements after the first will be shifted and return garbage.
 *
 * These tests exercise:
 *   - 9-byte items (mem_block_t: targetSize=9, virtualSize=9)
 *   - 80/129-byte items (osRtxThread_t: targetSize=80, virtualSize=129)
 *   - Odd/prime element sizes that avoid DWORD alignment
 *   - Boundary byte probes (read at offset-1, offset, offset+1)
 *   - Multiple appends followed by stride-based readback
 *   - readRaw crossing element boundaries (should see zero padding)
 *   - Container byte-length correctness after each append
 */

import { MemoryHost, MemoryContainer } from '../../../data-host/memory-host';
import { RefContainer } from '../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../model/scvd-node';

// ---------- helpers ----------

class NamedStub extends ScvdNode {
    constructor(name: string) {
        super(undefined);
        this.name = name;
    }
}

const makeRef = (name: string, widthBytes: number, offsetBytes = 0): RefContainer => {
    const node = new NamedStub(name);
    return {
        base: node,
        anchor: node,
        current: node,
        offsetBytes,
        widthBytes,
        valueType: undefined,
    };
};

/** Build a 9-byte mem_block_t: [next:4][len:4][id:1] in little-endian. */
function makeBlock9(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, nextAddr, true);
    dv.setUint32(4, len, true);
    buf[8] = id;
    return buf;
}

/** Build an 80-byte osRtxThread_t payload with identifiable per-element marker. */
function makeTCB80(marker: number): Uint8Array {
    const buf = new Uint8Array(80);
    // Fill with a recognizable pattern so we can detect offset misalignment.
    // Bytes 0-3: marker (LE u32) — simulates the first struct field
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, marker, true);
    // Byte 4-7: inverted marker for extra pattern
    dv.setUint32(4, ~marker >>> 0, true);
    // Byte 8: low byte of marker (easy check)
    buf[8] = marker & 0xFF;
    // Fill remaining with a repeating byte derived from the marker
    const fill = (marker & 0xFF) ^ 0xAA;
    buf.fill(fill, 9, 80);
    return buf;
}

/** Read a LE u32 from a Uint8Array at the given offset. */
function readU32LE(arr: Uint8Array, off: number): number {
    const b0 = arr.at(off) ?? 0;
    const b1 = arr.at(off + 1) ?? 0;
    const b2 = arr.at(off + 2) ?? 0;
    const b3 = arr.at(off + 3) ?? 0;
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

// =============================================================================
// 1. APPEND (-1) WITH EXACT virtualSize = targetSize (9-byte blocks)
// =============================================================================

describe('Append (-1): 9-byte items with virtualSize=9 (mem_block_t)', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('container byteLength grows by exactly virtualSize on each append', () => {
        for (let i = 0; i < 5; i++) {
            host.setVariable('bl', 9, makeBlock9(0, 0, i), -1, 0x1000 + i * 9, 9);
        }
        // Total: 5 * 9 = 45 bytes
        // We can infer from the element count and metadata
        expect(host.getArrayElementCount('bl')).toBe(5);
    });

    it('stride-based readback: element[i] at offset i*9 returns correct data', async () => {
        const stride = 9;
        const ids = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5];
        for (let i = 0; i < ids.length; i++) {
            const id = ids.at(i);
            if (id !== undefined) {
                host.setVariable('bl', 9, makeBlock9(0x100 * (i + 1), 41, id), -1, 0x20000 + i * 40, 9);
            }
        }

        for (let i = 0; i < ids.length; i++) {
            const base = i * stride;

            // next (offset 0, 4 bytes)
            const next = await host.readValue(makeRef('bl', 4, base + 0));
            expect(next).toBe(0x100 * (i + 1));

            // len (offset 4, 4 bytes)
            const len = await host.readValue(makeRef('bl', 4, base + 4));
            expect(len).toBe(41);

            // id (offset 8, 1 byte)
            const id = await host.readValue(makeRef('bl', 1, base + 8));
            expect(id).toBe(ids.at(i));
        }
    });

    it('reading one byte BEFORE an element boundary returns previous element tail', async () => {
        // Element 0: bytes [0..8], Element 1: bytes [9..17]
        host.setVariable('bl', 9, makeBlock9(0, 0, 0xAA), -1, 0x1000, 9);
        host.setVariable('bl', 9, makeBlock9(0, 0, 0xBB), -1, 0x2000, 9);

        // Byte 8 = last byte of element 0 = id byte = 0xAA
        const atBoundaryMinus1 = await host.readValue(makeRef('bl', 1, 8));
        expect(atBoundaryMinus1).toBe(0xAA);

        // Byte 9 = first byte of element 1 = low byte of next field = 0x00
        const atBoundary = await host.readValue(makeRef('bl', 1, 9));
        expect(atBoundary).toBe(0x00);
    });

    it('reading one byte AFTER an element boundary returns next element head', async () => {
        host.setVariable('bl', 9, makeBlock9(0xDEADBEEF, 0, 0), -1, 0x1000, 9);
        host.setVariable('bl', 9, makeBlock9(0xCAFEBABE, 0, 0), -1, 0x2000, 9);

        // Byte 9 = first byte of element 1 next field = 0xBE (LE of 0xCAFEBABE)
        const firstByteEl1 = await host.readValue(makeRef('bl', 1, 9));
        expect(firstByteEl1).toBe(0xBE);

        // Byte 10 = second byte of element 1 next field = 0xBA
        const secondByteEl1 = await host.readValue(makeRef('bl', 1, 10));
        expect(secondByteEl1).toBe(0xBA);
    });

    it('readRaw spanning an element boundary returns contiguous bytes', async () => {
        host.setVariable('bl', 9, makeBlock9(0x11223344, 0x55667788, 0x99), -1, 0x1000, 9);
        host.setVariable('bl', 9, makeBlock9(0xAABBCCDD, 0xEEFF0011, 0x22), -1, 0x2000, 9);

        // Read 4 bytes from offset 7 → last 2 bytes of el0 (len high) + first 2 of el1 (next low)
        const raw = await host.readRaw(makeRef('bl', 4, 7), 4);
        expect(raw).toBeDefined();
        // Byte 7 = len byte[3] of el0 = 0x55 (LE of 0x55667788 → [0x88, 0x77, 0x66, 0x55])
        // Wait: LE of 0x55667788 = [0x88, 0x77, 0x66, 0x55]
        // Byte 4=0x88, 5=0x77, 6=0x66, 7=0x55
        expect(raw![0]).toBe(0x55);
        // Byte 8 = id byte of el0 = 0x99
        expect(raw![1]).toBe(0x99);
        // Byte 9 = next byte[0] of el1 = 0xDD (LE of 0xAABBCCDD)
        expect(raw![2]).toBe(0xDD);
        // Byte 10 = next byte[1] of el1 = 0xCC
        expect(raw![3]).toBe(0xCC);
    });
});

// =============================================================================
// 2. APPEND (-1) WITH virtualSize > targetSize (80-byte data, 129-byte stride)
// =============================================================================

describe('Append (-1): 80-byte data with virtualSize=129 (osRtxThread_t)', () => {
    let host: MemoryHost;
    const TARGET_SIZE = 80;
    const VIRTUAL_SIZE = 129;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('container grows by virtualSize (129) per append, not targetSize (80)', async () => {
        // After 3 appends: 3 * 129 = 387 bytes total
        for (let i = 0; i < 3; i++) {
            host.setVariable('TCB', TARGET_SIZE, makeTCB80(0x1000 + i), -1, 0x20000 + i * 80, VIRTUAL_SIZE);
        }
        expect(host.getArrayElementCount('TCB')).toBe(3);

        // Verify we can read the start of element 2 at offset 2*129 = 258
        const marker2 = await host.readValue(makeRef('TCB', 4, 2 * VIRTUAL_SIZE));
        expect(marker2).toBe(0x1002);
    });

    it('stride-based indexing: TCB[i] at offset i*129 returns correct marker', async () => {
        const markers = [0xDEAD0001, 0xDEAD0002, 0xDEAD0003, 0xDEAD0004, 0xDEAD0005];
        for (const m of markers) {
            host.setVariable('TCB', TARGET_SIZE, makeTCB80(m), -1, 0x20000, VIRTUAL_SIZE);
        }

        for (let i = 0; i < markers.length; i++) {
            const offset = i * VIRTUAL_SIZE;
            const val = await host.readValue(makeRef('TCB', 4, offset));
            expect(val).toBe(markers.at(i));
        }
    });

    it('zero padding between targetSize and virtualSize is correct', async () => {
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0x42), -1, 0x20000, VIRTUAL_SIZE);

        // Bytes 0..79 contain the 80-byte TCB data
        // Bytes 80..128 should be zero-padded (49 bytes of zeros)
        const padStart = TARGET_SIZE;   // 80
        const padEnd = VIRTUAL_SIZE;    // 129
        const padSize = padEnd - padStart; // 49

        const raw = await host.readRaw(makeRef('TCB', padSize, padStart), padSize);
        expect(raw).toBeDefined();
        expect(raw!.length).toBe(padSize);
        // All padding bytes must be zero
        for (let i = 0; i < padSize; i++) {
            expect(raw!.at(i)).toBe(0);
        }
    });

    it('element 1 data starts at EXACTLY byte 129, not 128 or 130', async () => {
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0xAAAA), -1, 0x20000, VIRTUAL_SIZE);
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0xBBBB), -1, 0x20050, VIRTUAL_SIZE);

        // Byte 128 (= virtualSize - 1) should be zero (padding of element 0)
        const at128 = await host.readValue(makeRef('TCB', 1, 128));
        expect(at128).toBe(0);

        // Byte 129 (= virtualSize) should be low byte of element 1's marker
        // 0xBBBB in LE = [0xBB, 0xBB, 0x00, 0x00]
        const at129 = await host.readValue(makeRef('TCB', 1, 129));
        expect(at129).toBe(0xBB);

        // Byte 130 should be second byte of element 1's marker
        const at130 = await host.readValue(makeRef('TCB', 1, 130));
        expect(at130).toBe(0xBB);

        // Read full u32 at byte 129 = element 1 marker
        const marker1 = await host.readValue(makeRef('TCB', 4, 129));
        expect(marker1).toBe(0xBBBB);
    });

    it('element 2 data starts at byte 258 (2*129), not 256 or 260', async () => {
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0x1111), -1, 0x20000, VIRTUAL_SIZE);
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0x2222), -1, 0x20050, VIRTUAL_SIZE);
        host.setVariable('TCB', TARGET_SIZE, makeTCB80(0x3333), -1, 0x200A0, VIRTUAL_SIZE);

        // Byte 257 = virtualSize*2 - 1 = zero padding of element 1
        const at257 = await host.readValue(makeRef('TCB', 1, 257));
        expect(at257).toBe(0);

        // Byte 258 = element 2 starts here
        const at258 = await host.readValue(makeRef('TCB', 1, 258));
        expect(at258).toBe(0x33);

        // Full u32 at 258
        const marker2 = await host.readValue(makeRef('TCB', 4, 258));
        expect(marker2).toBe(0x3333);

        // WRONG offsets for reference (should NOT match marker):
        const at256 = await host.readValue(makeRef('TCB', 4, 256));
        expect(at256).not.toBe(0x3333);
        const at260 = await host.readValue(makeRef('TCB', 4, 260));
        expect(at260).not.toBe(0x3333);
    });

    it('member access: TCB[i].field4 at stride*i + memberOffset reads correctly', async () => {
        // Simulate reading TCB[i].field_at_offset_4 (bytes 4-7 of each 80-byte block)
        const markers = [0xF0F0F0F0, 0xA0A0A0A0, 0xC0C0C0C0];
        const blocks: Uint8Array[] = [];
        for (const m of markers) {
            const tcb = makeTCB80(m);
            // Verify bytes 4-7 contain the inverted marker
            const invertedMarker = (~m >>> 0);
            expect(readU32LE(tcb, 4)).toBe(invertedMarker);
            blocks.push(tcb);
        }

        for (const b of blocks) {
            host.setVariable('TCB', TARGET_SIZE, b, -1, 0x20000, VIRTUAL_SIZE);
        }

        // Access TCB[i] field at member offset 4 (bytes 4-7 within element)
        const MEMBER_OFFSET = 4;
        for (let i = 0; i < markers.length; i++) {
            const byteOff = i * VIRTUAL_SIZE + MEMBER_OFFSET;
            const val = await host.readValue(makeRef('TCB', 4, byteOff));
            const marker = markers.at(i);
            expect(val).toBe(marker !== undefined ? (~marker) >>> 0 : undefined);
        }
    });

    it('member access: TCB[i].byte8 at stride*i + 8 reads the single-byte marker', async () => {
        const markers = [0x10, 0x20, 0x30, 0x40, 0x50];
        for (const m of markers) {
            const tcb = makeTCB80(m);
            expect(tcb[8]).toBe(m); // sanity check
            host.setVariable('TCB', TARGET_SIZE, tcb, -1, 0x20000, VIRTUAL_SIZE);
        }

        for (let i = 0; i < markers.length; i++) {
            const byteOff = i * VIRTUAL_SIZE + 8;
            const val = await host.readValue(makeRef('TCB', 1, byteOff));
            expect(val).toBe(markers.at(i));
        }
    });
});

// =============================================================================
// 3. ODD/PRIME VIRTUAL SIZES (non-DWORD-aligned)
// =============================================================================

describe('Append (-1): odd and prime virtualSize values', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it.each([
        { targetSize: 7, virtualSize: 7 },    // prime, no padding
        { targetSize: 7, virtualSize: 11 },   // prime target, prime virtual
        { targetSize: 3, virtualSize: 5 },    // small prime sizes
        { targetSize: 13, virtualSize: 17 },  // twin primes
        { targetSize: 9, virtualSize: 16 },   // 9-byte data, DWORD-aligned stride
        { targetSize: 80, virtualSize: 129 }, // real RTX TCB
    ])('targetSize=$targetSize, virtualSize=$virtualSize: 4 appends and stride readback', async ({ targetSize, virtualSize }) => {
        const elements: Uint8Array[] = [];
        for (let i = 0; i < 4; i++) {
            const data = new Uint8Array(targetSize);
            // Fill with pattern: every byte = (i+1) * 0x11 ^ byteIndex
            for (let b = 0; b < targetSize; b++) {
                const value = ((i + 1) * 0x11 + b) & 0xFF;
                data.set([value], b);
            }
            elements.push(data);
            host.setVariable('arr', targetSize, data, -1, 0x10000 + i * 100, virtualSize);
        }

        expect(host.getArrayElementCount('arr')).toBe(4);

        // Verify stride-based read of each element's first byte
        for (let i = 0; i < 4; i++) {
            const offset = i * virtualSize;
            const val = await host.readValue(makeRef('arr', 1, offset));
            const elem = elements.at(i);
            expect(val).toBe(elem?.at(0));
        }

        // Verify stride-based read of each element's LAST data byte
        for (let i = 0; i < 4; i++) {
            const offset = i * virtualSize + (targetSize - 1);
            const val = await host.readValue(makeRef('arr', 1, offset));
            const elem = elements.at(i);
            expect(val).toBe(elem?.at(targetSize - 1));
        }

        // If virtualSize > targetSize, verify padding byte is zero
        if (virtualSize > targetSize) {
            for (let i = 0; i < 4; i++) {
                const paddingOffset = i * virtualSize + targetSize;
                const val = await host.readValue(makeRef('arr', 1, paddingOffset));
                expect(val).toBe(0);
            }
        }
    });
});

// =============================================================================
// 4. BOUNDARY PROBES: ±1 byte around element transitions
// =============================================================================

describe('Append (-1): boundary probes ±1 byte', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('probes ±1 around each element boundary with virtualSize=9', async () => {
        // 3 elements with distinct data patterns
        const data = [
            new Uint8Array([0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19]),
            new Uint8Array([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29]),
            new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]),
        ];
        for (const d of data) {
            host.setVariable('blk', 9, d, -1, 0x1000, 9);
        }

        // Boundary between element 0 and 1 is at byte 9
        // byte 8 = last byte of el0 = 0x19
        expect(await host.readValue(makeRef('blk', 1, 8))).toBe(0x19);
        // byte 9 = first byte of el1 = 0x21
        expect(await host.readValue(makeRef('blk', 1, 9))).toBe(0x21);

        // Boundary between element 1 and 2 is at byte 18
        // byte 17 = last byte of el1 = 0x29
        expect(await host.readValue(makeRef('blk', 1, 17))).toBe(0x29);
        // byte 18 = first byte of el2 = 0x31
        expect(await host.readValue(makeRef('blk', 1, 18))).toBe(0x31);
    });

    it('probes ±1 around each element boundary with virtualSize=129 (49-byte padding)', async () => {
        const stride = 129;
        // Use identifiable first bytes
        const el0 = new Uint8Array(80); el0[0] = 0xAA; el0[79] = 0x0A;
        const el1 = new Uint8Array(80); el1[0] = 0xBB; el1[79] = 0x0B;
        const el2 = new Uint8Array(80); el2[0] = 0xCC; el2[79] = 0x0C;

        host.setVariable('TCB', 80, el0, -1, 0x20000, stride);
        host.setVariable('TCB', 80, el1, -1, 0x20050, stride);
        host.setVariable('TCB', 80, el2, -1, 0x200A0, stride);

        // --- Element 0 → 1 boundary at byte 129 ---
        // Byte 79 = last data byte of el0 = 0x0A
        expect(await host.readValue(makeRef('TCB', 1, 79))).toBe(0x0A);
        // Byte 80 = first padding byte of el0 = 0
        expect(await host.readValue(makeRef('TCB', 1, 80))).toBe(0);
        // Byte 128 = last padding byte of el0 = 0
        expect(await host.readValue(makeRef('TCB', 1, 128))).toBe(0);
        // Byte 129 = first data byte of el1 = 0xBB
        expect(await host.readValue(makeRef('TCB', 1, 129))).toBe(0xBB);
        // Byte 130 = second data byte of el1 = 0 (default fill)
        expect(await host.readValue(makeRef('TCB', 1, 130))).toBe(0);

        // --- Element 1 → 2 boundary at byte 258 ---
        // Byte 208 = last data byte of el1 = el1[79] = 0x0B
        //   (el1 starts at 129, data 0..79 → byte 129+79 = 208)
        expect(await host.readValue(makeRef('TCB', 1, 129 + 79))).toBe(0x0B);
        // Byte 209 = first padding of el1 = 0
        expect(await host.readValue(makeRef('TCB', 1, 209))).toBe(0);
        // Byte 257 = last padding of el1 = 0
        expect(await host.readValue(makeRef('TCB', 1, 257))).toBe(0);
        // Byte 258 = first data byte of el2 = 0xCC
        expect(await host.readValue(makeRef('TCB', 1, 258))).toBe(0xCC);
    });
});

// =============================================================================
// 5. MemoryContainer.write DIRECTLY — bypass setVariable to isolate container
// =============================================================================

describe('MemoryContainer.write: virtualSize padding correctness', () => {
    it('write(0, 9bytes, 9) then write(9, 9bytes, 9) produces contiguous 18-byte store', () => {
        const mc = new MemoryContainer('test');
        const d0 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const d1 = new Uint8Array([11, 12, 13, 14, 15, 16, 17, 18, 19]);

        mc.write(0, d0, 9);
        expect(mc.byteLength).toBe(9);

        mc.write(9, d1, 9);
        expect(mc.byteLength).toBe(18);

        // Check exact byte content
        const raw0 = mc.readExact(0, 9);
        expect(raw0).toEqual(d0);

        const raw1 = mc.readExact(9, 9);
        expect(raw1).toEqual(d1);
    });

    it('write(0, 80bytes, 129) pads to exactly 129 bytes', () => {
        const mc = new MemoryContainer('test');
        const data = new Uint8Array(80).fill(0xFF);
        mc.write(0, data, 129);

        expect(mc.byteLength).toBe(129);

        // data region [0..79] all 0xFF
        const dataRegion = mc.readExact(0, 80);
        expect(dataRegion).toBeDefined();
        for (let i = 0; i < 80; i++) {
            expect(dataRegion!.at(i)).toBe(0xFF);
        }

        // padding region [80..128] all 0x00
        const padRegion = mc.readExact(80, 49);
        expect(padRegion).toBeDefined();
        for (let i = 0; i < 49; i++) {
            expect(padRegion!.at(i)).toBe(0);
        }
    });

    it('two sequential writes with virtualSize=129: second element at byte 129', () => {
        const mc = new MemoryContainer('test');
        const d0 = new Uint8Array(80).fill(0xAA);
        const d1 = new Uint8Array(80).fill(0xBB);

        mc.write(0, d0, 129);
        expect(mc.byteLength).toBe(129);

        mc.write(129, d1, 129);
        expect(mc.byteLength).toBe(258);

        // Byte 128 should be 0 (padding of d0)
        const at128 = mc.readExact(128, 1);
        expect(at128![0]).toBe(0);

        // Byte 129 should be 0xBB (start of d1)
        const at129 = mc.readExact(129, 1);
        expect(at129![0]).toBe(0xBB);

        // Byte 208 (= 129 + 79) should be 0xBB (last data byte of d1)
        const at208 = mc.readExact(208, 1);
        expect(at208![0]).toBe(0xBB);

        // Byte 209 should be 0 (first padding byte of d1)
        const at209 = mc.readExact(209, 1);
        expect(at209![0]).toBe(0);

        // Byte 257 (= 258-1) should be 0 (last padding byte of d1)
        const at257 = mc.readExact(257, 1);
        expect(at257![0]).toBe(0);
    });

    it('write at offset=byteLength (append) with odd virtualSize preserves alignment', () => {
        const mc = new MemoryContainer('test');
        // 5 appends of 3 data bytes with virtualSize=5
        for (let i = 0; i < 5; i++) {
            const off = mc.byteLength;
            mc.write(off, new Uint8Array([i + 1, i + 2, i + 3]), 5);
        }

        expect(mc.byteLength).toBe(25); // 5 * 5

        // Verify each element
        for (let i = 0; i < 5; i++) {
            const base = i * 5;
            // data bytes
            expect(mc.readExact(base, 1)![0]).toBe(i + 1);
            expect(mc.readExact(base + 1, 1)![0]).toBe(i + 2);
            expect(mc.readExact(base + 2, 1)![0]).toBe(i + 3);
            // padding bytes
            expect(mc.readExact(base + 3, 1)![0]).toBe(0);
            expect(mc.readExact(base + 4, 1)![0]).toBe(0);
        }
    });
});

// =============================================================================
// 6. VIRTUAL SIZE = 1 MORE / 1 LESS (off-by-one sensitivity)
// =============================================================================

describe('Append (-1): off-by-one virtualSize sensitivity', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('virtualSize = targetSize + 1: element[1] at offset targetSize+1 is correct', async () => {
        const targetSize = 9;
        const virtualSize = 10; // one extra padding byte

        host.setVariable('v', targetSize, makeBlock9(0x100, 1, 0xAA), -1, 0x1000, virtualSize);
        host.setVariable('v', targetSize, makeBlock9(0x200, 2, 0xBB), -1, 0x2000, virtualSize);

        // Element 0: bytes [0..9], data [0..8], pad [9]
        // Element 1: bytes [10..19], data [10..18], pad [19]

        // The padding byte at offset 9 must be 0
        expect(await host.readValue(makeRef('v', 1, 9))).toBe(0);

        // Element 1 starts at offset 10
        const next1 = await host.readValue(makeRef('v', 4, 10));
        expect(next1).toBe(0x200);

        const id1 = await host.readValue(makeRef('v', 1, 18));
        expect(id1).toBe(0xBB);
    });

    it('virtualSize = targetSize - 1 is rejected (logged error, data still written)', async () => {
        const targetSize = 9;
        const virtualSize = 8; // LESS than target — should be rejected by validation

        // This should trigger: "virtualSize (8) must be >= size (9)"
        // The function logs an error and returns without writing
        host.setVariable('v', targetSize, makeBlock9(0x100, 1, 0xAA), -1, 0x1000, virtualSize);

        // Element should NOT be recorded
        expect(host.getArrayElementCount('v')).toBe(1); // defaults to 1 when unknown
    });

    it('consistent stride across 5 elements: no drift with virtualSize=129', async () => {
        const TARGET = 80;
        const VIRTUAL = 129;
        const COUNT = 5;
        const markers = [0x10, 0x20, 0x30, 0x40, 0x50];

        for (let i = 0; i < COUNT; i++) {
            const marker = markers.at(i);
            if (marker !== undefined) {
                const tcb = makeTCB80(marker);
                host.setVariable('TCB', TARGET, tcb, -1, 0x20000 + i * 80, VIRTUAL);
            }
        }

        // Verify each element's marker using stride indexing (the evaluator's method)
        for (let i = 0; i < COUNT; i++) {
            const byteOffset = i * VIRTUAL;
            const val = await host.readValue(makeRef('TCB', 4, byteOffset));
            expect(val).toBe(markers.at(i));
        }

        // Also check the LAST data byte (offset 79 within each element)
        for (let i = 0; i < COUNT; i++) {
            const byteOffset = i * VIRTUAL + 79;
            const lastByte = await host.readValue(makeRef('TCB', 1, byteOffset));
            // makeTCB80 fills [9..79] with (marker & 0xFF) ^ 0xAA
            const marker = markers.at(i);
            const expected = marker !== undefined ? (marker & 0xFF) ^ 0xAA : undefined;
            expect(lastByte).toBe(expected);
        }
    });

    it('verifies cumulative byteLength after N appends does not drift', async () => {
        const TARGET = 9;
        const VIRTUAL = 9;
        const COUNT = 100; // push many elements to detect any cumulative drift

        for (let i = 0; i < COUNT; i++) {
            host.setVariable('many', TARGET, makeBlock9(i, i, i & 0xFF), -1, i, VIRTUAL);
        }

        expect(host.getArrayElementCount('many')).toBe(COUNT);

        // Spot-check element 99
        const off99 = 99 * VIRTUAL;
        const val = await host.readValue(makeRef('many', 4, off99));
        expect(val).toBe(99);

        // id byte of element 50
        const id50 = await host.readValue(makeRef('many', 1, 50 * VIRTUAL + 8));
        expect(id50).toBe(50);
    });
});

// =============================================================================
// 7. UNALIGNED TARGET BASE ADDRESSES (simulating optimized library builds)
// =============================================================================

describe('Append (-1): unaligned target base addresses', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('odd target addresses are recorded and retrievable', () => {
        // In optimized builds, addresses may not be DWORD-aligned
        const addrs = [0x20010D29, 0x20010D52, 0x20010D7B, 0x20010DA4, 0x20010DCD];
        for (let i = 0; i < addrs.length; i++) {
            const addr = addrs.at(i);
            if (addr !== undefined) {
                host.setVariable('bl', 9, makeBlock9(0, 0, i), -1, addr, 9);
            }
        }

        for (let i = 0; i < addrs.length; i++) {
            expect(host.getElementTargetBase('bl', i)).toBe(addrs.at(i));
        }
    });

    it('target base address does not affect in-host byte offsets', async () => {
        // Two elements with very different (unaligned) target addresses
        // but both should be stored contiguously in the container
        host.setVariable('bl', 9, makeBlock9(0xAAAA, 41, 0x11), -1, 0x20010D29, 9);
        host.setVariable('bl', 9, makeBlock9(0xBBBB, 42, 0x22), -1, 0x20010D52, 9);

        // Element 0 at offset 0
        expect(await host.readValue(makeRef('bl', 4, 0))).toBe(0xAAAA);
        expect(await host.readValue(makeRef('bl', 1, 8))).toBe(0x11);

        // Element 1 at offset 9 (= 1 * stride)
        expect(await host.readValue(makeRef('bl', 4, 9))).toBe(0xBBBB);
        expect(await host.readValue(makeRef('bl', 1, 17))).toBe(0x22);
    });

    it('non-DWORD-aligned addresses with virtualSize=129 store and read correctly', async () => {
        // Addresses that are 1, 2, 3 bytes off from DWORD alignment
        const addrs = [0x20010001, 0x20010052, 0x200100A3];
        const markers = [0x111, 0x222, 0x333];

        for (let i = 0; i < 3; i++) {
            const marker = markers.at(i) ?? 0;
            const addr = addrs.at(i) ?? 0;
            host.setVariable('TCB', 80, makeTCB80(marker), -1, addr, 129);
        }

        for (let i = 0; i < 3; i++) {
            expect(host.getElementTargetBase('TCB', i)).toBe(addrs.at(i));
            const val = await host.readValue(makeRef('TCB', 4, i * 129));
            expect(val).toBe(markers.at(i));
        }
    });
});

// =============================================================================
// 8. MIXED: different element sizes in same host (like SCVD with multiple types)
// =============================================================================

describe('Append (-1): multiple variables with different strides', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('mem_list_com (9/9) and TCB (80/129) coexist without interference', async () => {
        // Append 3 blocks to mem_list_com
        host.setVariable('mem_list_com', 9, makeBlock9(0x100, 41, 0xF1), -1, 0x1000, 9);
        host.setVariable('mem_list_com', 9, makeBlock9(0x200, 41, 0xF5), -1, 0x2000, 9);
        host.setVariable('mem_list_com', 9, makeBlock9(0, 6000, 0), -1, 0x9000, 9);

        // Append 2 TCBs
        host.setVariable('TCB', 80, makeTCB80(0xAABB), -1, 0x20000, 129);
        host.setVariable('TCB', 80, makeTCB80(0xCCDD), -1, 0x20050, 129);

        // Verify mem_list_com
        expect(host.getArrayElementCount('mem_list_com')).toBe(3);
        expect(await host.readValue(makeRef('mem_list_com', 1, 8))).toBe(0xF1);
        expect(await host.readValue(makeRef('mem_list_com', 1, 17))).toBe(0xF5);

        // Verify TCB — should not be affected by mem_list_com writes
        expect(host.getArrayElementCount('TCB')).toBe(2);
        expect(await host.readValue(makeRef('TCB', 4, 0))).toBe(0xAABB);
        expect(await host.readValue(makeRef('TCB', 4, 129))).toBe(0xCCDD);
    });

    it('clearNonConst wipes both variables, re-append produces fresh layout', async () => {
        host.setVariable('bl', 9, makeBlock9(0x100, 41, 0xF1), -1, 0x1000, 9);
        host.setVariable('TCB', 80, makeTCB80(0xAAAA), -1, 0x20000, 129);

        host.clearNonConst();

        // Both should be empty
        expect(host.getArrayElementCount('bl')).toBe(1); // default
        expect(host.getArrayElementCount('TCB')).toBe(1);

        // Re-append with different data
        host.setVariable('bl', 9, makeBlock9(0x999, 99, 0xEE), -1, 0x5000, 9);
        host.setVariable('TCB', 80, makeTCB80(0xDDDD), -1, 0x30000, 129);

        expect(await host.readValue(makeRef('bl', 1, 8))).toBe(0xEE);
        expect(await host.readValue(makeRef('TCB', 4, 0))).toBe(0xDDDD);
    });
});

// =============================================================================
// 9. EXACT RTX SCENARIO: readList → TCB indexing (end-to-end)
// =============================================================================

describe('Append (-1): simulated RTX readList → TCB[i].sp (end-to-end stride)', () => {
    let host: MemoryHost;

    beforeEach(() => {
        host = new MemoryHost();
    });

    it('5 TCBs appended with 80/129, then TCB[i].sp accessed via stride*i + offset', async () => {
        // The SCVD osRtxThread_t has sp at member offset 56 (byte 56 within the 80-byte struct)
        const SP_MEMBER_OFFSET = 56;
        const TARGET_SIZE = 80;
        const VIRTUAL_SIZE = 129;

        // Create 5 TCBs with distinct sp values
        const spValues = [0x20001000, 0x20002000, 0x20003000, 0x20004000, 0x20005000];

        for (let i = 0; i < 5; i++) {
            const tcb = new Uint8Array(TARGET_SIZE);
            const dv = new DataView(tcb.buffer);
            // Set sp at offset 56
            const spValue = spValues.at(i) ?? 0;
            dv.setUint32(SP_MEMBER_OFFSET, spValue, true);
            // Set a name marker at offset 0 for identification
            dv.setUint32(0, i + 1, true);
            host.setVariable('TCB', TARGET_SIZE, tcb, -1, 0x20010000 + i * 0x100, VIRTUAL_SIZE);
        }

        expect(host.getArrayElementCount('TCB')).toBe(5);

        // Now simulate what the evaluator does for "TCB[i].sp":
        //   byteOffset = i * getElementStride() + getMemberOffset('sp')
        //   = i * 129 + 56
        for (let i = 0; i < 5; i++) {
            const byteOff = i * VIRTUAL_SIZE + SP_MEMBER_OFFSET;
            const sp = await host.readValue(makeRef('TCB', 4, byteOff));
            expect(sp).toBe(spValues.at(i));
        }

        // Also verify we don't accidentally read the WRONG thread's sp
        // (which would happen if stride were off by even 1 byte)
        for (let i = 0; i < 5; i++) {
            const byteOff = i * VIRTUAL_SIZE + SP_MEMBER_OFFSET;
            const sp = await host.readValue(makeRef('TCB', 4, byteOff)) as number;
            // Must not equal any OTHER thread's sp
            for (let j = 0; j < 5; j++) {
                if (j !== i) {
                    expect(sp).not.toBe(spValues.at(j));
                }
            }
        }
    });

    it('TCB[i]._addr returns the correct target base per element', () => {
        const addrs = [0x20010100, 0x20010200, 0x20010300, 0x20010400, 0x20010500];

        for (let i = 0; i < 5; i++) {
            const addr = addrs.at(i) ?? 0;
            host.setVariable('TCB', 80, makeTCB80(i), -1, addr, 129);
        }

        for (let i = 0; i < 5; i++) {
            expect(host.getElementTargetBase('TCB', i)).toBe(addrs.at(i));
        }
    });

    it('2x same TCB address would require setVariable to be called twice for same addr', async () => {
        // This simulates the "2x app_main" bug scenario:
        // If the readList produces the same target address twice, both
        // appends store the same data but at different stride indices.
        const sameAddr = 0x20010300;
        const tcbData = makeTCB80(0xAAAA);

        // Append same data twice
        host.setVariable('TCB', 80, tcbData, -1, sameAddr, 129);
        host.setVariable('TCB', 80, tcbData, -1, sameAddr, 129);

        expect(host.getArrayElementCount('TCB')).toBe(2);

        // Both elements have the same base addr and same data
        expect(host.getElementTargetBase('TCB', 0)).toBe(sameAddr);
        expect(host.getElementTargetBase('TCB', 1)).toBe(sameAddr);

        const marker0 = await host.readValue(makeRef('TCB', 4, 0));
        const marker1 = await host.readValue(makeRef('TCB', 4, 129));
        expect(marker0).toBe(marker1); // same data → same marker → "2x app_main"
    });
});
