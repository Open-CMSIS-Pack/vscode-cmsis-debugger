/**
 * Unit tests for ScvdEvalInterface.formatPrintf based on the CMSIS-View
 * value_output specification: https://arm-software.github.io/CMSIS-View/main/value_output.html
 */

import { ScvdEvalInterface } from '../../scvd-eval-interface';
import { ScvdFormatSpecifier } from '../../model/scvd-format-specifier';
import { RefContainer } from '../../evaluator';
import { MemoryHost } from '../../data-host/memory-host';
import { RegisterHost } from '../../data-host/register-host';
import { ScvdBase } from '../../model/scvd-base';
import { ScvdMember } from '../../model/scvd-member';
import { ScvdDebugTarget } from '../../scvd-debug-target';

class FakeBase extends ScvdBase {
    constructor(typeName?: string) {
        super(undefined);
        this._typeName = typeName;
    }

    private _typeName: string | undefined;

    public override getValueType(): string | undefined {
        return this._typeName;
    }

    public override getIsPointer(): boolean {
        return false;
    }

    public override getTargetSize(): number | undefined {
        return 4;
    }

    public override getTypeSize(): number | undefined {
        return 4;
    }
}

class FakeMember extends ScvdMember {
    constructor() {
        super(undefined);
    }

    public override async getEnum(_value: number) {
        return {
            getGuiName: async () => 'ENUM_READY'
        } as unknown as Awaited<ReturnType<ScvdMember['getEnum']>>;
    }
}

class FakeDebugTarget implements Pick<ScvdDebugTarget,
    'findSymbolNameAtAddress' | 'findSymbolContextAtAddress' | 'readUint8ArrayStrFromPointer' | 'readMemory'> {
    constructor(
        private readonly symbolMap: Map<number, string>,
        private readonly memoryMap: Map<number, Uint8Array>
    ) {}

    public async findSymbolContextAtAddress(_addr: number): Promise<string | undefined> {
        return undefined;
    }

    public async findSymbolNameAtAddress(addr: number): Promise<string | undefined> {
        return this.symbolMap.get(addr);
    }

    public async readUint8ArrayStrFromPointer(address: number, _bytesPerChar: number, maxLength: number): Promise<Uint8Array | undefined> {
        const data = this.memoryMap.get(address);
        if (!data) {
            return undefined;
        }
        return data.subarray(0, Math.min(maxLength, data.length));
    }

    public async readMemory(address: number, size: number): Promise<Uint8Array | undefined> {
        const data = this.memoryMap.get(address);
        if (!data) {
            return undefined;
        }
        return data.subarray(0, Math.min(size, data.length));
    }
}

function makeContainer(typeName?: string, current?: ScvdBase): RefContainer {
    const base = current ?? new FakeBase(typeName);
    return {
        base,
        current: base,
        valueType: undefined
    };
}

function makeEvalInterface(symbolMap: Map<number, string>, memoryMap: Map<number, Uint8Array>) {
    const memHost = {} as unknown as MemoryHost;
    const regHost = {} as unknown as RegisterHost;
    const debugTarget = new FakeDebugTarget(symbolMap, memoryMap) as unknown as ScvdDebugTarget;
    const formatter = new ScvdFormatSpecifier();
    return new ScvdEvalInterface(memHost, regHost, debugTarget, formatter);
}

describe('ScvdEvalInterface.formatPrintf (CMSIS-View value_output)', () => {
    const symbolMap = new Map<number, string>([
        [0x1000, 'MySym']
    ]);
    const memoryMap = new Map<number, Uint8Array>([
        [0x10, new Uint8Array([192, 168, 0, 1])],                                              // IPv4
        [0x20, new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x13])], // IPv6
        [0x30, new Uint8Array([0x1E, 0x30, 0x6C, 0xA2, 0x45, 0x5F])],                           // MAC
        [0x40, new Uint8Array([0x4E, 0x61, 0x6D, 0x65, 0x00])],                                 // "Name\0"
        [0x50, new Uint8Array([0x55, 0x00, 0x53, 0x00, 0x42, 0x00, 0x00, 0x00])]                // "USB" wide
    ]);

    const scvd = makeEvalInterface(symbolMap, memoryMap);

    it('formats %d (signed decimal)', async () => {
        const out = await scvd.formatPrintf('d', 42, makeContainer('int32_t'));
        expect(out).toBe('42');
    });

    it('formats %u (unsigned decimal)', async () => {
        const out = await scvd.formatPrintf('u', -1, makeContainer('uint32_t'));
        expect(out).toBe('4294967295');
    });

    it('formats %x (hex)', async () => {
        const out = await scvd.formatPrintf('x', 0x1a, makeContainer('uint32_t'));
        expect(out).toBe('0x0000001a');
    });

    it('formats %t (text from literal)', async () => {
        const out = await scvd.formatPrintf('t', 'Status OK', makeContainer());
        expect(out).toBe('Status OK');
    });

    it('formats %C as symbol name when available', async () => {
        const out = await scvd.formatPrintf('C', 0x1000, makeContainer());
        expect(out).toBe('MySym');
    });

    it('formats %S as symbol name when available', async () => {
        const out = await scvd.formatPrintf('S', 0x1000, makeContainer());
        expect(out).toBe('MySym');
    });

    it('formats %E using enum text', async () => {
        const member = new FakeMember();
        const container: RefContainer = { base: member, current: member, valueType: undefined };
        const out = await scvd.formatPrintf('E', 2, container);
        expect(out).toBe('ENUM_READY');
    });

    it('formats %I (IPv4) from memory bytes', async () => {
        const out = await scvd.formatPrintf('I', 0x10, makeContainer());
        expect(out).toBe('192.168.0.1');
    });

    it('formats %J (IPv6) from memory bytes', async () => {
        const out = await scvd.formatPrintf('J', 0x20, makeContainer());
        expect(out).toBe('2001:db8::13');
    });

    it('formats %M (MAC) from memory bytes', async () => {
        const out = await scvd.formatPrintf('M', 0x30, makeContainer());
        expect(out).toBe('1E-30-6C-A2-45-5F');
    });

    it('formats %N (string address)', async () => {
        const out = await scvd.formatPrintf('N', 0x40, makeContainer());
        expect(out).toBe('Name');
    });

    it('formats %T using type info (float)', async () => {
        const out = await scvd.formatPrintf('T', 3.14159, makeContainer('float'));
        expect(out).toBe('3.142');
    });

    it('formats %U (wide string)', async () => {
        const out = await scvd.formatPrintf('U', 0x50, makeContainer());
        expect(out).toBe('USB');
    });

    it('formats %% literal percent', async () => {
        const out = await scvd.formatPrintf('%', 'ignored', makeContainer());
        expect(out).toBe('%');
    });

    it('returns placeholder for unknown spec', async () => {
        const out = await scvd.formatPrintf('Z', 123, makeContainer());
        expect(out).toBe('<unknown format specifier %Z>');
    });

    it('uses default 32-bit padding for array-like containers', async () => {
        // Simulate an array container by returning a large array size
        const arrayLike = new FakeBase('uint8_t');
        arrayLike.getArraySize = async () => 16;
        const out = await scvd.formatPrintf('x', 0xAB, makeContainer(undefined, arrayLike));
        expect(out).toBe('0x000000ab');
    });

    it('forces 32-bit padding for _addr members', async () => {
        const addrLike = new FakeBase('uint8_t');
        addrLike.name = '_addr';
        // even with odd target size, padding should be 32-bit
        addrLike.getTargetSize = () => 1;
        const out = await scvd.formatPrintf('x', 0x1, makeContainer(undefined, addrLike));
        expect(out).toBe('0x00000001');
    });
});
