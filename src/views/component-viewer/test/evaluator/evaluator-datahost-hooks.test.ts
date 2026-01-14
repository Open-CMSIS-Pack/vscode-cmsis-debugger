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

import { EvalContext, evaluateParseResult, type DataHost, type RefContainer, type EvalValue } from '../../evaluator';
import { parseExpression } from '../../parser';
import { ScvdNode } from '../../model/scvd-node';

class BasicRef extends ScvdNode {
    constructor(parent?: ScvdNode) {
        super(parent);
    }
}

class HookHost implements DataHost {
    readonly root = new BasicRef();
    readonly arrRef = new BasicRef(this.root);
    readonly elemRef = new BasicRef(this.arrRef);
    readonly fieldRef = new BasicRef(this.elemRef);
    lastFormattingContainer: RefContainer | undefined;

    private readonly values = new Map<number, EvalValue>([
        [10, 99], // offsetBytes for arr[2].field
        [6, 0xab], // offsetBytes for arr[1].field in printf path
    ]);

    calls: Record<string, number> = {};

    private tick(name: string) {
        // eslint-disable-next-line security/detect-object-injection -- false positive: controlled key accumulation for test bookkeeping
        this.calls[name] = (this.calls[name] ?? 0) + 1;
    }

    public getSymbolRef(_container: RefContainer, name: string): BasicRef | undefined {
        this.tick('getSymbolRef');
        if (name === 'arr') {
            return this.arrRef;
        }
        return undefined;
    }

    public getMemberRef(_container: RefContainer, property: string): BasicRef | undefined {
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

    public getElementStride(): number {
        this.tick('getElementStride');
        return 4;
    }

    public getMemberOffset(): number {
        this.tick('getMemberOffset');
        return 2;
    }

    public getElementRef(): BasicRef {
        this.tick('getElementRef');
        return this.elemRef;
    }

    public getByteWidth(): number {
        this.tick('getByteWidth');
        return 4;
    }

    public resolveColonPath(_container: RefContainer, parts: string[]): EvalValue {
        this.tick('resolveColonPath');
        return parts.length * 100; // simple sentinel
    }

    public readValue(container: RefContainer): EvalValue | undefined {
        this.tick('readValue');
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    }

    public writeValue(_container: RefContainer, value: EvalValue): EvalValue | undefined {
        this.tick('writeValue');
        return value;
    }

    public formatPrintf(spec: string, value: EvalValue, container: RefContainer): string {
        this.tick('formatPrintf');
        this.lastFormattingContainer = container;
        return `fmt-${spec}-${value}`;
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
});
