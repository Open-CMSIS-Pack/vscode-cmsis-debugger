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

import { performance } from 'node:perf_hooks';

export type BackendPerfStats = {
    evalMs: number;
    evalCalls: number;
    evalIntrinsicArgsMs: number;
    evalIntrinsicArgsCalls: number;
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
    printfCacheHits: number;
    printfCacheMiss: number;
    readListResolveMs: number;
    readListResolveCalls: number;
    readListBatchMs: number;
    readListBatchCalls: number;
    readListLoopMs: number;
    readListLoopCalls: number;
    readListStoreMs: number;
    readListStoreCalls: number;
    targetReadCacheHitMs: number;
    targetReadCacheHitCalls: number;
    targetReadCacheMissMs: number;
    targetReadCacheMissCalls: number;
    targetReadPrefetchMs: number;
    targetReadPrefetchCalls: number;
    targetReadFromTargetMs: number;
    targetReadFromTargetCalls: number;
    symbolFindMs: number;
    symbolFindCalls: number;
    symbolSizeMs: number;
    symbolSizeCalls: number;
    symbolOffsetMs: number;
    symbolOffsetCalls: number;
    evalNodeIdentifierCalls: number;
    evalNodeMemberCalls: number;
    evalNodeArrayCalls: number;
    evalNodeCallCalls: number;
    evalNodeEvalPointCalls: number;
    evalNodeUnaryCalls: number;
    evalNodeUpdateCalls: number;
    evalNodeBinaryCalls: number;
    evalNodeConditionalCalls: number;
    evalNodeAssignmentCalls: number;
    evalNodePrintfCalls: number;
    evalNodeFormatCalls: number;
    evalNodeTextCalls: number;
    evalNodeLiteralCalls: number;
    evalNodeOtherCalls: number;
    guiItemNodes: number;
    guiPrintNodes: number;
    guiOutNodes: number;
    printfSpecD: number;
    printfSpecU: number;
    printfSpecX: number;
    printfSpecT: number;
    printfSpecC: number;
    printfSpecS: number;
    printfSpecE: number;
    printfSpecI: number;
    printfSpecJ: number;
    printfSpecN: number;
    printfSpecM: number;
    printfSpecTFloat: number;
    printfSpecUUint: number;
    printfSpecPercent: number;
    printfSpecOther: number;
    printfValueNumber: number;
    printfValueBigInt: number;
    printfValueString: number;
    printfValueBytes: number;
    printfValueOther: number;
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
    | 'evalIntrinsicArgsMs'
    | 'evalReadMs'
    | 'evalWriteMs'
    | 'formatMs'
    | 'guiNameMs'
    | 'guiValueMs'
    | 'guiTreeMs'
    | 'guiTreeDetachMs'
    | 'printfMs'
    | 'readListResolveMs'
    | 'readListBatchMs'
    | 'readListLoopMs'
    | 'readListStoreMs'
    | 'targetReadCacheHitMs'
    | 'targetReadCacheMissMs'
    | 'targetReadPrefetchMs'
    | 'targetReadFromTargetMs'
    | 'symbolFindMs'
    | 'symbolSizeMs'
    | 'symbolOffsetMs';
type BackendPerfCallsKey =
    | 'evalCalls'
    | 'evalIntrinsicArgsCalls'
    | 'evalReadCalls'
    | 'evalWriteCalls'
    | 'formatCalls'
    | 'guiNameCalls'
    | 'guiValueCalls'
    | 'guiTreeCalls'
    | 'guiTreeDetachCalls'
    | 'printfCalls'
    | 'readListResolveCalls'
    | 'readListBatchCalls'
    | 'readListLoopCalls'
    | 'readListStoreCalls'
    | 'targetReadCacheHitCalls'
    | 'targetReadCacheMissCalls'
    | 'targetReadPrefetchCalls'
    | 'targetReadFromTargetCalls'
    | 'symbolFindCalls'
    | 'symbolSizeCalls'
    | 'symbolOffsetCalls';

type UiPerfMsKey = 'treeViewGetTreeItemMs' | 'treeViewResolveItemMs' | 'treeViewGetChildrenMs';
type UiPerfCallsKey = 'treeViewGetTreeItemCalls' | 'treeViewResolveItemCalls' | 'treeViewGetChildrenCalls';

let backendEnabled = false;
let uiEnabled = false;

const backendStats: BackendPerfStats = {
    evalMs: 0,
    evalCalls: 0,
    evalIntrinsicArgsMs: 0,
    evalIntrinsicArgsCalls: 0,
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
    printfCacheHits: 0,
    printfCacheMiss: 0,
    readListResolveMs: 0,
    readListResolveCalls: 0,
    readListBatchMs: 0,
    readListBatchCalls: 0,
    readListLoopMs: 0,
    readListLoopCalls: 0,
    readListStoreMs: 0,
    readListStoreCalls: 0,
    targetReadCacheHitMs: 0,
    targetReadCacheHitCalls: 0,
    targetReadCacheMissMs: 0,
    targetReadCacheMissCalls: 0,
    targetReadPrefetchMs: 0,
    targetReadPrefetchCalls: 0,
    targetReadFromTargetMs: 0,
    targetReadFromTargetCalls: 0,
    symbolFindMs: 0,
    symbolFindCalls: 0,
    symbolSizeMs: 0,
    symbolSizeCalls: 0,
    symbolOffsetMs: 0,
    symbolOffsetCalls: 0,
    evalNodeIdentifierCalls: 0,
    evalNodeMemberCalls: 0,
    evalNodeArrayCalls: 0,
    evalNodeCallCalls: 0,
    evalNodeEvalPointCalls: 0,
    evalNodeUnaryCalls: 0,
    evalNodeUpdateCalls: 0,
    evalNodeBinaryCalls: 0,
    evalNodeConditionalCalls: 0,
    evalNodeAssignmentCalls: 0,
    evalNodePrintfCalls: 0,
    evalNodeFormatCalls: 0,
    evalNodeTextCalls: 0,
    evalNodeLiteralCalls: 0,
    evalNodeOtherCalls: 0,
    guiItemNodes: 0,
    guiPrintNodes: 0,
    guiOutNodes: 0,
    printfSpecD: 0,
    printfSpecU: 0,
    printfSpecX: 0,
    printfSpecT: 0,
    printfSpecC: 0,
    printfSpecS: 0,
    printfSpecE: 0,
    printfSpecI: 0,
    printfSpecJ: 0,
    printfSpecN: 0,
    printfSpecM: 0,
    printfSpecTFloat: 0,
    printfSpecUUint: 0,
    printfSpecPercent: 0,
    printfSpecOther: 0,
    printfValueNumber: 0,
    printfValueBigInt: 0,
    printfValueString: 0,
    printfValueBytes: 0,
    printfValueOther: 0,
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
    backendStats.evalIntrinsicArgsMs = 0;
    backendStats.evalIntrinsicArgsCalls = 0;
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
    backendStats.printfCacheHits = 0;
    backendStats.printfCacheMiss = 0;
    backendStats.readListResolveMs = 0;
    backendStats.readListResolveCalls = 0;
    backendStats.readListBatchMs = 0;
    backendStats.readListBatchCalls = 0;
    backendStats.readListLoopMs = 0;
    backendStats.readListLoopCalls = 0;
    backendStats.readListStoreMs = 0;
    backendStats.readListStoreCalls = 0;
    backendStats.targetReadCacheHitMs = 0;
    backendStats.targetReadCacheHitCalls = 0;
    backendStats.targetReadCacheMissMs = 0;
    backendStats.targetReadCacheMissCalls = 0;
    backendStats.targetReadPrefetchMs = 0;
    backendStats.targetReadPrefetchCalls = 0;
    backendStats.targetReadFromTargetMs = 0;
    backendStats.targetReadFromTargetCalls = 0;
    backendStats.symbolFindMs = 0;
    backendStats.symbolFindCalls = 0;
    backendStats.symbolSizeMs = 0;
    backendStats.symbolSizeCalls = 0;
    backendStats.symbolOffsetMs = 0;
    backendStats.symbolOffsetCalls = 0;
    backendStats.evalNodeIdentifierCalls = 0;
    backendStats.evalNodeMemberCalls = 0;
    backendStats.evalNodeArrayCalls = 0;
    backendStats.evalNodeCallCalls = 0;
    backendStats.evalNodeEvalPointCalls = 0;
    backendStats.evalNodeUnaryCalls = 0;
    backendStats.evalNodeUpdateCalls = 0;
    backendStats.evalNodeBinaryCalls = 0;
    backendStats.evalNodeConditionalCalls = 0;
    backendStats.evalNodeAssignmentCalls = 0;
    backendStats.evalNodePrintfCalls = 0;
    backendStats.evalNodeFormatCalls = 0;
    backendStats.evalNodeTextCalls = 0;
    backendStats.evalNodeLiteralCalls = 0;
    backendStats.evalNodeOtherCalls = 0;
    backendStats.guiItemNodes = 0;
    backendStats.guiPrintNodes = 0;
    backendStats.guiOutNodes = 0;
    backendStats.printfSpecD = 0;
    backendStats.printfSpecU = 0;
    backendStats.printfSpecX = 0;
    backendStats.printfSpecT = 0;
    backendStats.printfSpecC = 0;
    backendStats.printfSpecS = 0;
    backendStats.printfSpecE = 0;
    backendStats.printfSpecI = 0;
    backendStats.printfSpecJ = 0;
    backendStats.printfSpecN = 0;
    backendStats.printfSpecM = 0;
    backendStats.printfSpecTFloat = 0;
    backendStats.printfSpecUUint = 0;
    backendStats.printfSpecPercent = 0;
    backendStats.printfSpecOther = 0;
    backendStats.printfValueNumber = 0;
    backendStats.printfValueBigInt = 0;
    backendStats.printfValueString = 0;
    backendStats.printfValueBytes = 0;
    backendStats.printfValueOther = 0;
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
    const ms = (value: number) => Math.max(0, Math.floor(value));
    return `[SCVD][perf] evalMs=${ms(backendStats.evalMs)} evalCalls=${backendStats.evalCalls} evalIntrinsicArgsMs=${ms(backendStats.evalIntrinsicArgsMs)} evalIntrinsicArgsCalls=${backendStats.evalIntrinsicArgsCalls} evalReadMs=${ms(backendStats.evalReadMs)} evalReadCalls=${backendStats.evalReadCalls} evalWriteMs=${ms(backendStats.evalWriteMs)} evalWriteCalls=${backendStats.evalWriteCalls} formatMs=${ms(backendStats.formatMs)} formatCalls=${backendStats.formatCalls} guiNameMs=${ms(backendStats.guiNameMs)} guiNameCalls=${backendStats.guiNameCalls} guiValueMs=${ms(backendStats.guiValueMs)} guiValueCalls=${backendStats.guiValueCalls} guiTreeMs=${ms(backendStats.guiTreeMs)} guiTreeCalls=${backendStats.guiTreeCalls} guiTreeDetachMs=${ms(backendStats.guiTreeDetachMs)} guiTreeDetachCalls=${backendStats.guiTreeDetachCalls} printfMs=${ms(backendStats.printfMs)} printfCalls=${backendStats.printfCalls} printfCacheHits=${backendStats.printfCacheHits} printfCacheMiss=${backendStats.printfCacheMiss} readListResolveMs=${ms(backendStats.readListResolveMs)} readListResolveCalls=${backendStats.readListResolveCalls} readListBatchMs=${ms(backendStats.readListBatchMs)} readListBatchCalls=${backendStats.readListBatchCalls} readListLoopMs=${ms(backendStats.readListLoopMs)} readListLoopCalls=${backendStats.readListLoopCalls} readListStoreMs=${ms(backendStats.readListStoreMs)} readListStoreCalls=${backendStats.readListStoreCalls} targetReadCacheHitMs=${ms(backendStats.targetReadCacheHitMs)} targetReadCacheHitCalls=${backendStats.targetReadCacheHitCalls} targetReadCacheMissMs=${ms(backendStats.targetReadCacheMissMs)} targetReadCacheMissCalls=${backendStats.targetReadCacheMissCalls} targetReadPrefetchMs=${ms(backendStats.targetReadPrefetchMs)} targetReadPrefetchCalls=${backendStats.targetReadPrefetchCalls} targetReadFromTargetMs=${ms(backendStats.targetReadFromTargetMs)} targetReadFromTargetCalls=${backendStats.targetReadFromTargetCalls} symbolFindMs=${ms(backendStats.symbolFindMs)} symbolFindCalls=${backendStats.symbolFindCalls} symbolSizeMs=${ms(backendStats.symbolSizeMs)} symbolSizeCalls=${backendStats.symbolSizeCalls} symbolOffsetMs=${ms(backendStats.symbolOffsetMs)} symbolOffsetCalls=${backendStats.symbolOffsetCalls} evalNodeIdentifierCalls=${backendStats.evalNodeIdentifierCalls} evalNodeMemberCalls=${backendStats.evalNodeMemberCalls} evalNodeArrayCalls=${backendStats.evalNodeArrayCalls} evalNodeCallCalls=${backendStats.evalNodeCallCalls} evalNodeEvalPointCalls=${backendStats.evalNodeEvalPointCalls} evalNodeUnaryCalls=${backendStats.evalNodeUnaryCalls} evalNodeUpdateCalls=${backendStats.evalNodeUpdateCalls} evalNodeBinaryCalls=${backendStats.evalNodeBinaryCalls} evalNodeConditionalCalls=${backendStats.evalNodeConditionalCalls} evalNodeAssignmentCalls=${backendStats.evalNodeAssignmentCalls} evalNodePrintfCalls=${backendStats.evalNodePrintfCalls} evalNodeFormatCalls=${backendStats.evalNodeFormatCalls} evalNodeTextCalls=${backendStats.evalNodeTextCalls} evalNodeLiteralCalls=${backendStats.evalNodeLiteralCalls} evalNodeOtherCalls=${backendStats.evalNodeOtherCalls} guiItemNodes=${backendStats.guiItemNodes} guiPrintNodes=${backendStats.guiPrintNodes} guiOutNodes=${backendStats.guiOutNodes} printfSpecD=${backendStats.printfSpecD} printfSpecU=${backendStats.printfSpecU} printfSpecX=${backendStats.printfSpecX} printfSpecT=${backendStats.printfSpecT} printfSpecC=${backendStats.printfSpecC} printfSpecS=${backendStats.printfSpecS} printfSpecE=${backendStats.printfSpecE} printfSpecI=${backendStats.printfSpecI} printfSpecJ=${backendStats.printfSpecJ} printfSpecN=${backendStats.printfSpecN} printfSpecM=${backendStats.printfSpecM} printfSpecTFloat=${backendStats.printfSpecTFloat} printfSpecUUint=${backendStats.printfSpecUUint} printfSpecPercent=${backendStats.printfSpecPercent} printfSpecOther=${backendStats.printfSpecOther} printfValueNumber=${backendStats.printfValueNumber} printfValueBigInt=${backendStats.printfValueBigInt} printfValueString=${backendStats.printfValueString} printfValueBytes=${backendStats.printfValueBytes} printfValueOther=${backendStats.printfValueOther}`;
}

export function formatPerfUiSummary(): string {
    const ms = (value: number) => Math.max(0, Math.floor(value));
    return `[SCVD][perf-ui] treeViewGetTreeItemMs=${ms(uiStats.treeViewGetTreeItemMs)} treeViewGetTreeItemCalls=${uiStats.treeViewGetTreeItemCalls} treeViewResolveItemMs=${ms(uiStats.treeViewResolveItemMs)} treeViewResolveItemCalls=${uiStats.treeViewResolveItemCalls} treeViewGetChildrenMs=${ms(uiStats.treeViewGetChildrenMs)} treeViewGetChildrenCalls=${uiStats.treeViewGetChildrenCalls}`;
}

export function perfStart(): number {
    return backendEnabled ? performance.now() : 0;
}

export function perfStartUi(): number {
    return uiEnabled ? performance.now() : 0;
}

export function perfEnd(start: number, msKey: BackendPerfMsKey, callsKey: BackendPerfCallsKey): void {
    if (!backendEnabled || start === 0) {
        return;
    }
    backendStats[msKey] += performance.now() - start;
    backendStats[callsKey] += 1;
}

export function perfEndUi(start: number, msKey: UiPerfMsKey, callsKey: UiPerfCallsKey): void {
    if (!uiEnabled || start === 0) {
        return;
    }
    uiStats[msKey] += performance.now() - start;
    uiStats[callsKey] += 1;
}

export function recordGuiItemNode(): void {
    if (backendEnabled) {
        backendStats.guiItemNodes += 1;
    }
}

export function recordGuiPrintNode(): void {
    if (backendEnabled) {
        backendStats.guiPrintNodes += 1;
    }
}

export function recordGuiOutNode(): void {
    if (backendEnabled) {
        backendStats.guiOutNodes += 1;
    }
}

export function recordPrintfSpec(spec: string): void {
    if (!backendEnabled) {
        return;
    }
    switch (spec) {
        case 'd':
            backendStats.printfSpecD += 1;
            return;
        case 'u':
            backendStats.printfSpecU += 1;
            return;
        case 'x':
            backendStats.printfSpecX += 1;
            return;
        case 't':
            backendStats.printfSpecT += 1;
            return;
        case 'C':
            backendStats.printfSpecC += 1;
            return;
        case 'S':
            backendStats.printfSpecS += 1;
            return;
        case 'E':
            backendStats.printfSpecE += 1;
            return;
        case 'I':
            backendStats.printfSpecI += 1;
            return;
        case 'J':
            backendStats.printfSpecJ += 1;
            return;
        case 'N':
            backendStats.printfSpecN += 1;
            return;
        case 'M':
            backendStats.printfSpecM += 1;
            return;
        case 'T':
            backendStats.printfSpecTFloat += 1;
            return;
        case 'U':
            backendStats.printfSpecUUint += 1;
            return;
        case '%':
            backendStats.printfSpecPercent += 1;
            return;
        default:
            backendStats.printfSpecOther += 1;
            return;
    }
}

export function recordPrintfValueType(value: unknown): void {
    if (!backendEnabled) {
        return;
    }
    if (typeof value === 'number') {
        backendStats.printfValueNumber += 1;
        return;
    }
    if (typeof value === 'bigint') {
        backendStats.printfValueBigInt += 1;
        return;
    }
    if (typeof value === 'string') {
        backendStats.printfValueString += 1;
        return;
    }
    if (value instanceof Uint8Array) {
        backendStats.printfValueBytes += 1;
        return;
    }
    backendStats.printfValueOther += 1;
}

export function recordPrintfCacheHit(): void {
    if (backendEnabled) {
        backendStats.printfCacheHits += 1;
    }
}

export function recordPrintfCacheMiss(): void {
    if (backendEnabled) {
        backendStats.printfCacheMiss += 1;
    }
}

export function recordEvalNodeKind(kind: string): void {
    if (!backendEnabled) {
        return;
    }
    switch (kind) {
        case 'Identifier':
            backendStats.evalNodeIdentifierCalls += 1;
            return;
        case 'MemberAccess':
            backendStats.evalNodeMemberCalls += 1;
            return;
        case 'ArrayIndex':
            backendStats.evalNodeArrayCalls += 1;
            return;
        case 'CallExpression':
            backendStats.evalNodeCallCalls += 1;
            return;
        case 'EvalPointCall':
            backendStats.evalNodeEvalPointCalls += 1;
            return;
        case 'UnaryExpression':
            backendStats.evalNodeUnaryCalls += 1;
            return;
        case 'UpdateExpression':
            backendStats.evalNodeUpdateCalls += 1;
            return;
        case 'BinaryExpression':
            backendStats.evalNodeBinaryCalls += 1;
            return;
        case 'ConditionalExpression':
            backendStats.evalNodeConditionalCalls += 1;
            return;
        case 'AssignmentExpression':
            backendStats.evalNodeAssignmentCalls += 1;
            return;
        case 'PrintfExpression':
            backendStats.evalNodePrintfCalls += 1;
            return;
        case 'FormatSegment':
            backendStats.evalNodeFormatCalls += 1;
            return;
        case 'TextSegment':
            backendStats.evalNodeTextCalls += 1;
            return;
        case 'NumberLiteral':
        case 'StringLiteral':
        case 'BooleanLiteral':
            backendStats.evalNodeLiteralCalls += 1;
            return;
        default:
            backendStats.evalNodeOtherCalls += 1;
            return;
    }
}
