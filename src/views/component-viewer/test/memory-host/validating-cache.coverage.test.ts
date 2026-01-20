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
 * Coverage for ValidatingCache.
 */
// generated with AI

import { ValidatingCache } from '../../data-host/validating-cache';

describe('ValidatingCache coverage', () => {
    it('normalizes keys on get/set and respects valid flags', () => {
        const normalize = jest.fn((key: string) => key.trim().toLowerCase());
        const cache = new ValidatingCache<number>(normalize);

        cache.set('  A  ', 1);
        cache.set('  B  ', 2, false);

        expect(cache.get('a')).toBe(1);
        expect(cache.get('b')).toBeUndefined();
        expect(normalize).toHaveBeenCalled();
    });

    it('returns undefined for empty keys', () => {
        const cache = new ValidatingCache<number>();

        cache.set('', 1);
        expect(cache.get('')).toBeUndefined();
        expect(cache.delete('')).toBe(false);
    });

    it('ensures a value with a factory and reuses existing entries', () => {
        const cache = new ValidatingCache<string>();
        const factory = jest.fn(() => 'value');

        expect(cache.ensure('key', factory)).toBe('value');
        expect(cache.ensure('key', () => 'new')).toBe('value');
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('invalidates entries and supports bulk invalidation', () => {
        const cache = new ValidatingCache<number>();
        cache.set('one', 1);
        cache.set('two', 2);

        cache.invalidate('');
        cache.invalidate('missing');
        cache.invalidate('one');
        expect(cache.get('one')).toBeUndefined();
        expect(cache.get('two')).toBe(2);

        cache.invalidateAll();
        expect(cache.get('two')).toBeUndefined();
    });

    it('clears and deletes keys', () => {
        const cache = new ValidatingCache<number>();
        cache.set('one', 1);
        cache.set('two', 2);

        expect(cache.delete('two')).toBe(true);
        expect(cache.delete('missing')).toBe(false);

        cache.clear();
        expect(cache.get('one')).toBeUndefined();
    });
});
