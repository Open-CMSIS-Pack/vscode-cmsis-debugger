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

export type PerfStats = {
    evalMs: number;
    evalCalls: number;
    evalReadMs: number;
    evalReadCalls: number;
    evalWriteMs: number;
    evalWriteCalls: number;
    formatMs: number;
    formatCalls: number;
    guiNameMs: number;
    guiNameCalls: number;
    guiValueMs: number;
    guiValueCalls: number;
    guiTreeMs: number;
    guiTreeCalls: number;
    guiTreeDetachMs: number;
    guiTreeDetachCalls: number;
};

type PerfMsKey = 'evalMs' | 'evalReadMs' | 'evalWriteMs' | 'formatMs' | 'guiNameMs' | 'guiValueMs' | 'guiTreeMs' | 'guiTreeDetachMs';
type PerfCallsKey = 'evalCalls' | 'evalReadCalls' | 'evalWriteCalls' | 'formatCalls' | 'guiNameCalls' | 'guiValueCalls' | 'guiTreeCalls' | 'guiTreeDetachCalls';

let enabled = false;
const stats: PerfStats = {
    evalMs: 0,
    evalCalls: 0,
    evalReadMs: 0,
    evalReadCalls: 0,
    evalWriteMs: 0,
    evalWriteCalls: 0,
    formatMs: 0,
    formatCalls: 0,
    guiNameMs: 0,
    guiNameCalls: 0,
    guiValueMs: 0,
    guiValueCalls: 0,
    guiTreeMs: 0,
    guiTreeCalls: 0,
    guiTreeDetachMs: 0,
    guiTreeDetachCalls: 0,
};

export function setPerfEnabled(value: boolean): void {
    enabled = value;
}

export function resetPerfStats(): void {
    stats.evalMs = 0;
    stats.evalCalls = 0;
    stats.evalReadMs = 0;
    stats.evalReadCalls = 0;
    stats.evalWriteMs = 0;
    stats.evalWriteCalls = 0;
    stats.formatMs = 0;
    stats.formatCalls = 0;
    stats.guiNameMs = 0;
    stats.guiNameCalls = 0;
    stats.guiValueMs = 0;
    stats.guiValueCalls = 0;
    stats.guiTreeMs = 0;
    stats.guiTreeCalls = 0;
    stats.guiTreeDetachMs = 0;
    stats.guiTreeDetachCalls = 0;
}

export function getPerfStats(): PerfStats {
    return { ...stats };
}

export function perfStart(): number {
    return enabled ? Date.now() : 0;
}

export function perfEnd(start: number, msKey: PerfMsKey, callsKey: PerfCallsKey): void {
    if (!enabled || start === 0) {
        return;
    }
    stats[msKey] += Date.now() - start;
    stats[callsKey] += 1;
}
