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
 * Coverage for ScvdEvalInterface helpers and intrinsics.
 */
// generated with AI

import { ScvdEvalInterface } from '../../scvd-eval-interface';
import type { RefContainer } from '../../model-host';
import type { MemoryHost } from '../../data-host/memory-host';
import type { RegisterHost } from '../../data-host/register-host';
import type { ScvdDebugTarget } from '../../scvd-debug-target';
import type { FormatSegment } from '../../parser';
import { ScvdFormatSpecifier } from '../../model/scvd-format-specifier';
import { ScvdNode } from '../../model/scvd-node';
import { ScvdMember } from '../../model/scvd-member';

class DummyNode extends ScvdNode {
    constructor(
        name: string | undefined,
        private readonly opts: Partial<{
            targetSize: number;
            virtualSize: number;
            arraySize: number;
            isPointer: boolean;
            memberOffset: number;
            valueType: string;
            symbolMap: Record<string, ScvdNode>;
        }> = {}
    ) {
        super(undefined);
        this.name = name;
    }
    public override getTargetSize(): number | undefined { return this.opts.targetSize; }
    public override getVirtualSize(): number | undefined { return this.opts.virtualSize; }
    public override async getArraySize(): Promise<number | undefined> { return this.opts.arraySize; }
    public override getIsPointer(): boolean { return this.opts.isPointer ?? false; }
    public override getDisplayLabel(): string { return this.name ?? '<anon>'; }
    public override getMemberOffset(): Promise<number | undefined> { return Promise.resolve(this.opts.memberOffset); }
    public override getMember(name: string): ScvdNode | undefined {
        const map = this.opts.symbolMap ?? {};
        return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined;
    }
    public override getValueType(): string | undefined { return this.opts.valueType; }
}

class LocalFakeMember extends ScvdMember {
    constructor() {
        super(undefined);
    }
    public override getTargetSize(): number | undefined { return 4; }
    public override async getEnum(_value: number) {
        return { getGuiName: async () => 'ENUM_READY' } as unknown as Awaited<ReturnType<ScvdMember['getEnum']>>;
    }
}

function makeEval(overrides: Partial<ScvdDebugTarget> & Partial<MemoryHost> & Partial<RegisterHost> = {}) {
    const merged = overrides ?? {};
    const memHost: Partial<MemoryHost> = {
        readValue: jest.fn(),
        writeValue: jest.fn(),
        getArrayElementCount: jest.fn().mockReturnValue(3),
        getElementTargetBase: jest.fn().mockReturnValue(0xbeef),
        ...merged
    };
    const regHost: Partial<RegisterHost> = {
        read: jest.fn().mockReturnValue(undefined),
        write: jest.fn(),
        ...merged
    };
    const debugTarget: Partial<ScvdDebugTarget> = {
        readRegister: jest.fn().mockResolvedValue(123),
        calculateMemoryUsage: jest.fn().mockResolvedValue(0xabcd),
        getSymbolSize: jest.fn().mockResolvedValue(undefined),
        getNumArrayElements: jest.fn().mockResolvedValue(7),
        getTargetIsRunning: jest.fn().mockResolvedValue(true),
        findSymbolAddress: jest.fn().mockResolvedValue(undefined),
        ...merged
    };
    const formatter = new ScvdFormatSpecifier();
    const evalIf = new ScvdEvalInterface(
        memHost as MemoryHost,
        regHost as RegisterHost,
        debugTarget as ScvdDebugTarget,
        formatter
    );
    return { evalIf, memHost: memHost as MemoryHost, regHost: regHost as RegisterHost, debugTarget: debugTarget as ScvdDebugTarget };
}

describe('ScvdEvalInterface intrinsics and helpers', () => {
    it('reads register with cache and normalization', async () => {
        const regHost = {
            read: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(999),
            write: jest.fn()
        } as unknown as RegisterHost;
        const debugTarget = { readRegister: jest.fn().mockResolvedValue(321) } as unknown as ScvdDebugTarget;
        const { evalIf } = makeEval({ ...regHost, ...debugTarget });

        await expect(evalIf.__GetRegVal(' r0 ')).resolves.toBe(321);
        expect(regHost.write).toHaveBeenCalledWith('r0', 321);
        await expect(evalIf.__GetRegVal(' r0 ')).resolves.toBe(999);
    });

    it('__Symbol_exists and __FindSymbol normalize names and map found/not found', async () => {
        const findSymbolAddress = jest.fn().mockResolvedValue(0x1234);
        const { evalIf } = makeEval({ findSymbolAddress });
        await expect(evalIf.__Symbol_exists('  ')).resolves.toBe(0);
        await expect(evalIf.__Symbol_exists('MySym')).resolves.toBe(1);
        await expect(evalIf.__FindSymbol('MySym')).resolves.toBe(0x1234);
    });

    it('__CalcMemUsed forwards params', async () => {
        const calculateMemoryUsage = jest.fn().mockResolvedValue(0xf00d);
        const { evalIf } = makeEval({ calculateMemoryUsage });
        await expect(evalIf.__CalcMemUsed(1, 2, 3, 4)).resolves.toBe(0xf00d);
        expect(calculateMemoryUsage).toHaveBeenCalledWith(1, 2, 3, 4);
    });

    it('__size_of prefers size then falls back to element count', async () => {
        const debugTarget: Partial<ScvdDebugTarget> = {
            getSymbolSize: jest.fn().mockResolvedValueOnce(16).mockResolvedValueOnce(undefined),
            getNumArrayElements: jest.fn().mockResolvedValue(5)
        };
        const { evalIf } = makeEval(debugTarget);
        await expect(evalIf.__size_of('sym')).resolves.toBe(16);
        await expect(evalIf.__size_of('sym')).resolves.toBe(5);
    });

    it('__Offset_of and __Running', async () => {
        const member = new DummyNode('m', { memberOffset: 12 });
        const container: RefContainer = { base: new DummyNode('base', { symbolMap: { member } }), current: undefined, valueType: undefined };
        const { evalIf, debugTarget } = makeEval({ getTargetIsRunning: jest.fn().mockResolvedValue(false) });
        await expect(evalIf.__Offset_of(container, 'member')).resolves.toBe(12);
        await expect(evalIf.__Offset_of(container, 'missing')).resolves.toBeUndefined();
        await expect(evalIf.__Running()).resolves.toBe(0);
        expect(debugTarget.getTargetIsRunning).toHaveBeenCalled();
    });

    it('_count and _addr defer to MemoryHost', async () => {
        const base = new DummyNode('arr');
        const container: RefContainer = { base, current: base, valueType: undefined };
        const memHost = {
            getArrayElementCount: jest.fn().mockReturnValue(10),
            getElementTargetBase: jest.fn().mockReturnValue(0xbeef)
        } as unknown as MemoryHost;
        const { evalIf } = makeEval(memHost);
        expect(await evalIf._count(container)).toBe(10);
        expect(await evalIf._addr(container)).toBe(0xbeef);
    });

    it('getByteWidth handles pointers, arrays, and logs missing size', async () => {
        const ptrNode = new DummyNode('ptr', { isPointer: true });
        const sizedNode = new DummyNode('arr', { targetSize: 2, arraySize: 3 });
        const missing = new DummyNode('missing');
        const { evalIf } = makeEval();
        await expect(evalIf.getByteWidth(ptrNode)).resolves.toBe(4);
        await expect(evalIf.getByteWidth(sizedNode)).resolves.toBe(6);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(evalIf.getByteWidth(missing)).resolves.toBeUndefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('getElementStride handles pointer, virtual size, target size, and missing stride', async () => {
        const ptrNode = new DummyNode('ptr', { isPointer: true });
        const virtualNode = new DummyNode('virt', { virtualSize: 5 });
        const sizedNode = new DummyNode('sized', { targetSize: 3 });
        const missing = new DummyNode('missing');
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const { evalIf } = makeEval();
        expect(await evalIf.getElementStride(ptrNode)).toBe(4);
        expect(await evalIf.getElementStride(virtualNode)).toBe(5);
        expect(await evalIf.getElementStride(sizedNode)).toBe(3);
        expect(await evalIf.getElementStride(missing)).toBe(0);
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('getMemberOffset logs when undefined', async () => {
        const member = new DummyNode('m');
        const { evalIf } = makeEval();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(evalIf.getMemberOffset(new DummyNode('b'), member)).resolves.toBeUndefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('resolveColonPath and getElementRef fall back to undefined', async () => {
        const child = new DummyNode('child');
        const base = new DummyNode('base', { symbolMap: { child } });
        const container: RefContainer = { base, current: base, valueType: undefined };
        const { evalIf } = makeEval();
        await expect(evalIf.resolveColonPath(container, ['a', 'b'])).resolves.toBeUndefined();
        await expect(evalIf.getElementRef(base)).resolves.toBeUndefined();
    });

    it('read/write value wrap host errors', async () => {
        const memHost = {
            readValue: jest.fn(() => { throw new Error('boom'); }),
            writeValue: jest.fn(() => { throw new Error('boom'); })
        } as unknown as MemoryHost;
        const { evalIf } = makeEval(memHost);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const container: RefContainer = { base: new DummyNode('b'), current: new DummyNode('b'), valueType: undefined };
        expect(await evalIf.readValue(container)).toBeUndefined();
        expect(await evalIf.writeValue(container, 1)).toBeUndefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('getSymbolRef/getMemberRef/getValueType resolve through container', async () => {
        const member = new DummyNode('m');
        const base = {
            getSymbol: jest.fn().mockReturnValue(member),
            getMember: jest.fn().mockReturnValue(member),
            getDisplayLabel: () => 'base',
            name: 'base'
        } as unknown as ScvdNode;
        const container: RefContainer = { base, current: base, valueType: undefined };
        const { evalIf } = makeEval();
        expect(await evalIf.getSymbolRef(container, 'm')).toBe(member);
        expect(await evalIf.getMemberRef(container, 'm')).toBe(member);
        expect(await evalIf.getValueType({ ...container, current: new DummyNode('c', { valueType: 'float64' }) })).toBe('float64');
    });

    it('covers scalar normalization, width hints, and special _addr case', async () => {
        const { evalIf } = makeEval();
        const addrNode = new DummyNode('_addr');
        const addrContainer: RefContainer = { base: addrNode, current: addrNode, valueType: undefined };
        const addrInfo = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<unknown> })
            .getScalarInfo(addrContainer);
        expect(addrInfo).toEqual({ kind: 'unknown', bits: 32, widthBytes: 4 });

        const hintContainer: RefContainer = { base: new DummyNode('h', { targetSize: 0 }), current: undefined, widthBytes: 2, valueType: undefined };
        const hintInfo = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; widthBytes?: number; kind: string }> })
            .getScalarInfo(hintContainer);
        expect(hintInfo.bits).toBe(32);
        expect(hintInfo.widthBytes).toBe(2);

        const widen = await (evalIf as unknown as { normalizeScalarType(v: unknown): { kind: string; name?: string; bits?: number } }).normalizeScalarType({ kind: 'int', name: 'custom', bits: 128 });
        expect(widen.bits).toBe(128);
    });

    it('covers scalar info for array types', async () => {
        const arrayNode = new DummyNode('arr', { arraySize: 4, valueType: 'uint8_t' });
        const container: RefContainer = { base: arrayNode, current: arrayNode, valueType: undefined };
        const { evalIf } = makeEval();
        const formatted = await evalIf.formatPrintf('x', 1, container);
        expect(formatted).toBeDefined();
    });

    it('normalizeScalarType and helpers handle undefined and invalid pointers', async () => {
        const { evalIf, debugTarget } = makeEval({ readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) });
        const norm = (evalIf as unknown as { normalizeScalarType(v: unknown): unknown }).normalizeScalarType('  double64 ');
        expect(norm).toEqual({ kind: 'float', name: 'double64', bits: 64 });

        const readBytes = await (evalIf as unknown as { readBytesFromPointer(addr: number, len: number): Promise<Uint8Array | undefined> })
            .readBytesFromPointer(NaN, 4);
        expect(readBytes).toBeUndefined();
        const readOk = await (evalIf as unknown as { readBytesFromPointer(addr: number, len: number): Promise<Uint8Array | undefined> })
            .readBytesFromPointer(0x10, 2);
        expect(readOk).toEqual(new Uint8Array([1, 2, 3]));
        expect(debugTarget.readMemory).toHaveBeenCalled();

        const sym = await (evalIf as unknown as { findSymbolAddressNormalized(name: string | undefined): Promise<number | undefined> })
            .findSymbolAddressNormalized(undefined);
        expect(sym).toBeUndefined();
    });

    it('covers byte width fallback and bit clamping', async () => {
        const { evalIf } = makeEval();
        const wideNode = new DummyNode('wide', { targetSize: 0, valueType: 'uint128_t' });
        const info = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; widthBytes?: number; kind: string }> })
            .getScalarInfo({ base: wideNode, current: wideNode, widthBytes: undefined, valueType: undefined } as unknown as RefContainer);
        expect(info.bits).toBe(8); // regex picks 8 in 128, then clamped logic keeps scalar bits

        jest.spyOn(console, 'error').mockImplementation(() => {});
        const sizedViaHelper = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; widthBytes?: number; kind: string }> })
            .getScalarInfo({ base: new DummyNode('viaHelper'), current: new DummyNode('viaHelper'), valueType: undefined } as unknown as RefContainer);
        expect(sizedViaHelper.bits).toBeDefined();
        (console.error as unknown as jest.Mock).mockRestore();

        const viaByteWidth = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; widthBytes?: number; kind: string }> })
            .getScalarInfo({ base: new DummyNode('viaBW', { targetSize: 0 }), current: new DummyNode('viaBW', { targetSize: 0 }), widthBytes: undefined, valueType: undefined } as unknown as RefContainer);
        expect(viaByteWidth.bits).toBeDefined();
    });

    it('covers member offset success, read/write success, and _count/_addr undefined', async () => {
        const memHost = {
            readValue: jest.fn().mockReturnValue(7),
            writeValue: jest.fn(),
            getArrayElementCount: jest.fn().mockReturnValue(5),
            getElementTargetBase: jest.fn().mockReturnValue(0xabc)
        } as unknown as MemoryHost;
        const { evalIf } = makeEval(memHost);
        const member = new DummyNode('m', { memberOffset: 8 });
        await expect(evalIf.getMemberOffset(new DummyNode('b'), member)).resolves.toBe(8);

        const container: RefContainer = { base: new DummyNode('b'), current: new DummyNode('b'), valueType: undefined };
        expect(await evalIf.readValue(container)).toBe(7);
        expect(await evalIf.writeValue(container, 9)).toBe(9);

        expect(await evalIf._count({ base: new DummyNode(undefined), current: new DummyNode(undefined), valueType: undefined } as unknown as RefContainer)).toBeUndefined();
        expect(await evalIf._addr({ base: new DummyNode(undefined), current: new DummyNode(undefined), valueType: undefined } as unknown as RefContainer)).toBeUndefined();

        const regHost = { read: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(undefined), write: jest.fn() } as unknown as RegisterHost;
        const debugTarget = { readRegister: jest.fn().mockResolvedValue(5) } as unknown as ScvdDebugTarget;
        const { evalIf: evalReg } = makeEval({ ...memHost, ...regHost, ...debugTarget });
        await expect(evalReg.__GetRegVal(' ')).resolves.toBeUndefined();
        await expect(evalReg.__GetRegVal('r1')).resolves.toBe(5);
        const { evalIf: evalSize } = makeEval({ getSymbolSize: jest.fn().mockResolvedValue(undefined), getNumArrayElements: jest.fn().mockResolvedValue(undefined) } as unknown as ScvdDebugTarget);
        await expect(evalSize.__size_of('sym')).resolves.toBeUndefined();
    });

    it('covers formatPrintf fallbacks when addresses are missing', async () => {
        const readUint8ArrayStrFromPointer = jest.fn().mockResolvedValue(undefined);
        const findSymbolNameAtAddress = jest.fn().mockResolvedValue(undefined);
        const debugTarget = { readUint8ArrayStrFromPointer, findSymbolNameAtAddress, readMemory: jest.fn().mockResolvedValue(undefined) } as unknown as ScvdDebugTarget;
        const { evalIf } = makeEval(debugTarget);
        const container: RefContainer = { base: new DummyNode('b'), current: new DummyNode('b'), valueType: undefined };
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(evalIf.formatPrintf('C', 'noaddr' as unknown as number, container)).resolves.toBe('noaddr');
        await expect(evalIf.formatPrintf('S', 'noaddr' as unknown as number, container)).resolves.toBe('noaddr');
        const nOut = await evalIf.formatPrintf('N', 0x9999, container);
        expect(nOut).toBeDefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });

    it('covers formatPrintf data paths (context, enums, IPv4/IPv6, toNumeric)', async () => {
        const symbolMap = new Map<number, string>([[0x2000, 'CTXSYM']]);
        const memoryMap = new Map<number, Uint8Array>([
            [0x10, new Uint8Array([1, 2, 3, 4])],
            [0x20, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])],
            [0x30, new Uint8Array([1, 2, 3, 4, 5, 6])]
        ]);
        const debugTarget = {
            findSymbolContextAtAddress: jest.fn().mockResolvedValue('CTX'),
            findSymbolNameAtAddress: jest.fn().mockImplementation((addr: number) => symbolMap.get(addr)),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(new Uint8Array([65, 0, 0, 0])),
            readMemory: jest.fn(async (addr: number, len: number) => (memoryMap.get(addr)?.subarray(0, len)))
        } as unknown as ScvdDebugTarget;
        const formatterEval = new ScvdEvalInterface({} as MemoryHost, {} as RegisterHost, debugTarget, new ScvdFormatSpecifier());
        const member = new LocalFakeMember();
        const container: RefContainer = { base: member, current: member, valueType: undefined };
        expect(await formatterEval.formatPrintf('C', 0x2000, container)).toBe('CTX');
        expect(await formatterEval.formatPrintf('S', 0x2000, container)).toBe('CTXSYM');
        expect(await formatterEval.formatPrintf('E', 1, container)).toBe('ENUM_READY');
        expect(await formatterEval.formatPrintf('I', 0x10, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('I', new Uint8Array([1, 2, 3, 4]), container)).toBeDefined();
        expect(await formatterEval.formatPrintf('J', 0x20, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('J', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), container)).toBeDefined();
        expect(await formatterEval.formatPrintf('M', 0x30, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('M', new Uint8Array([1, 2, 3, 4, 5, 6]), container)).toBeDefined();
        expect(await formatterEval.formatPrintf('U', 0x9999, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('x', true as unknown as number, container)).toBe('0x1');
        expect(await formatterEval.formatPrintf('x', '7' as unknown as number, container)).toBe('0x7');

        const noContextDebug = {
            findSymbolContextAtAddress: jest.fn().mockResolvedValue(undefined),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue(undefined),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(undefined),
            readMemory: jest.fn().mockResolvedValue(undefined)
        } as unknown as ScvdDebugTarget;
        const formatterEval2 = new ScvdEvalInterface({} as MemoryHost, {} as RegisterHost, noContextDebug, new ScvdFormatSpecifier());
        expect(await formatterEval2.formatPrintf('C', 0x1234, container)).toBe('0x00001234');
    });

    it('covers scalar width via getByteWidth and register read returning undefined', async () => {
        const { evalIf } = makeEval();
        const node = new DummyNode('bw', { targetSize: 0, valueType: 'int' });
        (evalIf as unknown as { getByteWidth(ref: ScvdNode): Promise<number> }).getByteWidth = jest.fn().mockResolvedValue(10);
        const info = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; widthBytes?: number; kind: string }> })
            .getScalarInfo({ base: node, current: node, valueType: undefined } as unknown as RefContainer);
        expect(info.bits).toBe(64); // clamp from 80

        const regHost = { read: jest.fn().mockReturnValue(undefined), write: jest.fn() } as unknown as RegisterHost;
        const debugTarget = { readRegister: jest.fn().mockResolvedValue(undefined) } as unknown as ScvdDebugTarget;
        const { evalIf: evalReg } = makeEval({ ...regHost, ...debugTarget });
        await expect(evalReg.__GetRegVal('r2')).resolves.toBeUndefined();
    });

    it('covers default scalar bits, toNumeric branches, and formatPrintf fallbacks', async () => {
        const { evalIf } = makeEval();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const scalarInfo = await (evalIf as unknown as { getScalarInfo(c: RefContainer): Promise<{ bits?: number; kind: string }> })
            .getScalarInfo({ base: new DummyNode('plain', { valueType: 'int' }), current: new DummyNode('plain', { valueType: 'int' }), valueType: undefined } as unknown as RefContainer);
        expect(scalarInfo.bits).toBe(32);

        const dbg = {
            readMemory: jest.fn().mockResolvedValue(undefined),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
            findSymbolContextAtAddress: jest.fn().mockResolvedValue(undefined),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue(undefined)
        } as unknown as ScvdDebugTarget;
        const formatterEval = new ScvdEvalInterface({} as MemoryHost, {} as RegisterHost, dbg, new ScvdFormatSpecifier());
        const container: RefContainer = { base: new DummyNode('b'), current: new DummyNode('b'), valueType: undefined };
        expect(await formatterEval.formatPrintf('x', BigInt(5) as unknown as number, container)).toBe('0x5');
        expect(await formatterEval.formatPrintf('x', ({}) as unknown as number, container)).toBe('NaN');
        expect(await formatterEval.formatPrintf('I', 0x1, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('I', 'text' as unknown as number, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('J', 0x1, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('J', 'text' as unknown as number, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('N', 0x1, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('M', 'str' as unknown as number, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('U', 'str' as unknown as number, container)).toBeDefined();
        expect(await formatterEval.formatPrintf('Z' as unknown as FormatSegment['spec'], 1, container)).toBeDefined();
        (console.error as unknown as jest.Mock).mockRestore();
    });
});
