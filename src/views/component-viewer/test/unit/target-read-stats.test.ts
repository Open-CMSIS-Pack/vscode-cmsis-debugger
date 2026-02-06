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

import { TargetReadStats, TargetReadTiming, getReadCacheStats, getReadTimingStats, resetReadTimingStats } from '../../target-read-stats';

describe('TargetReadStats', () => {
    it('records reads and prefetch time', () => {
        const stats = new TargetReadStats();
        stats.recordRequest();
        stats.recordRefreshRead();
        stats.recordMissRead();
        stats.recordPrefetchTime(10);
        stats.recordPrefetchTime(0);
        stats.recordPrefetchTime(Number.NaN);

        const snapshot = stats.getStats();
        expect(snapshot.requestedReads).toBe(1);
        expect(snapshot.refreshReads).toBe(1);
        expect(snapshot.missReads).toBe(1);
        expect(snapshot.totalReads).toBe(2);
        expect(snapshot.prefetchMs).toBe(10);
    });

    it('resets stats', () => {
        const stats = new TargetReadStats();
        stats.recordRequest();
        stats.reset();
        expect(stats.getStats()).toEqual({
            refreshReads: 0,
            missReads: 0,
            totalReads: 0,
            requestedReads: 0,
            prefetchMs: 0,
        });
    });
});

describe('TargetReadTiming', () => {
    it('records valid timings and ignores invalid values', () => {
        const timing = new TargetReadTiming();
        timing.recordRead(0, 10);
        timing.recordRead(-1, 10);
        timing.recordRead(Number.NaN, 10);
        timing.recordRead(5, 2);
        timing.recordRead(3, 4);

        expect(timing.getStats()).toEqual({
            count: 2,
            totalMs: 8,
            totalBytes: 6,
            maxMs: 5,
        });
    });

    it('resets timing stats and handles helpers', () => {
        const timing = new TargetReadTiming();
        timing.recordRead(1, 1);
        resetReadTimingStats(timing);
        expect(timing.getStats()).toEqual({ count: 0, totalMs: 0, totalBytes: 0, maxMs: 0 });

        expect(getReadTimingStats(undefined)).toEqual({ count: 0, totalMs: 0, totalBytes: 0, maxMs: 0 });
        expect(getReadCacheStats(undefined)).toEqual({
            refreshReads: 0,
            missReads: 0,
            totalReads: 0,
            requestedReads: 0,
            prefetchMs: 0,
        });
    });
});
