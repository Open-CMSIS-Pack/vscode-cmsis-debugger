import { ScvdEvalInterface } from '../../scvd-eval-interface';
import { MemoryHost } from '../../memory-host/memory-host';
import { ScvdFormatSpecifier } from '../../model/scvd-format-specifier';

const makeContainer = (name: string, widthBytes: number, offsetBytes = 0) => ({
    base: {} as any,
    anchor: { name } as any,
    current: {} as any,
    offsetBytes,
    widthBytes,
    valueType: undefined,
});

describe('ScvdEvalInterface', () => {
    it('routes intrinsic calls to debugTarget/registers/memHost', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn().mockReturnValue(7) } as any;
        const debugTarget = {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1234),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue('sym'),
            calculateMemoryUsage: jest.fn().mockReturnValue(0xabcd),
            getNumArrayElements: jest.fn().mockReturnValue(3),
            getTargetIsRunning: jest.fn().mockResolvedValue(true),
            readUint8ArrayStrFromPointer: jest.fn().mockResolvedValue(new Uint8Array([65, 66])),
        } as any;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        expect(await host.__FindSymbol('foo')).toBe(0x1234);
        expect(host.__GetRegVal('r0')).toBe(7);
        expect(await host.__Symbol_exists('foo')).toBe(1);
        expect(host.__CalcMemUsed(1, 2, 3, 4)).toBe(0xabcd);
        expect(host.__size_of('arr')).toBe(3);
        expect(await host.__Running()).toBe(1);
    });

    it('formats printf values and falls back to string', async () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as any;
        const debugTarget = {
            findSymbolAddress: jest.fn(),
            findSymbolNameAtAddress: jest.fn().mockResolvedValue('sym'),
            getNumArrayElements: jest.fn(),
            getTargetIsRunning: jest.fn(),
            readUint8ArrayStrFromPointer: jest.fn(),
        } as any;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('v', 4);

        expect(await host.formatPrintf('d', 42, container as any)).toBe('42');
        expect(await host.formatPrintf('S', 0x1000, container as any)).toBe('sym');
        expect(await host.formatPrintf('?', true as any, container as any)).toBe('true');
    });

    it('readValue/writeValue interop with cache', () => {
        const memHost = new MemoryHost();
        const regCache = { read: jest.fn() } as any;
        const debugTarget = { getNumArrayElements: jest.fn() } as any;
        const fmt = new ScvdFormatSpecifier();
        const host = new ScvdEvalInterface(memHost, regCache, debugTarget, fmt);

        const container = makeContainer('num', 4);
        host.writeValue(container as any, 0xdeadbeef);
        expect(host.readValue(container as any)).toBe(0xdeadbeef >>> 0);
    });
});
