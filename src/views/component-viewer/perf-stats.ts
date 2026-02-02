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

export type BackendPerfStats = {
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
    printfMs: number;
    printfCalls: number;
};

export type UiPerfStats = {
    treeViewGetTreeItemMs: number;
    treeViewGetTreeItemCalls: number;
    treeViewResolveItemMs: number;
    treeViewResolveItemCalls: number;
    treeViewGetChildrenMs: number;
    treeViewGetChildrenCalls: number;
};

type BackendPerfMsKey =
    | 'evalMs'
    | 'evalReadMs'
    | 'evalWriteMs'
    | 'formatMs'
    | 'guiNameMs'
    | 'guiValueMs'
    | 'guiTreeMs'
    | 'guiTreeDetachMs'
    | 'printfMs';
type BackendPerfCallsKey =
    | 'evalCalls'
    | 'evalReadCalls'
    | 'evalWriteCalls'
    | 'formatCalls'
    | 'guiNameCalls'
    | 'guiValueCalls'
    | 'guiTreeCalls'
    | 'guiTreeDetachCalls'
    | 'printfCalls';

type UiPerfMsKey = 'treeViewGetTreeItemMs' | 'treeViewResolveItemMs' | 'treeViewGetChildrenMs';
type UiPerfCallsKey = 'treeViewGetTreeItemCalls' | 'treeViewResolveItemCalls' | 'treeViewGetChildrenCalls';

let backendEnabled = false;
let uiEnabled = false;

const backendStats: BackendPerfStats = {
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
    printfMs: 0,
    printfCalls: 0,
};

const uiStats: UiPerfStats = {
    treeViewGetTreeItemMs: 0,
    treeViewGetTreeItemCalls: 0,
    treeViewResolveItemMs: 0,
    treeViewResolveItemCalls: 0,
    treeViewGetChildrenMs: 0,
    treeViewGetChildrenCalls: 0,
};

export function setPerfBackendEnabled(value: boolean): void {
    backendEnabled = value;
}

export function setPerfUiEnabled(value: boolean): void {
    uiEnabled = value;
}

export function resetPerfBackendStats(): void {
    backendStats.evalMs = 0;
    backendStats.evalCalls = 0;
    backendStats.evalReadMs = 0;
    backendStats.evalReadCalls = 0;
    backendStats.evalWriteMs = 0;
    backendStats.evalWriteCalls = 0;
    backendStats.formatMs = 0;
    backendStats.formatCalls = 0;
    backendStats.guiNameMs = 0;
    backendStats.guiNameCalls = 0;
    backendStats.guiValueMs = 0;
    backendStats.guiValueCalls = 0;
    backendStats.guiTreeMs = 0;
    backendStats.guiTreeCalls = 0;
    backendStats.guiTreeDetachMs = 0;
    backendStats.guiTreeDetachCalls = 0;
    backendStats.printfMs = 0;
    backendStats.printfCalls = 0;
}

export function resetPerfUiStats(): void {
    uiStats.treeViewGetTreeItemMs = 0;
    uiStats.treeViewGetTreeItemCalls = 0;
    uiStats.treeViewResolveItemMs = 0;
    uiStats.treeViewResolveItemCalls = 0;
    uiStats.treeViewGetChildrenMs = 0;
    uiStats.treeViewGetChildrenCalls = 0;
}

export function getPerfBackendStats(): BackendPerfStats {
    return { ...backendStats };
}

export function getPerfUiStats(): UiPerfStats {
    return { ...uiStats };
}

export function perfUiHasData(): boolean {
    return (
        uiStats.treeViewGetTreeItemCalls > 0 ||
        uiStats.treeViewResolveItemCalls > 0 ||
        uiStats.treeViewGetChildrenCalls > 0
    );
}

export function formatPerfSummary(): string {
    return `[SCVD][perf] evalMs=${backendStats.evalMs} evalCalls=${backendStats.evalCalls} evalReadMs=${backendStats.evalReadMs} evalReadCalls=${backendStats.evalReadCalls} evalWriteMs=${backendStats.evalWriteMs} evalWriteCalls=${backendStats.evalWriteCalls} formatMs=${backendStats.formatMs} formatCalls=${backendStats.formatCalls} guiNameMs=${backendStats.guiNameMs} guiNameCalls=${backendStats.guiNameCalls} guiValueMs=${backendStats.guiValueMs} guiValueCalls=${backendStats.guiValueCalls} guiTreeMs=${backendStats.guiTreeMs} guiTreeCalls=${backendStats.guiTreeCalls} guiTreeDetachMs=${backendStats.guiTreeDetachMs} guiTreeDetachCalls=${backendStats.guiTreeDetachCalls} printfMs=${backendStats.printfMs} printfCalls=${backendStats.printfCalls}`;
}

export function formatPerfUiSummary(): string {
    return `[SCVD][perf-ui] treeViewGetTreeItemMs=${uiStats.treeViewGetTreeItemMs} treeViewGetTreeItemCalls=${uiStats.treeViewGetTreeItemCalls} treeViewResolveItemMs=${uiStats.treeViewResolveItemMs} treeViewResolveItemCalls=${uiStats.treeViewResolveItemCalls} treeViewGetChildrenMs=${uiStats.treeViewGetChildrenMs} treeViewGetChildrenCalls=${uiStats.treeViewGetChildrenCalls}`;
}

export function perfStart(): number {
    return backendEnabled ? Date.now() : 0;
}

export function perfStartUi(): number {
    return uiEnabled ? Date.now() : 0;
}

export function perfEnd(start: number, msKey: BackendPerfMsKey, callsKey: BackendPerfCallsKey): void {
    if (!backendEnabled || start === 0) {
        return;
    }
    backendStats[msKey] += Date.now() - start;
    backendStats[callsKey] += 1;
}

export function perfEndUi(start: number, msKey: UiPerfMsKey, callsKey: UiPerfCallsKey): void {
    if (!uiEnabled || start === 0) {
        return;
    }
    uiStats[msKey] += Date.now() - start;
    uiStats[callsKey] += 1;
}
