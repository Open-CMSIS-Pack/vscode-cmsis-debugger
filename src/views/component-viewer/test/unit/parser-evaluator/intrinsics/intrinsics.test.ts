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
 * Unit test for Intrinsics.
 */

import { handleIntrinsic, handlePseudoMember, INTRINSIC_DEFINITIONS, isIntrinsicName, type IntrinsicName, type IntrinsicProvider } from '../../../../parser-evaluator/intrinsics';
import type { RefContainer } from '../../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../../model/scvd-node';

class TestNode extends ScvdNode {
    constructor() {
        super(undefined);
    }
}

describe('intrinsics', () => {
    const base = new TestNode();
    const container = (): RefContainer => ({ base, valueType: undefined });

    it('enforces intrinsic arg bounds', async () => {
        const host = {} as unknown as IntrinsicProvider;
        const onError = jest.fn();
        await expect(handleIntrinsic(host, container(), '__GetRegVal', [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __GetRegVal expects at least 1 argument(s)');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [1, 2, 3], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __CalcMemUsed expects at least 4 argument(s)');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [1, 2, 3, 4, 5], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __CalcMemUsed expects at most 4 argument(s)');
    });

    it('runs numeric intrinsics and coercions', async () => {
        const host = {
            __GetRegVal: jest.fn(async (r: string) => r === 'r0' ? 1 : (r === '' ? 2 : undefined)),
            __FindSymbol: jest.fn(async (name: string) => name === '' ? 0x99 : 0x10),
            __CalcMemUsed: jest.fn(async (a: number, b: number, c: number, d: number) => a + b + c + d),
            __size_of: jest.fn(async (name: string) => name === '' ? 8 : 4),
            __Symbol_exists: jest.fn(async (name: string) => name === '' ? 0 : 1),
            __Offset_of: jest.fn(async (_c: RefContainer, name: string) => name.length),
            __Running: jest.fn(async () => 1),
        } as unknown as IntrinsicProvider;

        await expect(handleIntrinsic(host, container(), '__GetRegVal', ['r0'])).resolves.toBe(1);
        await expect(handleIntrinsic(host, container(), '__GetRegVal', [undefined])).resolves.toBe(2);
        await expect(handleIntrinsic(host, container(), '__FindSymbol', ['main'])).resolves.toBe(0x10);
        await expect(handleIntrinsic(host, container(), '__FindSymbol', [undefined])).resolves.toBe(0x99);
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [1, 2, 3, 4])).resolves.toBe(10);
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [undefined, undefined, undefined, undefined])).resolves.toBe(0);
        await expect(handleIntrinsic(host, container(), '__size_of', ['T'])).resolves.toBe(4);
        await expect(handleIntrinsic(host, container(), '__size_of', [undefined])).resolves.toBe(8);
        await expect(handleIntrinsic(host, container(), '__Symbol_exists', ['foo'])).resolves.toBe(1);
        await expect(handleIntrinsic(host, container(), '__Symbol_exists', [undefined])).resolves.toBe(0);
        await expect(handleIntrinsic(host, container(), '__Offset_of', ['member'])).resolves.toBe('member'.length >>> 0);
        await expect(handleIntrinsic(host, container(), '__Offset_of', [undefined])).resolves.toBe(0);
        await expect(handleIntrinsic(host, container(), '__Running', [])).resolves.toBe(1);
    });

    it('coerces intrinsic arguments via toInt helpers', async () => {
        const host = {
            __CalcMemUsed: jest.fn(async (a: number, b: number, c: number, d: number) => a + b + c + d),
        } as unknown as IntrinsicProvider;

        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [1n, true, '3', 'bad'])).resolves.toBe(5);
    });

    it('reports missing or undefined intrinsic results', async () => {
        const missing = {} as unknown as IntrinsicProvider;
        const onError = jest.fn();
        await expect(handleIntrinsic(missing, container(), '__Running', [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __Running');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__GetRegVal', ['r0'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __GetRegVal');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__FindSymbol', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __FindSymbol');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__CalcMemUsed', [0, 0, 0, 0], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __CalcMemUsed');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__size_of', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __size_of');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__Symbol_exists', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __Symbol_exists');

        onError.mockClear();
        await expect(handleIntrinsic(missing, container(), '__Offset_of', ['m'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __Offset_of');

        const host = {
            __GetRegVal: jest.fn(async () => undefined),
            __FindSymbol: jest.fn(async () => undefined),
            __CalcMemUsed: jest.fn(async () => undefined),
            __size_of: jest.fn(async () => undefined),
            __Symbol_exists: jest.fn(async () => undefined),
            __Offset_of: jest.fn(async () => undefined),
            __Running: jest.fn(async () => undefined),
        } as unknown as IntrinsicProvider;

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__GetRegVal', ['r0'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __GetRegVal returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__FindSymbol', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __FindSymbol returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed', [0, 0, 0, 0], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __CalcMemUsed returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__size_of', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __size_of returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Symbol_exists', ['x'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Symbol_exists returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Offset_of', ['m'], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Offset_of returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Running', [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Running returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Running' as IntrinsicName, [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Running returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__GetRegVal' as IntrinsicName, [''], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __GetRegVal returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Symbol_exists' as IntrinsicName, [''], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Symbol_exists returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__Offset_of' as IntrinsicName, [''], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __Offset_of returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__CalcMemUsed' as IntrinsicName, [0, 0, 0, 0], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __CalcMemUsed returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__FindSymbol' as IntrinsicName, [''], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __FindSymbol returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__size_of' as IntrinsicName, [''], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Intrinsic __size_of returned undefined');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '_addr' as IntrinsicName, [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic _addr');

        onError.mockClear();
        await expect(handleIntrinsic(host, container(), '__NotReal' as IntrinsicName, [], onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing intrinsic __NotReal');
    });

    it('covers pseudo-member handling', async () => {
        const host = {
            _count: jest.fn(async () => 2),
            _addr: jest.fn(async () => 0x1000),
        } as unknown as IntrinsicProvider;

        await expect(handlePseudoMember(host, container(), '_count', base)).resolves.toBe(2);
        await expect(handlePseudoMember(host, container(), '_addr', base)).resolves.toBe(0x1000);

        const missing = {} as unknown as IntrinsicProvider;
        const onError = jest.fn();
        await expect(handlePseudoMember(missing, container(), '_count', base, onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Missing pseudo-member _count');

        const undef = {
            _count: jest.fn(async () => undefined),
            _addr: jest.fn(async () => undefined),
        } as unknown as IntrinsicProvider;
        onError.mockClear();
        await expect(handlePseudoMember(undef, container(), '_addr', base, onError)).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith('Pseudo-member _addr returned undefined');
    });

    it('keeps intrinsic definitions aligned', () => {
        expect(Object.keys(INTRINSIC_DEFINITIONS).sort()).toEqual([
            '__CalcMemUsed',
            '__FindSymbol',
            '__GetRegVal',
            '__Offset_of',
            '__Running',
            '__Symbol_exists',
            '__size_of',
            '_addr',
            '_count',
        ].sort());

        expect(isIntrinsicName('__Running')).toBe(true);
        expect(isIntrinsicName('notAnIntrinsic')).toBe(false);
    });
});
