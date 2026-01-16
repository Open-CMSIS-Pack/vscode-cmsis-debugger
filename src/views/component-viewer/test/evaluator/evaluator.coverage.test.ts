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
 * Coverage for evaluator helpers using real parser ASTs and a minimal DataHost.
 */
// generated with AI

import { parseExpression, type FormatSegment, type ASTNode, type EvalPointCall, type CallExpression, type AssignmentExpression, type ConditionalExpression, type BinaryExpression, type UpdateExpression, type UnaryExpression, type ArrayIndex, type MemberAccess, type Identifier, type PrintfExpression, type TextSegment } from '../../parser';
import { evaluateParseResult, EvalContext, evalNode } from '../../evaluator';
import type { RefContainer, EvalValue, ScalarType } from '../../model-host';
import type { FullDataHost } from '../helpers/full-data-host';
import { ScvdNode } from '../../model/scvd-node';

class FakeNode extends ScvdNode {
    constructor(public readonly id: string, parent?: ScvdNode, public value: EvalValue = undefined, private members: Record<string, ScvdNode> = {}) {
        super(parent);
    }
    public async setValue(v: number | string): Promise<number | string | undefined> {
        this.value = v;
        return v;
    }
    public async getValue(): Promise<string | number | bigint | Uint8Array<ArrayBufferLike> | undefined> {
        return this.value as unknown as string | number | bigint | Uint8Array<ArrayBufferLike> | undefined;
    }
    public getSymbol(name: string): ScvdNode | undefined {
        return this.members[name];
    }
}

class Host implements FullDataHost {
    constructor(private values: Map<string, FakeNode>) {}
    private setCurrent(container: RefContainer, node: FakeNode): FakeNode {
        container.current = node;
        return node;
    }
    async resolveColonPath(): Promise<EvalValue> {
        return undefined;
    }
    async getSymbolRef(container: RefContainer, name: string): Promise<FakeNode | undefined> {
        if (!this.values.has(name)) {
            return undefined;
        }
        const n = this.values.get(name);
        return n ? this.setCurrent(container, n) : undefined;
    }
    async getMemberRef(container: RefContainer, property: string): Promise<FakeNode | undefined> {
        const cur = container.current as FakeNode | undefined;
        const m = cur?.getSymbol(property) as FakeNode | undefined;
        if (m) {
            return this.setCurrent(container, m);
        }
        return undefined;
    }
    async readValue(container: RefContainer): Promise<EvalValue> {
        return (container.current as FakeNode | undefined)?.value;
    }
    async writeValue(container: RefContainer, value: EvalValue): Promise<EvalValue> {
        const node = container.current as FakeNode | undefined;
        if (typeof value === 'number' || typeof value === 'string') {
            await node?.setValue(value);
        }
        return value;
    }
    async getByteWidth(ref?: ScvdNode): Promise<number | undefined> {
        const cur = ref as FakeNode | undefined;
        const val = cur?.['value'] as EvalValue;
        return typeof val === 'bigint' ? 8 : 1;
    }
    async getElementStride(_ref: ScvdNode): Promise<number> {
        return 1;
    }
    async getMemberOffset(_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> {
        return undefined;
    }
    async getElementRef(ref: ScvdNode): Promise<ScvdNode | undefined> {
        const node = this.values.get((ref as FakeNode).id + '[0]');
        return node ?? this.values.get((ref as FakeNode).id);
    }
    async __GetRegVal(): Promise<number | bigint | undefined> {
        return undefined;
    }
    async __FindSymbol(): Promise<number | undefined> {
        return undefined;
    }
    async __CalcMemUsed(): Promise<number | undefined> {
        return undefined;
    }
    async __size_of(): Promise<number | undefined> {
        return undefined;
    }
    async __Symbol_exists(): Promise<number | undefined> {
        return undefined;
    }
    async __Offset_of(): Promise<number | undefined> {
        return undefined;
    }
    async __Running(): Promise<number | undefined> {
        return undefined;
    }
    async _count(): Promise<number | undefined> {
        return undefined;
    }
    async _addr(): Promise<number | undefined> {
        return undefined;
    }
    async formatPrintf(): Promise<string | undefined> {
        return undefined;
    }
    async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
        const cur = container.current as FakeNode | undefined;
        const val = cur?.['value'] as EvalValue;
        if (typeof val === 'bigint') {
            return { kind: 'uint', bits: 64 };
        }
        if (typeof val === 'number') {
            return { kind: 'int', bits: 32 };
        }
        return undefined;
    }
}

function evalExpr(expr: string, host: Host, base: ScvdNode): Promise<EvalValue> {
    const pr = parseExpression(expr, false);
    const ctx = new EvalContext({ data: host, container: base });
    return evaluateParseResult(pr, ctx);
}

describe('evaluator coverage', () => {
    it('handles arithmetic, bitwise, shifts, and comparisons', async () => {
        const base = new FakeNode('base');
        const values = new Map<string, FakeNode>([
            ['a', new FakeNode('a', base, 5)],
            ['b', new FakeNode('b', base, 2)],
            ['big', new FakeNode('big', base, 2n)],
            ['big2', new FakeNode('big2', base, 3n)],
        ]);
        const host = new Host(values);

        await expect(evalExpr('a + b - 1', host, base)).resolves.toBe(6);
        await expect(evalExpr('a * b', host, base)).resolves.toBe(10);
        await expect(evalExpr('a / b', host, base)).resolves.toBe(2);
        await expect(evalExpr('a % b', host, base)).resolves.toBe(1);
        await expect(evalExpr('a & b', host, base)).resolves.toBe(0);
        await expect(evalExpr('a ^ b', host, base)).resolves.toBe(7);
        await expect(evalExpr('a | b', host, base)).resolves.toBe(7);
        await expect(evalExpr('a << b', host, base)).resolves.toBe(20);
        await expect(evalExpr('a >> b', host, base)).resolves.toBe(1);
        await expect(evalExpr('a == b', host, base)).resolves.toBe(0);
        await expect(evalExpr('a != b', host, base)).resolves.toBe(1);
        await expect(evalExpr('a < b', host, base)).resolves.toBe(0);
        await expect(evalExpr('a <= b', host, base)).resolves.toBe(0);
        await expect(evalExpr('a > b', host, base)).resolves.toBe(1);
        await expect(evalExpr('a >= b', host, base)).resolves.toBe(1);

        const pr = parseExpression('big + big2', false);
        const ctx = new EvalContext({ data: host, container: base });
        await expect(evalNode(pr.ast, ctx)).resolves.toBe(5n);
        await expect(evaluateParseResult(pr, ctx)).resolves.toBeUndefined();
    });

    it('covers assignment, update, conditionals, and logical ops', async () => {
        const base = new FakeNode('base');
        const x = new FakeNode('x', base, 1);
        const y = new FakeNode('y', base, 0);
        const values = new Map<string, FakeNode>([['x', x], ['y', y]]);
        const host = new Host(values);

        await expect(evalExpr('x = 3', host, base)).resolves.toBe(3);
        expect(x['value']).toBe(3);
        await expect(evalExpr('++x', host, base)).resolves.toBe(4);
        await expect(evalExpr('--x', host, base)).resolves.toBe(3);
        await expect(evalExpr('x ? 5 : 6', host, base)).resolves.toBe(5);
        await expect(evalExpr('x && y', host, base)).resolves.toBe(0);
        await expect(evalExpr('x || y', host, base)).resolves.toBe(3);
    });

    it('handles member access, array indexing, and error paths', async () => {
        const base = new FakeNode('base');
        const obj = new FakeNode('obj', base, undefined, {
            m: new FakeNode('m', base, 9),
        });
        const arrElem = new FakeNode('arr[0]', base, 7);
        const arr = new FakeNode('arr', base, undefined, { '0': arrElem });
        const values = new Map<string, FakeNode>([['obj', obj], ['arr', arr], ['arr[0]', arrElem]]);
        const host = new Host(values);

        await expect(evalExpr('obj.m', host, base)).resolves.toBe(9);
        await expect(evalExpr('arr[0]', host, base)).resolves.toBe(7);

        // Unknown symbol triggers error and normalizeEvaluateResult returns undefined
        const pr = parseExpression('missing', false);
        const ctx = new EvalContext({ data: host, container: base });
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(evaluateParseResult(pr, ctx)).resolves.toBeUndefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('applies member offsets when provided by host', async () => {
        class OffsetHost extends Host {
            async getMemberOffset(): Promise<number | undefined> {
                return 8;
            }
        }

        const base = new FakeNode('base');
        const child = new FakeNode('child', base, 1);
        const obj = new FakeNode('obj', base, undefined, { child });
        const values = new Map<string, FakeNode>([['obj', obj], ['child', child]]);
        const host = new OffsetHost(values);
        const ctx = new EvalContext({ data: host, container: base });

        await expect(evalNode(parseExpression('obj.child', false).ast, ctx)).resolves.toBe(child['value']);
        expect(ctx.container.offsetBytes).toBe(8);
    });

    it('evaluates a complex conditional expression', async () => {
        const base = new FakeNode('base');
        const count = new FakeNode('Count', base, 2);
        const values = new Map<string, FakeNode>([['Count', count]]);
        const host = new Host(values);
        const expr = '0==( (Count==0) || (Count==1) || (Count==8) || (Count==9) || (Count==10) )';
        await expect(evalExpr(expr, host, base)).resolves.toBe(1);
    });

    it('covers intrinsics, pseudo members, and string/unary paths', async () => {
        const base = new FakeNode('base');
        const arrElem = new FakeNode('arr[0]', base, 1);
        const arr = new FakeNode('arr', base, undefined, { '0': arrElem });
        const str = new FakeNode('str', base, 0);
        const values = new Map<string, FakeNode>([['arr', arr], ['arr[0]', arrElem], ['str', str]]);
        const host = new Host(values);
        host._count = async () => 2;
        host._addr = async () => 0x1000;
        host.__Running = async () => 1;

        await expect(evalExpr('__Running', host, base)).resolves.toBe(1);
        await expect(evalExpr('arr._count', host, base)).resolves.toBe(2);
        await expect(evalExpr('arr._addr', host, base)).resolves.toBe(0x1000);
        await expect(evalExpr('"x" + 5', host, base)).resolves.toBe('x5');
        await expect(evalExpr('~1', host, base)).resolves.toBe(4294967294);
        await expect(evalExpr('!0', host, base)).resolves.toBe(1);
    });
});

class BranchNode extends ScvdNode {
    private readonly members: Map<string, BranchNode>;
    public value: EvalValue;
    constructor(name: string, parent?: ScvdNode, value: EvalValue = 0, members: Record<string, BranchNode> = {}) {
        super(parent);
        this.name = name;
        this.value = value;
        this.members = new Map(Object.entries(members));
    }
    public async setValue(v: string | number): Promise<string | number | undefined> {
        this.value = v;
        return v;
    }
    public async getValue(): Promise<string | number | bigint | Uint8Array | undefined> {
        const v = this.value;
        if (typeof v === 'boolean') {
            return v ? 1 : 0;
        }
        if (typeof v === 'function') {
            return undefined;
        }
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' || v instanceof Uint8Array) {
            return v;
        }
        return undefined;
    }
    public getMember(property: string): BranchNode | undefined { return this.members.get(property); }
    public setMember(property: string, node: BranchNode) { this.members.set(property, node); }
}

class BranchHost implements FullDataHost {
    constructor(private readonly values: Map<string, BranchNode>) {}
    async resolveColonPath(): Promise<EvalValue> {
        return undefined;
    }

    async getSymbolRef(container: RefContainer, name: string, _forWrite?: boolean): Promise<ScvdNode | undefined> {
        const n = this.values.get(name);
        container.current = n;
        container.anchor = n;
        return n;
    }
    async getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): Promise<ScvdNode | undefined> {
        const cur = container.current as BranchNode | undefined;
        const member = cur?.getMember(property);
        if (member) {
            container.current = member;
        }
        return member;
    }
    async readValue(container: RefContainer): Promise<EvalValue> {
        const cur = container.current as BranchNode | undefined;
        const v = await cur?.getValue();
        container.current = undefined; // force evaluateFormatSegmentValue to recover via findReferenceNode
        return v;
    }
    async writeValue(container: RefContainer, value: EvalValue): Promise<EvalValue> {
        if (typeof value === 'number' || typeof value === 'string') {
            await (container.current as BranchNode | undefined)?.setValue(value);
        }
        return value;
    }
    async getElementStride(_ref: ScvdNode): Promise<number> {
        return 1;
    }
    async getMemberOffset(_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> {
        return undefined;
    }
    async getElementRef(ref: ScvdNode): Promise<ScvdNode | undefined> {
        return ref.getElementRef();
    }
    async __GetRegVal(): Promise<number | bigint | undefined> {
        return undefined;
    }
    async __FindSymbol(): Promise<number | undefined> {
        return undefined;
    }
    async __CalcMemUsed(): Promise<number | undefined> {
        return undefined;
    }
    async __size_of(): Promise<number | undefined> {
        return undefined;
    }
    async __Symbol_exists(): Promise<number | undefined> {
        return undefined;
    }
    async __Offset_of(): Promise<number | undefined> {
        return undefined;
    }
    async __Running(): Promise<number | undefined> {
        return undefined;
    }
    async _count(): Promise<number | undefined> {
        return undefined;
    }
    async _addr(): Promise<number | undefined> {
        return undefined;
    }
    async formatPrintf(): Promise<string | undefined> {
        return undefined;
    }
    async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
        const cur = container.current as BranchNode | undefined;
        if (!cur) {
            return undefined;
        }
        const name = cur.name ?? '';
        if (name.startsWith('u')) {
            return 'uint32';
        }
        if (name.startsWith('f')) {
            return 'float32';
        }
        if (name.startsWith('q')) {
            return 'uint64';
        }
        return { kind: 'int', bits: 32 };
    }
    async getByteWidth(ref: ScvdNode): Promise<number | undefined> {
        const n = ref as BranchNode;
        return typeof n.value === 'bigint' ? 8 : 4;
    }
}

function segFromAst(ast: ASTNode, spec = 'd'): FormatSegment {
    return { kind: 'FormatSegment', spec, value: ast, start: 0, end: 0 };
}

describe('evaluator edge coverage', () => {
    it('hits float/unsigned math and shift branches', async () => {
        const base = new BranchNode('base');
        const values = new Map<string, BranchNode>([
            ['f1', new BranchNode('f1', base, 5.5)],
            ['f2', new BranchNode('f2', base, 2.5)],
            ['u1', new BranchNode('u1', base, 5)],
            ['u2', new BranchNode('u2', base, 2)],
        ]);
        const host = new BranchHost(values);
        const ctx = new EvalContext({ data: host, container: base });

        expect(await evalNode(parseExpression('f1 / f2', false).ast, ctx)).toBeCloseTo(2.2);
        expect(await evalNode(parseExpression('f1 % f2', false).ast, ctx)).toBe(1);
        expect(await evalNode(parseExpression('5 >> 1', false).ast, ctx)).toBe(2);
        expect(await evalNode(parseExpression('u1 / u2', false).ast, ctx)).toBe(2); // unsigned integer path
        expect(await evalNode(parseExpression('u1 % u2', false).ast, ctx)).toBe(1);
        await expect(evaluateParseResult(parseExpression('5 / 0', false), ctx)).resolves.toBeUndefined(); // division by zero handled
    });

    it('normalizes scalar types from strings and booleans/bigints', async () => {
        const base = new BranchNode('base');
        const host = new BranchHost(new Map<string, BranchNode>([['q1', new BranchNode('q1', base, 1n)]]));
        const ctx = new EvalContext({ data: host, container: base });
        // bigint result is normalized to undefined
        await expect(evaluateParseResult(parseExpression('q1 + 1', false), ctx)).resolves.toBeUndefined();
        // boolean normalized to 1
        await expect(evaluateParseResult(parseExpression('!0', false), ctx)).resolves.toBe(1);

        const alt = new BranchNode('alt');
        await expect(evaluateParseResult(parseExpression('1+2', false), ctx, alt)).resolves.toBe(3);
    });

    it('routes intrinsics and error paths', async () => {
        const base = new BranchNode('base');
        const host = new BranchHost(new Map<string, BranchNode>([['reg', new BranchNode('reg', base, 0)]]));
        host.__Running = async () => 1;
        host.__GetRegVal = async () => 7;
        host.__FindSymbol = async () => 9;
        host.__CalcMemUsed = async () => 4;
        host.__size_of = async () => 8;
        host.__Symbol_exists = async () => 1;
        host.__Offset_of = async () => 16;
        const ctx = new EvalContext({ data: host, container: base });

        await expect(evalNode(parseExpression('__Running', false).ast, ctx)).resolves.toBe(1);
        await expect(evalNode(parseExpression('__GetRegVal("r0")', false).ast as CallExpression, ctx)).resolves.toBe(7);
        await expect(evalNode(parseExpression('__FindSymbol("x")', false).ast as CallExpression, ctx)).resolves.toBe(9);
        await expect(evalNode(parseExpression('__CalcMemUsed(1,2,3,4)', false).ast as CallExpression, ctx)).resolves.toBe(4);
        await expect(evalNode(parseExpression('__size_of("x")', false).ast as CallExpression, ctx)).resolves.toBe(8);
        await expect(evalNode(parseExpression('__Symbol_exists("x")', false).ast as CallExpression, ctx)).resolves.toBe(1);
        await expect(evalNode(parseExpression('__Offset_of("m")', false).ast as CallExpression, ctx)).resolves.toBe(16);

        const missingCtx = new EvalContext({ data: new BranchHost(new Map<string, BranchNode>()), container: base });
        await expect(evalNode({ kind: 'EvalPointCall', intrinsic: '__CalcMemUsed', callee: { kind: 'Identifier', name: '__CalcMemUsed', start: 0, end: 0 } as Identifier, args: [], start: 0, end: 0 } as EvalPointCall, missingCtx)).rejects.toThrow('Intrinsic __CalcMemUsed expects at least 4 argument(s)');
    });

    it('recovers containers via findReferenceNode across node kinds', async () => {
        const base = new BranchNode('base');
        const vals = new Map<string, BranchNode>([
            ['x', new BranchNode('x', base, 1)],
            ['y', new BranchNode('y', base, 2)],
            ['z', new BranchNode('z', base, 3)],
            ['elem', new BranchNode('elem', base, 4)],
            ['__Running', new BranchNode('__Running', base, 0)],
        ]);
        const arr = new BranchNode('arr', base, 0, { '0': vals.get('elem') as BranchNode });
        const obj = new BranchNode('obj', base, 0, { m: new BranchNode('m', base, 6) });
        vals.set('arr', arr);
        vals.set('obj', obj);
        const host = new BranchHost(vals);
        host.resolveColonPath = async () => 0;
        host.__Running = async () => 1;
        const ctx = new EvalContext({ data: host, container: base });

        const unaryAst = parseExpression('!x', false).ast as UnaryExpression;
        const updateAst = parseExpression('++y', false).ast as UpdateExpression;
        const binaryAst = parseExpression('x + y', false).ast as BinaryExpression;
        const condAst = parseExpression('x ? y : z', false).ast as ConditionalExpression;
        const assignAst = parseExpression('z = 5', false).ast as AssignmentExpression;
        const evalCall: EvalPointCall = { kind: 'EvalPointCall', intrinsic: '__Running', callee: { kind: 'Identifier', name: '__Running', start: 0, end: 0 } as Identifier, args: [], start: 0, end: 0 };
        const memberAst = parseExpression('obj.m', false).ast as MemberAccess;
        const arrayAst = parseExpression('arr[0]', false).ast as ArrayIndex;
        const printfAst: PrintfExpression = {
            kind: 'PrintfExpression',
            segments: [
                { kind: 'TextSegment', text: 'pre', start: 0, end: 0 } as TextSegment,
                segFromAst(parseExpression('x', false).ast),
            ],
            resultType: 'string',
            start: 0,
            end: 0,
        };

        const segments: FormatSegment[] = [
            segFromAst(unaryAst),
            segFromAst(updateAst),
            segFromAst(binaryAst),
            segFromAst(condAst),
            segFromAst(assignAst),
            segFromAst(evalCall),
            segFromAst(memberAst),
            segFromAst(arrayAst),
        ];

        for (const seg of segments) {
            await expect(evalNode(seg, ctx)).resolves.toBeDefined();
        }

        // PrintfExpression path with formatPrintf override
        host.formatPrintf = async () => 'fmt';
        await expect(evalNode(printfAst, ctx)).resolves.toContain('fmt');
    });

    it('resolves array member via fast path with stride and element refs', async () => {
        const base = new BranchNode('base');
        const member = new BranchNode('m', base, 42);
        const element = new BranchNode('elem', base, 0, { m: member });
        const arr = new BranchNode('arr', base, undefined, { '1': element });
        (arr as unknown as { getElementRef(): BranchNode }).getElementRef = () => element;

        const values = new Map<string, BranchNode>([
            ['arr', arr],
            ['elem', element],
            ['m', member],
        ]);
        const host = new BranchHost(values);
        host.getMemberOffset = async () => 4;
        host.getElementStride = async () => 8;
        host.getByteWidth = async () => 4;

        const ctx = new EvalContext({ data: host, container: base });
        await expect(evalNode(parseExpression('arr[1].m', false).ast, ctx)).resolves.toBe(42);
    });

    it('covers bigint comparisons and compound assignments', async () => {
        const base = new BranchNode('base');
        const makeHost = (entries: [string, BranchNode][]) => new BranchHost(new Map(entries));

        // Bigint comparisons exercise eq/lt/gte bigint paths and string equality coercion
        const bigA = new BranchNode('bigA', base, 5n);
        const bigB = new BranchNode('bigB', base, 7n);
        const compareCtx = new EvalContext({ data: makeHost([['bigA', bigA], ['bigB', bigB]]), container: base });
        await expect(evalNode(parseExpression('bigA == bigA', false).ast, compareCtx)).resolves.toBeTruthy();
        await expect(evalNode(parseExpression('bigA < bigB', false).ast, compareCtx)).resolves.toBeTruthy();
        await expect(evalNode(parseExpression('bigB >= bigA', false).ast, compareCtx)).resolves.toBeTruthy();
        await expect(evalNode(parseExpression('"1" == 1', false).ast, compareCtx)).resolves.toBeTruthy();

        // Compound assignment operators cover arithmetic/bitwise branches
        const target = new BranchNode('c', base, 8);
        const other = new BranchNode('d', base, 3);
        const ctx = new EvalContext({ data: makeHost([['c', target], ['d', other]]), container: base });
        const run = async (expr: string, expected: number) => {
            target.value = expr.startsWith('c %=')
                ? 9 // ensure a value divisible by d for %= branch
                : target.value;
            await expect(evalNode(parseExpression(expr, false).ast, ctx)).resolves.toBe(expected);
        };

        target.value = 8; await run('c += d', 11);
        target.value = 8; await run('c -= d', 5);
        target.value = 8; await run('c *= d', 24);
        target.value = 8; await run('c /= d', 2);
        target.value = 9; await run('c %= d', 0);
        target.value = 1; await run('c <<= d', 8);
        target.value = 8; await run('c >>= d', 1);
        target.value = 6; await run('c &= d', 2);
        target.value = 6; await run('c ^= d', 5);
        target.value = 6; await run('c |= d', 7);
    });

    it('normalizes scalar types that only provide a typename', async () => {
        const base = new BranchNode('base');
        let sawTypename = false;
        class TypenameHost extends BranchHost {
            async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
                const cur = container.current as BranchNode | undefined;
                if (cur?.name === 'alias') {
                    sawTypename = true;
                    return { kind: 'int', bits: 16, typename: 'alias_t' };
                }
                return super.getValueType(container);
            }
        }

        const host = new TypenameHost(new Map<string, BranchNode>([['alias', new BranchNode('alias', base, 1)]]));
        const ctx = new EvalContext({ data: host, container: base });
        await expect(evalNode(parseExpression('alias + 1', false).ast, ctx)).resolves.toBe(2);
        expect(sawTypename).toBe(true);
    });

    it('recovers references across all findReferenceNode branches', async () => {
        class ClearingHost extends Host {
            async readValue(container: RefContainer): Promise<EvalValue> {
                const v = await super.readValue(container);
                container.current = undefined; // force recovery path
                return v;
            }
        }

        const base = new FakeNode('base');
        const fn = new FakeNode('fn', base, ((n: number) => n + 1) as unknown as EvalValue);
        const val = new FakeNode('v', base, 1);
        const values = new Map<string, FakeNode>([['fn', fn], ['v', val], ['__Running', new FakeNode('__Running', base, 1)]]);
        const host = new ClearingHost(values);
        host.__Running = async () => 1;

        const ctx = new EvalContext({ data: host, container: base });

        const assignmentSeg = segFromAst(parseExpression('v = 2', false).ast);
        const callSeg = segFromAst(parseExpression('fn(3)', false).ast);
        const evalPointSeg: FormatSegment = {
            kind: 'FormatSegment',
            spec: 'd',
            value: { kind: 'EvalPointCall', intrinsic: '__Running', callee: { kind: 'Identifier', name: '__Running', start: 0, end: 0 } as Identifier, args: [], start: 0, end: 0 },
            start: 0,
            end: 0,
        };
        const printfSeg = segFromAst({
            kind: 'PrintfExpression',
            segments: [{ kind: 'TextSegment', text: 'x', start: 0, end: 0 }, segFromAst(parseExpression('v', false).ast)],
            resultType: 'string',
            start: 0,
            end: 0,
        } as PrintfExpression);
        const literalSeg = segFromAst({ kind: 'NumberLiteral', value: 9, raw: '9', valueType: 'number', constValue: 9, start: 0, end: 1 } as ASTNode);

        await expect(evalNode(assignmentSeg, ctx)).resolves.toBeDefined();
        await expect(evalNode(callSeg, ctx)).resolves.toBeDefined();
        await expect(evalNode(evalPointSeg, ctx)).resolves.toBeDefined();
        await expect(evalNode(printfSeg, ctx)).resolves.toBeDefined();
        await expect(evalNode(literalSeg, ctx)).resolves.toBeDefined();
    });

    it('handles call expressions and read/write failures', async () => {
        class FnHost extends Host {
            async writeValue(): Promise<EvalValue> {
                return undefined;
            }
        }
        class UndefinedReadHost extends Host {
            async readValue(): Promise<EvalValue> {
                return undefined;
            }
        }

        const base = new FakeNode('base');
        const fnNode = new FakeNode('fn', base, ((a: number, b: number) => a + b) as unknown as EvalValue);
        const valNode = new FakeNode('x', base, 1);

        const fnHost = new FnHost(new Map<string, FakeNode>([['fn', fnNode], ['x', valNode]]));
        const fnCtx = new EvalContext({ data: fnHost, container: base });
        await expect(evalNode(parseExpression('fn(2, 3)', false).ast, fnCtx)).resolves.toBe(5);
        await expect(evalNode(parseExpression('x(1)', false).ast, fnCtx)).rejects.toThrow('Callee is not callable.');
        await expect(evalNode(parseExpression('x = 2', false).ast, fnCtx)).rejects.toThrow('Write returned undefined');

        const readHost = new UndefinedReadHost(new Map<string, FakeNode>([['x', valNode]]));
        const readCtx = new EvalContext({ data: readHost, container: base });
        await expect(evalNode(parseExpression('x', false).ast, readCtx)).rejects.toThrow('Undefined value');
    });

    it('formats values across printf specs and NaN paths', async () => {
        const base = new BranchNode('base');
        const host = new BranchHost(new Map());
        const ctx = new EvalContext({ data: host, container: base });

        const specs: Array<{ spec: FormatSegment['spec']; ast: ASTNode; expect: string }> = [
            { spec: '%', ast: { kind: 'NumberLiteral', value: 0, raw: '0', valueType: 'number', constValue: 0, start: 0, end: 1 }, expect: '%' },
            { spec: 'd', ast: { kind: 'NumberLiteral', value: Number.POSITIVE_INFINITY, raw: 'inf', valueType: 'number', constValue: undefined, start: 0, end: 1 }, expect: 'NaN' },
            { spec: 'u', ast: { kind: 'NumberLiteral', value: Number.NaN, raw: 'NaN', valueType: 'number', constValue: undefined, start: 0, end: 1 }, expect: 'NaN' },
            { spec: 'u', ast: { kind: 'NumberLiteral', value: -5, raw: '-5', valueType: 'number', constValue: -5, start: 0, end: 2 }, expect: String(((-5) >>> 0)) },
            { spec: 'x', ast: { kind: 'NumberLiteral', value: 255, raw: '255', valueType: 'number', constValue: 255, start: 0, end: 3 }, expect: 'ff' },
            { spec: 't', ast: { kind: 'BooleanLiteral', value: false, valueType: 'boolean', start: 0, end: 1 } as ASTNode, expect: 'false' },
            { spec: 'S', ast: { kind: 'StringLiteral', value: 'hi', raw: '"hi"', valueType: 'string', constValue: 'hi', start: 0, end: 2 } as ASTNode, expect: 'hi' },
            { spec: 'C', ast: { kind: 'StringLiteral', value: 'foo', raw: '"foo"', valueType: 'string', constValue: 'foo', start: 0, end: 3 } as ASTNode, expect: 'foo' },
        ];

        for (const { spec, ast, expect: expected } of specs) {
            const seg: FormatSegment = { kind: 'FormatSegment', spec, value: ast, start: 0, end: 0 };
            await expect(evalNode(seg, ctx)).resolves.toBe(expected);
        }
    });
});
