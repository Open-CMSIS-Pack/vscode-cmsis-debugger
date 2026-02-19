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

/**
 * Unit test for ScvdGroup.
 */

import { ScvdComponent } from '../../../model/scvd-component';
import { ScvdGroup } from '../../../model/scvd-group';
import { Json } from '../../../model/scvd-base';

describe('ScvdGroup', () => {
    it('returns false when XML is undefined', () => {
        const group = new ScvdGroup(undefined);
        expect(group.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads components from XML', () => {
        const group = new ScvdGroup(undefined);
        const readSpy = jest.spyOn(ScvdComponent.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            component: [{ name: 'c1' }, { name: 'c2' }]
        };

        expect(group.readXml(xml)).toBe(true);
        expect(group.components).toHaveLength(2);
        expect(readSpy).toHaveBeenCalledTimes(2);

        readSpy.mockRestore();
    });

    it('adds components directly', () => {
        const group = new ScvdGroup(undefined);
        const component = group.addComponent();

        expect(group.components).toEqual([component]);
    });
});
