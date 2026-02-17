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
 * Deep integration tests for TargetReadCache:
 *  - 9-byte (unaligned) reads/writes and gathering
 *  - merge behaviour for overlapping and adjacent segments
 *  - prefetch cycle correctness (stale → fresh transitions)
 *  - interaction between prefetch and on-demand reads
 *
 * These tests model the real RTX SCVD scenario where
 *   · mem_list_com reads 9-byte mem_block_t structures
 *   · TCB/MCB reads of 80/28 bytes overlap with the 9-byte reads
 *   · prefetch merges the two into a single range for cycle 2
 */

import { TargetReadCache } from '../../target-read-cache';

// ---------- helpers ----------

/** Build little-endian 4-byte pointer value inside a 9-byte mem_block_t. */
function makeBlock(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    view.setUint32(0, nextAddr, true);   // next pointer
    view.setUint32(4, len, true);        // len (LSB = allocated flag)
    buf[8] = id;                         // object identifier
    return buf;
}

/** Extract little-endian 32-bit next pointer from first 4 bytes. */
function extractNext(data: Uint8Array): number {
    return (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
}

/** Fill `size` bytes starting at `addr` inside a flat target memory map. */
function fillTargetMemory(mem: Map<string, number>, addr: number, data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        mem.set(`${addr + i}`, data[i]);
    }
}

/** Read `size` bytes from flat target memory starting at `addr`. */
function readTargetMemory(mem: Map<string, number>, addr: number, size: number): Uint8Array {
    const result = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        const value = mem.get(`${addr + i}`) ?? 0;
        // eslint-disable-next-line security/detect-object-injection
        result[i] = value;
    }
    return result;
}

// ---------- test data ----------

// Addresses matching the real RTX5 library-build log (part2)
const BLOCK_ADDRS = [0x20010d28, 0x20010d50, 0x20010d78, 0x20010da0, 0x20010dc8];
const SENTINEL_ADDR = 0x20018d18;

describe('TargetReadCache – 9-byte unaligned reads', () => {
    it('writes and reads back 9-byte blocks at non-aligned addresses', () => {
        const cache = new TargetReadCache();
        const block = makeBlock(0x20010d50, 41, 0xF5);
        cache.write(0x20010d28, block);

        const result = cache.read(0x20010d28, 9);
        expect(result).toEqual(block);
    });

    it('reads 4-byte sub-range from a 9-byte segment (next pointer extraction)', () => {
        const cache = new TargetReadCache();
        const block = makeBlock(0xDEADBEEF, 41, 0xF1);
        cache.write(0x100, block);

        // Extract the next pointer (first 4 bytes)
        const sub = cache.read(0x100, 4);
        expect(sub).toBeDefined();
        expect(extractNext(sub!)).toBe(0xDEADBEEF);

        // Extract the id byte (offset 8, 1 byte)
        const idByte = cache.read(0x108, 1);
        expect(idByte).toBeDefined();
        expect(idByte![0]).toBe(0xF1);
    });

    it('keeps separate non-adjacent 9-byte segments (gap > 0 with PREFETCH_GAP=0)', () => {
        const cache = new TargetReadCache();
        const block1 = makeBlock(0x20010d50, 41, 0xF5);
        const block2 = makeBlock(0x20010d78, 41, 0xF1);
        cache.write(0x20010d28, block1);
        cache.write(0x20010d50, block2);

        // Gap between segments: 0x20010d50 - (0x20010d28+9) = 0x20010d50 - 0x20010d31 = 31 bytes
        // With PREFETCH_GAP=0 they should NOT merge — but write() merges overlapping/adjacent only
        // Since gap > 0 they stay separate

        expect(cache.read(0x20010d28, 9)).toEqual(block1);
        expect(cache.read(0x20010d50, 9)).toEqual(block2);

        // Cross-boundary read should fail (not covered)
        expect(cache.read(0x20010d28, 20)).toBeUndefined();
    });

    it('detects missing ranges between non-adjacent 9-byte segments', () => {
        const cache = new TargetReadCache();
        cache.write(0x20010d28, makeBlock(0x20010d50, 41, 0xF5));
        cache.write(0x20010d50, makeBlock(0x20010d78, 41, 0xF1));

        const missing = cache.getMissingRanges(0x20010d28, 0x20010d50 + 9 - 0x20010d28);
        // Should report the 31-byte gap
        expect(missing).toEqual([{ start: 0x20010d31, size: 0x20010d50 - 0x20010d31 }]);
    });
});

describe('TargetReadCache – overlapping segment merges', () => {
    it('merges 9-byte block with overlapping 28-byte MCB read (1-byte overlap)', () => {
        const cache = new TargetReadCache();

        // mem_list_com reads 9 bytes at 0x20010d28 (mem_block_t: next+len+id)
        const block = makeBlock(0x20010d50, 41, 0xF5);
        cache.write(0x20010d28, block);

        // MCB (Mutex CB) reads 28 bytes at 0x20010d30 (block_addr + 8)
        // This overlaps by 1 byte: byte at 0x20010d30 = id byte = 0xF5
        const mcbData = new Uint8Array(28);
        mcbData[0] = 0xF5;   // id byte (same as block[8])
        for (let i = 1; i < 28; i++) {
            if (i < mcbData.length) {
                const value = 0xAA + i;
                mcbData.set([value], i);
            }
        }
        cache.write(0x20010d30, mcbData);

        // The merged segment should span [0x20010d28, 0x20010d28 + 9 = 0x20010d31)
        //                                ∪ [0x20010d30, 0x20010d30 + 28 = 0x20010d4c)
        //                              = [0x20010d28, 0x20010d4c) = 36 bytes

        // Read back the original 9 bytes
        const readBack = cache.read(0x20010d28, 9);
        expect(readBack).toBeDefined();
        // First 8 bytes: from the block write
        expect(readBack!.subarray(0, 8)).toEqual(block.subarray(0, 8));
        // Byte 8: overwritten by MCB write (MCB data takes priority in mergeSegments)
        expect(readBack![8]).toBe(0xF5);

        // Read the MCB data back
        const mcbRead = cache.read(0x20010d30, 28);
        expect(mcbRead).toEqual(mcbData);

        // Read the full merged range
        const full = cache.read(0x20010d28, 36);
        expect(full).toBeDefined();
        expect(full!.length).toBe(36);
    });

    it('merges 9-byte block with overlapping 80-byte TCB read', () => {
        const cache = new TargetReadCache();

        // mem_block_t at 0x20010d28
        const block = makeBlock(0x20010d50, 0x51, 0xF1); // id=0xF1 = thread
        cache.write(0x20010d28, block);

        // TCB (Thread CB, 80 bytes) at 0x20010d30 (= 0x20010d28 + 8)
        const tcbData = new Uint8Array(80).fill(0x42);
        tcbData[0] = 0xF1;  // id byte
        cache.write(0x20010d30, tcbData);

        // Merged: [0x20010d28, 0x20010d28 + max(9, 8+80)] = [0x20010d28, 0x20010d80) = 88 bytes
        const full = cache.read(0x20010d28, 88);
        expect(full).toBeDefined();
        expect(full!.length).toBe(88);

        // The next 9-byte block at 0x20010d50 is within the TCB's range
        const nextBlock = cache.read(0x20010d50, 9);
        expect(nextBlock).toBeDefined();
        // These bytes come from the TCB data at offset (0x20010d50 - 0x20010d30) = 0x20 = 32
        expect(nextBlock![0]).toBe(tcbData[0x20]);
    });

    it('new write takes priority over old data in overlap region', () => {
        const cache = new TargetReadCache();

        // Write 9 bytes: block header
        const oldBlock = makeBlock(0xAAAAAAAA, 99, 0xFF);
        cache.write(0x1000, oldBlock);

        // Write 4 bytes at offset 0: new next pointer overwrites old
        const newNext = new Uint8Array(4);
        new DataView(newNext.buffer).setUint32(0, 0xBBBBBBBB, true);
        cache.write(0x1000, newNext);

        // Read back: first 4 bytes should be new, bytes 4-8 should be old
        const result = cache.read(0x1000, 9);
        expect(result).toBeDefined();
        expect(extractNext(result!)).toBe(0xBBBBBBBB);
        // len field (offset 4) should still be old
        const lenView = new DataView(result!.buffer, result!.byteOffset + 4, 4);
        expect(lenView.getUint32(0, true)).toBe(99);
        // id should still be old
        expect(result![8]).toBe(0xFF);
    });
});

describe('TargetReadCache – prefetch cycle simulation', () => {
    it('prefetches 9-byte ranges and serves cache hits in cycle 2', async () => {
        const cache = new TargetReadCache();

        // Build target memory with 5 blocks + sentinel
        const targetMem = new Map<string, number>();
        for (let i = 0; i < BLOCK_ADDRS.length; i++) {
            const nextAddr = i < BLOCK_ADDRS.length - 1 ? BLOCK_ADDRS.at(i + 1)! : SENTINEL_ADDR;
            const currentAddr = BLOCK_ADDRS.at(i)!;
            fillTargetMemory(targetMem, currentAddr, makeBlock(nextAddr, 41 | 1, 0xF5));
        }
        fillTargetMemory(targetMem, SENTINEL_ADDR, makeBlock(0, 32552, 0));

        const fetcher = jest.fn(async (addr: number, size: number) =>
            readTargetMemory(targetMem, addr, size));

        // Cycle 1: on-demand reads (no prefetch yet)
        for (const addr of BLOCK_ADDRS) {
            cache.recordRequestRange(addr, 9);
        }
        cache.recordRequestRange(SENTINEL_ADDR, 9);

        // Cycle 2: beginUpdateCycle prefetches cycle 1 ranges
        const summary = await cache.beginUpdateCycle(fetcher);

        // Verify prefetch happened
        expect(summary.count).toBeGreaterThan(0);
        expect(fetcher).toHaveBeenCalled();

        // All 5 blocks + sentinel should now be cache hits
        for (const addr of BLOCK_ADDRS) {
            const data = cache.read(addr, 9);
            expect(data).toBeDefined();
            expect(data!.length).toBe(9);
        }
        const sentinel = cache.read(SENTINEL_ADDR, 9);
        expect(sentinel).toBeDefined();
        expect(extractNext(sentinel!)).toBe(0);
    });

    it('prefetch data is fresh (reflects target state at cycle 2, not cycle 1)', async () => {
        const cache = new TargetReadCache();

        // Cycle 1 target memory: block at 0x1000 points to 0x2000 (sentinel)
        let currentNext = 0x2000;
        const fetcher = jest.fn(async (addr: number, size: number) => {
            const data = new Uint8Array(size);
            if (addr <= 0x1000 && addr + size > 0x1000) {
                const view = new DataView(data.buffer);
                view.setUint32(0x1000 - addr, currentNext, true);
            }
            return data;
        });

        // Cycle 1: read block at 0x1000
        cache.recordRequestRange(0x1000, 9);

        // Cycle 2: target changed — block now points to 0x3000
        currentNext = 0x3000;
        await cache.beginUpdateCycle(fetcher);

        // The prefetched data should have the NEW next pointer
        const data = cache.read(0x1000, 9);
        expect(data).toBeDefined();
        expect(extractNext(data!)).toBe(0x3000);  // fresh data, not stale 0x2000
    });

    it('cycle 2 on-demand reads fill gaps not covered by prefetch', async () => {
        const cache = new TargetReadCache();
        const targetMem = new Map<string, number>();

        // Cycle 1: only know about 2 blocks
        fillTargetMemory(targetMem, 0x1000, makeBlock(0x1028, 41 | 1, 0xF1));
        fillTargetMemory(targetMem, 0x1028, makeBlock(0x2000, 32000, 0)); // sentinel

        cache.recordRequestRange(0x1000, 9);
        cache.recordRequestRange(0x1028, 9);

        const fetcher = jest.fn(async (addr: number, size: number) =>
            readTargetMemory(targetMem, addr, size));

        // Cycle 2: prefetch covers 0x1000 and 0x1028
        // But target now has a NEW block at 0x1050 (inserted between 0x1028 and sentinel)
        fillTargetMemory(targetMem, 0x1000, makeBlock(0x1028, 41 | 1, 0xF1));
        fillTargetMemory(targetMem, 0x1028, makeBlock(0x1050, 41 | 1, 0xF5)); // changed!
        fillTargetMemory(targetMem, 0x1050, makeBlock(0x2000, 31000, 0));

        await cache.beginUpdateCycle(fetcher);
        fetcher.mockClear();

        // Cache hit for 0x1000 and 0x1028 (prefetched)
        expect(cache.read(0x1000, 9)).toBeDefined();
        const block2 = cache.read(0x1028, 9);
        expect(block2).toBeDefined();
        expect(extractNext(block2!)).toBe(0x1050); // fresh data from prefetch

        // Cache miss for 0x1050 (not in previous cycle)
        expect(cache.read(0x1050, 9)).toBeUndefined();

        // On-demand read to fill the gap
        const missing = cache.getMissingRanges(0x1050, 9);
        expect(missing).toEqual([{ start: 0x1050, size: 9 }]);

        const freshData = readTargetMemory(targetMem, 0x1050, 9);
        cache.write(0x1050, freshData);
        const newBlock = cache.read(0x1050, 9);
        expect(newBlock).toBeDefined();
        expect(extractNext(newBlock!)).toBe(0x2000);
    });

    it('merged prefetch ranges include TCB+block overlaps', async () => {
        const cache = new TargetReadCache();

        // Cycle 1: read 9-byte block at 0x1000, then 80-byte TCB at 0x1008
        cache.recordRequestRange(0x1000, 9);
        cache.recordRequestRange(0x1008, 80);

        // Also read next 9-byte block at 0x1050
        cache.recordRequestRange(0x1050, 9);
        cache.recordRequestRange(0x1058, 80); // TCB at 0x1050+8

        const fetcher = jest.fn(async (_addr: number, size: number) =>
            new Uint8Array(size).fill(0x42));

        await cache.beginUpdateCycle(fetcher);

        // The ranges [0x1000,9] and [0x1008,80] should merge into [0x1000,88]
        // The ranges [0x1050,9] and [0x1058,80] should merge into [0x1050,88]
        // [0x1000,88] ends at 0x1058 which is ≤ 0x1050+0=0x1050+gap=0x1050
        // Actually 0x1000+88=0x1088 > 0x1050, so they merge further into [0x1000, 0x10D8)
        // This means a single prefetch read covers both blocks
        expect(fetcher).toHaveBeenCalledTimes(1);

        // Both 9-byte reads should be cache hits
        expect(cache.read(0x1000, 9)).toBeDefined();
        expect(cache.read(0x1050, 9)).toBeDefined();
    });

    it('subarray views from read() remain valid after subsequent writes', () => {
        const cache = new TargetReadCache();

        cache.write(0x1000, makeBlock(0x2000, 99, 0xF1));

        // Get a subarray view
        const view1 = cache.read(0x1000, 9);
        expect(view1).toBeDefined();
        expect(extractNext(view1!)).toBe(0x2000);

        // Write to a different location that forces a new segment
        cache.write(0x3000, makeBlock(0x4000, 50, 0xF2));

        // Original view should still be valid (different ArrayBuffer)
        expect(extractNext(view1!)).toBe(0x2000);

        // Write to an overlapping location (triggers mergeSegments which creates new buffer)
        cache.write(0x1000, makeBlock(0x5000, 99, 0xF1));

        // The old view still references the OLD buffer — data unchanged
        expect(extractNext(view1!)).toBe(0x2000);

        // New read gets the updated data
        const view2 = cache.read(0x1000, 9);
        expect(view2).toBeDefined();
        expect(extractNext(view2!)).toBe(0x5000);
    });
});

describe('TargetReadCache – full linked-list walk simulation', () => {
    /**
     * Simulates the exact RTX mem_list_com walk:
     *  1. beginUpdateCycle prefetches previous cycle's ranges
     *  2. Walk linked list: read 9 bytes, extract next, follow
     *  3. Cache hits for prefetched blocks, misses for new blocks → on-demand reads
     *  4. Sentinel terminates the walk
     */
    it('walks a 5-block linked list across 2 cycles', async () => {
        const targetMem = new Map<string, number>();

        // Cycle 1 target memory: 3 blocks + sentinel
        const cycle1Blocks = [0x1000, 0x1028, 0x1050];
        for (let i = 0; i < cycle1Blocks.length; i++) {
            const next = (i < cycle1Blocks.length - 1) ? cycle1Blocks.at(i + 1)! : 0x9000;
            const blockAddr = cycle1Blocks.at(i)!;
            fillTargetMemory(targetMem, blockAddr, makeBlock(next, 41 | 1, 0xF1));
        }
        fillTargetMemory(targetMem, 0x9000, makeBlock(0, 30000, 0)); // sentinel

        const cache = new TargetReadCache();

        // --- Cycle 1: no prefetch, all on-demand ---
        const fetcher = jest.fn(async (addr: number, size: number) =>
            readTargetMemory(targetMem, addr, size));

        // Simulate linked list walk
        let nextAddr: number | undefined = cycle1Blocks[0];
        const cycle1Items: number[] = [];
        while (nextAddr !== undefined && nextAddr !== 0 && nextAddr < 0xFFFFFFF0) {
            cache.recordRequestRange(nextAddr, 9);
            const missing = cache.getMissingRanges(nextAddr, 9);
            for (const range of missing) {
                const data = readTargetMemory(targetMem, range.start, range.size);
                cache.write(range.start, data);
            }
            const data = cache.read(nextAddr, 9);
            expect(data).toBeDefined();
            cycle1Items.push(nextAddr);
            nextAddr = extractNext(data!);
        }
        // 3 blocks + sentinel (which is read but terminates because next=0)
        expect(cycle1Items).toEqual([...cycle1Blocks, 0x9000]);

        // --- Update target for cycle 2: 2 new blocks inserted ---
        const cycle2Blocks = [0x1000, 0x1028, 0x1050, 0x1078, 0x10A0];
        for (let i = 0; i < cycle2Blocks.length; i++) {
            const next = (i < cycle2Blocks.length - 1) ? cycle2Blocks.at(i + 1)! : 0x9000;
            const blockAddr = cycle2Blocks.at(i)!;
            fillTargetMemory(targetMem, blockAddr, makeBlock(next, 41 | 1, 0xF1));
        }
        fillTargetMemory(targetMem, 0x9000, makeBlock(0, 28000, 0)); // sentinel updated

        // --- Cycle 2: beginUpdateCycle prefetches cycle 1 ranges ---
        await cache.beginUpdateCycle(fetcher);
        fetcher.mockClear();

        // Walk again
        nextAddr = cycle2Blocks[0];
        const cycle2Items: number[] = [];
        while (nextAddr !== undefined && nextAddr !== 0 && nextAddr < 0xFFFFFFF0) {
            cache.recordRequestRange(nextAddr, 9);
            let data = cache.read(nextAddr, 9);
            if (!data) {
                // Cache miss — fetch from target
                const missing = cache.getMissingRanges(nextAddr, 9);
                for (const range of missing) {
                    const fresh = readTargetMemory(targetMem, range.start, range.size);
                    cache.write(range.start, fresh);
                }
                data = cache.read(nextAddr, 9);
            }
            expect(data).toBeDefined();
            cycle2Items.push(nextAddr);
            nextAddr = extractNext(data!);
        }

        // Should find all 5 blocks + sentinel
        expect(cycle2Items).toEqual([...cycle2Blocks, 0x9000]);
    });

    it('walk terminates on sentinel (next=0) even from cache hit', async () => {
        const targetMem = new Map<string, number>();
        fillTargetMemory(targetMem, 0x1000, makeBlock(0x9000, 41 | 1, 0xF1));
        fillTargetMemory(targetMem, 0x9000, makeBlock(0, 30000, 0)); // sentinel: next=0

        const cache = new TargetReadCache();
        // Populate cache directly
        cache.write(0x1000, readTargetMemory(targetMem, 0x1000, 9));
        cache.write(0x9000, readTargetMemory(targetMem, 0x9000, 9));

        const data0 = cache.read(0x1000, 9);
        expect(extractNext(data0!)).toBe(0x9000);

        const data1 = cache.read(0x9000, 9);
        expect(extractNext(data1!)).toBe(0); // sentinel terminates
    });

    it('walk terminates on invalid address (>= 0xFFFFFFF0)', () => {
        const cache = new TargetReadCache();
        const block = makeBlock(0xFFFFFFF0, 41, 0xF1);
        cache.write(0x1000, block);

        const data = cache.read(0x1000, 9);
        const next = extractNext(data!);
        expect(next).toBe(0xFFFFFFF0);
        expect(next >= 0xFFFFFFF0).toBe(true);
    });
});

describe('TargetReadCache – getMissingRanges with partial cache coverage', () => {
    it('returns gap when 9-byte read partially overlaps existing segment', () => {
        const cache = new TargetReadCache();
        // Cache has 9 bytes at 0x1000
        cache.write(0x1000, new Uint8Array(9));

        // Read 28 bytes at 0x1008 — first byte is covered (0x1008 is within [0x1000, 0x1009))
        const missing = cache.getMissingRanges(0x1008, 28);
        // Byte at 0x1008 is covered, so missing starts at 0x1009
        expect(missing).toEqual([{ start: 0x1009, size: 27 }]);
    });

    it('fills gap and reads back merged result', () => {
        const cache = new TargetReadCache();
        // Write 9-byte block
        const block = makeBlock(0xAAAA, 41, 0xF5);
        cache.write(0x1000, block);

        // Request 28 bytes at 0x1008 — 1 byte covered, 27 missing
        const missing = cache.getMissingRanges(0x1008, 28);
        expect(missing.length).toBe(1);
        expect(missing[0]).toEqual({ start: 0x1009, size: 27 });

        // Fill the gap
        const gapData = new Uint8Array(27).fill(0xBB);
        cache.write(0x1009, gapData);

        // Now read the full 28 bytes
        const result = cache.read(0x1008, 28);
        expect(result).toBeDefined();
        expect(result!.length).toBe(28);

        // First byte should be the id from the block (offset 8)
        expect(result![0]).toBe(0xF5);
        // Remaining 27 bytes should be the gap fill
        expect(result!.subarray(1, 28)).toEqual(gapData);
    });
});
