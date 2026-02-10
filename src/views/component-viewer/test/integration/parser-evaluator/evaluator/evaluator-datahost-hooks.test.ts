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
 * Integration test for EvaluatorDatahostHooks.
 */

import { Evaluator, EvalContext } from '../../../../parser-evaluator/evaluator';
import type { RefContainer, EvalValue } from '../../../../parser-evaluator/model-host';
import type { FullDataHost } from '../../helpers/full-data-host';
import { parseExpression } from '../../../../parser-evaluator/parser';
import { ScvdNode } from '../../../../model/scvd-node';

class BasicRef extends ScvdNode {
    constructor(parent?: ScvdNode) {
        super(parent);
    }
}

class HookHost implements FullDataHost {
    readonly root = new BasicRef();
    readonly arrRef = new BasicRef(this.root);
    readonly elemRef = new BasicRef(this.arrRef);
    readonly fieldRef = new BasicRef(this.elemRef);
    lastFormattingContainer: RefContainer | undefined;

    private readonly values = new Map<number, EvalValue>([
        [10, 99], // offsetBytes for arr[2].field
        [6, 0xab], // offsetBytes for arr[1].field in printf path
    ]);
    private readonly disablePrintfOverride: boolean;

    constructor(opts?: { disablePrintfOverride?: boolean }) {
        this.disablePrintfOverride = opts?.disablePrintfOverride ?? false;
    }

    public getSymbolRef = jest.fn(async (_container: RefContainer, name: string): Promise<BasicRef | undefined> => {
        if (name === 'arr') {
            return this.arrRef;
        }
        return undefined;
    });

    public getMemberRef = jest.fn(async (_container: RefContainer, property: string): Promise<BasicRef | undefined> => {
        if (property === 'field') {
            return this.fieldRef;
        }
        // allow colon-path anchor to succeed
        if (property === 'dummy') {
            return this.fieldRef;
        }
        return undefined;
    });

    public getElementStride = jest.fn(async (_ref: ScvdNode): Promise<number> => 4);

    public getMemberOffset = jest.fn(async (_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> => 2);

    public getElementRef = jest.fn(async (): Promise<BasicRef | undefined> => this.elemRef);

    public getByteWidth = jest.fn(async (): Promise<number | undefined> => 4);

    public setValueAt(offset: number, value: EvalValue): void {
        this.values.set(offset, value);
    }

    public resolveColonPath = jest.fn(async (_container: RefContainer, parts: string[]): Promise<EvalValue> => {
        return parts.length * 100; // simple sentinel
    });

    public readValue = jest.fn(async (container: RefContainer): Promise<EvalValue | undefined> => {
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    });

    public writeValue = jest.fn(async (_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> => value);

    public _count = jest.fn(async (): Promise<number | undefined> => undefined);

    public _addr = jest.fn(async (): Promise<number | undefined> => undefined);

    public formatPrintf = jest.fn(async (spec: string, value: EvalValue, container: RefContainer): Promise<string | undefined> => {
        this.lastFormattingContainer = container;
        if (this.disablePrintfOverride) {
            if (value instanceof Uint8Array && spec === 'M') {
                return Array.from(value.subarray(0, 6))
                    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                    .join('-');
            }
            return undefined;
        }
        return `fmt-${spec}-${value}`;
    });

    public getValueType = jest.fn(async (): Promise<string | undefined> => undefined);

    public __GetRegVal = jest.fn(async (): Promise<number | bigint | undefined> => undefined);

    public __FindSymbol = jest.fn(async (): Promise<number | undefined> => undefined);

    public __CalcMemUsed = jest.fn(async (): Promise<number | undefined> => undefined);

    public __size_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Symbol_exists = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Offset_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Running = jest.fn(async (): Promise<number | undefined> => undefined);
}

const evaluator = new Evaluator();

class NestedArrayHost implements FullDataHost {
    readonly root = new BasicRef();
    readonly objArrayRef = new BasicRef(this.root);
    readonly objElementRef = new BasicRef(this.objArrayRef);
    readonly memberArrayRef = new BasicRef(this.objElementRef);
    readonly varArrayRef = new BasicRef(this.objElementRef);
    readonly memberElementRef = new BasicRef(this.memberArrayRef);
    readonly varElementRef = new BasicRef(this.varArrayRef);

    private readonly values = new Map<number, EvalValue>([
        [28, 111], // obj[1].member[2] => 1*16 + 8 + 2*2
        [36, 222], // obj[1].var[2] => 1*16 + 12 + 2*4
    ]);

    public getSymbolRef = jest.fn(async (_container: RefContainer, name: string): Promise<BasicRef | undefined> => {
        if (name === 'obj') {
            return this.objArrayRef;
        }
        return undefined;
    });

    public getMemberRef = jest.fn(async (container: RefContainer, property: string): Promise<BasicRef | undefined> => {
        if (container.current === this.objElementRef) {
            if (property === 'member') {
                return this.memberArrayRef;
            }
            if (property === 'var') {
                return this.varArrayRef;
            }
        }
        return undefined;
    });

    public getElementStride = jest.fn(async (ref: ScvdNode): Promise<number> => {
        if (ref === this.objArrayRef) {
            return 16;
        }
        if (ref === this.memberArrayRef) {
            return 2;
        }
        if (ref === this.varArrayRef) {
            return 4;
        }
        return 1;
    });

    public getMemberOffset = jest.fn(async (_base: ScvdNode, member: ScvdNode): Promise<number | undefined> => {
        if (member === this.memberArrayRef) {
            return 8;
        }
        if (member === this.varArrayRef) {
            return 12;
        }
        return 0;
    });

    public getElementRef = jest.fn(async (ref: ScvdNode): Promise<BasicRef | undefined> => {
        if (ref === this.objArrayRef) {
            return this.objElementRef;
        }
        if (ref === this.memberArrayRef) {
            return this.memberElementRef;
        }
        if (ref === this.varArrayRef) {
            return this.varElementRef;
        }
        return undefined;
    });

    public getByteWidth = jest.fn(async (): Promise<number | undefined> => 4);

    public resolveColonPath = jest.fn(async (): Promise<EvalValue> => undefined);

    public readValue = jest.fn(async (container: RefContainer): Promise<EvalValue | undefined> => {
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    });

    public writeValue = jest.fn(async (_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> => value);

    public _count = jest.fn(async (): Promise<number | undefined> => undefined);

    public _addr = jest.fn(async (): Promise<number | undefined> => undefined);

    public formatPrintf = jest.fn(async (): Promise<string | undefined> => undefined);

    public getValueType = jest.fn(async (): Promise<string | undefined> => undefined);

    public __GetRegVal = jest.fn(async (): Promise<number | bigint | undefined> => undefined);

    public __FindSymbol = jest.fn(async (): Promise<number | undefined> => undefined);

    public __CalcMemUsed = jest.fn(async (): Promise<number | undefined> => undefined);

    public __size_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Symbol_exists = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Offset_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Running = jest.fn(async (): Promise<number | undefined> => undefined);
}

describe('evaluator data host hooks', () => {
    it('uses stride/offset/element helpers for array member reads', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('arr[2].field', false);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe(99);
        expect(host.getElementStride).toHaveBeenCalledTimes(1);
        expect(host.getElementRef).toHaveBeenCalledTimes(1);
        expect(host.getMemberOffset).toHaveBeenCalledTimes(1);
        expect(host.getByteWidth).toHaveBeenCalled();
    });

    it('calls resolveColonPath for colon expressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('foo:bar:baz', false);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe(300); // 3 parts * 100
        expect(host.resolveColonPath).toHaveBeenCalledTimes(1);
    });

    it('honors printf formatting override', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field]', true);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe('val=fmt-x-171');
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
    });

    it('recovers reference containers for printf subexpressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field + 1]', true);

        await evaluator.evaluateParseResult(pr, ctx);
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('does not recover containers for constant-only branches', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[false ? arr[1].field : 5]', true);

        await evaluator.evaluateParseResult(pr, ctx);
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBeUndefined();
    });

    it('passes cached Uint8Array values to printf', async () => {
        const host = new HookHost({ disablePrintfOverride: true });
        // Override the value at offset 6 (arr[1].field) with a 6-byte MAC
        host.setValueAt(6, new Uint8Array([0x1e, 0x30, 0x6c, 0xa2, 0x45, 0x5f]));
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('mac=%M[arr[1].field]', true);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe('mac=1E-30-6C-A2-45-5F');
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('computes nested array offsets for member and var arrays', async () => {
        const host = new NestedArrayHost();
        const ctx = new EvalContext({ data: host, container: host.root });

        const memberExpr = parseExpression('obj[1].member[2]', false);
        const memberOut = await evaluator.evaluateParseResult(memberExpr, ctx);
        expect(memberOut).toBe(111);

        const varExpr = parseExpression('obj[1].var[2]', false);
        const varOut = await evaluator.evaluateParseResult(varExpr, ctx);
        expect(varOut).toBe(222);
    });
});
