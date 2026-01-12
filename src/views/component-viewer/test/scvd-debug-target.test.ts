import { ScvdDebugTarget } from '../scvd-debug-target';

function makeStackImage(totalBytes: number, fillPattern: number, magicValue: number, usedBytes: number): Uint8Array {
    const data = new Uint8Array(totalBytes);
    const fill = new Uint8Array([
        fillPattern & 0xFF,
        (fillPattern >>> 8) & 0xFF,
        (fillPattern >>> 16) & 0xFF,
        (fillPattern >>> 24) & 0xFF,
    ]);
    for (let i = 0; i < totalBytes; i++) {
        data[i] = fill[i % 4];
    }

    // Mark some bytes as used (overwrite with non-pattern)
    for (let i = 0; i < usedBytes; i++) {
        data[i] = 0xaa;
    }

    // Place magic value at the end (little endian)
    const magicStart = totalBytes - 4;
    data[magicStart + 0] = magicValue & 0xFF;
    data[magicStart + 1] = (magicValue >>> 8) & 0xFF;
    data[magicStart + 2] = (magicValue >>> 16) & 0xFF;
    data[magicStart + 3] = (magicValue >>> 24) & 0xFF;
    return data;
}

describe('ScvdDebugTarget.calculateMemoryUsage', () => {
    it('computes stack usage and overflow flags for real-world patterns', () => {
        const stackSize = 0x100;
        const fillPattern = 0xCCCCCCCC;
        const magicValue = 0xE25A2EA5;
        const usedBytes = 0x40; // simulate first 64 bytes overwritten

        const target = new ScvdDebugTarget();
        const image = makeStackImage(stackSize, fillPattern, magicValue, usedBytes);

        // Replace the mock memory data provider with our fixture
        (target as unknown as { mock: { getMockMemoryData: (addr: number, size: number) => Uint8Array | undefined } }).mock = {
            getMockMemoryData: (_addr: number, size: number) => image.slice(0, size),
        };

        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expectedUsedPercent = Math.floor((usedBytes / stackSize) * 100) & 0x1ff; // 25
        const expected =
            (usedBytes & 0xfffff) | // bits 0..19
            (expectedUsedPercent << 20) | // bits 20..28
            (1 << 31); // overflow bit set because magic is intact

        expect(result).toBe(expected);
    });
});
