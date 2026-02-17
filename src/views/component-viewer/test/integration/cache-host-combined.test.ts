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
 * Combined integration test: TargetReadCache + MemoryHost working together.
 *
 * Simulates the full RTX SCVD Component Viewer pipeline:
 *   1. clearNonConst() — wipe MemoryHost
 *   2. beginUpdateCycle() — clear TargetReadCache + prefetch
 *   3. Walk mem_list_com linked list:
 *      a. readMemory(addr, 9) → cache hit or miss
 *      b. setVariable('mem_list_com', 9, data, -1, addr, 9)
 *      c. Extract next pointer from data[0..3]
 *      d. isInvalidAddress check → continue or stop
 *   4. Process each block: read _addr, _count, check id, read TCB/MCB
 *
 * This exercises both caches end-to-end and verifies that:
 *   - Data flows correctly from target → cache → memory host
 *   - Subarray views from the cache remain valid during the walk
 *   - clearNonConst + beginUpdateCycle properly resets for the next cycle
 *   - The _count-1 sentinel pattern works correctly
 */

import { TargetReadCache } from '../../target-read-cache';
import { MemoryHost } from '../../data-host/memory-host';
import { RefContainer } from '../../parser-evaluator/model-host';
import { ScvdNode } from '../../model/scvd-node';

// ---------- helpers ----------

class NamedStubBase extends ScvdNode {
    constructor(name: string) {
        super(undefined);
        this.name = name;
    }
}

const makeContainer = (name: string, widthBytes: number, offsetBytes = 0): RefContainer => ({
    base: new NamedStubBase(name),
    anchor: new NamedStubBase(name),
    current: new NamedStubBase(name),
    offsetBytes,
    widthBytes,
    valueType: undefined,
});

function makeBlock(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    view.setUint32(0, nextAddr, true);
    view.setUint32(4, len, true);
    buf[8] = id;
    return buf;
}

function extractNext(data: Uint8Array): number {
    return (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
}

function isInvalidAddress(addr: number): boolean {
    return addr === 0 || addr >= 0xFFFFFFF0;
}

// ---------- target memory simulation ----------

class TargetMemory {
    private data = new Map<number, number>();

    write(addr: number, bytes: Uint8Array): void {
        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes.at(i);
            if (byte !== undefined) {
                this.data.set(addr + i, byte);
            }
        }
    }

    read(addr: number, size: number): Uint8Array {
        const result = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            if (i < result.length) {
                const value = this.data.get(addr + i) ?? 0;
                result.set([value], i);
            }
        }
        return result;
    }
}

// ---------- readMemory simulation (like scvd-debug-target.ts) ----------

async function readMemory(
    targetMem: TargetMemory,
    cache: TargetReadCache,
    address: number,
    size: number
): Promise<Uint8Array | undefined> {
    cache.recordRequestRange(address, size);
    const cached = cache.read(address, size);
    if (cached) {
        return cached;
    }
    const missing = cache.getMissingRanges(address, size);
    for (const range of missing) {
        const data = targetMem.read(range.start, range.size);
        cache.write(range.start, data);
    }
    return cache.read(address, size);
}

// ---------- linked list walk (like statement-readList.ts) ----------

async function walkLinkedList(
    targetMem: TargetMemory,
    cache: TargetReadCache,
    memHost: MemoryHost,
    listName: string,
    startAddr: number,
    readBytes: number,
    nextOffset: number,
    nextSize: number
): Promise<{ addresses: number[]; count: number }> {
    const addresses: number[] = [];
    const visitedAddresses = new Set<number>();
    let nextPtrAddr: number | undefined = startAddr >>> 0;

    while (nextPtrAddr !== undefined) {
        const itemAddress: number = nextPtrAddr;

        // Detect cycles: check if we've visited this address before
        if (visitedAddresses.has(itemAddress)) {
            break;
        }
        visitedAddresses.add(itemAddress);
        const readData = await readMemory(targetMem, cache, itemAddress, readBytes);
        if (!readData) break;

        // Store in memory host (exactly like statement-readList.ts)
        memHost.setVariable(listName, readBytes, readData, -1, itemAddress, readBytes);
        addresses.push(itemAddress);

        // Extract next pointer
        const nextPtrUint8Arr = readData.subarray(nextOffset, nextOffset + nextSize);
        if (nextPtrUint8Arr.length !== nextSize) break;
        nextPtrAddr = (nextPtrUint8Arr[0] | (nextPtrUint8Arr[1] << 8) |
                       (nextPtrUint8Arr[2] << 16) | (nextPtrUint8Arr[3] << 24)) >>> 0;

        if (isInvalidAddress(nextPtrAddr)) {
            nextPtrAddr = undefined;
        }
        // Note: Cycle detection is now handled at the start of the loop
        // by checking visitedAddresses Set
    }
    return { addresses, count: memHost.getArrayElementCount(listName) };
}

// ---------- tests ----------

describe('Combined: TargetReadCache + MemoryHost – RTX linked-list walk', () => {
    it('cycle 1: walks 5 blocks + sentinel, stores all in memory host', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();
        const memHost = new MemoryHost();

        // Set up 5 allocated blocks + sentinel at 0x9000
        const blocks = [
            { addr: 0x1000, next: 0x1028, len: 41 | 1, id: 0xF5 },
            { addr: 0x1028, next: 0x1050, len: 41 | 1, id: 0xF1 },
            { addr: 0x1050, next: 0x1078, len: 41 | 1, id: 0xF1 },
            { addr: 0x1078, next: 0x10A0, len: 41 | 1, id: 0xF1 },
            { addr: 0x10A0, next: 0x9000, len: 41 | 1, id: 0xF1 },
            { addr: 0x9000, next: 0, len: 30000, id: 0 },
        ];
        for (const b of blocks) {
            target.write(b.addr, makeBlock(b.next, b.len, b.id));
        }

        const result = await walkLinkedList(
            target, cache, memHost, 'mem_list_com',
            0x1000, 9, 0, 4
        );

        expect(result.addresses).toEqual(blocks.map(b => b.addr));
        expect(result.count).toBe(6);

        // Verify each element's _addr
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks.at(i);
            if (block) {
                expect(memHost.getElementTargetBase('mem_list_com', i)).toBe(block.addr);
            }
        }

        // Verify sentinel's len (max_used pattern)
        const lastLenRef = makeContainer('mem_list_com', 4, (result.count - 1) * 9 + 4);
        expect(await memHost.readValue(lastLenRef)).toBe(30000);
    });

    it('cycle 2: clearNonConst + prefetch + walk sees updated target memory', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();
        const memHost = new MemoryHost();

        // Cycle 1 setup: 3 blocks + sentinel
        const cycle1Blocks = [
            { addr: 0x1000, next: 0x1028, len: 41 | 1, id: 0xF5 },
            { addr: 0x1028, next: 0x1050, len: 41 | 1, id: 0xF1 },
            { addr: 0x1050, next: 0x9000, len: 41 | 1, id: 0xF1 },
            { addr: 0x9000, next: 0, len: 31000, id: 0 },
        ];
        for (const b of cycle1Blocks) {
            target.write(b.addr, makeBlock(b.next, b.len, b.id));
        }

        // Cycle 1: walk
        await walkLinkedList(target, cache, memHost, 'mem_list_com', 0x1000, 9, 0, 4);
        expect(memHost.getArrayElementCount('mem_list_com')).toBe(4);

        // --- Cycle 2 ---
        // 1. Update target: insert 2 new blocks
        const cycle2Blocks = [
            { addr: 0x1000, next: 0x1028, len: 41 | 1, id: 0xF5 },
            { addr: 0x1028, next: 0x1050, len: 41 | 1, id: 0xF1 },
            { addr: 0x1050, next: 0x1078, len: 41 | 1, id: 0xF1 },  // now points to new block
            { addr: 0x1078, next: 0x10A0, len: 41 | 1, id: 0xF3 },  // new
            { addr: 0x10A0, next: 0x9000, len: 41 | 1, id: 0xF1 },  // new
            { addr: 0x9000, next: 0, len: 29000, id: 0 },
        ];
        for (const b of cycle2Blocks) {
            target.write(b.addr, makeBlock(b.next, b.len, b.id));
        }

        // 2. Clear memory host (like statement-engine.ts executeAll)
        memHost.clearNonConst();
        expect(memHost.getArrayElementCount('mem_list_com')).toBe(1); // default

        // 3. Prefetch (like scvd-debug-target.ts beginUpdateCycle)
        await cache.beginUpdateCycle(
            async (addr, size) => target.read(addr, size)
        );

        // 4. Walk cycle 2
        const result = await walkLinkedList(
            target, cache, memHost, 'mem_list_com',
            0x1000, 9, 0, 4
        );

        // Should find all 6 items (5 allocated + 1 sentinel)
        expect(result.addresses).toEqual(cycle2Blocks.map(b => b.addr));
        expect(result.count).toBe(6);

        // Verify updated block at 0x1050 now points to 0x1078 (not sentinel)
        const block3NextRef = makeContainer('mem_list_com', 4, 2 * 9); // 3rd element, offset 0
        const block3Next = await memHost.readValue(block3NextRef);
        expect(block3Next).toBe(0x1078);

        // Verify sentinel len updated
        const lastLenRef = makeContainer('mem_list_com', 4, (result.count - 1) * 9 + 4);
        expect(await memHost.readValue(lastLenRef)).toBe(29000);
    });

    it('cycle 2 prefetch correctly updates data for blocks seen in cycle 1', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();
        const memHost = new MemoryHost();

        // Cycle 1: block at 0x1000 points to sentinel 0x9000
        target.write(0x1000, makeBlock(0x9000, 41 | 1, 0xF1));
        target.write(0x9000, makeBlock(0, 32000, 0));

        await walkLinkedList(target, cache, memHost, 'bl', 0x1000, 9, 0, 4);
        expect(memHost.getArrayElementCount('bl')).toBe(2);

        // Cycle 2: block at 0x1000 now points to 0x2000 (new block)
        target.write(0x1000, makeBlock(0x2000, 41 | 1, 0xF1));
        target.write(0x2000, makeBlock(0x9000, 41 | 1, 0xF5));
        target.write(0x9000, makeBlock(0, 31000, 0));

        memHost.clearNonConst();
        await cache.beginUpdateCycle(async (addr, size) => target.read(addr, size));

        const result = await walkLinkedList(target, cache, memHost, 'bl', 0x1000, 9, 0, 4);

        // CRITICAL: The prefetched data for 0x1000 must have the new next pointer (0x2000)
        // If it still has the old one (0x9000), we'd only see 2 blocks instead of 3
        expect(result.addresses).toEqual([0x1000, 0x2000, 0x9000]);
        expect(result.count).toBe(3);
    });

    it('handles the SCVD list loop with TCB reads overlapping mem_block reads', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();
        const memHost = new MemoryHost();

        // Block at 0x1000 with id=0xF1 (thread)
        target.write(0x1000, makeBlock(0x9000, 0x51 | 1, 0xF1));
        // TCB payload at 0x1008 (block addr + 8): 80 bytes of thread data
        // In real RTX memory, byte 0 of payload = object ID (0xF1 for thread)
        const tcbPayload = new Uint8Array(80);
        tcbPayload[0] = 0xF1;  // object ID — the 9th byte read by mem_list_com
        for (let i = 1; i < 80; i++) {
            if (i < tcbPayload.length) {
                const value = 0xA0 + (i & 0x3F);
                tcbPayload.set([value], i);
            }
        }
        target.write(0x1008, tcbPayload);
        // Sentinel
        target.write(0x9000, makeBlock(0, 30000, 0));

        // Cycle 1: walk mem_list_com
        const result = await walkLinkedList(
            target, cache, memHost, 'mem_list_com',
            0x1000, 9, 0, 4
        );
        expect(result.count).toBe(2);

        // Simulate the <list> loop: for each block, check id and read TCB
        let tcbCount = 0;
        for (let i = 0; i < result.count - 1; i++) {
            const addr = memHost.getElementTargetBase('mem_list_com', i)!;
            const idRef = makeContainer('mem_list_com', 1, i * 9 + 8);
            const id = await memHost.readValue(idRef);

            if (id === 0xF1) {
                tcbCount++;
                // Read TCB at addr+8 (like the SCVD does with addr += 8)
                const tcbAddr = addr + 8;
                const tcbData = await readMemory(target, cache, tcbAddr, 80);
                expect(tcbData).toBeDefined();
                expect(tcbData!.length).toBe(80);

                // Verify TCB data is correct
                expect(tcbData).toEqual(tcbPayload);

                // Store TCB in memory host (append to TCB variable)
                memHost.setVariable('TCB', 80, tcbData!, -1, tcbAddr, 80);
            }
        }

        expect(tcbCount).toBe(1);
        expect(memHost.getArrayElementCount('TCB')).toBe(1);
        expect(memHost.getElementTargetBase('TCB', 0)).toBe(0x1008);

        // --- Cycle 2: prefetch should merge the 9-byte and 80-byte ranges ---
        memHost.clearNonConst();
        const fetchCalls: Array<{ addr: number; size: number }> = [];
        await cache.beginUpdateCycle(async (addr, size) => {
            fetchCalls.push({ addr, size });
            return target.read(addr, size);
        });

        // The prefetch should have merged [0x1000,9] and [0x1008,80]
        // into something like [0x1000, 88] (because 0x1000+9=0x1009 >= 0x1008)
        const mergedFetch = fetchCalls.find(c => c.addr === 0x1000);
        expect(mergedFetch).toBeDefined();
        // The merged size should cover both: 0x1000..0x1058 = 88 bytes
        expect(mergedFetch!.size).toBeGreaterThanOrEqual(88);

        // After prefetch, re-walk and read TCB — all should be cache hits
        const result2 = await walkLinkedList(
            target, cache, memHost, 'mem_list_com',
            0x1000, 9, 0, 4
        );
        expect(result2.count).toBe(2);
    });

    it('combined 3-cycle scenario: grow, shrink, and grow list', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();
        const memHost = new MemoryHost();
        const sentinel = 0x9000;

        const fetcher = async (addr: number, size: number) => target.read(addr, size);

        // --- Cycle 1: 2 blocks + sentinel ---
        target.write(0x1000, makeBlock(0x1028, 41 | 1, 0xF1));
        target.write(0x1028, makeBlock(sentinel, 41 | 1, 0xF5));
        target.write(sentinel, makeBlock(0, 31000, 0));

        const r1 = await walkLinkedList(target, cache, memHost, 'bl', 0x1000, 9, 0, 4);
        expect(r1.count).toBe(3);
        expect(r1.addresses).toEqual([0x1000, 0x1028, sentinel]);

        // --- Cycle 2: grow to 4 blocks ---
        target.write(0x1028, makeBlock(0x1050, 41 | 1, 0xF5)); // changed
        target.write(0x1050, makeBlock(0x1078, 41 | 1, 0xF3)); // new
        target.write(0x1078, makeBlock(sentinel, 41 | 1, 0xF1)); // new
        target.write(sentinel, makeBlock(0, 29000, 0));

        memHost.clearNonConst();
        await cache.beginUpdateCycle(fetcher);

        const r2 = await walkLinkedList(target, cache, memHost, 'bl', 0x1000, 9, 0, 4);
        expect(r2.count).toBe(5);
        expect(r2.addresses).toEqual([0x1000, 0x1028, 0x1050, 0x1078, sentinel]);

        // --- Cycle 3: shrink to 1 block (all freed) ---
        target.write(0x1000, makeBlock(sentinel, 41 | 1, 0xF1)); // direct to sentinel
        target.write(sentinel, makeBlock(0, 32000, 0));

        memHost.clearNonConst();
        await cache.beginUpdateCycle(fetcher);

        const r3 = await walkLinkedList(target, cache, memHost, 'bl', 0x1000, 9, 0, 4);
        expect(r3.count).toBe(2);
        expect(r3.addresses).toEqual([0x1000, sentinel]);

        // Stale prefetch ranges (0x1050, 0x1078) should NOT affect the walk
        // They might be prefetched but the walk follows the actual next pointers
    });

    it('subarray view from cache remains valid through the entire walk', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();

        // 3 blocks + sentinel
        target.write(0x1000, makeBlock(0x1028, 41 | 1, 0xF1));
        target.write(0x1028, makeBlock(0x1050, 41 | 1, 0xF5));
        target.write(0x1050, makeBlock(0x9000, 41 | 1, 0xF1));
        target.write(0x9000, makeBlock(0, 30000, 0));

        // Pre-populate cache via prefetch
        cache.recordRequestRange(0x1000, 9);
        cache.recordRequestRange(0x1028, 9);
        cache.recordRequestRange(0x1050, 9);
        cache.recordRequestRange(0x9000, 9);
        await cache.beginUpdateCycle(async (addr, size) => target.read(addr, size));

        // Collect all subarray views during the walk
        const views: Uint8Array[] = [];
        let addr: number | undefined = 0x1000;
        while (addr !== undefined && !isInvalidAddress(addr)) {
            const data = cache.read(addr, 9);
            expect(data).toBeDefined();
            views.push(data!);
            const next = extractNext(data!);
            addr = isInvalidAddress(next) ? undefined : next;
        }

        // We should have 4 views (3 blocks + sentinel)
        expect(views.length).toBe(4);

        // All views should STILL be valid (not corrupted by later reads)
        expect(extractNext(views[0])).toBe(0x1028);
        expect(extractNext(views[1])).toBe(0x1050);
        expect(extractNext(views[2])).toBe(0x9000);
        expect(extractNext(views[3])).toBe(0);
    });

    it('const variables survive clearNonConst while readlist data is wiped', async () => {
        const target = new TargetMemory();
        const cache = new TargetReadCache();

        // Store a const variable (like cfg_mp_mpool with const="1")
        const memHost = new MemoryHost();
        memHost.setVariable('os_Config', 4, new Uint8Array([0x20, 0x0D, 0x01, 0x20]), 0, 0x800761C, 4, true);

        // Walk a non-const linked list
        target.write(0x1000, makeBlock(0x9000, 41 | 1, 0xF1));
        target.write(0x9000, makeBlock(0, 30000, 0));
        await walkLinkedList(target, cache, memHost, 'mem_list_com', 0x1000, 9, 0, 4);

        // Both should exist
        expect(memHost.getArrayElementCount('mem_list_com')).toBe(2);
        expect(await memHost.readRaw(makeContainer('os_Config', 4), 4)).toEqual(
            new Uint8Array([0x20, 0x0D, 0x01, 0x20])
        );

        // Clear non-const
        memHost.clearNonConst();

        // mem_list_com gone, os_Config survives
        expect(await memHost.readRaw(makeContainer('mem_list_com', 9), 9)).toBeUndefined();
        expect(await memHost.readRaw(makeContainer('os_Config', 4), 4)).toEqual(
            new Uint8Array([0x20, 0x0D, 0x01, 0x20])
        );
    });
});
