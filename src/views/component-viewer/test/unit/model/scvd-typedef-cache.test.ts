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

import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { ScvdObjects } from '../../../model/scvd-object';
import { ScvdMember } from '../../../model/scvd-member';
import { ScvdVar } from '../../../model/scvd-var';
import { ScvdTypedefFieldCache } from '../../../model/scvd-typedef-cache';

describe('ScvdTypedefFieldCache', () => {
    const createRoot = () => {
        const viewer = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(viewer);
        return objects.addObject();
    };

    it('rebuilds and clears cached fields', () => {
        const cache = new ScvdTypedefFieldCache();
        const root = createRoot();
        const member = new ScvdMember(root);
        member.name = 'm1';
        const unnamedMember = new ScvdMember(root);
        const variable = new ScvdVar(root);
        variable.name = 'v1';

        cache.rebuild([member, unnamedMember], [variable]);
        expect(cache.get('m1')).toBe(member);
        expect(cache.get('v1')).toBe(variable);
        expect(cache.get('missing')).toBeUndefined();

        cache.clear();
        expect(cache.get('m1')).toBeUndefined();
    });
});
