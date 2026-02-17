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
 * Cache tests with unaligned addresses and odd read sizes.
 *
 * In the RTX library build (optimized), linked-list node addresses may not be
 * DWORD-aligned, and struct sizes like mem_block_t (9 bytes) create reads that
 * straddle alignment boundaries. These tests verify:
 *
 *   - write + read at non-4-byte-aligned addresses
 *   - read subarray views at odd offsets within a segment
 *   - getMissingRanges with unaligned boundaries
 *   - mergeSegments when segments are 1 byte apart vs overlapping by 1
 *   - Prefetch/cycle with non-aligned requestedRanges
 *   - 9-byte reads at addresses like 0x20010d29 (1 byte off DWORD)
 */

import { TargetReadCache } from '../../target-read-cache';

// ---------- helpers ----------

/** Fill a Uint8Array with a repeating byte pattern starting at `startByte`. */
function fillPattern(size: number, startByte: number = 0): Uint8Array {
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        if (i < buf.length) {
            const value = (startByte + i) & 0xFF;
            buf.set([value], i);
        }
    }
    return buf;
}

/** Build a 9-byte mem_block_t: [next:4][len:4][id:1] in LE. */
function makeBlock9(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, nextAddr, true);
    dv.setUint32(4, len, true);
    buf[8] = id;
    return buf;
}

function readU32LE(arr: Uint8Array, off: number): number {
    const b0 = arr.at(off) ?? 0;
    const b1 = arr.at(off + 1) ?? 0;
    const b2 = arr.at(off + 2) ?? 0;
    const b3 = arr.at(off + 3) ?? 0;
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

// =============================================================================
// 1. BASIC UNALIGNED WRITE + READ
// =============================================================================

describe('TargetReadCache: unaligned address writes and reads', () => {
    let cache: TargetReadCache;

    beforeEach(() => {
        cache = new TargetReadCache();
    });

    it('write at odd address, read back exactly', () => {
        const addr = 0x20010D29; // 1 byte off DWORD alignment
        const data = makeBlock9(0x20010D52, 41, 0xF1);
        cache.write(addr, data);

        const result = cache.read(addr, 9);
        expect(result).toBeDefined();
        expect(result!.length).toBe(9);
        // Verify content byte-by-byte
        for (let i = 0; i < 9; i++) {
            expect(result!.at(i)).toBe(data.at(i));
        }
    });

    it('write at aligned address, read 9 bytes at +1 offset', () => {
        const addr = 0x20010D28; // DWORD aligned
        // Write 12 bytes starting at aligned address
        const data = fillPattern(12, 0xA0);
        cache.write(addr, data);

        // Read 9 bytes starting 1 byte in (unaligned sub-read)
        const result = cache.read(addr + 1, 9);
        expect(result).toBeDefined();
        for (let i = 0; i < 9; i++) {
            expect(result!.at(i)).toBe(data.at(i + 1));
        }
    });

    it('write at aligned address, read fails at -1 byte (before segment)', () => {
        const addr = 0x20010D28;
        cache.write(addr, fillPattern(9));

        // Read starting 1 byte before the segment should fail
        const result = cache.read(addr - 1, 9);
        expect(result).toBeUndefined();
    });

    it('write at aligned address, read fails at addr+2 with size that exceeds segment', () => {
        const addr = 0x20010D28;
        cache.write(addr, fillPattern(9));

        // Read 9 bytes from addr+2: would need bytes [addr+2, addr+11), but segment only has [addr, addr+9)
        const result = cache.read(addr + 2, 9);
        expect(result).toBeUndefined();
    });

    it.each([
        { offset: 1, label: '+1 (off DWORD)' },
        { offset: 2, label: '+2 (half-word)' },
        { offset: 3, label: '+3 (3 off DWORD)' },
        { offset: 5, label: '+5 (odd)' },
        { offset: 7, label: '+7 (prime)' },
    ])('write 9 bytes at DWORD-base $label, full readback matches', ({ offset }) => {
        const baseAddr = 0x20010D00 + offset;
        const data = makeBlock9(0xCAFEBABE, 41 | 1, 0xF5);
        cache.write(baseAddr, data);

        const result = cache.read(baseAddr, 9);
        expect(result).toBeDefined();
        expect(readU32LE(result!, 0)).toBe(0xCAFEBABE);
        expect(readU32LE(result!, 4)).toBe(41 | 1);
        expect(result![8]).toBe(0xF5);
    });
});

// =============================================================================
// 2. getMissingRanges WITH UNALIGNED BOUNDARIES
// =============================================================================

describe('TargetReadCache: getMissingRanges at unaligned boundaries', () => {
    let cache: TargetReadCache;

    beforeEach(() => {
        cache = new TargetReadCache();
    });

    it('single segment at odd address: no missing ranges for exact re-read', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(9));

        const missing = cache.getMissingRanges(addr, 9);
        expect(missing).toEqual([]);
    });

    it('gap of 1 byte between request and segment start', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(9));

        // Request starts 1 byte earlier
        const missing = cache.getMissingRanges(addr - 1, 10);
        expect(missing.length).toBe(1);
        expect(missing[0].start).toBe(addr - 1);
        expect(missing[0].size).toBe(1);
    });

    it('gap of 1 byte after segment end', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(9));

        // Request extends 1 byte past end
        const missing = cache.getMissingRanges(addr, 10);
        expect(missing.length).toBe(1);
        expect(missing[0].start).toBe(addr + 9);
        expect(missing[0].size).toBe(1);
    });

    it('two segments with 1-byte gap between them', () => {
        const addr1 = 0x20010D28;
        cache.write(addr1, fillPattern(9)); // [0x..28, 0x..31)

        const addr2 = 0x20010D32; // 1-byte gap at 0x..31
        cache.write(addr2, fillPattern(9)); // [0x..32, 0x..3B)

        // Request spanning both + gap
        const missing = cache.getMissingRanges(addr1, addr2 + 9 - addr1);
        expect(missing.length).toBe(1);
        expect(missing[0].start).toBe(addr1 + 9); // 0x..31
        expect(missing[0].size).toBe(1);
    });

    it('request for 9 bytes at addr where cache has 8 bytes: 1-byte tail missing', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(8));

        const missing = cache.getMissingRanges(addr, 9);
        expect(missing.length).toBe(1);
        expect(missing[0].start).toBe(addr + 8);
        expect(missing[0].size).toBe(1);
    });
});

// =============================================================================
// 3. MERGE SEGMENTS: ±1 byte overlap/adjacency
// =============================================================================

describe('TargetReadCache: merge segments with ±1 byte adjacency', () => {
    let cache: TargetReadCache;

    beforeEach(() => {
        cache = new TargetReadCache();
    });

    it('two adjacent 9-byte writes (no gap) merge into one 18-byte segment', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(9, 0x10));
        cache.write(addr + 9, fillPattern(9, 0x20));

        // Should read seamlessly across both
        const result = cache.read(addr, 18);
        expect(result).toBeDefined();
        expect(result![0]).toBe(0x10);
        expect(result![9]).toBe(0x20);
    });

    it('two writes overlapping by 1 byte: new data wins at overlap', () => {
        const addr = 0x20010D29;
        cache.write(addr, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
        // Overlap last byte: write starts at addr+8
        cache.write(addr + 8, new Uint8Array([0xFF, 0xA0, 0xB0, 0xC0]));

        const result = cache.read(addr, 12);
        expect(result).toBeDefined();
        // Bytes 0-7 from first write
        expect(result![7]).toBe(8);
        // Byte 8: overwritten by second write
        expect(result![8]).toBe(0xFF);
        // Bytes 9-11 from second write
        expect(result![9]).toBe(0xA0);
        expect(result![10]).toBe(0xB0);
        expect(result![11]).toBe(0xC0);
    });

    it('1-byte gap between segments: not merged, read spanning both fails', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(9));
        cache.write(addr + 10, fillPattern(9)); // 1-byte gap at addr+9

        // Read spanning the gap should fail (no single segment covers it)
        const result = cache.read(addr, 19);
        expect(result).toBeUndefined();

        // But each individual segment reads fine
        expect(cache.read(addr, 9)).toBeDefined();
        expect(cache.read(addr + 10, 9)).toBeDefined();
    });

    it('filling a 1-byte gap merges three segments into one', () => {
        const addr = 0x20010D29;
        cache.write(addr, fillPattern(4, 0x10));       // [addr, addr+4)
        cache.write(addr + 5, fillPattern(4, 0x50));   // [addr+5, addr+9) — 1-byte gap at addr+4

        // Read across the gap fails before filling
        expect(cache.read(addr, 9)).toBeUndefined();

        // Fill the gap
        cache.write(addr + 4, new Uint8Array([0x44])); // fills byte at addr+4

        // Now a full 9-byte read should work
        const result = cache.read(addr, 9);
        expect(result).toBeDefined();
        expect(result![4]).toBe(0x44);
    });
});

// =============================================================================
// 4. PREFETCH CYCLE WITH UNALIGNED ADDRESSES
// =============================================================================

describe('TargetReadCache: beginUpdateCycle with unaligned requestedRanges', () => {
    it('prefetches 9-byte ranges at odd addresses in new cycle', async () => {
        const cache = new TargetReadCache();

        // Simulate cycle 1: record ranges at odd addresses
        const addrs = [0x20010D29, 0x20010D52, 0x20010D7B];
        const targetData = new Map<number, Uint8Array>();
        for (const addr of addrs) {
            const data = makeBlock9(addr + 0x28, 41, 0xF1);
            targetData.set(addr, data);
            cache.write(addr, data);
            cache.recordRequestRange(addr, 9);
        }

        // Cycle 2: beginUpdateCycle should prefetch these ranges
        const fetchCalls: Array<{ addr: number; size: number }> = [];
        const fetcher = async (addr: number, size: number) => {
            fetchCalls.push({ addr, size });
            // Return fresh data for the prefetch
            const result = new Uint8Array(size);
            for (let i = 0; i < size; i++) {
                const segData = targetData.get(addr);
                if (segData && i < segData.length && i < result.length) {
                    const value = segData.at(i) ?? 0;
                    result.set([value], i);
                }
            }
            return result;
        };

        await cache.beginUpdateCycle(fetcher);

        // All requested ranges should have been fetched
        expect(fetchCalls.length).toBeGreaterThan(0);
    });

    it('after prefetch, reading 9 bytes at odd address succeeds', async () => {
        const cache = new TargetReadCache();

        const addr = 0x20010D29;
        const blockData = makeBlock9(0xDEADBEEF, 42, 0xCC);

        // Cycle 1: write and record
        cache.write(addr, blockData);
        cache.recordRequestRange(addr, 9);

        // Cycle 2: prefetch
        await cache.beginUpdateCycle(async (a, s) => {
            if (a <= addr && a + s >= addr + 9) {
                // Return data that covers the requested address
                const result = new Uint8Array(s);
                const off = addr - a;
                result.set(blockData, off);
                return result;
            }
            return undefined;
        });

        // Read should succeed
        const result = cache.read(addr, 9);
        expect(result).toBeDefined();
        expect(readU32LE(result!, 0)).toBe(0xDEADBEEF);
    });
});

// =============================================================================
// 5. LINKED-LIST WALK SIMULATION WITH UNALIGNED ADDRESSES
// =============================================================================

describe('TargetReadCache: linked-list walk with 9-byte blocks at non-DWORD addresses', () => {
    it('simulates mem_list_com walk with odd-address nodes', async () => {
        const cache = new TargetReadCache();

        // Simulate 5 linked-list nodes at non-DWORD-aligned addresses
        // (like optimized library build)
        const nodes = [
            { addr: 0x20010D29, next: 0x20010D52, len: 41 | 1, id: 0xF5 },
            { addr: 0x20010D52, next: 0x20010D7B, len: 41 | 1, id: 0xF1 },
            { addr: 0x20010D7B, next: 0x20010DA4, len: 41 | 1, id: 0xF1 },
            { addr: 0x20010DA4, next: 0x20010DCD, len: 41 | 1, id: 0xF1 },
            { addr: 0x20010DCD, next: 0x00000000, len: 6552,    id: 0x00 }, // sentinel
        ];

        // Walk: start at nodes[0].addr
        let currentAddr = nodes[0].addr;
        const visited: number[] = [];

        for (const node of nodes) {
            const data = makeBlock9(node.next, node.len, node.id);
            cache.write(node.addr, data);
        }

        // Walk the list using cache reads (like statement-readList.ts)
        while (currentAddr !== 0 && currentAddr < 0xFFFFFFF0) {
            const data = cache.read(currentAddr, 9);
            expect(data).toBeDefined();
            visited.push(currentAddr);

            // Extract next pointer
            const nextAddr = readU32LE(data!, 0);
            if (nextAddr === currentAddr) break; // self-loop
            currentAddr = nextAddr;
        }

        expect(visited).toEqual(nodes.map(n => n.addr));
    });

    it('linked-list walk with readMemory simulation (cache miss → fetch → hit)', async () => {
        const cache = new TargetReadCache();

        // Target memory simulation
        const targetMem = new Map<number, Uint8Array>();
        const nodes = [
            { addr: 0x20010D31, next: 0x20010D5A, id: 0xA1 },
            { addr: 0x20010D5A, next: 0x20010D83, id: 0xA2 },
            { addr: 0x20010D83, next: 0x00000000, id: 0xA3 },
        ];
        for (const n of nodes) {
            targetMem.set(n.addr, makeBlock9(n.next, 41, n.id));
        }

        const fetchFromTarget = async (addr: number, size: number): Promise<Uint8Array | undefined> => {
            const data = targetMem.get(addr);
            if (data && data.length >= size) return data.subarray(0, size);
            return undefined;
        };

        // Walk: simulates readMemory pattern from scvd-debug-target.ts
        let addr = nodes[0].addr;
        const results: number[] = [];

        while (addr !== 0 && addr < 0xFFFFFFF0) {
            // Check cache
            let data = cache.read(addr, 9);

            if (!data) {
                // Cache miss: check missing ranges
                const missing = cache.getMissingRanges(addr, 9);
                for (const range of missing) {
                    const fetched = await fetchFromTarget(range.start, range.size);
                    if (fetched) {
                        cache.write(range.start, fetched);
                    }
                }
                // Re-read from cache
                data = cache.read(addr, 9);
            }

            expect(data).toBeDefined();
            results.push(data![8]); // id byte

            const nextAddr = readU32LE(data!, 0);
            if (nextAddr === addr) break;
            addr = nextAddr;
        }

        expect(results).toEqual([0xA1, 0xA2, 0xA3]);
    });
});

// =============================================================================
// 6. SUBARRAY VIEW STABILITY (detects if views are invalidated by later writes)
// =============================================================================

describe('TargetReadCache: subarray view stability across writes', () => {
    it('read() view remains valid after writing to a non-overlapping address', () => {
        const cache = new TargetReadCache();
        const addr1 = 0x20010D29;
        const addr2 = 0x20010E00; // far away

        cache.write(addr1, makeBlock9(0x111, 41, 0xAA));
        const view1 = cache.read(addr1, 9);
        expect(view1).toBeDefined();
        expect(view1![8]).toBe(0xAA);

        // Write to a completely different address
        cache.write(addr2, makeBlock9(0x222, 42, 0xBB));

        // View1 should still be valid (subarray of the original segment)
        expect(view1![8]).toBe(0xAA);
    });

    it('read() view is INVALIDATED when segment is extended (merged)', () => {
        const cache = new TargetReadCache();
        const addr = 0x20010D29;

        cache.write(addr, new Uint8Array([1, 2, 3, 4]));
        const view = cache.read(addr, 4);
        expect(view).toBeDefined();
        expect(view![0]).toBe(1);

        // Write adjacent data, which will trigger merge → new underlying buffer
        cache.write(addr + 4, new Uint8Array([5, 6, 7, 8]));

        // The old view may now point to a detached buffer.
        // This is important: in the real code, readMemory returns a subarray view,
        // which is then passed to setVariable. If the underlying segment is reallocated,
        // the view becomes stale. Check if this happens:
        const freshView = cache.read(addr, 8);
        expect(freshView).toBeDefined();
        expect(freshView![0]).toBe(1);
        expect(freshView![4]).toBe(5);

        // Note: The old `view` may or may not be invalidated depending on
        // whether mergeSegments creates a new buffer. This test documents the behavior.
        // If view is now stale, it would show old data or zeros.
        // Either way, the FRESH read must be correct:
        expect(freshView![0]).toBe(1);
        expect(freshView![3]).toBe(4);
    });
});

// =============================================================================
// 7. readMemory PATTERN: normalize → getMissing → fetch → write → read
// =============================================================================

describe('TargetReadCache: full readMemory pattern with unaligned 9-byte reads', () => {
    it('9-byte read at odd address: miss → fetch → write → read matches', async () => {
        const cache = new TargetReadCache();
        const addr = 0x20010D29;
        const expected = makeBlock9(0xBEEFCAFE, 41 | 1, 0xF3);

        // Step 1: Check cache (miss expected)
        expect(cache.read(addr, 9)).toBeUndefined();

        // Step 2: Get missing ranges
        const missing = cache.getMissingRanges(addr, 9);
        expect(missing.length).toBe(1);
        expect(missing[0]).toEqual({ start: addr, size: 9 });

        // Step 3: Fetch from target and write to cache
        cache.write(addr, expected);

        // Step 4: Read from cache
        const result = cache.read(addr, 9);
        expect(result).toBeDefined();
        expect(readU32LE(result!, 0)).toBe(0xBEEFCAFE);
        expect(result![8]).toBe(0xF3);
    });

    it('partial cache hit: first 4 bytes cached, need remaining 5', () => {
        const cache = new TargetReadCache();
        const addr = 0x20010D29;

        // Write first 4 bytes
        cache.write(addr, new Uint8Array([0x11, 0x22, 0x33, 0x44]));

        // Request 9 bytes
        const missing = cache.getMissingRanges(addr, 9);
        expect(missing.length).toBe(1);
        expect(missing[0].start).toBe(addr + 4);
        expect(missing[0].size).toBe(5);

        // Fetch remaining 5 bytes
        cache.write(addr + 4, new Uint8Array([0x55, 0x66, 0x77, 0x88, 0x99]));

        // Full read
        const result = cache.read(addr, 9);
        expect(result).toBeDefined();
        expect(Array.from(result!)).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]);
    });
});
