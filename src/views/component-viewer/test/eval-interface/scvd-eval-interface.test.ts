import { ScvdEvalInterface } from '../../scvd-eval-interface';
import { MemoryHost } from '../../memory-host/memory-host';
import { RegisterHost } from '../../memory-host/register-host';
import { ScvdFormatSpecifier } from '../../model/scvd-format-specifier';
import { ScvdDebugTarget } from '../../scvd-debug-target';
import { RefContainer } from '../../evaluator';
import { ScvdBase } from '../../model/scvd-base';

const makeStubBase = (name: string): ScvdBase => ({
    name,
    getSymbol: jest.fn(),
    getMember: jest.fn(),
    getDisplayLabel: jest.fn().mockReturnValue(name),
} as unknown as ScvdBase);

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
            getNumArrayElements: jest.fn().mockReturnValue(3),
            getTargetIsRunning: jest.fn().mockResolvedValue(true),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(new Uint8Array([65, 66])),
        } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        expect(await host.__FindSymbol('foo')).toBe(0x1234);
        expect(await host.__GetRegVal('r0')).toBe(7);
        expect(await host.__Symbol_exists('foo')).toBe(1);
        expect(host.__CalcMemUsed(1, 2, 3, 4)).toBe(0xabcd);
        expect(host.__size_of('arr')).toBe(3);
        expect(await host.__Running()).toBe(1);
    });

    it('formats printf values and falls back to string', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as unknown as RegisterHost;
        const debugTarget = {
            findSymbolAddress: jest.fn(),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue('sym'),
            getNumArrayElements: jest.fn(),
            getTargetIsRunning: jest.fn(),
            readUint8ArrayStrFromPointer: jest.fn(),
        } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('v', 4);

        expect(await host.formatPrintf('d', 42, container)).toBe('42');
        expect(await host.formatPrintf('S', 0x1000, container)).toBe('sym');
        expect(await host.formatPrintf('?', true as unknown as number, container)).toBe('true');
    });

    it('readValue/writeValue interop with cache', () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as unknown as RegisterHost;
        const debugTarget = { getNumArrayElements: jest.fn() } as unknown as ScvdDebugTarget;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('num', 4);
        host.writeValue(container, 0xdeadbeef);
        expect(host.readValue(container)).toBe(0xdeadbeef >>> 0);
    });
});
