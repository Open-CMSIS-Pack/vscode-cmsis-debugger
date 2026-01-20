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

import { ScvdEvalInterface } from '../../../scvd-eval-interface';
import { MemoryHost } from '../../../data-host/memory-host';
import { RegisterHost } from '../../../data-host/register-host';
import { ScvdFormatSpecifier } from '../../../model/scvd-format-specifier';
import { ScvdDebugTarget } from '../../../scvd-debug-target';
import { RefContainer } from '../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../model/scvd-node';

const makeStubBase = (name: string): ScvdNode => ({
    name,
    getSymbol: jest.fn(),
    getMember: jest.fn(),
    getDisplayLabel: jest.fn().mockReturnValue(name),
    getValueType: jest.fn(),
} as unknown as ScvdNode);

const makeContainer = (name: string, widthBytes: number, offsetBytes = 0): RefContainer => ({
    base: makeStubBase(name),
    anchor: makeStubBase(name),
    current: makeStubBase(name),
    offsetBytes,
    widthBytes,
    valueType: undefined,
});

describe('ScvdEvalInterface', () => {
    it('routes intrinsic calls to debugTarget/registers/memHost', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn().mockReturnValue(7) } as unknown as RegisterHost;
        const debugTarget = {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1234),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue('sym'),
            calculateMemoryUsage: jest.fn().mockReturnValue(0xabcd),
            getSymbolSize: jest.fn().mockResolvedValue(undefined),
            getNumArrayElements: jest.fn().mockResolvedValue(3),
            getTargetIsRunning: jest.fn().mockResolvedValue(true),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(new Uint8Array([65, 66])),
        } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        expect(await host.__FindSymbol('foo')).toBe(0x1234);
        expect(await host.__GetRegVal('r0')).toBe(7);
        expect(await host.__Symbol_exists('foo')).toBe(1);
        expect(await host.__CalcMemUsed(1, 2, 3, 4)).toBe(0xabcd);
        expect(await host.__size_of('arr')).toBe(3);
        expect(await host.__Running()).toBe(1);
    });

    it('formats printf values and falls back to string', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as unknown as RegisterHost;
        const debugTarget = {
            findSymbolAddress: jest.fn(),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue('sym'),
            getSymbolSize: jest.fn().mockResolvedValue(undefined),
            getNumArrayElements: jest.fn().mockResolvedValue(undefined),
            getTargetIsRunning: jest.fn(),
            readUint8ArrayStrFromPointer: jest.fn(),
        } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('v', 4);

        expect(await host.formatPrintf('d', 42, container)).toBe('42');
        expect(await host.formatPrintf('S', 0x1000, container)).toBe('sym');
        expect(await host.formatPrintf('?', true as unknown as number, container)).toBe('<unknown format specifier %?>');
    });

    it('readValue/writeValue interop with cache', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as unknown as RegisterHost;
        const debugTarget = { getSymbolSize: jest.fn(), getNumArrayElements: jest.fn() } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('num', 4);
        await host.writeValue(container, 0xdeadbeef);
        expect(await host.readValue(container)).toBe(0xdeadbeef >>> 0);
    });
});
