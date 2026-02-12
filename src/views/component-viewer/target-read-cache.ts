/**
 * Copyright 2025-2026 Arm Limited
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

import { perf } from './stats-config';
import type { TargetReadStats } from './target-read-stats';

type TargetReadSegment = { start: number; data: Uint8Array };
type TargetReadRange = { start: number; size: number };

export const MAX_BATCH_BYTES = 4096;
export const MAX_BATCH_GAP_BYTES = 0;

export class TargetReadCache {
    private static readonly PREFETCH_GAP = 0;
    private segments: TargetReadSegment[] = [];
    private requestedRanges: TargetReadRange[] = [];

    constructor() {
    }

    public async beginUpdateCycle(
        fetcher: (addr: number, size: number) => Promise<Uint8Array | undefined>,
        stats?: TargetReadStats
    ): Promise<{ ranges: TargetReadRange[]; bytes: number; count: number }> {
        this.segments = [];
        if (this.requestedRanges.length === 0) {
            return { ranges: [], bytes: 0, count: 0 };
        }
        const merged = this.mergeRanges(this.requestedRanges, TargetReadCache.PREFETCH_GAP);
        const totalBytes = merged.reduce((sum, range) => sum + range.size, 0);
        for (const range of merged) {
            const perfStartTime = perf?.start() ?? 0;
            const fetchStart = Date.now();
            const data = await fetcher(range.start, range.size);
            stats?.recordPrefetchTime(Date.now() - fetchStart);
            perf?.end(perfStartTime, 'targetReadPrefetchMs', 'targetReadPrefetchCalls');
            if (!data) {
                continue;
            }
            stats?.recordRefreshRead();
            this.write(range.start, data);
        }
        this.requestedRanges.length = 0;
        return { ranges: merged, bytes: totalBytes, count: merged.length };
    }

    public read(start: number, size: number): Uint8Array | undefined {
        if (size <= 0) {
            return undefined;
        }
        const seg = this.findSegmentCovering(this.segments, start, size);
        if (!seg) {
            return undefined;
        }
        const rel = start - seg.start;
        return seg.data.subarray(rel, rel + size);
    }

    public getMissingRanges(start: number, size: number): Array<{ start: number; size: number }> {
        const missing: Array<{ start: number; size: number }> = [];
        if (size <= 0) {
            return missing;
        }
        const end = start + size;
        const segments = this.segments.slice().sort((a, b) => a.start - b.start);
        let cursor = start;
        for (const seg of segments) {
            const segEnd = seg.start + seg.data.length;
            if (segEnd <= cursor) {
                continue;
            }
            if (seg.start > cursor) {
                const gapEnd = Math.min(seg.start, end);
                missing.push({ start: cursor, size: gapEnd - cursor });
                cursor = gapEnd;
            }
            cursor = Math.max(cursor, segEnd);
            if (cursor >= end) {
                break;
            }
        }
        if (cursor < end) {
            missing.push({ start: cursor, size: end - cursor });
        }
        return missing;
    }

    public write(start: number, data: Uint8Array): void {
        if (data.length === 0) {
            return;
        }
        this.mergeSegments(this.segments, start, data);
    }

    public recordRequestRange(start: number, size: number): void {
        if (size <= 0) {
            return;
        }
        for (const range of this.requestedRanges) {
            if (range.start === start && range.size === size) {
                return;
            }
        }
        this.requestedRanges.push({ start, size });
    }

    private findSegmentCovering(segments: TargetReadSegment[], start: number, size: number): TargetReadSegment | undefined {
        const end = start + size;
        for (const seg of segments) {
            const segEnd = seg.start + seg.data.length;
            if (start >= seg.start && end <= segEnd) {
                return seg;
            }
        }
        return undefined;
    }

    private mergeSegments(segments: TargetReadSegment[], start: number, data: Uint8Array): void {
        const end = start + data.length;
        const overlapping: TargetReadSegment[] = [];
        const remaining: TargetReadSegment[] = [];

        for (const seg of segments) {
            const segEnd = seg.start + seg.data.length;
            // Merge only overlapping or directly adjacent segments (no gaps).
            const overlaps = !(segEnd < start || seg.start > end);
            if (overlaps) {
                overlapping.push(seg);
            } else {
                remaining.push(seg);
            }
        }

        let mergedStart = start;
        let mergedEnd = end;
        for (const seg of overlapping) {
            mergedStart = Math.min(mergedStart, seg.start);
            mergedEnd = Math.max(mergedEnd, seg.start + seg.data.length);
        }

        const mergedData = new Uint8Array(mergedEnd - mergedStart);
        for (const seg of overlapping) {
            mergedData.set(seg.data, seg.start - mergedStart);
        }
        mergedData.set(data, start - mergedStart);

        remaining.push({ start: mergedStart, data: mergedData });
        remaining.sort((a, b) => a.start - b.start);
        segments.length = 0;
        segments.push(...remaining);
    }

    private mergeRanges(ranges: TargetReadRange[], gap: number): TargetReadRange[] {
        if (ranges.length === 0) {
            return [];
        }
        const sorted = ranges
            .filter(range => range.size > 0)
            .slice()
            .sort((a, b) => a.start - b.start);
        if (sorted.length === 0) {
            return [];
        }
        const merged: TargetReadRange[] = [];
        let current = { start: sorted[0].start, size: sorted[0].size };
        for (const range of sorted.slice(1)) {
            const currentEnd = current.start + current.size;
            const rangeEnd = range.start + range.size;
            const shouldMerge = range.start <= currentEnd + gap;
            if (shouldMerge) {
                current.size = Math.max(currentEnd, rangeEnd) - current.start;
                continue;
            }
            merged.push(current);
            current = { start: range.start, size: range.size };
        }
        merged.push(current);
        return merged;
    }
}
