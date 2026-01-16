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
    constructor(public readonly id: string, parent?: ScvdNode, public value: string | number | bigint | Uint8Array | undefined = undefined, private members: Record<string, ScvdNode> = {}) {
        super(parent);
    }
    public async setValue(v: string | number): Promise<string | number | undefined> {
        this.value = v;
        return v;
    }
    public async getValue(): Promise<string | number | bigint | Uint8Array | undefined> {
        return this.value;
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
});
