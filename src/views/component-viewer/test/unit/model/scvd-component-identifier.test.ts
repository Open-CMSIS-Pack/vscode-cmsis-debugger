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
 * Unit test for ScvdComponentIdentifier.
 */

import { ScvdComponentIdentifier } from '../../../model/scvd-component-identifier';
import { Json } from '../../../model/scvd-base';

describe('ScvdComponentIdentifier', () => {
    it('returns false when XML is undefined', () => {
        const identifier = new ScvdComponentIdentifier(undefined);
        expect(identifier.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads version and shortname fields from XML', () => {
        const identifier = new ScvdComponentIdentifier(undefined);
        const xml = { version: '1.2.3', shortname: 'Comp' };
        expect(identifier.readXml(xml)).toBe(true);
        expect(identifier.version).toBe('1.2.3');
        expect(identifier.shortName).toBe('Comp');
    });

    it('tracks version and short name values', () => {
        const identifier = new ScvdComponentIdentifier(undefined);
        identifier.version = '2.0';
        identifier.shortName = 'New';
        expect(identifier.version).toBe('2.0');
        expect(identifier.shortName).toBe('New');
    });
});
