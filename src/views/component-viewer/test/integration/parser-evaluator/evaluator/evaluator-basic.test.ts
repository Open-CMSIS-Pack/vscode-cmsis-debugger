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
 * Integration test for EvaluatorBasic.
 */

import { Evaluator, EvalContext } from '../../../../parser-evaluator/evaluator';
import type { EvalValue, RefContainer } from '../../../../parser-evaluator/model-host';
import type { FullDataHost } from '../../helpers/full-data-host';
import { parseExpression } from '../../../../parser-evaluator/parser';
import { ScvdNode } from '../../../../model/scvd-node';

type SymbolDef = {
    value?: EvalValue;
    members?: Record<string, SymbolDef>;
    elements?: Record<string, SymbolDef>;
    addr?: number;
};

// Loaded from static test fixture (path is fixed at build time).
type EvaluatorCase = {
    expr: string;
    expected: number | string | undefined;
    symbols?: Record<string, SymbolDef>;
    checkSymbol?: string;
    expectedSymbol?: number | string | undefined;
};

const evaluator = new Evaluator();

type EvaluatorCasesFile = {
    _meta: { format: string; copyright: string; generatedWith?: string };
    cases: EvaluatorCase[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture: EvaluatorCasesFile | EvaluatorCase[] = require('../../testfiles/evaluator-basic.json');
const cases: EvaluatorCase[] = Array.isArray(fixture) ? fixture : fixture.cases;

class MockRef extends ScvdNode {
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

class MockHost implements FullDataHost {
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

    public async resolveColonPath(): Promise<EvalValue> {
        return undefined;
    }

    public async getSymbolRef(_container: RefContainer, name: string, _forWrite?: boolean): Promise<MockRef | undefined> {
        return this.symbols.get(name);
    }

    public async getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): Promise<MockRef | undefined> {
        const base = this.resolveElement(container.current as MockRef, container.index);
        return base?.members.get(property);
    }

    public async readValue(container: RefContainer): Promise<EvalValue | undefined> {
        const ref =
            (container.member as MockRef | undefined) ??
            this.resolveElement(container.current as MockRef, container.index) ??
            (container.anchor as MockRef | undefined);
        return ref?.value;
    }

    public async writeValue(container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> {
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

    public async getElementStride(_ref: MockRef): Promise<number> {
        return 1;
    }

    public async getMemberOffset(_base: MockRef, _member: MockRef): Promise<number | undefined> {
        return undefined;
    }

    public async getElementRef(ref: MockRef): Promise<MockRef | undefined> {
        return this.resolveElement(ref);
    }

    public async getByteWidth(): Promise<number | undefined> {
        return 4;
    }

    public async _count(container: RefContainer): Promise<number | undefined> {
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

    public async _addr(container: RefContainer): Promise<number | undefined> {
        const ref = this.resolveElement(container.current as MockRef, container.index);
        return ref?.addr ?? 0;
    }

    public async __Running(): Promise<number | undefined> {
        return 1;
    }

    public async __GetRegVal(reg: string): Promise<number | bigint | undefined> {
        return this.regValues.get(reg);
    }

    public async __FindSymbol(symbol: string): Promise<number | undefined> {
        const ref = this.symbols.get(symbol);
        if (ref?.addr !== undefined) {
            return ref.addr;
        }
        if (typeof ref?.value === 'number') {
            return ref.value;
        }
        return undefined;
    }

    public async __CalcMemUsed(a: number, b: number, c: number, d: number): Promise<number | undefined> {
        return (a >>> 0) + (b >>> 0) + (c >>> 0) + (d >>> 0);
    }

    public async __size_of(symbol: string): Promise<number | undefined> {
        return this.symbols.has(symbol) ? 4 : undefined;
    }

    public async __Symbol_exists(symbol: string): Promise<number | undefined> {
        return this.symbols.has(symbol) ? 1 : 0;
    }

    public async __Offset_of(_container: RefContainer, typedefMember: string): Promise<number | undefined> {
        return this.symbolOffsets.get(typedefMember);
    }

    public async formatPrintf(): Promise<string | undefined> {
        return undefined;
    }

    public async getValueType(): Promise<string | undefined> {
        return undefined;
    }

    public getSymbolValue(name: string): EvalValue | undefined {
        return this.symbols.get(name)?.value;
    }
}

describe('evaluator', () => {
    it.each(cases)('evaluates %s', async testCase => {
        const host = new MockHost(testCase.symbols);
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression(testCase.expr, false);

        expect(pr.diagnostics).toHaveLength(0);

        const result = await evaluator.evaluateParseResult(pr, ctx);
        expect(result).toEqual(testCase.expected);

        if (testCase.checkSymbol) {
            expect(host.getSymbolValue(testCase.checkSymbol)).toEqual(testCase.expectedSymbol);
        }
    });
});
