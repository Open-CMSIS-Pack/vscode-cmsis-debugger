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

import { TargetReadCache } from '../../target-read-cache';
import { TargetReadStats } from '../../target-read-stats';

describe('TargetReadCache', () => {
    it('handles empty reads and ignores invalid sizes', () => {
        const cache = new TargetReadCache();
        expect(cache.read(0, 0)).toBeUndefined();
        expect(cache.read(0, -1)).toBeUndefined();
        expect(cache.getMissingRanges(0, 0)).toEqual([]);
        expect(cache.getMissingRanges(0, -2)).toEqual([]);

        cache.write(0, new Uint8Array());
        cache.recordRequestRange(0, 0);
        cache.recordRequestRange(0, -1);
        expect(cache.read(0, 1)).toBeUndefined();
    });

    it('writes, reads, and computes missing ranges', () => {
        const cache = new TargetReadCache();
        cache.write(0, Uint8Array.from([1, 2, 3]));
        cache.write(4, Uint8Array.from([9]));

        expect(Array.from(cache.read(1, 2) ?? [])).toEqual([2, 3]);
        expect(cache.getMissingRanges(0, 6)).toEqual([
            { start: 3, size: 1 },
            { start: 5, size: 1 },
        ]);
    });

    it('merges overlapping segments', () => {
        const cache = new TargetReadCache();
        cache.write(10, Uint8Array.from([1, 2, 3]));
        cache.write(12, Uint8Array.from([9, 8]));

        expect(Array.from(cache.read(10, 4) ?? [])).toEqual([1, 2, 9, 8]);
        expect(cache.getMissingRanges(10, 4)).toEqual([]);
    });

    it('stops scanning ranges once coverage meets the end', () => {
        const cache = new TargetReadCache();
        cache.write(0, Uint8Array.from([1, 2, 3, 4, 5]));

        expect(cache.getMissingRanges(0, 3)).toEqual([]);
    });

    it('advances cursor across overlapping segments', () => {
        const cache = new TargetReadCache();
        cache.write(0, Uint8Array.from([1, 2]));
        cache.write(2, Uint8Array.from([3]));

        expect(cache.getMissingRanges(0, 3)).toEqual([]);
    });

    it('prefetches merged ranges during update cycles', async () => {
        const cache = new TargetReadCache();
        const stats = new TargetReadStats();

        cache.recordRequestRange(0, 2);
        cache.recordRequestRange(2, 2);
        cache.recordRequestRange(10, 2);

        const fetcher = jest.fn(async (addr: number, size: number) => {
            if (addr === 10) {
                return undefined;
            }
            return new Uint8Array(size).fill(7);
        });

        await cache.beginUpdateCycle(fetcher, stats);

        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(Array.from(cache.read(0, 4) ?? [])).toEqual([7, 7, 7, 7]);
        expect(cache.read(10, 2)).toBeUndefined();
        expect(stats.getStats().refreshReads).toBe(1);
    });

    it('handles gaps, non-overlapping segments, and empty merge cases', async () => {
        const cache = new TargetReadCache();
        cache.write(0, Uint8Array.from([1, 2]));
        cache.write(10, Uint8Array.from([3]));

        expect(cache.getMissingRanges(0, 12)).toEqual([
            { start: 2, size: 8 },
            { start: 11, size: 1 },
        ]);

        cache.write(0, Uint8Array.from([9]));
        cache.write(2, Uint8Array.from([8]));

        expect(Array.from(cache.read(0, 3) ?? [])).toEqual([9, 2, 8]);
        expect(cache.getMissingRanges(0, 3)).toEqual([]);

        await cache.beginUpdateCycle(async () => undefined);

        // Access private mergeRanges via prototype to cover empty paths.
        const mergeRanges = Object.getPrototypeOf(cache).mergeRanges as (ranges: Array<{ start: number; size: number }>, gap: number) => Array<{ start: number; size: number }>;
        expect(mergeRanges([], 0)).toEqual([]);
        expect(mergeRanges([{ start: 0, size: 0 }], 0)).toEqual([]);
    });
});
