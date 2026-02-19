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

import { SymbolCaches } from '../../scvd-debug-target-cache';

describe('SymbolCaches', () => {
    it('caches computed values and trims keys', async () => {
        const caches = new SymbolCaches();
        const compute = jest.fn(async (name: string) => (name === 'foo' ? 123 : undefined));

        await expect(caches.getAddress(' foo ', compute)).resolves.toBe(123);
        await expect(caches.getAddress('foo', compute)).resolves.toBe(123);
        expect(compute).toHaveBeenCalledTimes(1);

        await expect(caches.getSize(' foo ', async () => 4)).resolves.toBe(4);
        await expect(caches.getArrayCount(' foo ', async () => 2)).resolves.toBe(2);
    });

    it('returns cached address with name', async () => {
        const caches = new SymbolCaches();
        const compute = jest.fn(async () => 99);

        const first = await caches.getAddressWithName(' bar ', compute);
        expect(first).toEqual({ name: 'bar', value: 99 });

        const second = await caches.getAddressWithName('bar', compute);
        expect(second).toEqual({ name: 'bar', value: 99 });
        expect(compute).toHaveBeenCalledTimes(1);
    });

    it('clears caches', async () => {
        const caches = new SymbolCaches();
        await caches.getAddress('foo', async () => 1);
        await caches.getSize('foo', async () => 2);
        await caches.getArrayCount('foo', async () => 3);
        caches.clearAll();

        await expect(caches.getAddress('foo', async () => 4)).resolves.toBe(4);
        await expect(caches.getSize('foo', async () => 5)).resolves.toBe(5);
        await expect(caches.getArrayCount('foo', async () => 6)).resolves.toBe(6);
    });
});
