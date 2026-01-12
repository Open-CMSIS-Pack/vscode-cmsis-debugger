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

import { MemoryHost } from '../../data-host/memory-host';

describe('MemoryHost', () => {
    it('stores and retrieves numeric values with explicit offsets', () => {
        const host = new MemoryHost();

        host.setVariable('foo', 4, 0x12345678, 0);
        expect(host.getVariable('foo')).toBe(0x12345678);

        host.setVariable('foo', 2, 0xabcd, 4);
        expect(host.getVariable('foo', 2, 4)).toBe(0xabcd);
    });

    it('appends when offset is -1 and tracks element count', () => {
        const host = new MemoryHost();
        host.setVariable('arr', 4, 1, -1);
        host.setVariable('arr', 4, 2, -1);
        host.setVariable('arr', 4, 3, -1);

        expect(host.getArrayElementCount('arr')).toBe(3);
        expect(host.getVariable('arr', 4, 0)).toBe(1);
        expect(host.getVariable('arr', 4, 4)).toBe(2);
        expect(host.getVariable('arr', 4, 8)).toBe(3);
    });

    it('rejects spans larger than 4 bytes via getVariable', () => {
        const host = new MemoryHost();
        host.setVariable('big', 8, new Uint8Array(8), 0);
        expect(host.getVariable('big', 8, 0)).toBeUndefined();
    });

    it('tracks target bases and allows updating them', () => {
        const host = new MemoryHost();
        host.setVariable('sym', 4, 1, -1, 0x1000);
        host.setVariable('sym', 4, 2, -1, 0x2000);

        expect(host.getElementTargetBase('sym', 0)).toBe(0x1000);
        expect(host.getElementTargetBase('sym', 1)).toBe(0x2000);

        host.setElementTargetBase('sym', 1, 0x3000);
        expect(host.getElementTargetBase('sym', 1)).toBe(0x3000);
    });

    it('supports readValue/writeValue round-trips for numbers', () => {
        const host = new MemoryHost();
        const container = {
            base: { name: 'num', getDisplayLabel: () => 'num' } as unknown as any,
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
        const host = new MemoryHost();
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const container = {
            base: { name: 'blob', getDisplayLabel: () => 'blob' } as unknown as any,
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
