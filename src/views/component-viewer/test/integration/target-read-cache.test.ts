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

import { ScvdDebugTarget } from '../../scvd-debug-target';

describe('TargetReadCache integration cycles', () => {
    it('merges, prefetches, and clears across three update cycles', async () => {
        const target = new ScvdDebugTarget();
        let cycle = 0;
        // Test-only injection: replace target reads with a deterministic mock data source.
        const readMemoryFromTarget = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(cycle));
        (target as unknown as { readMemoryFromTarget: (addr: number | bigint, size: number) => Promise<Uint8Array | undefined> })
            .readMemoryFromTarget = readMemoryFromTarget;

        // Cycle 1: read adjacent ranges (merge) plus one separate range.
        cycle = 1;
        await expect(target.readMemory(0x1000, 4)).resolves.toEqual(new Uint8Array([1, 1, 1, 1]));
        await expect(target.readMemory(0x1004, 2)).resolves.toEqual(new Uint8Array([1, 1]));
        await expect(target.readMemory(0x2000, 2)).resolves.toEqual(new Uint8Array([1, 1]));
        await expect(target.readMemory(0x1000, 4)).resolves.toEqual(new Uint8Array([1, 1, 1, 1]));

        // Cycle timing: beginUpdateCycle(prefetch) uses the previous cycle's ranges, so we set
        // the cycle data source before calling beginUpdateCycle.
        // Prefetch for cycle 2 should merge adjacent requests from cycle 1.
        cycle = 2;
        readMemoryFromTarget.mockClear();
        await target.beginUpdateCycle();
        expect(readMemoryFromTarget).toHaveBeenCalledTimes(2);
        expect(readMemoryFromTarget.mock.calls[0]).toEqual([0x1000, 6]);
        expect(readMemoryFromTarget.mock.calls[1]).toEqual([0x2000, 2]);

        // Cycle 2: keep 0x1000 range, add 0x3000, drop 0x2000.
        readMemoryFromTarget.mockClear();
        await expect(target.readMemory(0x1000, 6)).resolves.toEqual(new Uint8Array([2, 2, 2, 2, 2, 2]));
        await expect(target.readMemory(0x3000, 3)).resolves.toEqual(new Uint8Array([2, 2, 2]));
        expect(readMemoryFromTarget).toHaveBeenCalledWith(0x3000, 3);

        // Prefetch for cycle 3 should not include 0x2000 anymore.
        cycle = 3;
        readMemoryFromTarget.mockClear();
        await target.beginUpdateCycle();
        expect(readMemoryFromTarget).toHaveBeenCalledTimes(2);
        expect(readMemoryFromTarget.mock.calls[0]).toEqual([0x1000, 6]);
        expect(readMemoryFromTarget.mock.calls[1]).toEqual([0x3000, 3]);

        // Cycle 3: ensure old range wasn't prefetched, add a new range.
        readMemoryFromTarget.mockClear();
        await expect(target.readMemory(0x2000, 2)).resolves.toEqual(new Uint8Array([3, 3]));
        expect(readMemoryFromTarget).toHaveBeenCalledWith(0x2000, 2);
        await expect(target.readMemory(0x4000, 1)).resolves.toEqual(new Uint8Array([3]));
    });
});
