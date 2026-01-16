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
 * Coverage for ScvdTypesCache creation and lookup paths.
 */

import { ScvdTypesCache } from '../scvd-types-cache';
import { ScvdComponentViewer } from '../model/scvd-component-viewer';
import { ScvdTypedefs, ScvdTypedef } from '../model/scvd-typedef';
import { ScvdNode } from '../model/scvd-node';

describe('ScvdTypesCache', () => {
    it('returns undefined when no model or typedefs are present', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const cache = new ScvdTypesCache(viewer);

        cache.createCache(); // with no typedefs set, should no-op
        expect(cache.findTypeByName('missing')).toBeUndefined();

        // Simulate model cleared after construction
        (cache as unknown as { _model?: ScvdComponentViewer })._model = undefined;
        cache.createCache();
        expect(cache.findTypeByName('anything')).toBeUndefined();
    });

    it('caches only ScvdTypedef entries and resolves by name', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const typedefs = new ScvdTypedefs(viewer);
        const good = typedefs.addTypedef();
        good.name = 'GoodType';
        // Insert a non-typedef child to ensure it is skipped
        new ScvdNode(typedefs);
        (viewer as unknown as { _typedefs?: ScvdTypedefs })._typedefs = typedefs;

        const cache = new ScvdTypesCache(viewer);
        cache.createCache();
        expect(cache.findTypeByName('GoodType')).toBe(good);
        expect(cache.findTypeByName('Missing')).toBeUndefined();
    });

    it('findTypeByName ignores non-typedef values in the map', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const cache = new ScvdTypesCache(viewer);
        (cache as unknown as { typesCache: Map<string, ScvdNode> }).typesCache = new Map<string, ScvdNode>([
            ['bad', new ScvdNode(undefined)],
        ]);
        expect(cache.findTypeByName('bad')).toBeUndefined();

        // If the internal map is missing entirely, bail out gracefully
        (cache as unknown as { typesCache?: Map<string, ScvdNode> }).typesCache = undefined;
        expect(cache.findTypeByName('anything')).toBeUndefined();
    });
});
