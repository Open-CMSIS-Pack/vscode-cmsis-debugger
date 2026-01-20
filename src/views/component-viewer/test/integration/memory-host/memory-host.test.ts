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
 * Integration test for MemoryHost.
 */
// generated with AI

import { MemoryHost } from '../../../data-host/memory-host';
import { RefContainer } from '../../../parser-evaluator/model-host';
import { ScvdNode } from '../../../model/scvd-node';

class NamedStubBase extends ScvdNode {
    constructor(name: string) {
        super(undefined);
        this.name = name;
    }
}

const makeContainer = (name: string, widthBytes: number, offsetBytes = 0): RefContainer => {
    const ref = new NamedStubBase(name);
    return {
        base: ref,
        anchor: ref,
        current: ref,
        offsetBytes,
        widthBytes,
        valueType: undefined,
    };
};

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

    it('supports readValue/writeValue round-trips for numbers', async () => {
        const host = new MemoryHost();
        const container = makeContainer('num', 4);

        await host.writeValue(container, 0xdeadbeef);
        const out = await host.readValue(container);
        expect(out).toBe(0xdeadbeef >>> 0);
    });

    it('supports readValue/writeValue for byte arrays', async () => {
        const host = new MemoryHost();
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const container = makeContainer('blob', bytes.length);

        await host.writeValue(container, bytes);
        const out = await host.readValue(container);
        expect(out).toEqual(bytes);
    });

    it('writes and reads raw bytes at offsets', async () => {
        const host = new MemoryHost();
        const container = makeContainer('raw', 4, 2);

        await host.writeValue(container, new Uint8Array([9, 8, 7, 6]));
        const out = await host.readRaw(container, 4);

        expect(out).toEqual(new Uint8Array([9, 8, 7, 6]));
    });

    it('round-trips via setVariable/getVariable for a simple read', () => {
        const host = new MemoryHost();
        host.setVariable('simple', 2, 0x1234, 0);

        expect(host.getVariable('simple')).toBe(0x1234);
    });

    it('preserves untouched bytes on partial overwrites', async () => {
        const host = new MemoryHost();
        const base = makeContainer('overlap', 4, 0);
        const tail = makeContainer('overlap', 2, 2);

        await host.writeValue(base, new Uint8Array([1, 2, 3, 4]));
        await host.writeValue(tail, new Uint8Array([9, 8]));

        const out = await host.readRaw(base, 4);
        expect(out).toEqual(new Uint8Array([1, 2, 9, 8]));
    });

    it('partial setVariable writes only affect the specified range', () => {
        const host = new MemoryHost();

        host.setVariable('window', 4, new Uint8Array([1, 2, 3, 4]), 0);
        host.setVariable('window', 2, new Uint8Array([9, 8]), 2);

        expect(host.getVariable('window', 2, 0)).toBe(0x0201);
        expect(host.getVariable('window', 2, 2)).toBe(0x0809);
    });

    it('zero-fills virtual size and supports writes into virtual space', async () => {
        const host = new MemoryHost();

        host.setVariable('struct', 2, new Uint8Array([0xAA, 0xBB]), 0, undefined, 6);

        const base = makeContainer('struct', 2, 0);
        const mid = makeContainer('struct', 2, 2);
        const tail = makeContainer('struct', 2, 4);

        expect(await host.readRaw(base, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(await host.readRaw(mid, 2)).toEqual(new Uint8Array([0x00, 0x00]));
        expect(await host.readRaw(tail, 2)).toEqual(new Uint8Array([0x00, 0x00]));

        await host.writeValue(mid, new Uint8Array([0x11, 0x22]));

        expect(await host.readRaw(base, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(await host.readRaw(mid, 2)).toEqual(new Uint8Array([0x11, 0x22]));
        expect(await host.readRaw(tail, 2)).toEqual(new Uint8Array([0x00, 0x00]));

        await host.writeValue(tail, new Uint8Array([0x33, 0x44]));

        expect(await host.readRaw(base, 2)).toEqual(new Uint8Array([0xAA, 0xBB]));
        expect(await host.readRaw(mid, 2)).toEqual(new Uint8Array([0x11, 0x22]));
        expect(await host.readRaw(tail, 2)).toEqual(new Uint8Array([0x33, 0x44]));
    });

    it('expands the backing buffer when writing beyond current size', async () => {
        const host = new MemoryHost();
        const head = makeContainer('grow', 2, 0);
        const tail = makeContainer('grow', 2, 6);

        await host.writeValue(head, new Uint8Array([1, 2]));
        await host.writeValue(tail, new Uint8Array([9, 8]));

        expect(await host.readRaw(head, 2)).toEqual(new Uint8Array([1, 2]));
        expect(await host.readRaw(tail, 2)).toEqual(new Uint8Array([9, 8]));
    });

    it('appends when offset is -1 and later writes can expand via the interface', async () => {
        const host = new MemoryHost();

        host.setVariable('arr', 2, new Uint8Array([1, 2]), -1);
        host.setVariable('arr', 2, new Uint8Array([3, 4]), -1);

        const appended = makeContainer('arr', 2, 4);
        await host.writeValue(appended, new Uint8Array([5, 6]));

        expect(host.getArrayElementCount('arr')).toBe(2);
        expect(await host.readRaw(makeContainer('arr', 2, 0), 2)).toEqual(new Uint8Array([1, 2]));
        expect(await host.readRaw(makeContainer('arr', 2, 2), 2)).toEqual(new Uint8Array([3, 4]));
        expect(await host.readRaw(makeContainer('arr', 2, 4), 2)).toEqual(new Uint8Array([5, 6]));
    });
});
