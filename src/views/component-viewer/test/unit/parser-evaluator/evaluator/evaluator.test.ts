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

import { Evaluator, EvalContext } from '../../../../parser-evaluator/evaluator';
import type { ASTNode, AssignmentExpression, BinaryExpression, CallExpression, ConditionalExpression, EvalPointCall, FormatSegment, Identifier, MemberAccess, NumberLiteral, PrintfExpression, StringLiteral, TextSegment, UnaryExpression, UpdateExpression, ArrayIndex, ColonPath, BooleanLiteral, ErrorNode } from '../../../../parser-evaluator/parser';
import type { DataAccessHost, EvalValue, ModelHost, RefContainer, ScalarType } from '../../../../parser-evaluator/model-host';
import type { IntrinsicProvider } from '../../../../parser-evaluator/intrinsics';
import { ScvdNode } from '../../../../model/scvd-node';

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
        const evaluator = new Evaluator();
        const anyEval = evaluator as unknown as {
            formatEvalValueForMessage: (v: EvalValue) => string;
            formatNodeForMessage: (n: ASTNode) => string;
            popContainer: (ctx: EvalContext) => void;
        };

        expect(anyEval.formatEvalValueForMessage(undefined)).toBe('undefined');
        const long = 'a'.repeat(80);
        const formattedLong = anyEval.formatEvalValueForMessage(long);
        expect(formattedLong.startsWith('"')).toBe(true);
        expect(formattedLong.endsWith('"')).toBe(true);
        expect(formattedLong).toContain('...');
        expect(anyEval.formatEvalValueForMessage('short')).toBe('"short"');
        expect(anyEval.formatEvalValueForMessage(123)).toBe('123');
        expect(anyEval.formatEvalValueForMessage(new Uint8Array([1, 2, 3]))).toBe('Uint8Array(3)');
        expect(anyEval.formatEvalValueForMessage({} as unknown as EvalValue)).toBe('[object Object]');

        expect(anyEval.formatNodeForMessage(id('x'))).toBe('Identifier(x)');
        expect(anyEval.formatNodeForMessage(member(id('obj'), 'field'))).toBe('MemberAccess(Identifier(obj).field)');
        expect(anyEval.formatNodeForMessage(arr(id('arr'), num(0)))).toBe('ArrayIndex(Identifier(arr)[...])');
        expect(anyEval.formatNodeForMessage(callExpr(id('fn'), []))).toBe('CallExpression');
        expect(anyEval.formatNodeForMessage(evalPoint('__Running', []))).toBe('EvalPointCall');
        expect(anyEval.formatNodeForMessage(unary('-', num(1)))).toBe('UnaryExpression(-)');
        expect(anyEval.formatNodeForMessage(binary('+', num(1), num(2)))).toBe('BinaryExpression(+)');
        expect(anyEval.formatNodeForMessage({ kind: 'ConditionalExpression', test: num(1), consequent: num(2), alternate: num(3), ...span } as ConditionalExpression)).toBe('ConditionalExpression');
        expect(anyEval.formatNodeForMessage(assign('=', id('x'), num(1)))).toBe('AssignmentExpression(=)');
        expect(anyEval.formatNodeForMessage(update('++', id('x'), true))).toBe('UpdateExpression(++)');
        expect(anyEval.formatNodeForMessage(printfExpr([textSeg('x')]))).toBe('PrintfExpression');
        expect(anyEval.formatNodeForMessage(formatSeg('d', num(1)))).toBe('FormatSegment');
        expect(anyEval.formatNodeForMessage(textSeg('t'))).toBe('TextSegment');
        expect(anyEval.formatNodeForMessage(num(5))).toBe('NumberLiteral(5)');
        expect(anyEval.formatNodeForMessage(str('hi'))).toBe('StringLiteral("hi")');
        expect(anyEval.formatNodeForMessage(bool(true))).toBe('BooleanLiteral(true)');
        expect(anyEval.formatNodeForMessage(errorNode('boom'))).toBe('ErrorNode');

        const ctx = makeCtx(makeHost());
        anyEval.popContainer(ctx);
    });

    it('captures containers and compares values', async () => {
        const evaluator = new Evaluator();
        const helpers = evaluator.getTestHelpers() as {
            captureContainerForReference: (n: ASTNode, ctx: EvalContext) => Promise<RefContainer | undefined>;
            ltVals: (a: EvalValue, b: EvalValue) => boolean;
            gtVals: (a: EvalValue, b: EvalValue) => boolean;
        };

        const ctx = makeCtx(makeHost({ getSymbolRef: jest.fn(async () => undefined) }));
        await expect(helpers.captureContainerForReference(id('missing'), ctx)).resolves.toBeUndefined();
        expect(helpers.ltVals('a', 'b')).toBe(true);
        expect(helpers.gtVals('b', 'a')).toBe(true);
    });

    it('evaluates intrinsic args and mod-by-zero messages', async () => {
        const evaluator = new Evaluator();
        const helpers = evaluator.getTestHelpers() as {
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

        const modValsWithKind = (evaluator as unknown as { modValsWithKind: (a: EvalValue, b: EvalValue, kind: string | undefined) => EvalValue }).modValsWithKind;
        expect(modValsWithKind.call(evaluator, 10, 0, 'int')).toBeUndefined();
    });

    it('covers mustRef branches for pseudo members and arrays', async () => {
        const evaluator = new Evaluator();
        const helpers = evaluator.getTestHelpers() as {
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
        const evaluator = new Evaluator();
        const priv = evaluator as unknown as {
            isPureNode: (node: ASTNode) => boolean;
            addByteOffset: (ctx: EvalContext, bytes: number) => void;
            evalOperandWithType: (node: ASTNode, ctx: EvalContext) => Promise<{ value: EvalValue; type: ScalarType | undefined }>;
        };
        const helpers = evaluator.getTestHelpers() as {
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
        const evaluator = new Evaluator();
        const helpers = evaluator.getTestHelpers() as {
            formatValue: (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, container?: RefContainer) => Promise<string | undefined>;
        };

        const colonNode: ColonPath = { kind: 'ColonPath', parts: ['a', 'b'], ...span } as ColonPath;
        const host = makeHost({
            resolveColonPath: jest.fn(async () => 42),
        });
        const ctx = makeCtx(host);
        await expect(evaluator.evalNode(colonNode, ctx)).resolves.toBe(42);

        const bigNode = new TestNode('big', 1n);
        const bigHost = makeHost({}, { big: bigNode });
        const bigCtx = makeCtx(bigHost);
        await expect(evaluator.evalNode(unary('+', id('big')), bigCtx)).resolves.toBe(1n);

        const counter = new TestNode('counter', 1n);
        const counterHost = makeHost({}, { counter });
        const counterCtx = makeCtx(counterHost);
        await expect(evaluator.evalNode(update('++', id('counter'), true), counterCtx)).resolves.toBe(2n);
        await expect(evaluator.evalNode(update('--', id('counter'), true), counterCtx)).resolves.toBe(1n);

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: bool(false), consequent: num(1), alternate: num(2), ...span };
        await expect(evaluator.evalNode(cond, counterCtx)).resolves.toBe(2);

        await expect(helpers.formatValue('u', -5n, counterCtx)).resolves.toBe('5');
        await expect(helpers.formatValue('t', 0, counterCtx)).resolves.toBe('false');
        await expect(helpers.formatValue('t', 1, counterCtx)).resolves.toBe('true');

        await expect(evaluator.evalNode({ kind: 'UnknownKind', ...span } as unknown as ASTNode, counterCtx)).resolves.toBeUndefined();
    });

    it('exercises printf container recovery and memo caching paths', async () => {
        const evaluator = new Evaluator();
        const host = makeHost({}, { x: new TestNode('x', 5) });
        const ctx = makeCtx(host);
        ctx.container.current = undefined;

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: bool(true), consequent: id('x'), alternate: num(0), ...span };
        const printfNode = printfExpr([formatSeg('d', cond)]);
        await expect(evaluator.evalNode(printfNode, ctx)).resolves.toBeDefined();

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
        const evaluator = new Evaluator();
        const ctx = makeCtx(makeHost());

        await expect(evaluator.evalNode(binary('+', num(1), num(2)), ctx)).resolves.toBe(3);
    });

    it('covers evalNode error paths and assignment/update fallbacks', async () => {
        const evaluator = new Evaluator();

        const missingHost = makeHost({
            getSymbolRef: jest.fn(async () => undefined),
            readValue: jest.fn(async () => undefined),
            writeValue: jest.fn(async () => undefined),
        });
        const { __Running, ...missingHostNoRunning } = missingHost;
        void __Running;
        const ctxMissing = makeCtx(missingHostNoRunning);

        await expect(evaluator.evalNode(id('__Running'), ctxMissing)).resolves.toBeUndefined();

        const runningUndefHost = makeHost({ __Running: jest.fn(async () => undefined) });
        const ctxRunningUndef = makeCtx(runningUndefHost);
        await expect(evaluator.evalNode(id('__Running'), ctxRunningUndef)).resolves.toBeUndefined();

        const base = new TestNode('base');
        const pseudoMissingHost = makeHost({}, { base });
        const { _count, ...pseudoMissingHostNoCount } = pseudoMissingHost;
        void _count;
        const ctxPseudoMissing = makeCtx(pseudoMissingHostNoCount);
        await expect(evaluator.evalNode(member(id('base'), '_count'), ctxPseudoMissing)).resolves.toBeUndefined();

        const pseudoUndefHost = makeHost({ _count: jest.fn(async () => undefined) } as Partial<Host>, { base });
        const ctxPseudoUndef = makeCtx(pseudoUndefHost);
        await expect(evaluator.evalNode(member(id('base'), '_count'), ctxPseudoUndef)).resolves.toBeUndefined();

        await expect(evaluator.evalNode(member(id('missing'), '_addr'), ctxMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(member(id('missing'), 'field'), ctxMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(arr(id('missing'), num(0)), ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNode(unary('-', id('missing')), ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNode(update('++', id('missing'), true), ctxMissing)).resolves.toBeUndefined();

        const writeFailNode = new TestNode('counter', 1);
        const writeFailHost = makeHost({ writeValue: jest.fn(async () => undefined) }, { counter: writeFailNode });
        const ctxWriteFail = makeCtx(writeFailHost);
        await expect(evaluator.evalNode(update('++', id('counter'), true), ctxWriteFail)).resolves.toBeUndefined();

        const special = new TestNode('special', 1);
        const forWriteHost = makeHost({
            getSymbolRef: jest.fn(async (_container, name: string, forWrite?: boolean) => (name === 'special' && forWrite ? special : undefined)),
        }, { special });
        const ctxForWrite = makeCtx(forWriteHost);
        await expect(evaluator.evalNode(update('++', id('special'), true), ctxForWrite)).resolves.toBeUndefined();

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: id('missing'), consequent: num(1), alternate: num(2), ...span };
        await expect(evaluator.evalNode(cond, ctxMissing)).resolves.toBeUndefined();

        const rightMissingHost = makeHost({}, { left: new TestNode('left', 5) });
        const ctxRightMissing = makeCtx(rightMissingHost);
        await expect(evaluator.evalNode(assign('=', id('left'), id('missing')), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(assign('+=', id('left'), id('missing')), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(assign('=', id('missing'), num(1)), ctxMissing)).resolves.toBeUndefined();

        const divideNode = new TestNode('div', 10);
        const divHost = makeHost({}, { div: divideNode, zero: new TestNode('zero', 0) });
        const ctxDiv = makeCtx(divHost);
        await expect(evaluator.evalNode(assign('/=', id('div'), id('zero')), ctxDiv)).resolves.toBeUndefined();

        await expect(evaluator.evalNode(callExpr(id('__size_of'), [num(1)]), ctxRightMissing)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(evalPoint('__size_of', [num(1)]), ctxRightMissing)).resolves.toBeUndefined();

        const pfMissing = printfExpr([formatSeg('d', id('missing'))]);
        await expect(evaluator.evalNode(pfMissing, ctxMissing)).resolves.toBeUndefined();

        await expect(evaluator.evalNode(formatSeg('d', id('missing')), ctxMissing)).resolves.toBeUndefined();

        const formatterEval = new Evaluator();
        (formatterEval as unknown as { formatValue: () => Promise<string | undefined> }).formatValue = jest.fn().mockResolvedValueOnce(undefined);
        const ctxFormat = makeCtx(makeHost());
        await expect(formatterEval.evalNode(printfExpr([formatSeg('d', num(1))]), ctxFormat)).resolves.toBeUndefined();

        const formatValue = (evaluator as unknown as { formatValue: (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, container?: RefContainer) => Promise<string | undefined> }).formatValue;
        await expect(formatValue('d', undefined, ctxMissing)).resolves.toBeUndefined();
    });

    it('covers binary evaluation fallbacks and memo control', async () => {
        const evaluator = new Evaluator();

        const noTypesHost = makeHost({}, { a: new TestNode('a', 5), b: new TestNode('b', 2) });
        const { getValueType, ...noTypesHostNoTypes } = noTypesHost;
        void getValueType;
        const ctxNoTypes = makeCtx(noTypesHostNoTypes);

        await expect(evaluator.evalNode(binary('&&', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(binary('||', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(binary('+', id('missing'), num(1)), ctxNoTypes)).resolves.toBeUndefined();
        await expect(evaluator.evalNode(binary('+', num(1), id('missing')), ctxNoTypes)).resolves.toBeUndefined();

        expect(await evaluator.evalNode(binary('+', num(1), num(2)), ctxNoTypes)).toBe(3);
        expect(await evaluator.evalNode(binary('-', num(5), num(3)), ctxNoTypes)).toBe(2);
        expect(await evaluator.evalNode(binary('*', num(2), num(4)), ctxNoTypes)).toBe(8);
        expect(await evaluator.evalNode(binary('/', num(8), num(2)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNode(binary('%', num(9), num(4)), ctxNoTypes)).toBe(1);
        expect(await evaluator.evalNode(binary('<<', num(1), num(2)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNode(binary('>>', num(8), num(1)), ctxNoTypes)).toBe(4);
        expect(await evaluator.evalNode(binary('&', num(3), num(1)), ctxNoTypes)).toBe(1);
        expect(await evaluator.evalNode(binary('^', num(3), num(1)), ctxNoTypes)).toBe(2);
        expect(await evaluator.evalNode(binary('|', num(2), num(1)), ctxNoTypes)).toBe(3);
        const memoPrev = (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED;
        (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED = false;
        const evalNodeChild = (evaluator as unknown as { evalNodeChild: (node: ASTNode, ctx: EvalContext) => Promise<EvalValue> }).evalNodeChild;
        await expect(evalNodeChild.call(evaluator, num(1), ctxNoTypes)).resolves.toBe(1);
        (Evaluator as unknown as { MEMO_ENABLED: boolean }).MEMO_ENABLED = memoPrev;
    });

    it('handles evaluateParseResult exceptions', async () => {
        const evaluator = new Evaluator();
        const readThrowsHost = makeHost({
            readValue: jest.fn(async () => { throw new Error('boom'); }),
        }, { bad: new TestNode('bad', 1) });
        const ctx = makeCtx(readThrowsHost);
        const pr = { ast: id('bad'), diagnostics: [], isPrintf: false, externalSymbols: [] };
        await expect(evaluator.evaluateParseResult(pr, ctx)).resolves.toBeUndefined();
    });
});
