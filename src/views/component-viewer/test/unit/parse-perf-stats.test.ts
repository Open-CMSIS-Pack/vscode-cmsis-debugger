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

jest.mock('../../../../logger', () => ({
    logger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
    componentViewerLogger: {
        trace: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

import { performance } from 'node:perf_hooks';
import { componentViewerLogger } from '../../../../logger';
import { ParsePerfStats } from '../../parse-perf-stats';
import type {
    AlignofExpression,
    AssignmentExpression,
    BinaryExpression,
    BooleanLiteral,
    CallExpression,
    CastExpression,
    ConditionalExpression,
    EvalPointCall,
    FormatSegment,
    Identifier,
    MemberAccess,
    NumberLiteral,
    StringLiteral,
    ColonPath,
    ErrorNode,
    PrintfExpression,
    SizeofExpression,
    TextSegment,
    UnaryExpression,
    UpdateExpression,
    ArrayIndex,
    ASTNode,
} from '../../parser-evaluator/parser';

const id = (name: string): Identifier => ({ kind: 'Identifier', name, start: 0, end: 0 });
const num = (value = 1): NumberLiteral => ({ kind: 'NumberLiteral', value, raw: String(value), valueType: 'number', start: 0, end: 0 });
const bool = (value = true): BooleanLiteral => ({ kind: 'BooleanLiteral', value, valueType: 'boolean', start: 0, end: 0 });
const str = (value: string): StringLiteral => ({ kind: 'StringLiteral', value, raw: `"${value}"`, valueType: 'string', start: 0, end: 0 });
const colon = (parts: string[]): ColonPath => ({ kind: 'ColonPath', parts, start: 0, end: 0 });
const errorNode = (message: string): ErrorNode => ({ kind: 'ErrorNode', message, start: 0, end: 0 });
const textSeg = (text: string): TextSegment => ({ kind: 'TextSegment', text, start: 0, end: 0 });
const formatSeg = (spec: string, value: ASTNode): FormatSegment => ({ kind: 'FormatSegment', spec, value, start: 0, end: 0 });

describe('ParsePerfStats', () => {
    it('returns empty summaries and skips work when disabled', () => {
        const perf = new ParsePerfStats();
        Reflect.set(perf as object, 'enabled', false);

        const logSpy = jest.spyOn(componentViewerLogger, 'trace').mockImplementation(() => {});

        expect(perf.start()).toBe(0);
        perf.endParse(0);
        perf.endOptimize(0);
        perf.recordParse(num());
        perf.recordOptimize(num(), num(), false);

        expect(perf.hasData()).toBe(false);
        expect(perf.formatSummary()).toBe('');

        perf.logSummary();
        expect(logSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
    });

    it('returns empty summary with no data even when enabled', () => {
        const perf = new ParsePerfStats();

        expect(perf.hasData()).toBe(false);
        expect(perf.formatSummary()).toBe('');
    });

    it('records parse/optimize stats and formats a summary', () => {
        const nowSpy = jest.spyOn(performance, 'now');
        nowSpy
            .mockReturnValueOnce(100)
            .mockReturnValueOnce(120)
            .mockReturnValueOnce(200)
            .mockReturnValueOnce(260)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce(320);

        const perf = new ParsePerfStats();

        const member: MemberAccess = { kind: 'MemberAccess', object: id('obj'), property: 'prop', start: 0, end: 0 };
        const unary: UnaryExpression = { kind: 'UnaryExpression', operator: '-', argument: member, start: 0, end: 0 };
        const arrayIndex: ArrayIndex = { kind: 'ArrayIndex', array: id('arr'), index: num(3), start: 0, end: 0 };
        const call: CallExpression = { kind: 'CallExpression', callee: id('fn'), args: [arrayIndex], start: 0, end: 0 };
        const parseAst: BinaryExpression = { kind: 'BinaryExpression', operator: '+', left: unary, right: call, start: 0, end: 0 };

        const parseStart = perf.start();
        perf.endParse(parseStart);
        perf.recordParse(parseAst);

        const sizeofWithArg: SizeofExpression = { kind: 'SizeofExpression', argument: id('sz'), start: 0, end: 0 };
        const alignofNoArg: AlignofExpression = { kind: 'AlignofExpression', start: 0, end: 0 };
        const update: UpdateExpression = { kind: 'UpdateExpression', operator: '++', argument: alignofNoArg, prefix: true, start: 0, end: 0 };
        const castExpr: CastExpression = { kind: 'CastExpression', typeName: 'int', argument: id('y'), start: 0, end: 0 };
        const assignment: AssignmentExpression = { kind: 'AssignmentExpression', operator: '=', left: id('lhs'), right: castExpr, start: 0, end: 0 };
        const evalPoint: EvalPointCall = { kind: 'EvalPointCall', callee: id('__Running'), args: [sizeofWithArg], intrinsic: '__Running', start: 0, end: 0 };
        const conditional: ConditionalExpression = { kind: 'ConditionalExpression', test: bool(true), consequent: assignment, alternate: update, start: 0, end: 0 };
        const memberCallee: MemberAccess = { kind: 'MemberAccess', object: id('host'), property: 'call', start: 0, end: 0 };
        const callMember: CallExpression = { kind: 'CallExpression', callee: memberCallee, args: [evalPoint], start: 0, end: 0 };
        const optimizeIn: BinaryExpression = { kind: 'BinaryExpression', operator: '*', left: conditional, right: callMember, start: 0, end: 0 };

        const optimizeOutConst = num(1);
        optimizeOutConst.constValue = 1;

        const optStart1 = perf.start();
        perf.endOptimize(optStart1);
        perf.recordOptimize(optimizeIn, optimizeOutConst, false);

        const printfAst: PrintfExpression = {
            kind: 'PrintfExpression',
            segments: [textSeg('hello'), formatSeg('d', colon(['Type', 'member']))],
            resultType: 'string',
            start: 0,
            end: 0,
        };
        const optStart2 = perf.start();
        perf.endOptimize(optStart2);
        perf.recordOptimize(printfAst, str('x'), true);

        const optStart3 = perf.start();
        perf.endOptimize(optStart3);
        perf.recordOptimize(str('v'), errorNode('boom'), false);

        const summary = perf.formatSummary();

        expect(summary).toContain('[parse-perf]');
        expect(summary).toContain('parseCalls=1');
        expect(summary).toContain('optimizeCalls=3');
        expect(summary).toContain('foldFull=1');
        expect(summary).toContain('foldPartial=1');
        expect(summary).toContain('parseOps=+:1');
        expect(summary).toContain('parseKinds=');
        expect(summary).toContain('callees=');
        expect(summary).toContain('fn:1');
        expect(summary).toContain('MemberAccess:1');
        expect(summary).toContain('optimizeMaxNodesInKind=BinaryExpression');
        expect(summary).toContain('optimizeMaxNodesOutKind=NumberLiteral');

        nowSpy.mockRestore();
    });

    it('does not record when starts are zero and ignores non-folding optimize', () => {
        const perf = new ParsePerfStats();

        perf.endParse(0);
        perf.endOptimize(0);

        const start = perf.start();
        perf.endParse(start);
        perf.recordParse(errorNode('err'));

        const inAst = id('v');
        const outAst = id('v');
        perf.recordOptimize(inAst, outAst, true);

        const summary = perf.formatSummary();
        expect(summary).toContain('parseCalls=1');
        expect(summary).toContain('optimizeCalls=0');
        expect(summary).toContain('foldFull=0');
        expect(summary).toContain('foldPartial=0');
    });

    it('resets collected stats and counters', () => {
        const perf = new ParsePerfStats();

        perf.endParse(perf.start());
        perf.recordParse(num(3));
        perf.endOptimize(perf.start());
        perf.recordOptimize(num(4), num(5), false);
        expect(perf.hasData()).toBe(true);
        expect(perf.formatSummary()).toContain('[parse-perf]');

        perf.reset();

        expect(perf.hasData()).toBe(false);
        expect(perf.formatSummary()).toBe('');
    });

    it('formats summaries with only optimize calls', () => {
        const perf = new ParsePerfStats();
        const start = perf.start();
        perf.endOptimize(start);
        perf.recordOptimize(num(1), num(2), true);

        const summary = perf.formatSummary();
        expect(summary).toContain('[parse-perf]');
        expect(summary).toContain('parseCalls=0');
        expect(summary).toContain('optimizeCalls=1');
    });

    it('logs summaries when data exists', () => {
        const perf = new ParsePerfStats();
        perf.endParse(perf.start());
        perf.recordParse(num(1));

        const logSpy = jest.spyOn(componentViewerLogger, 'trace').mockImplementation(() => {});
        perf.logSummary();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[parse-perf]'));
        logSpy.mockRestore();
    });

    it('collects stats without op or callee maps and skips max updates', () => {
        const perf = new ParsePerfStats();
        (perf as unknown as { parseMaxNodes: number; parseMaxDepth: number }).parseMaxNodes = 100;
        (perf as unknown as { parseMaxNodes: number; parseMaxDepth: number }).parseMaxDepth = 100;

        const call: CallExpression = {
            kind: 'CallExpression',
            callee: { kind: 'MemberAccess', object: id('obj'), property: 'prop', start: 0, end: 0 },
            args: [num(1)],
            start: 0,
            end: 0,
        };
        const binary: BinaryExpression = { kind: 'BinaryExpression', operator: '+', left: call, right: num(2), start: 0, end: 0 };

        const collect = (perf as unknown as {
            collectAstStats: (node: ASTNode, kindCounts: Map<string, number>, opCounts?: Map<string, number>, calleeCounts?: Map<string, number>) => {
                nodes: number;
                maxDepth: number;
                maxDepthKind: string;
            };
        }).collectAstStats.bind(perf);

        const kindCounts = new Map<string, number>();
        const stats = collect(binary, kindCounts, undefined, undefined);
        expect(stats.nodes).toBeGreaterThan(0);

        perf.recordParse(num(1));
        expect((perf as unknown as { parseMaxNodes: number }).parseMaxNodes).toBe(100);
        expect((perf as unknown as { parseMaxDepth: number }).parseMaxDepth).toBe(100);
    });
});
