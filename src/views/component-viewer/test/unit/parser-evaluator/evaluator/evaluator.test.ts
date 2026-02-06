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

/**
 * Coverage-focused tests for Evaluator branches.
 */

import { Evaluator, EvalContext, type EvaluateResult } from '../../../../parser-evaluator/evaluator';
import { TestEvaluator } from '../../helpers/test-evaluator';
import type { ASTNode, AssignmentExpression, BinaryExpression, CallExpression, ConditionalExpression, EvalPointCall, FormatSegment, Identifier, MemberAccess, NumberLiteral, PrintfExpression, StringLiteral, TextSegment, UnaryExpression, UpdateExpression, ArrayIndex, ColonPath, BooleanLiteral, ErrorNode } from '../../../../parser-evaluator/parser';
import type { DataAccessHost, EvalValue, ModelHost, RefContainer, ScalarType } from '../../../../parser-evaluator/model-host';
import type { IntrinsicProvider } from '../../../../parser-evaluator/intrinsics';
import { ScvdNode } from '../../../../model/scvd-node';
import { perf } from '../../../../stats-config';

jest.mock('../../../../stats-config', () => {
    const { PerfStats } = jest.requireActual('../../../../perf-stats');
    const perf = new PerfStats();
    perf.setBackendEnabled(true);
    return { perf, targetReadStats: undefined, targetReadTimingStats: undefined };
});

type Host = ModelHost & DataAccessHost & IntrinsicProvider;

class TestNode extends ScvdNode {
    public value?: EvalValue;
    public members = new Map<string, TestNode>();
    public element?: TestNode;

    constructor(name: string, value?: EvalValue) {
        super(undefined);
        this.name = name;
        this.value = value;
    }

    public override getDisplayLabel(): string {
        return this.name ?? '<anon>';
    }

    public override getMember(property: string): ScvdNode | undefined {
        return this.members.get(property);
    }

    public override getElementRef(): ScvdNode | undefined {
        return this.element;
    }
}

function makeHost(overrides: Partial<Host> = {}, symbols: Record<string, TestNode> = {}): Host {
    const symbolMap = new Map(Object.entries(symbols));
    const host: Host = {
        getSymbolRef: jest.fn(async (_container, name) => symbolMap.get(name)),
        getMemberRef: jest.fn(async (container, property) => (container.current as TestNode | undefined)?.members.get(property)),
        readValue: jest.fn(async (container) => {
            const ref = (container.member ?? container.current ?? container.anchor) as TestNode | undefined;
            return ref?.value;
        }),
        writeValue: jest.fn(async (container, value) => {
            const ref = (container.member ?? container.current ?? container.anchor) as TestNode | undefined;
            if (!ref) {
                return undefined;
            }
            ref.value = value;
            return value;
        }),
        resolveColonPath: jest.fn(async () => undefined),
        getElementStride: jest.fn(async () => 1),
        getElementRef: jest.fn(async (ref) => (ref as TestNode).element ?? undefined),
        getMemberOffset: jest.fn(async () => 0),
        getByteWidth: jest.fn(async () => 4),
        getValueType: jest.fn(async () => ({ kind: 'int', name: 'int', bits: 32 } as ScalarType)),
        _count: jest.fn(async () => 1),
        _addr: jest.fn(async () => 0x1000),
        __Running: jest.fn(async () => 1),
        __GetRegVal: jest.fn(async () => 1),
        __FindSymbol: jest.fn(async () => 1),
        __Symbol_exists: jest.fn(async () => 1),
        __size_of: jest.fn(async () => 1),
        __Offset_of: jest.fn(async () => 1),
        __CalcMemUsed: jest.fn(async () => 1),
    };
    return { ...host, ...overrides };
}

function makeCtx(host: Host | Partial<Host>, base?: TestNode): EvalContext {
    return new EvalContext({ data: host as Host, container: base ?? new TestNode('root') });
}

const span = { start: 0, end: 0 };
const id = (name: string): Identifier => ({ kind: 'Identifier', name, ...span });
const num = (value: number): NumberLiteral => ({ kind: 'NumberLiteral', value, raw: String(value), valueType: 'number', constValue: value, ...span });
const str = (value: string): StringLiteral => ({ kind: 'StringLiteral', value, raw: JSON.stringify(value), valueType: 'string', constValue: value, ...span });
const bool = (value: boolean): BooleanLiteral => ({ kind: 'BooleanLiteral', value, valueType: 'boolean', constValue: value, ...span });
const member = (object: ASTNode, property: string): MemberAccess => ({ kind: 'MemberAccess', object, property, ...span });
const arr = (array: ASTNode, index: ASTNode): ArrayIndex => ({ kind: 'ArrayIndex', array, index, ...span } as ArrayIndex);
const unary = (operator: UnaryExpression['operator'], argument: ASTNode): UnaryExpression => ({ kind: 'UnaryExpression', operator, argument, ...span });
const binary = (operator: BinaryExpression['operator'], left: ASTNode, right: ASTNode): BinaryExpression => ({ kind: 'BinaryExpression', operator, left, right, ...span });
const update = (operator: UpdateExpression['operator'], argument: ASTNode, prefix: boolean): UpdateExpression => ({ kind: 'UpdateExpression', operator, argument, prefix, ...span });
const assign = (operator: AssignmentExpression['operator'], left: ASTNode, right: ASTNode): AssignmentExpression => ({ kind: 'AssignmentExpression', operator, left, right, ...span });
const callExpr = (callee: ASTNode, args: ASTNode[]): CallExpression => ({ kind: 'CallExpression', callee, args, ...span });
const evalPoint = (name: string, args: ASTNode[]): EvalPointCall => ({ kind: 'EvalPointCall', intrinsic: name, callee: id(name), args, ...span } as EvalPointCall);
const formatSeg = (spec: FormatSegment['spec'], value: ASTNode): FormatSegment => ({ kind: 'FormatSegment', spec, value, ...span });
const errorNode = (message: string): ErrorNode => ({ kind: 'ErrorNode', message, ...span });
const textSeg = (text: string): TextSegment => ({ kind: 'TextSegment', text, ...span });
const printfExpr = (segments: Array<TextSegment | FormatSegment>): PrintfExpression => ({ kind: 'PrintfExpression', segments, resultType: 'string', ...span } as PrintfExpression);

describe('Evaluator coverage branches', () => {
    it('formats values and nodes for messages', () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            formatEvalValueForMessage: (v: EvalValue) => string;
            formatNodeForMessage: (n: ASTNode) => string;
        };
        const anyEval = evaluator as unknown as {
            popContainer: (ctx: EvalContext) => void;
        };

        expect(helpers.formatEvalValueForMessage(undefined)).toBe('undefined');
        const long = 'a'.repeat(80);
        const formattedLong = helpers.formatEvalValueForMessage(long);
        expect(formattedLong.startsWith('"')).toBe(true);
        expect(formattedLong.endsWith('"')).toBe(true);
        expect(formattedLong).toContain('...');
        expect(helpers.formatEvalValueForMessage('short')).toBe('"short"');
        expect(helpers.formatEvalValueForMessage(123)).toBe('123');
        expect(helpers.formatEvalValueForMessage(new Uint8Array([1, 2, 3]))).toBe('Uint8Array(3)');
        expect(helpers.formatEvalValueForMessage({} as unknown as EvalValue)).toBe('[object Object]');

        expect(helpers.formatNodeForMessage(id('x'))).toBe('Identifier(x)');
        expect(helpers.formatNodeForMessage(member(id('obj'), 'field'))).toBe('MemberAccess(Identifier(obj).field)');
        expect(helpers.formatNodeForMessage(arr(id('arr'), num(0)))).toBe('ArrayIndex(Identifier(arr)[...])');
        expect(helpers.formatNodeForMessage(callExpr(id('fn'), []))).toBe('CallExpression');
        expect(helpers.formatNodeForMessage(evalPoint('__Running', []))).toBe('EvalPointCall');
        expect(helpers.formatNodeForMessage(unary('-', num(1)))).toBe('UnaryExpression(-)');
        expect(helpers.formatNodeForMessage(binary('+', num(1), num(2)))).toBe('BinaryExpression(+)');
        expect(helpers.formatNodeForMessage({ kind: 'ConditionalExpression', test: num(1), consequent: num(2), alternate: num(3), ...span } as ConditionalExpression)).toBe('ConditionalExpression');
        expect(helpers.formatNodeForMessage(assign('=', id('x'), num(1)))).toBe('AssignmentExpression(=)');
        expect(helpers.formatNodeForMessage(update('++', id('x'), true))).toBe('UpdateExpression(++)');
        expect(helpers.formatNodeForMessage(printfExpr([textSeg('x')]))).toBe('PrintfExpression');
        expect(helpers.formatNodeForMessage(formatSeg('d', num(1)))).toBe('FormatSegment');
        expect(helpers.formatNodeForMessage(textSeg('t'))).toBe('TextSegment');
        expect(helpers.formatNodeForMessage(num(5))).toBe('NumberLiteral(5)');
        expect(helpers.formatNodeForMessage(str('hi'))).toBe('StringLiteral("hi")');
        expect(helpers.formatNodeForMessage(bool(true))).toBe('BooleanLiteral(true)');
        expect(helpers.formatNodeForMessage(errorNode('boom'))).toBe('ErrorNode');

        const ctx = makeCtx(makeHost());
        anyEval.popContainer(ctx);
    });

    it('captures containers and compares values', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            captureContainerForReference: (n: ASTNode, ctx: EvalContext) => Promise<RefContainer | undefined>;
            ltVals: (a: EvalValue, b: EvalValue) => number | undefined;
            gtVals: (a: EvalValue, b: EvalValue) => number | undefined;
        };

        const ctx = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.captureContainerForReference(id('missing'), ctx)).resolves.toBeUndefined();
        expect(helpers.ltVals('a', 'b')).toBeUndefined();
        expect(helpers.gtVals('b', 'a')).toBeUndefined();
    });

    it('evaluates intrinsic args and mod-by-zero messages', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            evalArgsForIntrinsic: (name: string, args: ASTNode[], ctx: EvalContext) => Promise<EvalValue[] | undefined>;
        };

        const sym = new TestNode('sym', 42);
        const host = makeHost({}, { sym });
        const ctx = makeCtx(host);
        const args = await helpers.evalArgsForIntrinsic('__Running', [
            num(1),
            str('s'),
            bool(true) as ASTNode,
            id('sym'),
        ], ctx);
        expect(args).toEqual([1, 's', true, 42]);

        const badArgs = await helpers.evalArgsForIntrinsic('__size_of', [num(1)], ctx);
        expect(badArgs).toBeUndefined();

        const evalBinary = (evaluator as unknown as { evalBinary: (n: BinaryExpression, ctx: EvalContext) => Promise<EvalValue> }).evalBinary;
        await expect(evalBinary.call(evaluator, binary('%', num(10), num(0)), ctx)).resolves.toBeUndefined();
    });

    it('covers mustRef branches for pseudo members and arrays', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            mustRef: (node: ASTNode, ctx: EvalContext, forWrite?: boolean) => Promise<ScvdNode | undefined>;
        };

        const ctxMissing = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.mustRef(member(id('missing'), '_count'), ctxMissing, false)).resolves.toBeUndefined();

        const base = new TestNode('base');
        const ctxOk = makeCtx(makeHost({}, { base }));
        await expect(helpers.mustRef(member(id('base'), '_count'), ctxOk, false)).resolves.toBe(base);

        const ctxMissingArray = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.mustRef(member(arr(id('arr'), num(0)), 'field'), ctxMissingArray, false)).resolves.toBeUndefined();

        const ctxMissingMember = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.mustRef(member(id('obj'), 'field'), ctxMissingMember, false)).resolves.toBeUndefined();

        const ctxMissingIndex = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.mustRef(arr(id('arr'), num(0)), ctxMissingIndex, false)).resolves.toBeUndefined();
    });

    it('covers pure nodes, reference discovery, and optional host hooks', async () => {
        const evaluator = new TestEvaluator();
        const priv = evaluator as unknown as {
            isPureNode: (node: ASTNode) => boolean;
            addByteOffset: (ctx: EvalContext, bytes: number) => void;
            evalOperandWithType: (node: ASTNode, ctx: EvalContext) => Promise<{ value: EvalValue; type: ScalarType | undefined }>;
        };
        const helpers = evaluator.getTestHelpersPublic() as {
            findReferenceNode: (node: ASTNode) => ASTNode | undefined;
            mustRef: (node: ASTNode, ctx: EvalContext, forWrite?: boolean) => Promise<ScvdNode | undefined>;
        };

        const pureCond: ConditionalExpression = { kind: 'ConditionalExpression', test: num(1), consequent: num(2), alternate: num(3), ...span };
        expect(priv.isPureNode(pureCond)).toBe(true);

        const printfRef = helpers.findReferenceNode(printfExpr([formatSeg('d', id('x'))]));
        expect(printfRef?.kind).toBe('Identifier');
        const condRef = helpers.findReferenceNode({ kind: 'ConditionalExpression', test: id('x'), consequent: num(1), alternate: num(2), ...span } as ConditionalExpression);
        expect(condRef?.kind).toBe('Identifier');

        const base = new TestNode('arr');
        const field = new TestNode('field', 7);
        base.members.set('field', field);
        const host = makeHost({}, { arr: base });
        const { getElementStride, getElementRef, getMemberOffset, getByteWidth, ...hostNoHooks } = host;
        void getElementStride;
        void getElementRef;
        void getMemberOffset;
        void getByteWidth;
        const ctx = makeCtx(hostNoHooks);
        await expect(helpers.mustRef(member(arr(id('arr'), num(1)), 'field'), ctx, false)).resolves.toBe(field);
        await expect(helpers.mustRef(arr(id('arr'), num(0)), ctx, false)).resolves.toBe(base);

        const base2 = new TestNode('arr2');
        const element = new TestNode('elem');
        const field2 = new TestNode('field', 3);
        element.members.set('field', field2);
        base2.element = element;
        const host2 = makeHost({}, { arr2: base2 });
        const ctx2 = makeCtx(host2);
        await expect(helpers.mustRef(member(arr(id('arr2'), num(1)), 'field'), ctx2, false)).resolves.toBe(field2);
        await expect(helpers.mustRef(arr(id('arr2'), num(0)), ctx2, false)).resolves.toBe(base2);

        const offsetCtx = makeCtx(makeHost({}, { arr: base }));
        offsetCtx.container.offsetBytes = undefined;
        priv.addByteOffset(offsetCtx, 4);
        expect(offsetCtx.container.offsetBytes).toBe(4);

        const operand = await priv.evalOperandWithType(num(1), offsetCtx);
        expect(operand.value).toBe(1);
        expect(operand.type?.kind).toBeDefined();
    });

    it('covers colon paths, unary/update bigint, conditionals, and format fallbacks', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            formatValue: (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, container?: RefContainer) => Promise<string | undefined>;
        };

        const colonNode: ColonPath = { kind: 'ColonPath', parts: ['a', 'b'], ...span } as ColonPath;
        const host = makeHost({
            resolveColonPath: jest.fn(async () => 42),
        });
        const ctx = makeCtx(host);
        await expect(evaluator.evalNodePublic(colonNode, ctx)).resolves.toBe(42);

        const bigNode = new TestNode('big', 1n);
        const bigHost = makeHost({}, { big: bigNode });
        const bigCtx = makeCtx(bigHost);
        await expect(evaluator.evalNodePublic(unary('+', id('big')), bigCtx)).resolves.toBe(1);

        const counter = new TestNode('counter', 1n);
        const counterHost = makeHost({}, { counter });
        const counterCtx = makeCtx(counterHost);
        await expect(evaluator.evalNodePublic(update('++', id('counter'), true), counterCtx)).resolves.toBe(2);
        await expect(evaluator.evalNodePublic(update('--', id('counter'), true), counterCtx)).resolves.toBe(1);

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: bool(false), consequent: num(1), alternate: num(2), ...span };
        await expect(evaluator.evalNodePublic(cond, counterCtx)).resolves.toBe(2);

        await expect(helpers.formatValue('u', -5n, counterCtx)).resolves.toBe('5');
        await expect(helpers.formatValue('t', 0, counterCtx)).resolves.toBe('false');
        await expect(helpers.formatValue('t', 1, counterCtx)).resolves.toBe('true');

        await expect(evaluator.evalNodePublic({ kind: 'UnknownKind', ...span } as unknown as ASTNode, counterCtx)).resolves.toBeUndefined();
    });

    it('exercises printf container recovery and memo caching paths', async () => {
        const evaluator = new TestEvaluator();
        const host = makeHost({}, { x: new TestNode('x', 5) });
        const ctx = makeCtx(host);
        ctx.container.current = undefined;

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: bool(true), consequent: id('x'), alternate: num(0), ...span };
        const printfNode = printfExpr([formatSeg('d', cond)]);
        await expect(evaluator.evalNodePublic(printfNode, ctx)).resolves.toBeDefined();

        const memoCtx = makeCtx(makeHost());
        const pure = num(7);
        const evalNodeChild = (evaluator as unknown as { evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<EvalValue> }).evalNodeChild;
        await expect(evalNodeChild.call(evaluator, pure, memoCtx)).resolves.toBe(7);
        await expect(evalNodeChild.call(evaluator, pure, memoCtx)).resolves.toBe(7);

        const divZero: BinaryExpression = { kind: 'BinaryExpression', operator: '/', left: num(1), right: num(0), ...span };
        await expect(evalNodeChild.call(evaluator, divZero, memoCtx)).resolves.toBeUndefined();
        await expect(evalNodeChild.call(evaluator, divZero, memoCtx)).resolves.toBeUndefined();
    });

    it('accumulates child timing when evaluating nested nodes', async () => {
        const evaluator = new TestEvaluator();
        const ctx = makeCtx(makeHost());

        await expect(evaluator.evalNodePublic(binary('+', num(1), num(2)), ctx)).resolves.toBe(3);
    });

    it('covers evalNode error paths and assignment/update fallbacks', async () => {
        const evaluator = new TestEvaluator();

        const missingHost = makeHost({
            getSymbolRef: jest.fn(async () => undefined),
            readValue: jest.fn(async () => undefined),
            writeValue: jest.fn(async () => undefined),
        });
        const { __Running, ...missingHostNoRunning } = missingHost;
        void __Running;
        const ctxMissing = makeCtx(missingHostNoRunning);

        await expect(evaluator.evalNodePublic(id('__Running'), ctxMissing)).resolves.toBeUndefined();

        const runningUndefHost = makeHost({ __Running: jest.fn(async () => undefined) });
        const ctxRunningUndef = makeCtx(runningUndefHost);
        await expect(evaluator.evalNodePublic(id('__Running'), ctxRunningUndef)).resolves.toBeUndefined();

        const base = new TestNode('base');
        const pseudoMissingHost = makeHost({}, { base });
        const { _count, ...pseudoMissingHostNoCount } = pseudoMissingHost;
        void _count;
        const ctxPseudoMissing = makeCtx(pseudoMissingHostNoCount);
        await expect(evaluator.evalNodePublic(member(id('base'), '_count'), ctxPseudoMissing)).resolves.toBeUndefined();

        const pseudoUndefHost = makeHost({ _count: jest.fn(async () => undefined) } as Partial<Host>, { base });
        const ctxPseudoUndef = makeCtx(pseudoUndefHost);
        await expect(evaluator.evalNodePublic(member(id('base'), '_count'), ctxPseudoUndef)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(member(id('missing'), '_addr'), ctxMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(member(id('missing'), 'field'), ctxMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(arr(id('missing'), num(0)), ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(unary('-', id('missing')), ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(update('++', id('missing'), true), ctxMissing)).resolves.toBeUndefined();

        const writeFailNode = new TestNode('counter', 1);
        const writeFailHost = makeHost({ writeValue: jest.fn(async () => undefined) }, { counter: writeFailNode });
        const ctxWriteFail = makeCtx(writeFailHost);
        await expect(evaluator.evalNodePublic(update('++', id('counter'), true), ctxWriteFail)).resolves.toBeUndefined();

        const special = new TestNode('special', 1);
        const forWriteHost = makeHost({
            getSymbolRef: jest.fn(async (_container, name: string, forWrite?: boolean) => (name === 'special' && forWrite ? special : undefined)),
        }, { special });
        const ctxForWrite = makeCtx(forWriteHost);
        await expect(evaluator.evalNodePublic(update('++', id('special'), true), ctxForWrite)).resolves.toBeUndefined();

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: id('missing'), consequent: num(1), alternate: num(2), ...span };
        await expect(evaluator.evalNodePublic(cond, ctxMissing)).resolves.toBeUndefined();

        const rightMissingHost = makeHost({}, { left: new TestNode('left', 5) });
        const ctxRightMissing = makeCtx(rightMissingHost);
        await expect(evaluator.evalNodePublic(assign('=', id('left'), id('missing')), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(assign('+=', id('left'), id('missing')), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(assign('=', id('missing'), num(1)), ctxMissing)).resolves.toBeUndefined();

        const divideNode = new TestNode('div', 10);
        const divHost = makeHost({}, { div: divideNode, zero: new TestNode('zero', 0) });
        const ctxDiv = makeCtx(divHost);
        await expect(evaluator.evalNodePublic(assign('/=', id('div'), id('zero')), ctxDiv)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(callExpr(id('__size_of'), [num(1)]), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(evalPoint('__size_of', [num(1)]), ctxRightMissing)).resolves.toBeUndefined();

        const pfMissing = printfExpr([formatSeg('d', id('missing'))]);
        await expect(evaluator.evalNodePublic(pfMissing, ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(formatSeg('d', id('missing')), ctxMissing)).resolves.toBeUndefined();

        const formatterEval = new TestEvaluator();
        (formatterEval as unknown as { formatValue: () => Promise<string | undefined> }).formatValue = jest.fn().mockResolvedValueOnce(undefined);
        const ctxFormat = makeCtx(makeHost());
        await expect(formatterEval.evalNodePublic(printfExpr([formatSeg('d', num(1))]), ctxFormat)).resolves.toBeUndefined();

        const formatValue = (evaluator as unknown as { formatValue: (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, container?: RefContainer) => Promise<string | undefined> }).formatValue;
        await expect(formatValue('d', undefined, ctxMissing)).resolves.toBeUndefined();
    });

    it('covers binary evaluation fallbacks and memo control', async () => {
        const evaluator = new TestEvaluator();

        const noTypesHost = makeHost({}, { a: new TestNode('a', 5), b: new TestNode('b', 2) });
        const { getValueType, ...noTypesHostNoTypes } = noTypesHost;
        void getValueType;
        const ctxNoTypes = makeCtx(noTypesHostNoTypes);

        await expect(evaluator.evalNodePublic(binary('&&', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(binary('||', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(binary('+', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(binary('+', num(1), id('missing')), ctxNoTypes)).resolves.toBeUndefined();

        expect(await evaluator.evalNodePublic(binary('+', num(1), num(2)), ctxNoTypes)).toBe(3);
        expect(await evaluator.evalNodePublic(binary('-', num(5), num(3)), ctxNoTypes)).toBe(2);
        expect(await evaluator.evalNodePublic(binary('*', num(2), num(4)), ctxNoTypes)).toBe(8);
        expect(await evaluator.evalNodePublic(binary('/', num(8), num(2)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNodePublic(binary('%', num(9), num(4)), ctxNoTypes)).toBe(1);
        expect(await evaluator.evalNodePublic(binary('<<', num(1), num(2)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNodePublic(binary('>>', num(8), num(1)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNodePublic(binary('&', num(3), num(1)), ctxNoTypes)).toBe(1);
        expect(await evaluator.evalNodePublic(binary('^', num(3), num(1)), ctxNoTypes)).toBe(2);
        expect(await evaluator.evalNodePublic(binary('|', num(2), num(1)), ctxNoTypes)).toBe(3);
        const memoPrev = (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED;
        (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED = false;
        const evalNodeChild = (evaluator as unknown as { evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<EvalValue> }).evalNodeChild;
        await expect(evalNodeChild.call(evaluator, num(1), ctxNoTypes)).resolves.toBe(1);
        (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED = memoPrev;
    });

    it('handles evaluateParseResult exceptions', async () => {
        const evaluator = new TestEvaluator();
        const readThrowsHost = makeHost({
            readValue: jest.fn(async () => { throw new Error('boom'); }),
        }, { bad: new TestNode('bad', 1) });
        const ctx = makeCtx(readThrowsHost);
        const pr = { ast: id('bad'), diagnostics: [], isPrintf: false, externalSymbols: [] };
        await expect(evaluator.evaluateParseResult(pr, ctx)).resolves.toBeUndefined();
    });

    it('normalizes scalar types and caches value type lookups', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            getScalarTypeForContainer: (ctx: EvalContext, container: RefContainer) => Promise<ScalarType | undefined>;
        };

        const u = new TestNode('u');
        const f = new TestNode('f');
        const t = new TestNode('t');
        const host = makeHost({
            getValueType: jest.fn(async (container: RefContainer) => {
                const name = container.current?.name;
                if (name === 'u') {
                    return 'unsigned 16';
                }
                if (name === 'f') {
                    return 'float64';
                }
                if (name === 't') {
                    return { kind: 'int', typename: 'int16' } as ScalarType;
                }
                return undefined;
            }),
        }, { u, f, t });
        const ctx = makeCtx(host);

        ctx.container.current = u;
        ctx.container.valueType = undefined;
        const typeU = await helpers.getScalarTypeForContainer(ctx, ctx.container);
        expect(typeU?.kind).toBe('uint');
        expect(typeU?.bits).toBe(16);

        ctx.container.current = f;
        ctx.container.valueType = undefined;
        const typeF = await helpers.getScalarTypeForContainer(ctx, ctx.container);
        expect(typeF?.kind).toBe('float');
        expect(typeF?.bits).toBe(64);

        ctx.container.current = t;
        ctx.container.valueType = undefined;
        const typeT = await helpers.getScalarTypeForContainer(ctx, ctx.container);
        expect(typeT?.name).toBe('int16');

        ctx.container.current = u;
        ctx.container.valueType = undefined;
        const typeCached = await helpers.getScalarTypeForContainer(ctx, ctx.container);
        expect(typeCached?.kind).toBe('uint');
        expect(host.getValueType).toHaveBeenCalledTimes(3);

        ctx.container.valueType = { kind: 'uint', name: 'uint8', bits: 8 };
        const typeDirect = await helpers.getScalarTypeForContainer(ctx, ctx.container);
        expect(typeDirect?.bits).toBe(8);

        const undefNode = new TestNode('undef');
        const hostUndefined = makeHost({
            getValueType: jest.fn(async () => undefined),
        }, { undef: undefNode });
        const ctxUndefined = makeCtx(hostUndefined);
        ctxUndefined.container.current = undefNode;
        await expect(helpers.getScalarTypeForContainer(ctxUndefined, ctxUndefined.container)).resolves.toBeUndefined();

        const uNode = new TestNode('u');
        const hostNoTypes = makeHost({}, { u: uNode });
        const { getValueType, ...hostNoTypesNoValue } = hostNoTypes;
        void getValueType;
        const ctxNoTypes = makeCtx(hostNoTypesNoValue);
        ctxNoTypes.container.current = uNode;
        await expect(helpers.getScalarTypeForContainer(ctxNoTypes, ctxNoTypes.container)).resolves.toBeUndefined();
    });

    it('handles numeric conversion and comparisons', () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            asNumber: (v: unknown) => number;
            eqVals: (a: EvalValue, b: EvalValue) => number | undefined;
            ltVals: (a: EvalValue, b: EvalValue) => number | undefined;
            lteVals: (a: EvalValue, b: EvalValue) => number | undefined;
            gtVals: (a: EvalValue, b: EvalValue) => number | undefined;
            gteVals: (a: EvalValue, b: EvalValue) => number | undefined;
        };

        expect(helpers.asNumber(true)).toBe(1);
        expect(helpers.asNumber(false)).toBe(0);
        expect(helpers.asNumber('  ')).toBe(0);
        expect(helpers.asNumber('12')).toBe(12);
        expect(helpers.asNumber(5n)).toBe(5);

        expect(helpers.eqVals('1', 1)).toBeUndefined();
        expect(helpers.eqVals(true, 1)).toBe(1);
        expect(helpers.eqVals(1n, 1)).toBe(1);
        expect(helpers.ltVals('a', 'b')).toBeUndefined();
        expect(helpers.ltVals(1n, 2n)).toBe(1);
        expect(helpers.lteVals('a', 'a')).toBeUndefined();
        expect(helpers.gtVals(2n, 1n)).toBe(1);
        expect(helpers.gteVals(2n, 2n)).toBe(1);
    });

    it('covers integer division/modulo and prefersInteger fallbacks', () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            integerDiv: (a: number | bigint, b: number | bigint, unsigned: boolean) => number | bigint | undefined;
            integerMod: (a: number | bigint, b: number | bigint, unsigned: boolean) => number | bigint | undefined;
        };

        expect(helpers.integerDiv(5n, 2n, false)).toBe(2);
        expect(helpers.integerDiv(5n, 0.5, false)).toBeUndefined();
        expect(helpers.integerDiv(5, 2, true)).toBe(2);
        expect(helpers.integerDiv(5, 0.5, true)).toBeUndefined();
        expect(helpers.integerDiv(5, Number.NaN, false)).toBeUndefined();
        expect(helpers.integerMod(5n, 2n, false)).toBe(1);
        expect(helpers.integerMod(5n, 0.5, false)).toBeUndefined();
        expect(helpers.integerMod(5, 2, true)).toBe(1);
        expect(helpers.integerMod(5, 0.5, true)).toBeUndefined();
        expect(helpers.integerMod(5, Number.NaN, false)).toBeUndefined();
    });

    it('covers byte width caching and missing byte width hooks', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            mustRef: (node: ASTNode, ctx: EvalContext, forWrite?: boolean) => Promise<ScvdNode | undefined>;
        };

        const wide = new TestNode('wide', 1);
        const host = makeHost({ getByteWidth: jest.fn(async () => 4) }, { wide });
        const ctx = makeCtx(host);
        await expect(helpers.mustRef(id('wide'), ctx, false)).resolves.toBe(wide);
        await expect(helpers.mustRef(id('wide'), ctx, false)).resolves.toBe(wide);
        expect(host.getByteWidth).toHaveBeenCalledTimes(1);

        const zeroWidth = new TestNode('zero', 1);
        const hostZero = makeHost({ getByteWidth: jest.fn(async () => 0) }, { zero: zeroWidth });
        const ctxZero = makeCtx(hostZero);
        await expect(helpers.mustRef(id('zero'), ctxZero, false)).resolves.toBe(zeroWidth);
        expect(ctxZero.container.widthBytes).toBeUndefined();

        const xNode = new TestNode('x');
        const hostNoByte = makeHost({}, { x: xNode });
        const { getByteWidth, ...hostNoByteWidth } = hostNoByte;
        void getByteWidth;
        const ctxNoByte = makeCtx(hostNoByteWidth);
        await expect(helpers.mustRef(id('x'), ctxNoByte, false)).resolves.toBe(xNode);
    });

    it('captures containers and reports missing members', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            mustRef: (node: ASTNode, ctx: EvalContext, forWrite?: boolean) => Promise<ScvdNode | undefined>;
            captureContainerForReference: (node: ASTNode, ctx: EvalContext) => Promise<RefContainer | undefined>;
        };

        const arrayNode = new TestNode('arr');
        arrayNode.element = new TestNode('elem');
        const obj = new TestNode('obj');
        const host = makeHost({}, { arr: arrayNode, obj });

        const ctxArray = makeCtx(host);
        await expect(helpers.mustRef(member(arr(id('arr'), num(0)), 'missing'), ctxArray, false)).resolves.toBeUndefined();

        const ctxObj = makeCtx(host);
        await expect(helpers.mustRef(member(id('obj'), 'missing'), ctxObj, false)).resolves.toBeUndefined();

        await expect(helpers.captureContainerForReference(num(1), ctxObj)).resolves.toBeUndefined();
    });

    it('finds reference nodes through nested structures', () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            findReferenceNode: (node: ASTNode | undefined) => ASTNode | undefined;
        };

        expect(helpers.findReferenceNode(undefined)).toBeUndefined();
        expect(helpers.findReferenceNode(unary('-', id('x')))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(update('++', id('y'), true))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(binary('+', num(1), id('z')))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(assign('=', id('a'), num(1)))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(callExpr(id('fn'), [num(1), id('arg')]))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(callExpr(id('fn'), []))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(evalPoint('__Running', []))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(evalPoint('__size_of', [id('sym')]))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(printfExpr([formatSeg('d', id('p'))]))?.kind).toBe('Identifier');
        expect(helpers.findReferenceNode(printfExpr([textSeg('only-text')]))).toBeUndefined();
    });

    it('handles invalid mustRef targets', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            mustRef: (node: ASTNode, ctx: EvalContext, forWrite?: boolean) => Promise<ScvdNode | undefined>;
        };
        const ctx = makeCtx(makeHost());

        await expect(helpers.mustRef(evalPoint('__Running', []), ctx, false)).resolves.toBeUndefined();
        await expect(helpers.mustRef(num(1), ctx, false)).resolves.toBeUndefined();
    });

    it('evaluates identifiers, members, arrays, and unary operators', async () => {
        const evaluator = new TestEvaluator();
        const element = new TestNode('element', 9);
        const arrayNode = new TestNode('arr');
        arrayNode.element = element;
        const obj = new TestNode('obj');
        const field = new TestNode('field', 6);
        obj.members.set('field', field);
        const host = makeHost({
            _count: jest.fn(async () => 7),
            _addr: jest.fn(async () => 0x10),
            __Running: jest.fn(async () => 2),
        }, { arr: arrayNode, obj, field, run: new TestNode('run', 2) });
        const ctx = makeCtx(host);

        await expect(evaluator.evalNodePublic(id('__Running'), ctx)).resolves.toBe(2);
        await expect(evaluator.evalNodePublic(member(id('obj'), '_count'), ctx)).resolves.toBe(7);
        await expect(evaluator.evalNodePublic(member(id('obj'), '_addr'), ctx)).resolves.toBe(0x10);
        await expect(evaluator.evalNodePublic(member(id('obj'), 'field'), ctx)).resolves.toBe(6);
        await expect(evaluator.evalNodePublic(arr(id('arr'), num(0)), ctx)).resolves.toBe(9);

        await expect(evaluator.evalNodePublic(unary('-', num(5)), ctx)).resolves.toBe(-5);
        await expect(evaluator.evalNodePublic(unary('!', bool(false)), ctx)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(unary('~', num(1)), ctx)).resolves.toBe(-2);
        const bigHost = makeHost({}, { big: new TestNode('big', 1n) });
        const bigCtx = makeCtx(bigHost);
        await expect(evaluator.evalNodePublic(unary('~', id('big')), bigCtx)).resolves.toBe(-2);
    });

    it('covers colon path misses and invalid unary operators', async () => {
        const evaluator = new TestEvaluator();
        const host = makeHost({ resolveColonPath: jest.fn(async () => undefined) });
        const ctx = makeCtx(host);
        const colonNode: ColonPath = { kind: 'ColonPath', parts: ['missing'], ...span } as ColonPath;
        await expect(evaluator.evalNodePublic(colonNode, ctx)).resolves.toBeUndefined();

        const badUnary = { kind: 'UnaryExpression', operator: '??', argument: num(1), ...span } as unknown as UnaryExpression;
        await expect(evaluator.evalNodePublic(badUnary, ctx)).resolves.toBeUndefined();
    });

    it('updates and assigns with supported operators', async () => {
        const evaluator = new TestEvaluator();
        const ops: Array<{ op: AssignmentExpression['operator']; start: number; rhs: number; expected: number }> = [
            { op: '+=', start: 2, rhs: 3, expected: 5 },
            { op: '-=', start: 5, rhs: 3, expected: 2 },
            { op: '*=', start: 2, rhs: 4, expected: 8 },
            { op: '/=', start: 7, rhs: 2, expected: 3 },
            { op: '%=', start: 7, rhs: 2, expected: 1 },
            { op: '<<=', start: 1, rhs: 3, expected: 8 },
            { op: '>>=', start: 8, rhs: 2, expected: 2 },
            { op: '&=', start: 6, rhs: 3, expected: 2 },
            { op: '^=', start: 6, rhs: 3, expected: 5 },
            { op: '|=', start: 2, rhs: 1, expected: 3 },
        ];

        for (const { op, start, rhs, expected } of ops) {
            const node = new TestNode('x', start);
            const host = makeHost({
                getValueType: jest.fn(async () => ({ kind: 'int', name: 'int', bits: 32 } as ScalarType)),
            }, { x: node });
            const ctx = makeCtx(host);
            await expect(evaluator.evalNodePublic(assign(op, id('x'), num(rhs)), ctx)).resolves.toBe(expected);
            expect(node.value).toBe(expected);
        }

        const counter = new TestNode('counter', 1);
        const host = makeHost({}, { counter });
        const ctx = makeCtx(host);
        await expect(evaluator.evalNodePublic(update('++', id('counter'), false), ctx)).resolves.toBe(1);
        expect(counter.value).toBe(2);

        const base = new TestNode('base', 1);
        const setHost = makeHost({}, { base });
        const ctxSet = makeCtx(setHost);
        await expect(evaluator.evalNodePublic(assign('=', id('base'), num(9)), ctxSet)).resolves.toBe(9);
        expect(base.value).toBe(9);
    });

    it('covers unsupported assignment operator branch', async () => {
        const evaluator = new TestEvaluator();
        const node = new TestNode('x', 1);
        const host = makeHost({}, { x: node });
        const ctx = makeCtx(host);
        const badAssign = { kind: 'AssignmentExpression', operator: '??=', left: id('x'), right: num(1), ...span } as unknown as AssignmentExpression;
        await expect(evaluator.evalNodePublic(badAssign, ctx)).resolves.toBeUndefined();
    });

    it('handles call expressions and eval points', async () => {
        const evaluator = new TestEvaluator();
        const fnNode = new TestNode('fn', async (...args: EvalValue[]) => {
            const [a, b] = args;
            if (typeof a === 'number' && typeof b === 'number') {
                return a + b;
            }
            return undefined;
        });
        const host = makeHost({}, { fn: fnNode, sym: new TestNode('sym', 1) });
        const ctx = makeCtx(host);

        await expect(evaluator.evalNodePublic(callExpr(id('fn'), [num(2), num(3)]), ctx)).resolves.toBe(5);
        await expect(evaluator.evalNodePublic(callExpr(num(1), []), ctx)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(callExpr(id('__size_of'), [id('sym')]), ctx)).resolves.toBe(1);

        const badEvalPoint = evalPoint('NotIntrinsic', []);
        await expect(evaluator.evalNodePublic(badEvalPoint, ctx)).resolves.toBeUndefined();

        await expect(evaluator.evalNodePublic(evalPoint('__GetRegVal', [id('sym')]), ctx)).resolves.toBe(1);
    });

    it('evaluates binary operations with and without types', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            evalBinary: (node: BinaryExpression, ctx: EvalContext) => Promise<EvalValue>;
        };
        const typeHost = makeHost({
            getValueType: jest.fn(async () => ({ kind: 'uint', name: 'uint32', bits: 32 } as ScalarType)),
        });
        const ctxTyped = makeCtx(typeHost);
        await expect(helpers.evalBinary(binary('<<', num(1), num(2)), ctxTyped)).resolves.toBe(4);
        await expect(helpers.evalBinary(binary('>>', num(8), num(1)), ctxTyped)).resolves.toBe(4);
        await expect(helpers.evalBinary(binary('/', num(5), num(2)), ctxTyped)).resolves.toBe(2);
        await expect(helpers.evalBinary(binary('-', num(5), num(2)), ctxTyped)).resolves.toBe(3);
        await expect(helpers.evalBinary(binary('*', num(3), num(2)), ctxTyped)).resolves.toBe(6);
        await expect(helpers.evalBinary(binary('%', num(7), num(2)), ctxTyped)).resolves.toBe(1);
        await expect(helpers.evalBinary(binary('&', num(3), num(1)), ctxTyped)).resolves.toBe(1);
        await expect(helpers.evalBinary(binary('^', num(3), num(1)), ctxTyped)).resolves.toBe(2);
        await expect(helpers.evalBinary(binary('|', num(2), num(1)), ctxTyped)).resolves.toBe(3);

        const missingHost = makeHost({
            getValueType: jest.fn(async () => ({ kind: 'uint', name: 'uint32', bits: 32 } as ScalarType)),
            getSymbolRef: jest.fn(async () => undefined),
        });
        const ctxMissing = makeCtx(missingHost);
        await expect(helpers.evalBinary(binary('+', id('missing'), num(1)), ctxMissing)).resolves.toBeUndefined();

        const noTypesHost = makeHost({}, { a: new TestNode('a', 'x'), b: new TestNode('b', 'y') });
        const { getValueType, ...noTypesHostNoTypes } = noTypesHost;
        void getValueType;
        const ctxNoTypes = makeCtx(noTypesHostNoTypes);
        await expect(evaluator.evalNodePublic(binary('==', str('1'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(binary('!=', num(1), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('<', num(1), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('<=', num(2), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('>', num(3), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('>=', num(2), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('===', num(1), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNodePublic(binary('&&', num(0), num(1)), ctxNoTypes)).resolves.toBe(0);
        await expect(evaluator.evalNodePublic(binary('&&', num(1), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('||', num(0), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('||', num(1), num(2)), ctxNoTypes)).resolves.toBe(1);
        await expect(evaluator.evalNodePublic(binary('/', num(5.5), num(2)), ctxNoTypes)).resolves.toBeCloseTo(2.75);
        await expect(evaluator.evalNodePublic(binary('%', num(5.5), num(2)), ctxNoTypes)).resolves.toBeUndefined();
    });

    it('formats values and normalizes evaluate results', async () => {
        const evaluator = new TestEvaluator();
        const helpers = evaluator.getTestHelpersPublic() as {
            formatValue: (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, container?: RefContainer) => Promise<string | undefined>;
            normalizeEvaluateResult: (v: EvalValue) => EvaluateResult;
        };

        const host = makeHost({
            formatPrintf: jest.fn(async () => 'override'),
        });
        const ctx = makeCtx(host);
        await expect(helpers.formatValue('d', 5, ctx)).resolves.toBe('override');

        const noOverrideHost = makeHost({});
        const ctxNoOverride = makeCtx(noOverrideHost);
        await expect(helpers.formatValue('%', 1, ctxNoOverride)).resolves.toBe('%');
        await expect(helpers.formatValue('d', 1n, ctxNoOverride)).resolves.toBe('1');
        await expect(helpers.formatValue('d', Number.NaN, ctxNoOverride)).resolves.toBe('NaN');
        await expect(helpers.formatValue('u', Number.NaN, ctxNoOverride)).resolves.toBe('NaN');
        await expect(helpers.formatValue('x', Number.NaN, ctxNoOverride)).resolves.toBe('NaN');
        await expect(helpers.formatValue('x', 15, ctxNoOverride)).resolves.toBe('f');
        await expect(helpers.formatValue('u', 15, ctxNoOverride)).resolves.toBe('15');
        await expect(helpers.formatValue('x', 15n, ctxNoOverride)).resolves.toBe('0xf');
        await expect(helpers.formatValue('S', 5, ctxNoOverride)).resolves.toBe('5');
        await expect(helpers.formatValue('C', 5, ctxNoOverride)).resolves.toBe('5');
        await expect(helpers.formatValue('q', 5, ctxNoOverride)).resolves.toBe('5');
        await expect(helpers.formatValue('d', undefined, ctxNoOverride)).resolves.toBeUndefined();

        expect(helpers.normalizeEvaluateResult(true)).toBe(1);
        expect(helpers.normalizeEvaluateResult(false)).toBe(0);
        expect(helpers.normalizeEvaluateResult('ok')).toBe('ok');
        expect(helpers.normalizeEvaluateResult(5)).toBe(5);
        expect(helpers.normalizeEvaluateResult(1n)).toBeUndefined();
        expect(helpers.normalizeEvaluateResult(new Uint8Array([1]))).toBeUndefined();
    });

    it('covers printf container recovery and format segment evaluation', async () => {
        const evaluator = new TestEvaluator();
        const host = makeHost({}, { x: new TestNode('x', 8) });
        const ctx = makeCtx(host);

        const refSegment = printfExpr([textSeg('v='), formatSeg('d', id('x'))]);
        await expect(evaluator.evalNodePublic(refSegment, ctx)).resolves.toBe('v=8');

        ctx.container.current = undefined;
        const nonConstLiteral: NumberLiteral = { kind: 'NumberLiteral', value: 3, raw: '3', valueType: 'number', ...span };
        const plainSegment = printfExpr([formatSeg('d', nonConstLiteral)]);
        await expect(evaluator.evalNodePublic(plainSegment, ctx)).resolves.toBe('3');

        const recoveredSegment = printfExpr([formatSeg('d', binary('+', id('x'), num(1)))]);
        await expect(evaluator.evalNodePublic(recoveredSegment, ctx)).resolves.toBe('9');

        await expect(evaluator.evalNodePublic(textSeg('only-text'), ctx)).resolves.toBe('only-text');
        await expect(evaluator.evalNodePublic(formatSeg('d', num(2)), ctx)).resolves.toBe('2');
        await expect(evaluator.evalNodePublic(errorNode('fail'), ctx)).resolves.toBeUndefined();
    });

    it('records messages during evaluateParseResult and handles perf start == 0', async () => {
        const evaluator = new TestEvaluator();
        const host = makeHost({ getSymbolRef: jest.fn(async () => undefined) });
        const ctx = makeCtx(host);
        const pr = { ast: id('missing'), diagnostics: [], isPrintf: false, externalSymbols: [] };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(evaluator.evaluateParseResult(pr, ctx)).resolves.toBeUndefined();
        } finally {
            consoleSpy.mockRestore();
        }

        if (!perf) {
            return;
        }
        const originalNow = perf.now;
        try {
            perf.now = () => 0;
            const evalNodeChild = (evaluator as unknown as { evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<EvalValue> }).evalNodeChild;
            await expect(evalNodeChild.call(evaluator, num(1), ctx)).resolves.toBe(1);
        } finally {
            perf.now = originalNow;
        }
    });

    it('records intrinsic errors, resets caches, and uses container overrides', async () => {
        const evaluator = new TestEvaluator();
        evaluator.resetEvalCaches();

        const host = makeHost({}, { sym: new TestNode('sym', 1) });
        const { __GetRegVal, ...hostNoReg } = host;
        void __GetRegVal;
        const ctx = makeCtx(hostNoReg);
        await expect(evaluator.evalNodePublic(evalPoint('__GetRegVal', [str('r0')]), ctx)).resolves.toBeUndefined();
        expect(evaluator.getMessagesPublic()).toContain('Missing intrinsic __GetRegVal');

        const overrideBase = new TestNode('override');
        const pr = { ast: num(1), diagnostics: [], isPrintf: false, externalSymbols: [] };
        await expect(evaluator.evaluateParseResult(pr, ctx, overrideBase)).resolves.toBe(1);
    });

    it('uses memoization for unary pure nodes', async () => {
        const evaluator = new TestEvaluator();
        const ctx = makeCtx(makeHost());
        const evalNodeChild = (evaluator as unknown as { evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<EvalValue> }).evalNodeChild;
        await expect(evalNodeChild.call(evaluator, unary('-', num(2)), ctx)).resolves.toBe(-2);
    });
});
