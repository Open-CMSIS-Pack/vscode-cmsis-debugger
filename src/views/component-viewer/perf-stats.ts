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
    treeViewGetTreeItemMs: number;
    treeViewGetTreeItemCalls: number;
    treeViewResolveItemMs: number;
    treeViewResolveItemCalls: number;
    treeViewGetChildrenMs: number;
    treeViewGetChildrenCalls: number;
    printfMs: number;
    printfCalls: number;
};

type PerfMsKey =
    | 'evalMs'
    | 'evalReadMs'
    | 'evalWriteMs'
    | 'formatMs'
    | 'guiNameMs'
    | 'guiValueMs'
    | 'guiTreeMs'
    | 'guiTreeDetachMs'
    | 'treeViewGetTreeItemMs'
    | 'treeViewResolveItemMs'
    | 'treeViewGetChildrenMs'
    | 'printfMs';
type PerfCallsKey =
    | 'evalCalls'
    | 'evalReadCalls'
    | 'evalWriteCalls'
    | 'formatCalls'
    | 'guiNameCalls'
    | 'guiValueCalls'
    | 'guiTreeCalls'
    | 'guiTreeDetachCalls'
    | 'treeViewGetTreeItemCalls'
    | 'treeViewResolveItemCalls'
    | 'treeViewGetChildrenCalls'
    | 'printfCalls';

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
    treeViewGetTreeItemMs: 0,
    treeViewGetTreeItemCalls: 0,
    treeViewResolveItemMs: 0,
    treeViewResolveItemCalls: 0,
    treeViewGetChildrenMs: 0,
    treeViewGetChildrenCalls: 0,
    printfMs: 0,
    printfCalls: 0,
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
    stats.treeViewGetTreeItemMs = 0;
    stats.treeViewGetTreeItemCalls = 0;
    stats.treeViewResolveItemMs = 0;
    stats.treeViewResolveItemCalls = 0;
    stats.treeViewGetChildrenMs = 0;
    stats.treeViewGetChildrenCalls = 0;
    stats.printfMs = 0;
    stats.printfCalls = 0;
}

export function getPerfStats(): PerfStats {
    return { ...stats };
}

export function formatPerfSummary(): string {
    return `[SCVD][perf] evalMs=${stats.evalMs} evalCalls=${stats.evalCalls} evalReadMs=${stats.evalReadMs} evalReadCalls=${stats.evalReadCalls} evalWriteMs=${stats.evalWriteMs} evalWriteCalls=${stats.evalWriteCalls} formatMs=${stats.formatMs} formatCalls=${stats.formatCalls} guiNameMs=${stats.guiNameMs} guiNameCalls=${stats.guiNameCalls} guiValueMs=${stats.guiValueMs} guiValueCalls=${stats.guiValueCalls} guiTreeMs=${stats.guiTreeMs} guiTreeCalls=${stats.guiTreeCalls} guiTreeDetachMs=${stats.guiTreeDetachMs} guiTreeDetachCalls=${stats.guiTreeDetachCalls} treeViewGetTreeItemMs=${stats.treeViewGetTreeItemMs} treeViewGetTreeItemCalls=${stats.treeViewGetTreeItemCalls} treeViewResolveItemMs=${stats.treeViewResolveItemMs} treeViewResolveItemCalls=${stats.treeViewResolveItemCalls} treeViewGetChildrenMs=${stats.treeViewGetChildrenMs} treeViewGetChildrenCalls=${stats.treeViewGetChildrenCalls} printfMs=${stats.printfMs} printfCalls=${stats.printfCalls}`;
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

export function perfEndMulti(start: number, entries: Array<[PerfMsKey, PerfCallsKey]>): void {
    if (!enabled || start === 0) {
        return;
    }
    const elapsed = Date.now() - start;
    for (const [msKey, callsKey] of entries) {
        stats[msKey] += elapsed;
        stats[callsKey] += 1;
    }
}
