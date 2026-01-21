/**
 * Copyright 2025-2026 Arm Limited
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
 * Unit test for ScvdObject(s).
 */

import { Json } from '../../../model/scvd-base';
import { ScvdObject, ScvdObjects } from '../../../model/scvd-object';
import { ScvdVar } from '../../../model/scvd-var';

describe('ScvdObject', () => {
    it('reads objects and returns undefined for global symbols', () => {
        const objects = new ScvdObjects(undefined);
        expect(objects.readXml(undefined as unknown as Json)).toBe(false);

        const xml: Json = {
            object: {
                name: 'obj',
                var: { name: 'v', type: 'uint8_t' }
            }
        };
        expect(objects.readXml(xml)).toBe(true);
        expect(objects.objects).toHaveLength(1);
        expect(objects.getSymbol('anything')).toBeUndefined();
    });

    it('reads object children and manages symbol context', () => {
        const object = new ScvdObject(undefined);
        const xml: Json = {
            name: 'obj',
            var: { name: 'v', type: 'uint8_t' },
            read: { name: 'r', type: 'uint8_t' },
            readlist: { name: 'rl', type: 'uint8_t' },
            list: { name: 'list' },
            calc: { name: 'calc', expression: '1' },
            out: { name: 'out' }
        };

        expect(object.readXml(xml)).toBe(true);
        expect(object.readXml(undefined as unknown as Json)).toBe(false);
        expect(object.var).toHaveLength(1);
        expect(object.read).toHaveLength(1);
        expect(object.readList).toHaveLength(1);
        expect(object.list).toHaveLength(1);
        expect(object.out).toHaveLength(1);
        expect(object.vars).toHaveLength(1);
        expect(object.calcs).toHaveLength(1);

        const firstVar = object.var[0];
        expect(object.getSymbol('v')).toBe(firstVar);
        expect(object.getVar('v')).toBe(firstVar);
        expect(object.getVar('missing')).toBeUndefined();
        expect(object.getRead('r')).toBe(object.read[0]);
        expect(object.getRead('missing')).toBeUndefined();
    });

    it('does not overwrite existing symbol context entries', () => {
        const object = new ScvdObject(undefined);
        const varItem = new ScvdVar(object);
        varItem.name = 'dup';
        object.addToSymbolContext('dup', varItem);

        const otherVar = new ScvdVar(object);
        otherVar.name = 'dup';
        object.addToSymbolContext('dup', otherVar);

        expect(object.symbolContext.get('dup')).toBe(varItem);
    });
});
