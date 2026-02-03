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

export type TargetReadCacheStats = {
    refreshReads: number;
    missReads: number;
    totalReads: number;
    requestedReads: number;
    prefetchMs: number;
};

export type TargetReadTimingStats = {
    count: number;
    totalMs: number;
    totalBytes: number;
    maxMs: number;
};

export class TargetReadStats {
    private stats: TargetReadCacheStats = {
        refreshReads: 0,
        missReads: 0,
        totalReads: 0,
        requestedReads: 0,
        prefetchMs: 0,
    };

    public reset(): void {
        this.stats = {
            refreshReads: 0,
            missReads: 0,
            totalReads: 0,
            requestedReads: 0,
            prefetchMs: 0,
        };
    }

    public recordRequest(): void {
        this.stats.requestedReads += 1;
    }

    public recordRefreshRead(): void {
        this.stats.refreshReads += 1;
        this.stats.totalReads += 1;
    }

    public recordMissRead(): void {
        this.stats.missReads += 1;
        this.stats.totalReads += 1;
    }

    public recordPrefetchTime(ms: number): void {
        if (!Number.isFinite(ms) || ms <= 0) {
            return;
        }
        this.stats.prefetchMs += ms;
    }

    public getStats(): TargetReadCacheStats {
        return { ...this.stats };
    }
}

export class TargetReadTiming {
    private stats: TargetReadTimingStats = {
        count: 0,
        totalMs: 0,
        totalBytes: 0,
        maxMs: 0,
    };

    public reset(): void {
        this.stats = {
            count: 0,
            totalMs: 0,
            totalBytes: 0,
            maxMs: 0,
        };
    }

    public recordRead(elapsedMs: number, bytes: number): void {
        if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
            return;
        }
        this.stats.count += 1;
        this.stats.totalMs += elapsedMs;
        this.stats.totalBytes += bytes;
        this.stats.maxMs = Math.max(this.stats.maxMs, elapsedMs);
    }

    public getStats(): TargetReadTimingStats {
        return { ...this.stats };
    }
}

export function getReadTimingStats(stats?: TargetReadTiming): TargetReadTimingStats {
    return stats?.getStats() ?? {
        count: 0,
        totalMs: 0,
        totalBytes: 0,
        maxMs: 0,
    };
}

export function getReadCacheStats(stats?: TargetReadStats): TargetReadCacheStats {
    return stats?.getStats() ?? {
        refreshReads: 0,
        missReads: 0,
        totalReads: 0,
        requestedReads: 0,
        prefetchMs: 0,
    };
}

export function resetReadTimingStats(stats?: TargetReadTiming): void {
    stats?.reset();
}
