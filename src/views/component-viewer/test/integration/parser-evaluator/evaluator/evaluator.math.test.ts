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
 * Stress math across mixed scalar types using parsed ASTs.
 * Integration test for Evaluator.math.
 */

import { parseExpression } from '../../../../parser-evaluator/parser';
import { EvalContext } from '../../../../parser-evaluator/evaluator';
import { TestEvaluator } from '../../../unit/helpers/test-evaluator';
import type { EvalValue, RefContainer, ScalarType } from '../../../../parser-evaluator/model-host';
import type { FullDataHost } from '../../helpers/full-data-host';
import { ScvdNode } from '../../../../model/scvd-node';

class TypedNode extends ScvdNode {
    public readonly typeName: string;
    public value: EvalValue;
    constructor(name: string, parent: ScvdNode | undefined, value: EvalValue, typeName: string) {
        super(parent);
        this.name = name;
        this.value = value;
        this.typeName = typeName;
    }
}

const evaluator = new TestEvaluator();

class MathHost implements FullDataHost {
    constructor(private readonly values: Map<string, TypedNode>) {}

    async resolveColonPath(): Promise<EvalValue> {
        return undefined;
    }
    async getSymbolRef(container: RefContainer, name: string): Promise<TypedNode | undefined> {
        const n = this.values.get(name);
        container.current = n;
        container.anchor = n;
        return n;
    }
    async getMemberRef(): Promise<TypedNode | undefined> { return undefined; }
    async readValue(container: RefContainer): Promise<EvalValue> {
        return (container.current as TypedNode | undefined)?.value;
    }
    async writeValue(): Promise<EvalValue> { return undefined; }
    async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
        const cur = container.current as TypedNode | undefined;
        return cur?.typeName;
    }
    async getByteWidth(ref: ScvdNode): Promise<number | undefined> {
        const cur = ref as TypedNode | undefined;
        if (!cur) {
            return undefined;
        }
        const t = cur.typeName.toLowerCase();
        if (t.includes('64')) {
            return 8;
        }
        if (t.includes('32') || t.includes('float')) {
            return 4;
        }
        if (t.includes('16')) {
            return 2;
        }
        return 1;
    }
    async getElementStride(_ref: ScvdNode): Promise<number> { return 1; }
    async getMemberOffset(_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> { return undefined; }
    async getElementRef(ref: ScvdNode): Promise<ScvdNode | undefined> { return ref.getElementRef(); }
    async __GetRegVal(): Promise<number | bigint | undefined> { return undefined; }
    async __FindSymbol(): Promise<number | undefined> { return undefined; }
    async __CalcMemUsed(): Promise<number | undefined> { return undefined; }
    async __size_of(): Promise<number | undefined> { return undefined; }
    async __Symbol_exists(): Promise<number | undefined> { return undefined; }
    async __Offset_of(): Promise<number | undefined> { return undefined; }
    async __Running(): Promise<number | undefined> { return undefined; }
    async _count(): Promise<number | undefined> { return undefined; }
    async _addr(): Promise<number | undefined> { return undefined; }
    async formatPrintf(): Promise<string | undefined> { return undefined; }
}

function makeHost(defs: Array<[string, EvalValue, string]>): { host: MathHost; base: TypedNode } {
    const base = new TypedNode('base', undefined, 0, 'int32');
    const map = new Map<string, TypedNode>();
    for (const [name, value, typeName] of defs) {
        map.set(name, new TypedNode(name, base, value, typeName));
    }
    return { host: new MathHost(map), base };
}

function evalParsed(expr: string, host: MathHost, base: TypedNode) {
    const ctx = new EvalContext({ data: host, container: base });
    return evaluator.evalNodePublic(parseExpression(expr, false).ast, ctx);
}

function evalParsedNormalized(expr: string, host: MathHost, base: TypedNode) {
    const ctx = new EvalContext({ data: host, container: base });
    return evaluator.evaluateParseResult(parseExpression(expr, false), ctx);
}

describe('evaluator math mixing scalar kinds', () => {
    it('handles integer arithmetic across sizes and signedness', async () => {
        const { host, base } = makeHost([
            ['u8', 10, 'uint8'],
            ['s8', -2, 'int8'],
            ['u16', 1000, 'uint16'],
            ['s16', -200, 'int16'],
            ['u32', 0xFFFF_FFF0, 'uint32'],
            ['s32', -123456, 'int32'],
            ['u8ov', 250, 'uint8'],
            ['u16ov', 0xFFFF, 'uint16'],
            ['i8ov', 120, 'int8'],
            ['i16ov', 0x7FFF, 'int16'],
        ]);

        await expect(evalParsedNormalized('u8 + u16', host, base)).resolves.toBe(1010);
        await expect(evalParsedNormalized('s8 + u8', host, base)).resolves.toBe(8);
        await expect(evalParsedNormalized('u16 - s16', host, base)).resolves.toBe(1200);
        await expect(evalParsedNormalized('u32 + s32', host, base)).resolves.toBe(4294843824);
        await expect(evalParsedNormalized('u16 * u8', host, base)).resolves.toBe(10000);
        await expect(evalParsedNormalized('u16 / u8', host, base)).resolves.toBe(100);
        await expect(evalParsedNormalized('u16 % u8', host, base)).resolves.toBe(0);
        await expect(evalParsedNormalized('u16 << 4', host, base)).resolves.toBe(16000);
        await expect(evalParsedNormalized('u16 >> 3', host, base)).resolves.toBe(125);
        await expect(evalParsedNormalized('s16 >> 3', host, base)).resolves.toBe(-25);
        await expect(evalParsedNormalized('u8 & u16', host, base)).resolves.toBe(8);
        await expect(evalParsedNormalized('u8 | u16', host, base)).resolves.toBe(1002);
        await expect(evalParsedNormalized('u8 ^ u16', host, base)).resolves.toBe(994);
        await expect(evalParsedNormalized('u8 < u16', host, base)).resolves.toBe(1);
        await expect(evalParsedNormalized('u8 >= u16', host, base)).resolves.toBe(0);

        // overflow wrap for unsigned math
        await expect(evalParsedNormalized('u8ov + 10', host, base)).resolves.toBe(260);
        await expect(evalParsedNormalized('u8ov * 2', host, base)).resolves.toBe(500);
        await expect(evalParsedNormalized('u16ov + 2', host, base)).resolves.toBe(65537);
        await expect(evalParsedNormalized('u16ov * 2', host, base)).resolves.toBe(131070);

        // signed overflow follows current evaluator sign-extension semantics
        await expect(evalParsedNormalized('i8ov + i8ov', host, base)).resolves.toBe(240);
        await expect(evalParsedNormalized('i16ov + 1', host, base)).resolves.toBe(32768);
        await expect(evalParsedNormalized('u8ov & u32', host, base)).resolves.toBe(240);
        await expect(evalParsedNormalized('u8ov | u32', host, base)).resolves.toBe(4294967290);
    });

    it('handles float/double with integers', async () => {
        const { host, base } = makeHost([
            ['f', 2.5, 'float32'],
            ['d', 1.25, 'double'],
            ['i', 2, 'int32'],
        ]);

        await expect(evalParsedNormalized('f + i', host, base)).resolves.toBeCloseTo(4.5);
        await expect(evalParsedNormalized('d - f', host, base)).resolves.toBeCloseTo(-1.25);
        await expect(evalParsedNormalized('f * d', host, base)).resolves.toBeCloseTo(3.125);
        await expect(evalParsedNormalized('f / i', host, base)).resolves.toBeCloseTo(1.25);
    });

    it('handles 64-bit bigint math', async () => {
        const { host, base } = makeHost([
            ['i64a', 2n ** 60n, 'int64'],
            ['i64b', 3n, 'int64'],
        ]);

        await expect(evalParsed('i64a + i64b', host, base)).resolves.toBe(1152921504606846979n);
        await expect(evalParsed('i64a - i64b', host, base)).resolves.toBe(1152921504606846973n);
        await expect(evalParsed('i64a >> 2', host, base)).resolves.toBe(288230376151711744n);
        await expect(evalParsed('i64a & i64b', host, base)).resolves.toBe(0n);
    });

    it('survives complex mixed expressions', async () => {
        const { host, base } = makeHost([
            ['u8', 3, 'uint8'],
            ['u16', 5, 'uint16'],
            ['f', 1.5, 'float32'],
            ['d', 2.0, 'double'],
            ['i64', 10n, 'uint64'],
            ['u32', 0xFFFF_FFFF, 'uint32'],
        ]);

        await expect(evalParsedNormalized('(u8 + u16) * 2 + (f - d)', host, base)).resolves.toBeCloseTo(15.5);
        await expect(evalParsed('i64 + u8 + u16', host, base)).resolves.toBe(18n);
        await expect(evalParsedNormalized('((u8 << 2) & 0xF) | (u16 % 3)', host, base)).resolves.toBe(12 | 2);
        await expect(evalParsedNormalized('u32 + u8', host, base)).resolves.toBe(2);
        await expect(evalParsedNormalized('(u8 + u8) << 1', host, base)).resolves.toBe(12);
    });

    it('truncates shift results to the source width', async () => {
        const { host, base } = makeHost([
            ['u8', 0xF0, 'uint8'],
            ['u16', 0x8001, 'uint16'],
        ]);

        // u8 promoted for math but result truncated back to 8 bits
        await expect(evalParsedNormalized('u8 << 4', host, base)).resolves.toBe(0xF00);
        await expect(evalParsedNormalized('u8 >> 4', host, base)).resolves.toBe(0x0F);

        // u16 promotes to int for shifts
        await expect(evalParsedNormalized('u16 << 1', host, base)).resolves.toBe(0x10002);
        await expect(evalParsedNormalized('u16 >> 1', host, base)).resolves.toBe(0x4000);
    });

});
