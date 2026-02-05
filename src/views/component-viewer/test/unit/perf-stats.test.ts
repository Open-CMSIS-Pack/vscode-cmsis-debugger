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

import { PerfStats } from '../../perf-stats';

describe('PerfStats', () => {
    it('records backend metrics, formats summaries, and consumes them', () => {
        const perf = new PerfStats();
        expect(perf.isBackendEnabled()).toBe(false);
        expect(perf.formatSummary()).toBe('');

        perf.setBackendEnabled(true);
        expect(perf.isBackendEnabled()).toBe(true);
        const start = perf.start();
        perf.end(start, 'evalMs', 'evalCalls');
        expect(perf.now()).toBeGreaterThan(0);

        const summary = perf.formatSummary();
        expect(summary).toContain('[SCVD][perf]');

        perf.beginExecuteAll();
        perf.end(perf.start(), 'evalMs', 'evalCalls');
        perf.endExecuteAll(
            { count: 2, totalMs: 10, totalBytes: 8, maxMs: 6 },
            { requestedReads: 3, totalReads: 2, refreshReads: 1, missReads: 1, prefetchMs: 4 }
        );
        const consumed = perf.consumeExecuteSummaries();
        expect(consumed.executeSummary).toContain('[SCVD][executeAll]');
        expect(consumed.perfSummary).toContain('[SCVD][perf]');
        expect(perf.consumeExecuteSummaries()).toEqual({});
    });

    it('returns zeros and skips records when disabled', () => {
        const perf = new PerfStats();

        expect(perf.start()).toBe(0);
        expect(perf.now()).toBe(0);
        perf.recordGuiItemNode();
        perf.recordGuiPrintNode();
        perf.recordGuiOutNode();
        perf.recordEvalNodeCacheHit();
        perf.recordEvalNodeCacheMiss();
        perf.recordPrintfCacheHit();
        perf.recordPrintfCacheMiss();
        expect(perf.backendHasData()).toBe(false);

        expect(perf.startUi()).toBe(0);
        expect(perf.uiHasData()).toBe(false);
    });

    it('reports no UI data when disabled or empty', () => {
        const perf = new PerfStats();
        (perf as unknown as { enabled: boolean }).enabled = false;
        perf.setUiEnabled(true);
        expect(perf.uiHasData()).toBe(false);
    });

    it('reports UI data when resolve/children calls are recorded', () => {
        const perf = new PerfStats();
        perf.setUiEnabled(true);

        perf.endUi(perf.startUi(), 'treeViewResolveItemMs', 'treeViewResolveItemCalls');
        expect(perf.uiHasData()).toBe(true);

        perf.resetUiStats();
        perf.endUi(perf.startUi(), 'treeViewGetChildrenMs', 'treeViewGetChildrenCalls');
        expect(perf.uiHasData()).toBe(true);
    });

    it('returns false when UI enabled but no calls were recorded', () => {
        const perf = new PerfStats();
        perf.setUiEnabled(true);
        expect(perf.uiHasData()).toBe(false);
    });

    it('records UI metrics and formats UI summaries', () => {
        const perf = new PerfStats();
        expect(perf.formatUiSummary()).toBe('');

        perf.setUiEnabled(true);
        const uiStart = perf.startUi();
        perf.endUi(uiStart, 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');

        const uiSummary = perf.formatUiSummary();
        expect(uiSummary).toContain('[SCVD][perf-ui]');
        expect(perf.uiHasData()).toBe(true);

        perf.captureUiSummary();
        expect(perf.consumeUiSummary()).toContain('[SCVD][perf-ui]');
        expect(perf.consumeUiSummary()).toBeUndefined();
    });

    it('logs summaries when available', () => {
        const perf = new PerfStats();
        perf.setBackendEnabled(true);
        perf.setUiEnabled(true);

        perf.end(perf.start(), 'evalMs', 'evalCalls');
        perf.beginExecuteAll();
        perf.endExecuteAll(
            { count: 1, totalMs: 1, totalBytes: 1, maxMs: 1 },
            { requestedReads: 1, totalReads: 1, refreshReads: 0, missReads: 0, prefetchMs: 0 }
        );
        perf.endUi(perf.startUi(), 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');
        perf.captureUiSummary();

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        perf.logSummaries();
        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it('logs execute and ui summaries when explicitly set', () => {
        const perf = new PerfStats();
        const priv = perf as unknown as { lastExecuteSummary: string; lastPerfSummary: string; lastUiSummary: string };
        priv.lastExecuteSummary = '[SCVD][executeAll] test';
        priv.lastPerfSummary = '[SCVD][perf] test';
        priv.lastUiSummary = '[SCVD][perf-ui] test';

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        perf.logSummaries();
        expect(logSpy).toHaveBeenCalledWith('[SCVD][executeAll] test');
        expect(logSpy).toHaveBeenCalledWith('[SCVD][perf] test');
        expect(logSpy).toHaveBeenCalledWith('[SCVD][perf-ui] test');
        logSpy.mockRestore();
    });

    it('does not log when summaries are empty', () => {
        const perf = new PerfStats();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        perf.logSummaries();

        expect(logSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it('omits perf summaries when no backend data is collected', () => {
        const perf = new PerfStats();
        perf.setBackendEnabled(true);

        perf.beginExecuteAll();
        perf.endExecuteAll(
            { count: 0, totalMs: 0, totalBytes: 0, maxMs: 0 },
            { requestedReads: 0, totalReads: 0, refreshReads: 0, missReads: 0, prefetchMs: 0 }
        );
        const consumed = perf.consumeExecuteSummaries();
        expect(consumed.executeSummary).toContain('[SCVD][executeAll]');
        expect(consumed.perfSummary).toBeUndefined();
    });

    it('covers perf record helpers', () => {
        const perf = new PerfStats();
        perf.setBackendEnabled(true);

        perf.recordGuiItemNode();
        perf.recordGuiPrintNode();
        perf.recordGuiOutNode();
        perf.recordEvalNodeCacheHit();
        perf.recordEvalNodeCacheMiss();

        const printfSpecs = ['d', 'u', 'x', 't', 'C', 'S', 'E', 'I', 'J', 'N', 'M', 'T', 'U', '%', '?'];
        for (const spec of printfSpecs) {
            perf.recordPrintfSpec(spec);
        }

        perf.recordPrintfValueType(1);
        perf.recordPrintfValueType(1n);
        perf.recordPrintfValueType('s');
        perf.recordPrintfValueType(new Uint8Array([1]));
        perf.recordPrintfValueType({ other: true });

        perf.recordPrintfCacheHit();
        perf.recordPrintfCacheMiss();

        const nodeKinds = [
            'Identifier',
            'MemberAccess',
            'ArrayIndex',
            'CallExpression',
            'EvalPointCall',
            'UnaryExpression',
            'UpdateExpression',
            'BinaryExpression',
            'ConditionalExpression',
            'AssignmentExpression',
            'PrintfExpression',
            'FormatSegment',
            'TextSegment',
            'NumberLiteral',
            'StringLiteral',
            'BooleanLiteral',
            'Other'
        ];
        for (const kind of nodeKinds) {
            perf.recordEvalNodeKind(kind);
        }

        const nodeMsKinds = ['Identifier', 'MemberAccess', 'ArrayIndex', 'BinaryExpression', 'PrintfExpression', 'Other'];
        for (const kind of nodeMsKinds) {
            perf.recordEvalNodeKindMs(kind, 2);
        }
    });

    it('covers backend and ui key switch tables', () => {
        const perf = new PerfStats();
        perf.setBackendEnabled(true);
        perf.setUiEnabled(true);

        const backendMsKeys = [
            'evalMs',
            'evalIntrinsicArgsMs',
            'evalRunningIntrinsicMs',
            'evalPseudoMemberMs',
            'evalBinaryMs',
            'evalBinaryTypedMs',
            'evalBinaryTypedOperandMs',
            'evalBinaryTypedTypeMs',
            'evalBinaryTypedOpMs',
            'evalBinaryTypedNormalizeMs',
            'evalBinaryNoTypesMs',
            'evalOperandWithTypeMs',
            'evalOperandValueMs',
            'evalNodeChildMs',
            'evalGetScalarTypeMs',
            'evalGetValueTypeMs',
            'evalMustRefMs',
            'evalMustReadMs',
            'evalMustRefIdentifierMs',
            'evalMustRefMemberMs',
            'evalMustRefArrayMs',
            'evalHostGetSymbolRefMs',
            'evalHostGetMemberRefMs',
            'evalHostGetElementRefMs',
            'evalHostGetElementStrideMs',
            'evalHostGetByteWidthMs',
            'modelGetSymbolMs',
            'modelGetMemberMs',
            'modelGetMemberOffsetMs',
            'evalReadMs',
            'evalWriteMs',
            'formatMs',
            'guiNameMs',
            'guiValueMs',
            'guiTreeMs',
            'guiTreeDetachMs',
            'printfMs',
            'evalNodeIdentifierMs',
            'evalNodeMemberMs',
            'evalNodeArrayMs',
            'evalNodeBinaryMs',
            'evalNodePrintfMs',
            'readListResolveMs',
            'readListBatchMs',
            'readListLoopMs',
            'readListStoreMs',
            'targetReadCacheHitMs',
            'targetReadCacheMissMs',
            'targetReadPrefetchMs',
            'targetReadFromTargetMs',
            'symbolFindMs',
            'symbolSizeMs',
            'symbolOffsetMs',
        ] as const;

        const backendCallsKeys = [
            'evalCalls',
            'evalIntrinsicArgsCalls',
            'evalRunningIntrinsicCalls',
            'evalPseudoMemberCalls',
            'evalBinaryCalls',
            'evalBinaryTypedCalls',
            'evalBinaryTypedOperandCalls',
            'evalBinaryTypedTypeCalls',
            'evalBinaryTypedOpCalls',
            'evalBinaryTypedNormalizeCalls',
            'evalBinaryNoTypesCalls',
            'evalOperandWithTypeCalls',
            'evalOperandValueCalls',
            'evalNodeChildCalls',
            'evalGetScalarTypeCalls',
            'evalGetValueTypeCalls',
            'evalMustRefCalls',
            'evalMustReadCalls',
            'evalMustRefIdentifierCalls',
            'evalMustRefMemberCalls',
            'evalMustRefArrayCalls',
            'evalHostGetSymbolRefCalls',
            'evalHostGetMemberRefCalls',
            'evalHostGetElementRefCalls',
            'evalHostGetElementStrideCalls',
            'evalHostGetByteWidthCalls',
            'modelGetSymbolCalls',
            'modelGetMemberCalls',
            'modelGetMemberOffsetCalls',
            'evalReadCalls',
            'evalWriteCalls',
            'formatCalls',
            'guiNameCalls',
            'guiValueCalls',
            'guiTreeCalls',
            'guiTreeDetachCalls',
            'printfCalls',
            'readListResolveCalls',
            'readListBatchCalls',
            'readListLoopCalls',
            'readListStoreCalls',
            'targetReadCacheHitCalls',
            'targetReadCacheMissCalls',
            'targetReadPrefetchCalls',
            'targetReadFromTargetCalls',
            'symbolFindCalls',
            'symbolSizeCalls',
            'symbolOffsetCalls',
        ] as const;

        for (const key of backendMsKeys) {
            const start = perf.start();
            perf.endMs(start, key);
        }

        for (const key of backendCallsKeys) {
            const start = perf.start();
            perf.end(start, 'evalMs', key);
        }

        const uiMsKeys = ['treeViewGetTreeItemMs', 'treeViewResolveItemMs', 'treeViewGetChildrenMs'] as const;
        const uiCallsKeys = ['treeViewGetTreeItemCalls', 'treeViewResolveItemCalls', 'treeViewGetChildrenCalls'] as const;
        for (const key of uiCallsKeys) {
            const start = perf.startUi();
            perf.endUi(start, 'treeViewGetTreeItemMs', key);
        }
        for (const key of uiMsKeys) {
            const start = perf.startUi();
            perf.endUi(start, key, 'treeViewGetChildrenCalls');
        }
    });

    it('handles endExecuteAll when not started', () => {
        const perf = new PerfStats();
        perf.endExecuteAll(
            { count: 0, totalMs: 0, totalBytes: 0, maxMs: 0 },
            { requestedReads: 0, totalReads: 0, refreshReads: 0, missReads: 0, prefetchMs: 0 }
        );
        expect(perf.consumeExecuteSummaries()).toEqual({});
    });

    it('covers disabled branches and defaults', () => {
        const perf = new PerfStats();

        perf.recordPrintfSpec('d');
        perf.recordPrintfValueType(1);
        perf.recordEvalNodeKind('Identifier');
        perf.recordEvalNodeKindMs('Identifier', 1);

        perf.setBackendEnabled(true);
        perf.end(0, 'evalMs', 'evalCalls');
        perf.endMs(0, 'evalMs');
        perf.setUiEnabled(true);
        perf.endUi(0, 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');

        // Trigger default cases in key switches.
        // @ts-expect-error testing invalid key path
        perf.endMs(perf.start(), 'invalidMsKey');
        // @ts-expect-error testing invalid key path
        perf.end(perf.start(), 'evalMs', 'invalidCallsKey');
        // @ts-expect-error testing invalid key path
        perf.endUi(perf.startUi(), 'invalidUiMsKey', 'treeViewGetTreeItemCalls');
        // @ts-expect-error testing invalid key path
        perf.endUi(perf.startUi(), 'treeViewGetTreeItemMs', 'invalidUiCallsKey');

        // Force disabled guard in beginExecuteAll.
        // @ts-expect-error testing private flag
        perf.enabled = false;
        perf.beginExecuteAll();
    });

    it('logs summaries when present', () => {
        const perf = new PerfStats();
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        perf.beginExecuteAll();
        perf.end(perf.start(), 'evalMs', 'evalCalls');
        perf.endExecuteAll(
            { count: 1, totalMs: 1, totalBytes: 1, maxMs: 1 },
            { requestedReads: 1, totalReads: 1, refreshReads: 1, missReads: 0, prefetchMs: 1 }
        );
        perf.setUiEnabled(true);
        perf.endUi(perf.startUi(), 'treeViewGetTreeItemMs', 'treeViewGetTreeItemCalls');
        perf.captureUiSummary();
        perf.logSummaries();

        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();
    });
});
