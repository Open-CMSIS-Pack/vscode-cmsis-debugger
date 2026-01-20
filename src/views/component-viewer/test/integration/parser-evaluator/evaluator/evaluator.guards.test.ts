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
 *
 * Integration test for Evaluator.guardCoverage.
 */
// generated with AI

import * as evaluator from '../../../../parser-evaluator/evaluator';
import { EvalContext } from '../../../../parser-evaluator/evaluator';
import type { ASTNode, AssignmentExpression, CallExpression, UnaryExpression, BinaryExpression, ColonPath, FormatSegment } from '../../../../parser-evaluator/parser';
import type { ModelHost } from '../../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../../model/scvd-node';
import type { EvalValue, RefContainer, ScalarType } from '../../../../parser-evaluator/ref-container';

class BareNode extends ScvdNode {
    constructor() {
        super(undefined);
    }
    public override getSymbol(_name: string): ScvdNode | undefined { return undefined; }
    public getMember(_property: string): ScvdNode | undefined { return undefined; }
    public async setValue(): Promise<string | number | undefined> { return undefined; }
    public async getValue(): Promise<string | number | bigint | Uint8Array | undefined> { return undefined; }
}

class StubHost implements ModelHost {
    constructor(private readonly memberRef?: ScvdNode, private readonly memberOffset?: number, private readonly byteWidth?: number) {}
    async getSymbolRef(container: RefContainer): Promise<ScvdNode | undefined> {
        container.current = container.base;
        return container.base;
    }
    async getMemberRef(container: RefContainer, _property: string): Promise<ScvdNode | undefined> {
        container.current = this.memberRef;
        return this.memberRef;
    }
    async readValue(): Promise<EvalValue> { return 0; }
    async writeValue(_container: RefContainer, value: EvalValue): Promise<EvalValue> { return value; }
    async resolveColonPath(): Promise<EvalValue> { return undefined; }
    async getElementStride(): Promise<number> { return 0; }
    async getMemberOffset(): Promise<number | undefined> { return this.memberOffset; }
    async getByteWidth(): Promise<number | undefined> { return this.byteWidth; }
    async getElementRef(): Promise<ScvdNode | undefined> { return undefined; }
    async getValueType(): Promise<string | ScalarType | undefined> { return undefined; }
}

function makeCtx(host: ModelHost): EvalContext {
    const base = new BareNode();
    return new EvalContext({ data: host as never, container: base });
}

describe('evaluator guards', () => {
    const asAny = evaluator.__test__ as Record<string, unknown>;

    it('covers findReferenceNode guards and non-reference path', () => {
        const fn = asAny.findReferenceNode as (n: ASTNode | undefined) => ASTNode | undefined;
        expect(fn(undefined)).toBeUndefined();
        expect(fn({ kind: 'Unknown', start: 0, end: 0 } as unknown as ASTNode)).toBeUndefined();

        const callNode: CallExpression = { kind: 'CallExpression', callee: { kind: 'Identifier', name: 'fn', start: 0, end: 0 }, args: [], start: 0, end: 0 };
        expect(fn(callNode)).toBe(callNode.callee);

        const callWithArg: CallExpression = {
            kind: 'CallExpression',
            callee: { kind: 'Identifier', name: 'fn', start: 0, end: 0 },
            args: [{ kind: 'Identifier', name: 'arg', start: 0, end: 0 }],
            start: 0,
            end: 0,
        };
        expect(fn(callWithArg)).toBe(callWithArg.args[0]);

        const assignNode: AssignmentExpression = { kind: 'AssignmentExpression', operator: '=', left: { kind: 'Identifier', name: 'x', start: 0, end: 0 }, right: { kind: 'Identifier', name: 'y', start: 0, end: 0 }, start: 0, end: 0 };
        expect(fn(assignNode)).toBe(assignNode.right);

        const evalPoint: ASTNode = { kind: 'EvalPointCall', intrinsic: '__Running', callee: { kind: 'Identifier', name: '__Running', start: 0, end: 0 }, args: [], start: 0, end: 0 } as unknown as ASTNode;
        expect(fn(evalPoint)).toBe((evalPoint as CallExpression).callee);

        const evalPointWithArg: ASTNode = {
            kind: 'EvalPointCall',
            intrinsic: '__Running',
            callee: { kind: 'Identifier', name: '__Running', start: 0, end: 0 },
            args: [{ kind: 'Identifier', name: 'arg', start: 0, end: 0 }],
            start: 0,
            end: 0,
        } as unknown as ASTNode;
        expect(fn(evalPointWithArg)).toBe((evalPointWithArg as CallExpression).args[0]);

        const printfAst: ASTNode = {
            kind: 'PrintfExpression',
            segments: [{ kind: 'TextSegment', text: 'only text', start: 0, end: 0 }],
            resultType: 'string',
            start: 0,
            end: 0,
        } as ASTNode;
        expect(fn(printfAst)).toBeUndefined();

        const capture = asAny.captureContainerForReference as (n: ASTNode, ctx: EvalContext) => Promise<RefContainer | undefined>;
        const ctx = makeCtx(new StubHost());
        expect(capture({ kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 } as ASTNode, ctx)).resolves.toBeUndefined();
    });

    it('covers asNumber fallbacks', () => {
        const asNumber = asAny.asNumber as (v: unknown) => number;
        expect(asNumber('not-a-number')).toBe(0);
        expect(asNumber('')).toBe(0);
        expect(asNumber(false)).toBe(0);
        expect(asNumber(1n)).toBe(1);
        expect(asNumber(true)).toBe(1);
    });

    it('covers integerDiv/mod zero and unsigned/bigint paths', () => {
        const integerDiv = asAny.integerDiv as (a: number | bigint, b: number | bigint, unsigned: boolean) => number | bigint;
        const integerMod = asAny.integerMod as (a: number | bigint, b: number | bigint, unsigned: boolean) => number | bigint;
        expect(() => integerDiv(1n, 0n, false)).toThrow('Division by zero');
        expect(() => integerDiv(1, 0, true)).toThrow('Division by zero');
        expect(() => integerDiv(1, 0, false)).toThrow('Division by zero');
        expect(() => integerMod(1n, 0n, false)).toThrow('Division by zero');
        expect(() => integerMod(1, 0, true)).toThrow('Division by zero');
        expect(() => integerMod(1, 0, false)).toThrow('Division by zero');
        // NaN bypasses the first guard but is coerced to 0 inside the signed path
        expect(() => integerDiv(1, Number.NaN, false)).toThrow('Division by zero');
        expect(() => integerMod(1, Number.NaN, false)).toThrow('Division by zero');
        expect(integerDiv(8n, 2n, false)).toBe(4n);
        expect(integerMod(9n, 2n, false)).toBe(1n);
        expect(integerDiv(8, 2, true)).toBe(4);
        expect(integerMod(9, 2, true)).toBe(1);
        // Signed numeric path (non-unsigned) to exercise the signed guard blocks
        expect(integerDiv(6, 3, false)).toBe(2);
        expect(integerMod(7, 3, false)).toBe(1);
        // malformed inputs to hit deeper zero checks
        expect(() => integerDiv(1n, '0' as unknown as number, false)).toThrow('Division by zero');
        expect(() => integerDiv(1, '0' as unknown as number, true)).toThrow('Division by zero');
        expect(() => integerMod(1n, '0' as unknown as number, false)).toThrow('Division by zero');
        expect(() => integerMod(1, '0' as unknown as number, true)).toThrow('Division by zero');
    });

    it('covers evalArgsForIntrinsic error path', async () => {
        const evalArgsForIntrinsic = asAny.evalArgsForIntrinsic as (name: string, args: ASTNode[], ctx: EvalContext) => Promise<EvalValue[]>;
        const ctx = makeCtx(new StubHost());
        await expect(evalArgsForIntrinsic('__FindSymbol', [{ kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 } as ASTNode], ctx))
            .rejects.toThrow('expects an identifier or string literal');
    });

    it('covers getScalarTypeForContainer missing getValueType', async () => {
        const getScalar = asAny.getScalarTypeForContainer as (ctx: EvalContext, c: RefContainer) => Promise<ScalarType | undefined>;
        const ctx = makeCtx({} as ModelHost);
        ctx.container.valueType = undefined;
        await expect(getScalar(ctx, ctx.container)).resolves.toBeUndefined();
    });

    it('covers comparison helpers string/boolean/bigint paths', () => {
        const eq = asAny.eqVals as (a: EvalValue, b: EvalValue) => boolean;
        const lt = asAny.ltVals as (a: EvalValue, b: EvalValue) => boolean;
        const lte = asAny.lteVals as (a: EvalValue, b: EvalValue) => boolean;
        const gt = asAny.gtVals as (a: EvalValue, b: EvalValue) => boolean;
        const gte = asAny.gteVals as (a: EvalValue, b: EvalValue) => boolean;

        expect(eq('1', 1)).toBe(true);
        expect(lt(1n, 2n)).toBe(true);
        expect(lte(2n, 2n)).toBe(true);
        expect(gt(3n, 2n)).toBe(true);
        expect(gte(2n, 2n)).toBe(true);
        expect(eq('a', 'b')).toBe(false);
    });

    it('covers mustRef invalid targets and missing members', async () => {
        const mustRef = asAny.mustRef as (node: ASTNode, ctx: EvalContext, forWrite: boolean) => Promise<unknown>;
        const ctx = makeCtx(new StubHost());
        await expect(mustRef({ kind: 'EvalPointCall' } as ASTNode, ctx, false)).rejects.toThrow('Invalid reference target.');

        const memberCtx = makeCtx(new StubHost(undefined));
        const ma: ASTNode = { kind: 'MemberAccess', object: { kind: 'Identifier', name: 'root', start: 0, end: 0 }, property: 'missing', start: 0, end: 0 } as ASTNode;
        await expect(mustRef(ma, memberCtx, false)).rejects.toThrow('Missing member \'missing\'');

        const arrCtx = makeCtx(new StubHost(undefined));
        const arrMember: ASTNode = {
            kind: 'MemberAccess',
            object: { kind: 'ArrayIndex', array: { kind: 'Identifier', name: 'arr', start: 0, end: 0 }, index: { kind: 'NumberLiteral', value: 0, raw: '0', valueType: 'number', constValue: 0, start: 0, end: 1 }, start: 0, end: 0 } as ASTNode,
            property: 'missing',
            start: 0,
            end: 0,
        };
        await expect(mustRef(arrMember, arrCtx, false)).rejects.toThrow('Missing member \'missing\'');

        const defaultCtx = makeCtx(new StubHost());
        await expect(mustRef({ kind: 'Unknown', start: 0, end: 0 } as unknown as ASTNode, defaultCtx, false)).rejects.toThrow('Invalid reference target.');
    });

    it('covers colon path unresolved error', async () => {
        const ctx = makeCtx(new StubHost());
        const colon: ColonPath = { kind: 'ColonPath', parts: ['a', 'b'], start: 0, end: 0 };
        await expect(evaluator.evalNode(colon as ASTNode, ctx)).rejects.toThrow('Unresolved colon path: a:b');
    });

    it('covers unsupported operators and unknown node kinds', async () => {
        const ctx = makeCtx(new StubHost());
        const badUnary = { kind: 'UnaryExpression', operator: '?' as unknown as UnaryExpression['operator'], argument: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 }, start: 0, end: 0 } as unknown as UnaryExpression;
        await expect(evaluator.evalNode(badUnary, ctx)).rejects.toThrow('Unsupported unary operator ?');

        const badAssign = {
            kind: 'AssignmentExpression',
            operator: '?=' as unknown as AssignmentExpression['operator'],
            left: { kind: 'Identifier', name: 'x', start: 0, end: 0 },
            right: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 },
            start: 0,
            end: 0,
        } as unknown as AssignmentExpression;
        await expect(evaluator.evalNode(badAssign, ctx)).rejects.toThrow('Unsupported assignment operator ?=');

        await expect(evaluator.evalNode({ kind: 'Unknown', start: 0, end: 0 } as unknown as ASTNode, ctx)).rejects.toThrow('Unhandled node kind: Unknown');
    });

    it('covers formatValue bigint/NaN paths', async () => {
        const formatValue = asAny.formatValue as (spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext) => Promise<string>;
        const ctx = makeCtx(new StubHost());
        await expect(formatValue('d', 2n, ctx)).resolves.toBe('2');
        await expect(formatValue('u', -2n, ctx)).resolves.toBe('2');
        await expect(formatValue('x', 0xffn, ctx)).resolves.toBe('0xff');
        await expect(formatValue('x', Number.POSITIVE_INFINITY, ctx)).resolves.toBe('NaN');
        await expect(formatValue('?', 123, ctx)).resolves.toBe('123');
        await expect(formatValue('C', true, ctx)).resolves.toBe('true');
    });

    it('covers mustRead undefined value', async () => {
        class UndefinedReadHost extends StubHost {
            async readValue(): Promise<EvalValue> { return undefined; }
        }
        const ctx = makeCtx(new UndefinedReadHost());
        await expect(evaluator.evalNode({ kind: 'Identifier', name: 'x', start: 0, end: 0 }, ctx)).rejects.toThrow('Undefined value');
    });

    it('covers unary bigint and bitwise paths plus >>> error', async () => {
        const base = new BareNode();
        const ctx = new EvalContext({ data: new StubHost() as never, container: base });
        await expect(evaluator.evalNode({ kind: 'UnaryExpression', operator: '+', argument: { kind: 'NumberLiteral', value: 1n, raw: '1n', valueType: 'number', constValue: 1n, start: 0, end: 0 }, start: 0, end: 0 } as unknown as ASTNode, ctx)).resolves.toBe(1n);
        await expect(evaluator.evalNode({ kind: 'UnaryExpression', operator: '-', argument: { kind: 'NumberLiteral', value: 2n, raw: '2n', valueType: 'number', constValue: 2n, start: 0, end: 0 }, start: 0, end: 0 } as unknown as ASTNode, ctx)).resolves.toBe(-2n);
        await expect(evaluator.evalNode({ kind: 'UnaryExpression', operator: '~', argument: { kind: 'NumberLiteral', value: 1n, raw: '1n', valueType: 'number', constValue: 1n, start: 0, end: 0 }, start: 0, end: 0 } as unknown as ASTNode, ctx)).resolves.toBe(~1n);
        await expect(evaluator.evalNode({ kind: 'UnaryExpression', operator: '~', argument: { kind: 'NumberLiteral', value: 3, raw: '3', valueType: 'number', constValue: 3, start: 0, end: 0 }, start: 0, end: 0 } as ASTNode, ctx)).resolves.toBe(((~(3 | 0)) >>> 0));
        const evalBinary = asAny.evalBinary as (n: BinaryExpression, ctx: EvalContext) => Promise<EvalValue>;
        await expect(evalBinary({ kind: 'BinaryExpression', operator: '>>>', left: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 0 }, right: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 0 }, start: 0, end: 0 } as BinaryExpression, ctx)).rejects.toThrow('Unsupported operator >>>');
    });

    it('covers call-expression intrinsic and EvalPointCall missing intrinsic', async () => {
        class IntrinsicHost extends StubHost {
            async __GetRegVal(): Promise<number> { return 7; }
        }
        const host = new IntrinsicHost();
        const ctx = makeCtx(host);
        const callExpr: CallExpression = {
            kind: 'CallExpression',
            callee: { kind: 'Identifier', name: '__GetRegVal', start: 0, end: 0 },
            args: [{ kind: 'StringLiteral', value: 'r0', raw: '"r0"', valueType: 'string', constValue: 'r0', start: 0, end: 0 }],
            start: 0,
            end: 0,
        };
        await expect(evaluator.evalNode(callExpr, ctx)).resolves.toBe(7);

        const missingEval: ASTNode = { kind: 'EvalPointCall', intrinsic: 'missing', callee: { kind: 'Identifier', name: 'missing', start: 0, end: 0 }, args: [], start: 0, end: 0 } as unknown as ASTNode;
        await expect(evaluator.evalNode(missingEval, ctx)).rejects.toThrow('Missing intrinsic missing');
    });

    it('covers TextSegment and unsupported binary operator throw', async () => {
        const base = new BareNode();
        const ctx = new EvalContext({ data: new StubHost() as never, container: base });
        const textSeg: ASTNode = { kind: 'TextSegment', text: 'hi', start: 0, end: 0 } as ASTNode;
        await expect(evaluator.evalNode(textSeg, ctx)).resolves.toBe('hi');

        const evalBinary = asAny.evalBinary as (n: BinaryExpression, ctx: EvalContext) => Promise<EvalValue>;
        const badBin: BinaryExpression = { kind: 'BinaryExpression', operator: '**', left: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 0 }, right: { kind: 'NumberLiteral', value: 2, raw: '2', valueType: 'number', constValue: 2, start: 0, end: 0 }, start: 0, end: 0 };
        await expect(evalBinary(badBin, ctx)).rejects.toThrow('Unsupported binary operator **');

        const plusString: BinaryExpression = {
            kind: 'BinaryExpression',
            operator: '+',
            left: { kind: 'StringLiteral', value: 'a', raw: '"a"', valueType: 'string', constValue: 'a', start: 0, end: 0 },
            right: { kind: 'StringLiteral', value: 'b', raw: '"b"', valueType: 'string', constValue: 'b', start: 0, end: 0 },
            start: 0,
            end: 0,
        };
        await expect(evalBinary(plusString, ctx)).resolves.toBe('ab');
    });

    it('covers normalizeEvaluateResult for null/boolean', () => {
        const normalize = asAny.normalizeEvaluateResult as (v: EvalValue) => EvalValue | undefined;
        expect(normalize(null as unknown as EvalValue)).toBeUndefined();
        expect(normalize(true)).toBe(1);
    });
});
