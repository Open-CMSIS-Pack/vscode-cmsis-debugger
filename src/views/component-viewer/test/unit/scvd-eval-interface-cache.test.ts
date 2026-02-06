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

import { ScvdEvalInterfaceCache } from '../../scvd-eval-interface-cache';
import { ScvdComponentViewer } from '../../model/scvd-component-viewer';
import { ScvdObjects } from '../../model/scvd-object';

describe('ScvdEvalInterfaceCache', () => {
    const createNode = () => {
        const viewer = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(viewer);
        return objects.addObject();
    };

    it('caches printf values', () => {
        const cache = new ScvdEvalInterfaceCache();
        expect(cache.getPrintf('k')).toBeUndefined();
        cache.setPrintf('k', 'v');
        expect(cache.getPrintf('k')).toBe('v');
        cache.clearPrintf();
        expect(cache.getPrintf('k')).toBeUndefined();
    });

    it('caches symbol and member refs with lazy maps', () => {
        const cache = new ScvdEvalInterfaceCache();
        const base = createNode();
        const sym = createNode();
        const member = createNode();

        expect(cache.hasSymbolRef(base, 'x')).toBe(false);
        cache.setSymbolRef(base, 'x', sym);
        expect(cache.hasSymbolRef(base, 'x')).toBe(true);
        expect(cache.getSymbolRef(base, 'x')).toBe(sym);

        expect(cache.hasMemberRef(base, 'y')).toBe(false);
        cache.setMemberRef(base, 'y', member);
        expect(cache.hasMemberRef(base, 'y')).toBe(true);
        expect(cache.getMemberRef(base, 'y')).toBe(member);
    });

    it('tracks byte widths and member offsets and clears all', () => {
        const cache = new ScvdEvalInterfaceCache();
        const node = createNode();

        expect(cache.hasByteWidth(node)).toBe(false);
        cache.setByteWidth(node, 4);
        expect(cache.getByteWidth(node)).toBe(4);
        expect(cache.hasByteWidth(node)).toBe(true);

        expect(cache.hasMemberOffset(node)).toBe(false);
        cache.setMemberOffset(node, 12);
        expect(cache.getMemberOffset(node)).toBe(12);
        expect(cache.hasMemberOffset(node)).toBe(true);

        cache.clearAll();
        expect(cache.getByteWidth(node)).toBeUndefined();
        expect(cache.getMemberOffset(node)).toBeUndefined();
    });
});
