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

import { EvalContext, evaluateParseResult } from '../../../../parser-evaluator/evaluator';
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

    calls: Record<string, number> = {};

    constructor(opts?: { disablePrintfOverride?: boolean }) {
        this.disablePrintfOverride = opts?.disablePrintfOverride ?? false;
    }

    private tick(name: string) {
        // eslint-disable-next-line security/detect-object-injection -- false positive: controlled key accumulation for test bookkeeping
        this.calls[name] = (this.calls[name] ?? 0) + 1;
    }

    public async getSymbolRef(_container: RefContainer, name: string): Promise<BasicRef | undefined> {
        this.tick('getSymbolRef');
        if (name === 'arr') {
            return this.arrRef;
        }
        return undefined;
    }

    public async getMemberRef(_container: RefContainer, property: string): Promise<BasicRef | undefined> {
        this.tick('getMemberRef');
        if (property === 'field') {
            return this.fieldRef;
        }
        // allow colon-path anchor to succeed
        if (property === 'dummy') {
            return this.fieldRef;
        }
        return undefined;
    }

    public async getElementStride(_ref: ScvdNode): Promise<number> {
        this.tick('getElementStride');
        return 4;
    }

    public async getMemberOffset(_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> {
        this.tick('getMemberOffset');
        return 2;
    }

    public async getElementRef(): Promise<BasicRef | undefined> {
        this.tick('getElementRef');
        return this.elemRef;
    }

    public async getByteWidth(): Promise<number | undefined> {
        this.tick('getByteWidth');
        return 4;
    }

    public setValueAt(offset: number, value: EvalValue): void {
        this.values.set(offset, value);
    }

    public async resolveColonPath(_container: RefContainer, parts: string[]): Promise<EvalValue> {
        this.tick('resolveColonPath');
        return parts.length * 100; // simple sentinel
    }

    public async readValue(container: RefContainer): Promise<EvalValue | undefined> {
        this.tick('readValue');
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    }

    public async writeValue(_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> {
        this.tick('writeValue');
        return value;
    }

    public async _count(): Promise<number | undefined> {
        this.tick('_count');
        return undefined;
    }

    public async _addr(): Promise<number | undefined> {
        this.tick('_addr');
        return undefined;
    }

    public async formatPrintf(spec: string, value: EvalValue, container: RefContainer): Promise<string | undefined> {
        this.tick('formatPrintf');
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
    }

    public async getValueType(): Promise<string | undefined> {
        this.tick('getValueType');
        return undefined;
    }

    public async __GetRegVal(): Promise<number | bigint | undefined> {
        this.tick('__GetRegVal');
        return undefined;
    }

    public async __FindSymbol(): Promise<number | undefined> {
        this.tick('__FindSymbol');
        return undefined;
    }

    public async __CalcMemUsed(): Promise<number | undefined> {
        this.tick('__CalcMemUsed');
        return undefined;
    }

    public async __size_of(): Promise<number | undefined> {
        this.tick('__size_of');
        return undefined;
    }

    public async __Symbol_exists(): Promise<number | undefined> {
        this.tick('__Symbol_exists');
        return undefined;
    }

    public async __Offset_of(): Promise<number | undefined> {
        this.tick('__Offset_of');
        return undefined;
    }

    public async __Running(): Promise<number | undefined> {
        this.tick('__Running');
        return undefined;
    }
}

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

    calls: Record<string, number> = {};

    private tick(name: string) {
        // eslint-disable-next-line security/detect-object-injection -- false positive: controlled key accumulation for test bookkeeping
        this.calls[name] = (this.calls[name] ?? 0) + 1;
    }

    public async getSymbolRef(_container: RefContainer, name: string): Promise<BasicRef | undefined> {
        this.tick('getSymbolRef');
        if (name === 'obj') {
            return this.objArrayRef;
        }
        return undefined;
    }

    public async getMemberRef(container: RefContainer, property: string): Promise<BasicRef | undefined> {
        this.tick('getMemberRef');
        if (container.current === this.objElementRef) {
            if (property === 'member') {
                return this.memberArrayRef;
            }
            if (property === 'var') {
                return this.varArrayRef;
            }
        }
        return undefined;
    }

    public async getElementStride(ref: ScvdNode): Promise<number> {
        this.tick('getElementStride');
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
    }

    public async getMemberOffset(_base: ScvdNode, member: ScvdNode): Promise<number | undefined> {
        this.tick('getMemberOffset');
        if (member === this.memberArrayRef) {
            return 8;
        }
        if (member === this.varArrayRef) {
            return 12;
        }
        return 0;
    }

    public async getElementRef(ref: ScvdNode): Promise<BasicRef | undefined> {
        this.tick('getElementRef');
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
    }

    public async getByteWidth(): Promise<number | undefined> {
        this.tick('getByteWidth');
        return 4;
    }

    public async resolveColonPath(): Promise<EvalValue> {
        this.tick('resolveColonPath');
        return undefined;
    }

    public async readValue(container: RefContainer): Promise<EvalValue | undefined> {
        this.tick('readValue');
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    }

    public async writeValue(_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> {
        this.tick('writeValue');
        return value;
    }

    public async _count(): Promise<number | undefined> {
        this.tick('_count');
        return undefined;
    }

    public async _addr(): Promise<number | undefined> {
        this.tick('_addr');
        return undefined;
    }

    public async formatPrintf(): Promise<string | undefined> {
        this.tick('formatPrintf');
        return undefined;
    }

    public async getValueType(): Promise<string | undefined> {
        this.tick('getValueType');
        return undefined;
    }

    public async __GetRegVal(): Promise<number | bigint | undefined> {
        this.tick('__GetRegVal');
        return undefined;
    }

    public async __FindSymbol(): Promise<number | undefined> {
        this.tick('__FindSymbol');
        return undefined;
    }

    public async __CalcMemUsed(): Promise<number | undefined> {
        this.tick('__CalcMemUsed');
        return undefined;
    }

    public async __size_of(): Promise<number | undefined> {
        this.tick('__size_of');
        return undefined;
    }

    public async __Symbol_exists(): Promise<number | undefined> {
        this.tick('__Symbol_exists');
        return undefined;
    }

    public async __Offset_of(): Promise<number | undefined> {
        this.tick('__Offset_of');
        return undefined;
    }

    public async __Running(): Promise<number | undefined> {
        this.tick('__Running');
        return undefined;
    }
}

describe('evaluator data host hooks', () => {
    it('uses stride/offset/element helpers for array member reads', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('arr[2].field', false);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe(99);
        expect(host.calls.getElementStride).toBe(1);
        expect(host.calls.getElementRef).toBe(1);
        expect(host.calls.getMemberOffset).toBe(1);
        expect(host.calls.getByteWidth).toBeGreaterThanOrEqual(1);
    });

    it('calls resolveColonPath for colon expressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('foo:bar:baz', false);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe(300); // 3 parts * 100
        expect(host.calls.resolveColonPath).toBe(1);
    });

    it('honors printf formatting override', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field]', true);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe('val=fmt-x-171');
        expect(host.calls.formatPrintf).toBe(1);
    });

    it('recovers reference containers for printf subexpressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field + 1]', true);

        await evaluateParseResult(pr, ctx);
        expect(host.calls.formatPrintf).toBe(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('does not recover containers for constant-only branches', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[false ? arr[1].field : 5]', true);

        await evaluateParseResult(pr, ctx);
        expect(host.calls.formatPrintf).toBe(1);
        expect(host.lastFormattingContainer?.current).toBeUndefined();
    });

    it('passes cached Uint8Array values to printf', async () => {
        const host = new HookHost({ disablePrintfOverride: true });
        // Override the value at offset 6 (arr[1].field) with a 6-byte MAC
        host.setValueAt(6, new Uint8Array([0x1e, 0x30, 0x6c, 0xa2, 0x45, 0x5f]));
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('mac=%M[arr[1].field]', true);

        const out = await evaluateParseResult(pr, ctx);
        expect(out).toBe('mac=1E-30-6C-A2-45-5F');
        expect(host.calls.formatPrintf).toBe(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('computes nested array offsets for member and var arrays', async () => {
        const host = new NestedArrayHost();
        const ctx = new EvalContext({ data: host, container: host.root });

        const memberExpr = parseExpression('obj[1].member[2]', false);
        const memberOut = await evaluateParseResult(memberExpr, ctx);
        expect(memberOut).toBe(111);

        const varExpr = parseExpression('obj[1].var[2]', false);
        const varOut = await evaluateParseResult(varExpr, ctx);
        expect(varOut).toBe(222);
    });
});
