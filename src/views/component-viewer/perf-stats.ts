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

type BackendPerfStats = {
    evalMs: number;
    evalCalls: number;
    evalIntrinsicArgsMs: number;
    evalIntrinsicArgsCalls: number;
    evalRunningIntrinsicMs: number;
    evalRunningIntrinsicCalls: number;
    evalPseudoMemberMs: number;
    evalPseudoMemberCalls: number;
    evalBinaryMs: number;
    evalBinaryCalls: number;
    evalBinaryTypedMs: number;
    evalBinaryTypedCalls: number;
    evalBinaryTypedOperandMs: number;
    evalBinaryTypedOperandCalls: number;
    evalBinaryTypedTypeMs: number;
    evalBinaryTypedTypeCalls: number;
    evalBinaryTypedOpMs: number;
    evalBinaryTypedOpCalls: number;
    evalBinaryTypedNormalizeMs: number;
    evalBinaryTypedNormalizeCalls: number;
    evalNodeCacheHitCalls: number;
    evalNodeCacheMissCalls: number;
    evalBinaryNoTypesMs: number;
    evalBinaryNoTypesCalls: number;
    evalOperandWithTypeMs: number;
    evalOperandWithTypeCalls: number;
    evalOperandValueMs: number;
    evalOperandValueCalls: number;
    evalNodeChildMs: number;
    evalNodeChildCalls: number;
    evalGetScalarTypeMs: number;
    evalGetScalarTypeCalls: number;
    evalGetValueTypeMs: number;
    evalGetValueTypeCalls: number;
    evalMustRefMs: number;
    evalMustRefCalls: number;
    evalMustReadMs: number;
    evalMustReadCalls: number;
    evalMustRefIdentifierMs: number;
    evalMustRefIdentifierCalls: number;
    evalMustRefMemberMs: number;
    evalMustRefMemberCalls: number;
    evalMustRefArrayMs: number;
    evalMustRefArrayCalls: number;
    evalHostGetSymbolRefMs: number;
    evalHostGetSymbolRefCalls: number;
    evalHostGetMemberRefMs: number;
    evalHostGetMemberRefCalls: number;
    evalHostGetElementRefMs: number;
    evalHostGetElementRefCalls: number;
    evalHostGetElementStrideMs: number;
    evalHostGetElementStrideCalls: number;
    evalHostGetByteWidthMs: number;
    evalHostGetByteWidthCalls: number;
    modelGetSymbolMs: number;
    modelGetSymbolCalls: number;
    modelGetMemberMs: number;
    modelGetMemberCalls: number;
    modelGetMemberOffsetMs: number;
    modelGetMemberOffsetCalls: number;
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
    evalNodeIdentifierMs: number;
    evalNodeMemberMs: number;
    evalNodeArrayMs: number;
    evalNodeBinaryMs: number;
    evalNodePrintfMs: number;
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

type UiPerfStats = {
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
    | 'evalRunningIntrinsicMs'
    | 'evalPseudoMemberMs'
    | 'evalBinaryMs'
    | 'evalBinaryTypedMs'
    | 'evalBinaryTypedOperandMs'
    | 'evalBinaryTypedTypeMs'
    | 'evalBinaryTypedOpMs'
    | 'evalBinaryTypedNormalizeMs'
    | 'evalBinaryNoTypesMs'
    | 'evalOperandWithTypeMs'
    | 'evalOperandValueMs'
    | 'evalNodeChildMs'
    | 'evalGetScalarTypeMs'
    | 'evalGetValueTypeMs'
    | 'evalMustRefMs'
    | 'evalMustReadMs'
    | 'evalMustRefIdentifierMs'
    | 'evalMustRefMemberMs'
    | 'evalMustRefArrayMs'
    | 'evalHostGetSymbolRefMs'
    | 'evalHostGetMemberRefMs'
    | 'evalHostGetElementRefMs'
    | 'evalHostGetElementStrideMs'
    | 'evalHostGetByteWidthMs'
    | 'modelGetSymbolMs'
    | 'modelGetMemberMs'
    | 'modelGetMemberOffsetMs'
    | 'evalReadMs'
    | 'evalWriteMs'
    | 'formatMs'
    | 'guiNameMs'
    | 'guiValueMs'
    | 'guiTreeMs'
    | 'guiTreeDetachMs'
    | 'printfMs'
    | 'evalNodeIdentifierMs'
    | 'evalNodeMemberMs'
    | 'evalNodeArrayMs'
    | 'evalNodeBinaryMs'
    | 'evalNodePrintfMs'
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
    | 'evalRunningIntrinsicCalls'
    | 'evalPseudoMemberCalls'
    | 'evalBinaryCalls'
    | 'evalBinaryTypedCalls'
    | 'evalBinaryTypedOperandCalls'
    | 'evalBinaryTypedTypeCalls'
    | 'evalBinaryTypedOpCalls'
    | 'evalBinaryTypedNormalizeCalls'
    | 'evalBinaryNoTypesCalls'
    | 'evalOperandWithTypeCalls'
    | 'evalOperandValueCalls'
    | 'evalNodeChildCalls'
    | 'evalGetScalarTypeCalls'
    | 'evalGetValueTypeCalls'
    | 'evalMustRefCalls'
    | 'evalMustReadCalls'
    | 'evalMustRefIdentifierCalls'
    | 'evalMustRefMemberCalls'
    | 'evalMustRefArrayCalls'
    | 'evalHostGetSymbolRefCalls'
    | 'evalHostGetMemberRefCalls'
    | 'evalHostGetElementRefCalls'
    | 'evalHostGetElementStrideCalls'
    | 'evalHostGetByteWidthCalls'
    | 'modelGetSymbolCalls'
    | 'modelGetMemberCalls'
    | 'modelGetMemberOffsetCalls'
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

export class PerfStats {
    private enabled = true;
    private backendEnabled = false;
    private uiEnabled = false;
    private backendStats: BackendPerfStats = PerfStats.createBackendStats();
    private uiStats: UiPerfStats = PerfStats.createUiStats();
    private executeAllStartMs = 0;
    private lastExecuteSummary = '';
    private lastPerfSummary = '';
    private lastUiSummary = '';

    constructor() {}

    public setBackendEnabled(value: boolean): void {
        this.backendEnabled = this.enabled && value;
    }

    public setUiEnabled(value: boolean): void {
        this.uiEnabled = this.enabled && value;
    }

    public isBackendEnabled(): boolean {
        return this.enabled && this.backendEnabled;
    }

    public resetBackendStats(): void {
        this.backendStats = PerfStats.createBackendStats();
    }

    public resetUiStats(): void {
        this.uiStats = PerfStats.createUiStats();
    }

    public backendHasData(): boolean {
        return this.enabled && this.backendEnabled && this.backendStats.evalCalls > 0;
    }

    public uiHasData(): boolean {
        return this.enabled && this.uiEnabled && (
            this.uiStats.treeViewGetTreeItemCalls > 0 ||
            this.uiStats.treeViewResolveItemCalls > 0 ||
            this.uiStats.treeViewGetChildrenCalls > 0
        );
    }

    public formatSummary(): string {
        if (!this.backendHasData()) {
            return '';
        }
        const ms = (value: number) => Math.max(0, Math.floor(value));
        const stats = this.backendStats;
        return `[SCVD][perf] evalMs=${ms(stats.evalMs)} evalCalls=${stats.evalCalls} evalIntrinsicArgsMs=${ms(stats.evalIntrinsicArgsMs)} evalIntrinsicArgsCalls=${stats.evalIntrinsicArgsCalls} evalRunningIntrinsicMs=${ms(stats.evalRunningIntrinsicMs)} evalRunningIntrinsicCalls=${stats.evalRunningIntrinsicCalls} evalPseudoMemberMs=${ms(stats.evalPseudoMemberMs)} evalPseudoMemberCalls=${stats.evalPseudoMemberCalls} evalBinaryMs=${ms(stats.evalBinaryMs)} evalBinaryCalls=${stats.evalBinaryCalls} evalBinaryTypedMs=${ms(stats.evalBinaryTypedMs)} evalBinaryTypedCalls=${stats.evalBinaryTypedCalls} evalBinaryTypedOperandMs=${ms(stats.evalBinaryTypedOperandMs)} evalBinaryTypedOperandCalls=${stats.evalBinaryTypedOperandCalls} evalBinaryTypedTypeMs=${ms(stats.evalBinaryTypedTypeMs)} evalBinaryTypedTypeCalls=${stats.evalBinaryTypedTypeCalls} evalBinaryTypedOpMs=${ms(stats.evalBinaryTypedOpMs)} evalBinaryTypedOpCalls=${stats.evalBinaryTypedOpCalls} evalBinaryTypedNormalizeMs=${ms(stats.evalBinaryTypedNormalizeMs)} evalBinaryTypedNormalizeCalls=${stats.evalBinaryTypedNormalizeCalls} evalBinaryNoTypesMs=${ms(stats.evalBinaryNoTypesMs)} evalBinaryNoTypesCalls=${stats.evalBinaryNoTypesCalls} evalOperandWithTypeMs=${ms(stats.evalOperandWithTypeMs)} evalOperandWithTypeCalls=${stats.evalOperandWithTypeCalls} evalOperandValueMs=${ms(stats.evalOperandValueMs)} evalOperandValueCalls=${stats.evalOperandValueCalls} evalNodeChildMs=${ms(stats.evalNodeChildMs)} evalNodeChildCalls=${stats.evalNodeChildCalls} evalGetScalarTypeMs=${ms(stats.evalGetScalarTypeMs)} evalGetScalarTypeCalls=${stats.evalGetScalarTypeCalls} evalGetValueTypeMs=${ms(stats.evalGetValueTypeMs)} evalGetValueTypeCalls=${stats.evalGetValueTypeCalls} evalMustRefMs=${ms(stats.evalMustRefMs)} evalMustRefCalls=${stats.evalMustRefCalls} evalMustReadMs=${ms(stats.evalMustReadMs)} evalMustReadCalls=${stats.evalMustReadCalls} evalMustRefIdentifierMs=${ms(stats.evalMustRefIdentifierMs)} evalMustRefIdentifierCalls=${stats.evalMustRefIdentifierCalls} evalMustRefMemberMs=${ms(stats.evalMustRefMemberMs)} evalMustRefMemberCalls=${stats.evalMustRefMemberCalls} evalMustRefArrayMs=${ms(stats.evalMustRefArrayMs)} evalMustRefArrayCalls=${stats.evalMustRefArrayCalls} evalHostGetSymbolRefMs=${ms(stats.evalHostGetSymbolRefMs)} evalHostGetSymbolRefCalls=${stats.evalHostGetSymbolRefCalls} evalHostGetMemberRefMs=${ms(stats.evalHostGetMemberRefMs)} evalHostGetMemberRefCalls=${stats.evalHostGetMemberRefCalls} evalHostGetElementRefMs=${ms(stats.evalHostGetElementRefMs)} evalHostGetElementRefCalls=${stats.evalHostGetElementRefCalls} evalHostGetElementStrideMs=${ms(stats.evalHostGetElementStrideMs)} evalHostGetElementStrideCalls=${stats.evalHostGetElementStrideCalls} evalHostGetByteWidthMs=${ms(stats.evalHostGetByteWidthMs)} evalHostGetByteWidthCalls=${stats.evalHostGetByteWidthCalls} modelGetSymbolMs=${ms(stats.modelGetSymbolMs)} modelGetSymbolCalls=${stats.modelGetSymbolCalls} modelGetMemberMs=${ms(stats.modelGetMemberMs)} modelGetMemberCalls=${stats.modelGetMemberCalls} modelGetMemberOffsetMs=${ms(stats.modelGetMemberOffsetMs)} modelGetMemberOffsetCalls=${stats.modelGetMemberOffsetCalls} evalReadMs=${ms(stats.evalReadMs)} evalReadCalls=${stats.evalReadCalls} evalWriteMs=${ms(stats.evalWriteMs)} evalWriteCalls=${stats.evalWriteCalls} formatMs=${ms(stats.formatMs)} formatCalls=${stats.formatCalls} guiNameMs=${ms(stats.guiNameMs)} guiNameCalls=${stats.guiNameCalls} guiValueMs=${ms(stats.guiValueMs)} guiValueCalls=${stats.guiValueCalls} guiTreeMs=${ms(stats.guiTreeMs)} guiTreeCalls=${stats.guiTreeCalls} guiTreeDetachMs=${ms(stats.guiTreeDetachMs)} guiTreeDetachCalls=${stats.guiTreeDetachCalls} printfMs=${ms(stats.printfMs)} printfCalls=${stats.printfCalls} printfCacheHits=${stats.printfCacheHits} printfCacheMiss=${stats.printfCacheMiss} evalNodeIdentifierMs=${ms(stats.evalNodeIdentifierMs)} evalNodeMemberMs=${ms(stats.evalNodeMemberMs)} evalNodeArrayMs=${ms(stats.evalNodeArrayMs)} evalNodeBinaryMs=${ms(stats.evalNodeBinaryMs)} evalNodePrintfMs=${ms(stats.evalNodePrintfMs)} readListResolveMs=${ms(stats.readListResolveMs)} readListResolveCalls=${stats.readListResolveCalls} readListBatchMs=${ms(stats.readListBatchMs)} readListBatchCalls=${stats.readListBatchCalls} readListLoopMs=${ms(stats.readListLoopMs)} readListLoopCalls=${stats.readListLoopCalls} readListStoreMs=${ms(stats.readListStoreMs)} readListStoreCalls=${stats.readListStoreCalls} targetReadCacheHitMs=${ms(stats.targetReadCacheHitMs)} targetReadCacheHitCalls=${stats.targetReadCacheHitCalls} targetReadCacheMissMs=${ms(stats.targetReadCacheMissMs)} targetReadCacheMissCalls=${stats.targetReadCacheMissCalls} targetReadPrefetchMs=${ms(stats.targetReadPrefetchMs)} targetReadPrefetchCalls=${stats.targetReadPrefetchCalls} targetReadFromTargetMs=${ms(stats.targetReadFromTargetMs)} targetReadFromTargetCalls=${stats.targetReadFromTargetCalls} symbolFindMs=${ms(stats.symbolFindMs)} symbolFindCalls=${stats.symbolFindCalls} symbolSizeMs=${ms(stats.symbolSizeMs)} symbolSizeCalls=${stats.symbolSizeCalls} symbolOffsetMs=${ms(stats.symbolOffsetMs)} symbolOffsetCalls=${stats.symbolOffsetCalls} evalNodeIdentifierCalls=${stats.evalNodeIdentifierCalls} evalNodeMemberCalls=${stats.evalNodeMemberCalls} evalNodeArrayCalls=${stats.evalNodeArrayCalls} evalNodeCallCalls=${stats.evalNodeCallCalls} evalNodeEvalPointCalls=${stats.evalNodeEvalPointCalls} evalNodeUnaryCalls=${stats.evalNodeUnaryCalls} evalNodeUpdateCalls=${stats.evalNodeUpdateCalls} evalNodeBinaryCalls=${stats.evalNodeBinaryCalls} evalNodeConditionalCalls=${stats.evalNodeConditionalCalls} evalNodeAssignmentCalls=${stats.evalNodeAssignmentCalls} evalNodePrintfCalls=${stats.evalNodePrintfCalls} evalNodeFormatCalls=${stats.evalNodeFormatCalls} evalNodeTextCalls=${stats.evalNodeTextCalls} evalNodeLiteralCalls=${stats.evalNodeLiteralCalls} evalNodeOtherCalls=${stats.evalNodeOtherCalls} evalNodeCacheHitCalls=${stats.evalNodeCacheHitCalls} evalNodeCacheMissCalls=${stats.evalNodeCacheMissCalls} guiItemNodes=${stats.guiItemNodes} guiPrintNodes=${stats.guiPrintNodes} guiOutNodes=${stats.guiOutNodes} printfSpecD=${stats.printfSpecD} printfSpecU=${stats.printfSpecU} printfSpecX=${stats.printfSpecX} printfSpecT=${stats.printfSpecT} printfSpecC=${stats.printfSpecC} printfSpecS=${stats.printfSpecS} printfSpecE=${stats.printfSpecE} printfSpecI=${stats.printfSpecI} printfSpecJ=${stats.printfSpecJ} printfSpecN=${stats.printfSpecN} printfSpecM=${stats.printfSpecM} printfSpecTFloat=${stats.printfSpecTFloat} printfSpecUUint=${stats.printfSpecUUint} printfSpecPercent=${stats.printfSpecPercent} printfSpecOther=${stats.printfSpecOther} printfValueNumber=${stats.printfValueNumber} printfValueBigInt=${stats.printfValueBigInt} printfValueString=${stats.printfValueString} printfValueBytes=${stats.printfValueBytes} printfValueOther=${stats.printfValueOther}`;
    }

    public formatUiSummary(): string {
        if (!this.uiHasData()) {
            return '';
        }
        const ms = (value: number) => Math.max(0, Math.floor(value));
        const stats = this.uiStats;
        return `[SCVD][perf-ui] treeViewGetTreeItemMs=${ms(stats.treeViewGetTreeItemMs)} treeViewGetTreeItemCalls=${stats.treeViewGetTreeItemCalls} treeViewResolveItemMs=${ms(stats.treeViewResolveItemMs)} treeViewResolveItemCalls=${stats.treeViewResolveItemCalls} treeViewGetChildrenMs=${ms(stats.treeViewGetChildrenMs)} treeViewGetChildrenCalls=${stats.treeViewGetChildrenCalls}`;
    }

    public start(): number {
        return this.enabled && this.backendEnabled ? performance.now() : 0;
    }

    public now(): number {
        return this.enabled && this.backendEnabled ? performance.now() : 0;
    }

    public end(start: number, msKey: BackendPerfMsKey, callsKey: BackendPerfCallsKey): void {
        if (!this.enabled || !this.backendEnabled || start === 0) {
            return;
        }
        const elapsed = performance.now() - start;
        this.addBackendMs(msKey, elapsed);
        this.addBackendCalls(callsKey, 1);
    }

    public endMs(start: number, msKey: BackendPerfMsKey): void {
        if (!this.enabled || !this.backendEnabled || start === 0) {
            return;
        }
        const elapsed = performance.now() - start;
        this.addBackendMs(msKey, elapsed);
    }

    public startUi(): number {
        return this.enabled && this.uiEnabled ? performance.now() : 0;
    }

    public endUi(start: number, msKey: UiPerfMsKey, callsKey: UiPerfCallsKey): void {
        if (!this.enabled || !this.uiEnabled || start === 0) {
            return;
        }
        const elapsed = performance.now() - start;
        this.addUiMs(msKey, elapsed);
        this.addUiCalls(callsKey, 1);
    }

    public recordGuiItemNode(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.guiItemNodes += 1;
        }
    }

    public recordGuiPrintNode(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.guiPrintNodes += 1;
        }
    }

    public recordGuiOutNode(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.guiOutNodes += 1;
        }
    }

    public recordEvalNodeCacheHit(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.evalNodeCacheHitCalls += 1;
        }
    }

    public recordEvalNodeCacheMiss(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.evalNodeCacheMissCalls += 1;
        }
    }

    public recordPrintfSpec(spec: string): void {
        if (!this.enabled || !this.backendEnabled) {
            return;
        }
        switch (spec) {
            case 'd':
                this.backendStats.printfSpecD += 1;
                return;
            case 'u':
                this.backendStats.printfSpecU += 1;
                return;
            case 'x':
                this.backendStats.printfSpecX += 1;
                return;
            case 't':
                this.backendStats.printfSpecT += 1;
                return;
            case 'C':
                this.backendStats.printfSpecC += 1;
                return;
            case 'S':
                this.backendStats.printfSpecS += 1;
                return;
            case 'E':
                this.backendStats.printfSpecE += 1;
                return;
            case 'I':
                this.backendStats.printfSpecI += 1;
                return;
            case 'J':
                this.backendStats.printfSpecJ += 1;
                return;
            case 'N':
                this.backendStats.printfSpecN += 1;
                return;
            case 'M':
                this.backendStats.printfSpecM += 1;
                return;
            case 'T':
                this.backendStats.printfSpecTFloat += 1;
                return;
            case 'U':
                this.backendStats.printfSpecUUint += 1;
                return;
            case '%':
                this.backendStats.printfSpecPercent += 1;
                return;
            default:
                this.backendStats.printfSpecOther += 1;
                return;
        }
    }

    public recordPrintfValueType(value: unknown): void {
        if (!this.enabled || !this.backendEnabled) {
            return;
        }
        if (typeof value === 'number') {
            this.backendStats.printfValueNumber += 1;
            return;
        }
        if (typeof value === 'bigint') {
            this.backendStats.printfValueBigInt += 1;
            return;
        }
        if (typeof value === 'string') {
            this.backendStats.printfValueString += 1;
            return;
        }
        if (value instanceof Uint8Array) {
            this.backendStats.printfValueBytes += 1;
            return;
        }
        this.backendStats.printfValueOther += 1;
    }

    public recordPrintfCacheHit(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.printfCacheHits += 1;
        }
    }

    public recordPrintfCacheMiss(): void {
        if (this.enabled && this.backendEnabled) {
            this.backendStats.printfCacheMiss += 1;
        }
    }

    public recordEvalNodeKind(kind: string): void {
        if (!this.enabled || !this.backendEnabled) {
            return;
        }
        switch (kind) {
            case 'Identifier':
                this.backendStats.evalNodeIdentifierCalls += 1;
                return;
            case 'MemberAccess':
                this.backendStats.evalNodeMemberCalls += 1;
                return;
            case 'ArrayIndex':
                this.backendStats.evalNodeArrayCalls += 1;
                return;
            case 'CallExpression':
                this.backendStats.evalNodeCallCalls += 1;
                return;
            case 'EvalPointCall':
                this.backendStats.evalNodeEvalPointCalls += 1;
                return;
            case 'UnaryExpression':
                this.backendStats.evalNodeUnaryCalls += 1;
                return;
            case 'UpdateExpression':
                this.backendStats.evalNodeUpdateCalls += 1;
                return;
            case 'BinaryExpression':
                this.backendStats.evalNodeBinaryCalls += 1;
                return;
            case 'ConditionalExpression':
                this.backendStats.evalNodeConditionalCalls += 1;
                return;
            case 'AssignmentExpression':
                this.backendStats.evalNodeAssignmentCalls += 1;
                return;
            case 'PrintfExpression':
                this.backendStats.evalNodePrintfCalls += 1;
                return;
            case 'FormatSegment':
                this.backendStats.evalNodeFormatCalls += 1;
                return;
            case 'TextSegment':
                this.backendStats.evalNodeTextCalls += 1;
                return;
            case 'NumberLiteral':
            case 'StringLiteral':
            case 'BooleanLiteral':
                this.backendStats.evalNodeLiteralCalls += 1;
                return;
            default:
                this.backendStats.evalNodeOtherCalls += 1;
                return;
        }
    }

    public recordEvalNodeKindMs(kind: string, ms: number): void {
        if (!this.enabled || !this.backendEnabled) {
            return;
        }
        switch (kind) {
            case 'Identifier':
                this.backendStats.evalNodeIdentifierMs += ms;
                return;
            case 'MemberAccess':
                this.backendStats.evalNodeMemberMs += ms;
                return;
            case 'ArrayIndex':
                this.backendStats.evalNodeArrayMs += ms;
                return;
            case 'BinaryExpression':
                this.backendStats.evalNodeBinaryMs += ms;
                return;
            case 'PrintfExpression':
                this.backendStats.evalNodePrintfMs += ms;
                return;
            default:
                return;
        }
    }

    public beginExecuteAll(): void {
        if (!this.enabled) {
            return;
        }
        this.setBackendEnabled(true);
        this.executeAllStartMs = Date.now();
    }

    public endExecuteAll(
        stats: { count: number; totalMs: number; totalBytes: number; maxMs: number },
        cacheStats: { requestedReads: number; totalReads: number; refreshReads: number; missReads: number; prefetchMs: number }
    ): void {
        const startMs = this.executeAllStartMs;
        this.executeAllStartMs = 0;
        if (!this.enabled || startMs === 0) {
            this.setBackendEnabled(false);
            return;
        }
        const elapsed = Date.now() - startMs;
        this.lastExecuteSummary = `[SCVD][executeAll] total=${elapsed}ms reads=${stats.count} readMs=${stats.totalMs} readBytes=${stats.totalBytes} maxReadMs=${stats.maxMs} cacheMaxReads=${cacheStats.requestedReads} cacheActualReads=${cacheStats.totalReads} cacheRefreshReads=${cacheStats.refreshReads} cacheMissReads=${cacheStats.missReads} prefetchMs=${cacheStats.prefetchMs}`;
        this.lastPerfSummary = this.backendHasData() ? this.formatSummary() : '';
        this.setBackendEnabled(false);
    }

    public consumeExecuteSummaries(): { executeSummary?: string; perfSummary?: string } {
        const executeSummary = this.lastExecuteSummary;
        const perfSummary = this.lastPerfSummary;
        this.lastExecuteSummary = '';
        this.lastPerfSummary = '';
        const result: { executeSummary?: string; perfSummary?: string } = {};
        if (executeSummary) {
            result.executeSummary = executeSummary;
        }
        if (perfSummary) {
            result.perfSummary = perfSummary;
        }
        return result;
    }

    public captureUiSummary(): void {
        this.lastUiSummary = this.formatUiSummary();
        this.resetUiStats();
        this.setUiEnabled(true);
    }

    private addBackendMs(msKey: BackendPerfMsKey, delta: number): void {
        switch (msKey) {
            case 'evalMs':
                this.backendStats.evalMs += delta;
                return;
            case 'evalIntrinsicArgsMs':
                this.backendStats.evalIntrinsicArgsMs += delta;
                return;
            case 'evalRunningIntrinsicMs':
                this.backendStats.evalRunningIntrinsicMs += delta;
                return;
            case 'evalPseudoMemberMs':
                this.backendStats.evalPseudoMemberMs += delta;
                return;
            case 'evalBinaryMs':
                this.backendStats.evalBinaryMs += delta;
                return;
            case 'evalBinaryTypedMs':
                this.backendStats.evalBinaryTypedMs += delta;
                return;
            case 'evalBinaryTypedOperandMs':
                this.backendStats.evalBinaryTypedOperandMs += delta;
                return;
            case 'evalBinaryTypedTypeMs':
                this.backendStats.evalBinaryTypedTypeMs += delta;
                return;
            case 'evalBinaryTypedOpMs':
                this.backendStats.evalBinaryTypedOpMs += delta;
                return;
            case 'evalBinaryTypedNormalizeMs':
                this.backendStats.evalBinaryTypedNormalizeMs += delta;
                return;
            case 'evalBinaryNoTypesMs':
                this.backendStats.evalBinaryNoTypesMs += delta;
                return;
            case 'evalOperandWithTypeMs':
                this.backendStats.evalOperandWithTypeMs += delta;
                return;
            case 'evalOperandValueMs':
                this.backendStats.evalOperandValueMs += delta;
                return;
            case 'evalNodeChildMs':
                this.backendStats.evalNodeChildMs += delta;
                return;
            case 'evalGetScalarTypeMs':
                this.backendStats.evalGetScalarTypeMs += delta;
                return;
            case 'evalGetValueTypeMs':
                this.backendStats.evalGetValueTypeMs += delta;
                return;
            case 'evalMustRefMs':
                this.backendStats.evalMustRefMs += delta;
                return;
            case 'evalMustReadMs':
                this.backendStats.evalMustReadMs += delta;
                return;
            case 'evalMustRefIdentifierMs':
                this.backendStats.evalMustRefIdentifierMs += delta;
                return;
            case 'evalMustRefMemberMs':
                this.backendStats.evalMustRefMemberMs += delta;
                return;
            case 'evalMustRefArrayMs':
                this.backendStats.evalMustRefArrayMs += delta;
                return;
            case 'evalHostGetSymbolRefMs':
                this.backendStats.evalHostGetSymbolRefMs += delta;
                return;
            case 'evalHostGetMemberRefMs':
                this.backendStats.evalHostGetMemberRefMs += delta;
                return;
            case 'evalHostGetElementRefMs':
                this.backendStats.evalHostGetElementRefMs += delta;
                return;
            case 'evalHostGetElementStrideMs':
                this.backendStats.evalHostGetElementStrideMs += delta;
                return;
            case 'evalHostGetByteWidthMs':
                this.backendStats.evalHostGetByteWidthMs += delta;
                return;
            case 'modelGetSymbolMs':
                this.backendStats.modelGetSymbolMs += delta;
                return;
            case 'modelGetMemberMs':
                this.backendStats.modelGetMemberMs += delta;
                return;
            case 'modelGetMemberOffsetMs':
                this.backendStats.modelGetMemberOffsetMs += delta;
                return;
            case 'evalReadMs':
                this.backendStats.evalReadMs += delta;
                return;
            case 'evalWriteMs':
                this.backendStats.evalWriteMs += delta;
                return;
            case 'formatMs':
                this.backendStats.formatMs += delta;
                return;
            case 'guiNameMs':
                this.backendStats.guiNameMs += delta;
                return;
            case 'guiValueMs':
                this.backendStats.guiValueMs += delta;
                return;
            case 'guiTreeMs':
                this.backendStats.guiTreeMs += delta;
                return;
            case 'guiTreeDetachMs':
                this.backendStats.guiTreeDetachMs += delta;
                return;
            case 'printfMs':
                this.backendStats.printfMs += delta;
                return;
            case 'evalNodeIdentifierMs':
                this.backendStats.evalNodeIdentifierMs += delta;
                return;
            case 'evalNodeMemberMs':
                this.backendStats.evalNodeMemberMs += delta;
                return;
            case 'evalNodeArrayMs':
                this.backendStats.evalNodeArrayMs += delta;
                return;
            case 'evalNodeBinaryMs':
                this.backendStats.evalNodeBinaryMs += delta;
                return;
            case 'evalNodePrintfMs':
                this.backendStats.evalNodePrintfMs += delta;
                return;
            case 'readListResolveMs':
                this.backendStats.readListResolveMs += delta;
                return;
            case 'readListBatchMs':
                this.backendStats.readListBatchMs += delta;
                return;
            case 'readListLoopMs':
                this.backendStats.readListLoopMs += delta;
                return;
            case 'readListStoreMs':
                this.backendStats.readListStoreMs += delta;
                return;
            case 'targetReadCacheHitMs':
                this.backendStats.targetReadCacheHitMs += delta;
                return;
            case 'targetReadCacheMissMs':
                this.backendStats.targetReadCacheMissMs += delta;
                return;
            case 'targetReadPrefetchMs':
                this.backendStats.targetReadPrefetchMs += delta;
                return;
            case 'targetReadFromTargetMs':
                this.backendStats.targetReadFromTargetMs += delta;
                return;
            case 'symbolFindMs':
                this.backendStats.symbolFindMs += delta;
                return;
            case 'symbolSizeMs':
                this.backendStats.symbolSizeMs += delta;
                return;
            case 'symbolOffsetMs':
                this.backendStats.symbolOffsetMs += delta;
                return;
            default:
                return;
        }
    }

    private addBackendCalls(callsKey: BackendPerfCallsKey, delta: number): void {
        switch (callsKey) {
            case 'evalCalls':
                this.backendStats.evalCalls += delta;
                return;
            case 'evalIntrinsicArgsCalls':
                this.backendStats.evalIntrinsicArgsCalls += delta;
                return;
            case 'evalRunningIntrinsicCalls':
                this.backendStats.evalRunningIntrinsicCalls += delta;
                return;
            case 'evalPseudoMemberCalls':
                this.backendStats.evalPseudoMemberCalls += delta;
                return;
            case 'evalBinaryCalls':
                this.backendStats.evalBinaryCalls += delta;
                return;
            case 'evalBinaryTypedCalls':
                this.backendStats.evalBinaryTypedCalls += delta;
                return;
            case 'evalBinaryTypedOperandCalls':
                this.backendStats.evalBinaryTypedOperandCalls += delta;
                return;
            case 'evalBinaryTypedTypeCalls':
                this.backendStats.evalBinaryTypedTypeCalls += delta;
                return;
            case 'evalBinaryTypedOpCalls':
                this.backendStats.evalBinaryTypedOpCalls += delta;
                return;
            case 'evalBinaryTypedNormalizeCalls':
                this.backendStats.evalBinaryTypedNormalizeCalls += delta;
                return;
            case 'evalBinaryNoTypesCalls':
                this.backendStats.evalBinaryNoTypesCalls += delta;
                return;
            case 'evalOperandWithTypeCalls':
                this.backendStats.evalOperandWithTypeCalls += delta;
                return;
            case 'evalOperandValueCalls':
                this.backendStats.evalOperandValueCalls += delta;
                return;
            case 'evalNodeChildCalls':
                this.backendStats.evalNodeChildCalls += delta;
                return;
            case 'evalGetScalarTypeCalls':
                this.backendStats.evalGetScalarTypeCalls += delta;
                return;
            case 'evalGetValueTypeCalls':
                this.backendStats.evalGetValueTypeCalls += delta;
                return;
            case 'evalMustRefCalls':
                this.backendStats.evalMustRefCalls += delta;
                return;
            case 'evalMustReadCalls':
                this.backendStats.evalMustReadCalls += delta;
                return;
            case 'evalMustRefIdentifierCalls':
                this.backendStats.evalMustRefIdentifierCalls += delta;
                return;
            case 'evalMustRefMemberCalls':
                this.backendStats.evalMustRefMemberCalls += delta;
                return;
            case 'evalMustRefArrayCalls':
                this.backendStats.evalMustRefArrayCalls += delta;
                return;
            case 'evalHostGetSymbolRefCalls':
                this.backendStats.evalHostGetSymbolRefCalls += delta;
                return;
            case 'evalHostGetMemberRefCalls':
                this.backendStats.evalHostGetMemberRefCalls += delta;
                return;
            case 'evalHostGetElementRefCalls':
                this.backendStats.evalHostGetElementRefCalls += delta;
                return;
            case 'evalHostGetElementStrideCalls':
                this.backendStats.evalHostGetElementStrideCalls += delta;
                return;
            case 'evalHostGetByteWidthCalls':
                this.backendStats.evalHostGetByteWidthCalls += delta;
                return;
            case 'modelGetSymbolCalls':
                this.backendStats.modelGetSymbolCalls += delta;
                return;
            case 'modelGetMemberCalls':
                this.backendStats.modelGetMemberCalls += delta;
                return;
            case 'modelGetMemberOffsetCalls':
                this.backendStats.modelGetMemberOffsetCalls += delta;
                return;
            case 'evalReadCalls':
                this.backendStats.evalReadCalls += delta;
                return;
            case 'evalWriteCalls':
                this.backendStats.evalWriteCalls += delta;
                return;
            case 'formatCalls':
                this.backendStats.formatCalls += delta;
                return;
            case 'guiNameCalls':
                this.backendStats.guiNameCalls += delta;
                return;
            case 'guiValueCalls':
                this.backendStats.guiValueCalls += delta;
                return;
            case 'guiTreeCalls':
                this.backendStats.guiTreeCalls += delta;
                return;
            case 'guiTreeDetachCalls':
                this.backendStats.guiTreeDetachCalls += delta;
                return;
            case 'printfCalls':
                this.backendStats.printfCalls += delta;
                return;
            case 'readListResolveCalls':
                this.backendStats.readListResolveCalls += delta;
                return;
            case 'readListBatchCalls':
                this.backendStats.readListBatchCalls += delta;
                return;
            case 'readListLoopCalls':
                this.backendStats.readListLoopCalls += delta;
                return;
            case 'readListStoreCalls':
                this.backendStats.readListStoreCalls += delta;
                return;
            case 'targetReadCacheHitCalls':
                this.backendStats.targetReadCacheHitCalls += delta;
                return;
            case 'targetReadCacheMissCalls':
                this.backendStats.targetReadCacheMissCalls += delta;
                return;
            case 'targetReadPrefetchCalls':
                this.backendStats.targetReadPrefetchCalls += delta;
                return;
            case 'targetReadFromTargetCalls':
                this.backendStats.targetReadFromTargetCalls += delta;
                return;
            case 'symbolFindCalls':
                this.backendStats.symbolFindCalls += delta;
                return;
            case 'symbolSizeCalls':
                this.backendStats.symbolSizeCalls += delta;
                return;
            case 'symbolOffsetCalls':
                this.backendStats.symbolOffsetCalls += delta;
                return;
            default:
                return;
        }
    }

    private addUiMs(msKey: UiPerfMsKey, delta: number): void {
        switch (msKey) {
            case 'treeViewGetTreeItemMs':
                this.uiStats.treeViewGetTreeItemMs += delta;
                return;
            case 'treeViewResolveItemMs':
                this.uiStats.treeViewResolveItemMs += delta;
                return;
            case 'treeViewGetChildrenMs':
                this.uiStats.treeViewGetChildrenMs += delta;
                return;
            default:
                return;
        }
    }

    private addUiCalls(callsKey: UiPerfCallsKey, delta: number): void {
        switch (callsKey) {
            case 'treeViewGetTreeItemCalls':
                this.uiStats.treeViewGetTreeItemCalls += delta;
                return;
            case 'treeViewResolveItemCalls':
                this.uiStats.treeViewResolveItemCalls += delta;
                return;
            case 'treeViewGetChildrenCalls':
                this.uiStats.treeViewGetChildrenCalls += delta;
                return;
            default:
                return;
        }
    }

    public consumeUiSummary(): string | undefined {
        const summary = this.lastUiSummary;
        this.lastUiSummary = '';
        return summary || undefined;
    }

    public logSummaries(): void {
        const summaries = this.consumeExecuteSummaries();
        if (summaries.executeSummary) {
            console.log(summaries.executeSummary);
        }
        if (summaries.perfSummary) {
            console.log(summaries.perfSummary);
        }
        const uiSummary = this.consumeUiSummary();
        if (uiSummary) {
            console.log(uiSummary);
        }
    }

    private static createBackendStats(): BackendPerfStats {
        return {
            evalMs: 0,
            evalCalls: 0,
            evalIntrinsicArgsMs: 0,
            evalIntrinsicArgsCalls: 0,
            evalRunningIntrinsicMs: 0,
            evalRunningIntrinsicCalls: 0,
            evalPseudoMemberMs: 0,
            evalPseudoMemberCalls: 0,
            evalBinaryMs: 0,
            evalBinaryCalls: 0,
            evalBinaryTypedMs: 0,
            evalBinaryTypedCalls: 0,
            evalBinaryTypedOperandMs: 0,
            evalBinaryTypedOperandCalls: 0,
            evalBinaryTypedTypeMs: 0,
            evalBinaryTypedTypeCalls: 0,
            evalBinaryTypedOpMs: 0,
            evalBinaryTypedOpCalls: 0,
            evalBinaryTypedNormalizeMs: 0,
            evalBinaryTypedNormalizeCalls: 0,
            evalNodeCacheHitCalls: 0,
            evalNodeCacheMissCalls: 0,
            evalBinaryNoTypesMs: 0,
            evalBinaryNoTypesCalls: 0,
            evalOperandWithTypeMs: 0,
            evalOperandWithTypeCalls: 0,
            evalOperandValueMs: 0,
            evalOperandValueCalls: 0,
            evalNodeChildMs: 0,
            evalNodeChildCalls: 0,
            evalGetScalarTypeMs: 0,
            evalGetScalarTypeCalls: 0,
            evalGetValueTypeMs: 0,
            evalGetValueTypeCalls: 0,
            evalMustRefMs: 0,
            evalMustRefCalls: 0,
            evalMustReadMs: 0,
            evalMustReadCalls: 0,
            evalMustRefIdentifierMs: 0,
            evalMustRefIdentifierCalls: 0,
            evalMustRefMemberMs: 0,
            evalMustRefMemberCalls: 0,
            evalMustRefArrayMs: 0,
            evalMustRefArrayCalls: 0,
            evalHostGetSymbolRefMs: 0,
            evalHostGetSymbolRefCalls: 0,
            evalHostGetMemberRefMs: 0,
            evalHostGetMemberRefCalls: 0,
            evalHostGetElementRefMs: 0,
            evalHostGetElementRefCalls: 0,
            evalHostGetElementStrideMs: 0,
            evalHostGetElementStrideCalls: 0,
            evalHostGetByteWidthMs: 0,
            evalHostGetByteWidthCalls: 0,
            modelGetSymbolMs: 0,
            modelGetSymbolCalls: 0,
            modelGetMemberMs: 0,
            modelGetMemberCalls: 0,
            modelGetMemberOffsetMs: 0,
            modelGetMemberOffsetCalls: 0,
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
            evalNodeIdentifierMs: 0,
            evalNodeMemberMs: 0,
            evalNodeArrayMs: 0,
            evalNodeBinaryMs: 0,
            evalNodePrintfMs: 0,
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
    }

    private static createUiStats(): UiPerfStats {
        return {
            treeViewGetTreeItemMs: 0,
            treeViewGetTreeItemCalls: 0,
            treeViewResolveItemMs: 0,
            treeViewResolveItemCalls: 0,
            treeViewGetChildrenMs: 0,
            treeViewGetChildrenCalls: 0,
        };
    }
}
