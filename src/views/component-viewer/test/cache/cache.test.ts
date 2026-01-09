import { CachedMemoryHost } from '../../cache/cache';

describe('CachedMemoryHost', () => {
    it('stores and retrieves numeric values with explicit offsets', () => {
        const host = new CachedMemoryHost();

        host.setVariable('foo', 4, 0x12345678, 0);
        expect(host.getVariable('foo')).toBe(0x12345678);

        host.setVariable('foo', 2, 0xabcd, 4);
        expect(host.getVariable('foo', 2, 4)).toBe(0xabcd);
    });

    it('appends when offset is -1 and tracks element count', () => {
        const host = new CachedMemoryHost();
        host.setVariable('arr', 4, 1, -1);
        host.setVariable('arr', 4, 2, -1);
        host.setVariable('arr', 4, 3, -1);

        expect(host.getArrayElementCount('arr')).toBe(3);
        expect(host.getVariable('arr', 4, 0)).toBe(1);
        expect(host.getVariable('arr', 4, 4)).toBe(2);
        expect(host.getVariable('arr', 4, 8)).toBe(3);
    });

    it('rejects spans larger than 4 bytes via getVariable', () => {
        const host = new CachedMemoryHost();
        host.setVariable('big', 8, new Uint8Array(8), 0);
        expect(host.getVariable('big', 8, 0)).toBeUndefined();
    });

    it('tracks target bases and allows updating them', () => {
        const host = new CachedMemoryHost();
        host.setVariable('sym', 4, 1, -1, 0x1000);
        host.setVariable('sym', 4, 2, -1, 0x2000);

        expect(host.getElementTargetBase('sym', 0)).toBe(0x1000);
        expect(host.getElementTargetBase('sym', 1)).toBe(0x2000);

        host.setElementTargetBase('sym', 1, 0x3000);
        expect(host.getElementTargetBase('sym', 1)).toBe(0x3000);
    });

    it('supports readValue/writeValue round-trips for numbers', () => {
        const host = new CachedMemoryHost();
        const container = {
            base: {} as any,
            anchor: { name: 'num' } as any,
            offsetBytes: 0,
            widthBytes: 4,
            valueType: undefined,
        };

        host.writeValue(container, 0xdeadbeef);
        const out = host.readValue(container);
        expect(out).toBe(0xdeadbeef >>> 0);
    });

    it('supports readValue/writeValue for byte arrays', () => {
        const host = new CachedMemoryHost();
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const container = {
            base: {} as any,
            anchor: { name: 'blob' } as any,
            offsetBytes: 0,
            widthBytes: bytes.length,
            valueType: undefined,
        };

        host.writeValue(container, bytes);
        const out = host.readValue(container);
        expect(out).toEqual(bytes);
    });
});
