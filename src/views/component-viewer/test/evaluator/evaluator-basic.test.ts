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

import fs from 'fs';
import path from 'path';

import { EvalContext, evaluateParseResult, type DataHost, type EvalValue, type RefContainer } from '../../evaluator';
import { parseExpression } from '../../parser';
import { ScvdBase } from '../../model/scvd-base';

type SymbolDef = {
    value?: EvalValue;
    members?: Record<string, SymbolDef>;
    elements?: Record<string, SymbolDef>;
    addr?: number;
};

type EvaluatorCase = {
    expr: string;
    expected: number | string | undefined;
    symbols?: Record<string, SymbolDef>;
    checkSymbol?: string;
    expectedSymbol?: number | string | undefined;
};

class MockRef extends ScvdBase {
    value: EvalValue | undefined;
    members: Map<string, MockRef> = new Map();
    elements: Map<number, MockRef> = new Map();
    addr: number | undefined;

    constructor(def?: SymbolDef, parent?: MockRef) {
        super(parent);
        this.value = def?.value;
        this.addr = def?.addr;
        if (def?.members) {
            for (const [name, child] of Object.entries(def.members)) {
                this.members.set(name, buildRef(child, this));
            }
        }
        if (def?.elements) {
            for (const [index, child] of Object.entries(def.elements)) {
                const idx = Number(index);
                this.elements.set(Number.isFinite(idx) ? idx : 0, buildRef(child, this));
            }
        }
    }
}

function buildRef(def?: SymbolDef, parent?: MockRef): MockRef {
    return new MockRef(def, parent);
}

class MockHost implements DataHost {
    readonly root: MockRef;
    private readonly symbols = new Map<string, MockRef>();
    private readonly regValues = new Map<string, number>([['r0', 7]]);
    private readonly symbolOffsets = new Map<string, number>([['memberA', 12]]);

    constructor(symbols?: Record<string, SymbolDef>) {
        this.root = new MockRef();
        const baseSymbols: Record<string, SymbolDef> = {
            symA: { value: 0, addr: 0x1234 },
            foo: { value: 1 },
        };
        const merged = { ...baseSymbols, ...(symbols ?? {}) };
        for (const [name, def] of Object.entries(merged)) {
            this.symbols.set(name, buildRef(def, this.root));
        }
    }

    private resolveElement(ref: MockRef | undefined, index?: number): MockRef | undefined {
        if (!ref) {
            return undefined;
        }
        if (index !== undefined && ref.elements.size > 0) {
            return ref.elements.get(index);
        }
        return ref;
    }

    public getSymbolRef(_container: RefContainer, name: string, _forWrite?: boolean): MockRef | undefined {
        return this.symbols.get(name);
    }

    public getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): MockRef | undefined {
        const base = this.resolveElement(container.current as MockRef, container.index);
        return base?.members.get(property);
    }

    public readValue(container: RefContainer): EvalValue | undefined {
        const ref =
            (container.member as MockRef | undefined) ??
            this.resolveElement(container.current as MockRef, container.index) ??
            (container.anchor as MockRef | undefined);
        return ref?.value;
    }

    public writeValue(container: RefContainer, value: EvalValue): EvalValue | undefined {
        const ref =
            (container.member as MockRef | undefined) ??
            this.resolveElement(container.current as MockRef, container.index) ??
            (container.anchor as MockRef | undefined);
        if (!ref) {
            return undefined;
        }
        ref.value = value;
        return value;
    }

    public _count(container: RefContainer): number | undefined {
        const ref = this.resolveElement(container.current as MockRef, container.index);
        if (!ref) {
            return undefined;
        }
        if (ref.elements.size > 0) {
            return ref.elements.size;
        }
        if (ref.members.size > 0) {
            return ref.members.size;
        }
        if (typeof ref.value === 'string') {
            return ref.value.length;
        }
        return 0;
    }

    public _addr(container: RefContainer): number | undefined {
        const ref = this.resolveElement(container.current as MockRef, container.index);
        return ref?.addr ?? 0;
    }

    public __Running(): number {
        return 1;
    }

    public __GetRegVal(reg: string): number | undefined {
        return this.regValues.get(reg);
    }

    public __FindSymbol(symbol: string): number | undefined {
        const ref = this.symbols.get(symbol);
        if (ref?.addr !== undefined) {
            return ref.addr;
        }
        if (typeof ref?.value === 'number') {
            return ref.value;
        }
        return undefined;
    }

    public __CalcMemUsed(a: number, b: number, c: number, d: number): number {
        return (a >>> 0) + (b >>> 0) + (c >>> 0) + (d >>> 0);
    }

    public __size_of(symbol: string): number | undefined {
        return this.symbols.has(symbol) ? 4 : undefined;
    }

    public __Symbol_exists(symbol: string): number {
        return this.symbols.has(symbol) ? 1 : 0;
    }

    public __Offset_of(_container: RefContainer, typedefMember: string): number | undefined {
        return this.symbolOffsets.get(typedefMember);
    }

    public getSymbolValue(name: string): EvalValue | undefined {
        return this.symbols.get(name)?.value;
    }
}

function loadCases(): EvaluatorCase[] {
    const file = path.join(__dirname, '..', 'testfiles', 'evaluator-basic.json');
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as EvaluatorCase[];
}

describe('evaluator basic coverage', () => {
    const cases = loadCases();

    it.each(cases)('evaluates %s', async testCase => {
        const host = new MockHost(testCase.symbols);
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression(testCase.expr, false);

        expect(pr.diagnostics).toHaveLength(0);

        const result = await evaluateParseResult(pr, ctx);
        expect(result).toEqual(testCase.expected);

        if (testCase.checkSymbol) {
            expect(host.getSymbolValue(testCase.checkSymbol)).toEqual(testCase.expectedSymbol);
        }
    });
});
