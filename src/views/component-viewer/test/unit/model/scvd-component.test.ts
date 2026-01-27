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
 * Unit test for ScvdComponent.
 */

import { ScvdComponent } from '../../../model/scvd-component';
import { Json } from '../../../model/scvd-base';
import { ScvdEventState } from '../../../model/scvd-event-state';

describe('ScvdComponent', () => {
    it('returns false when XML is undefined', () => {
        const component = new ScvdComponent(undefined);
        expect(component.readXml(undefined as unknown as Json)).toBe(false);
        expect(component.tag).toBe('XML undefined');
    });

    it('reads component attributes and state list', () => {
        const component = new ScvdComponent(undefined);
        const stateSpy = jest.spyOn(ScvdEventState.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            brief: 'Brief',
            no: '3',
            prefix: 'pfx',
            state: [{}, {}]
        };

        expect(component.readXml(xml)).toBe(true);
        expect(component.brief).toBe('Brief');
        expect(component.no).toBe(3);
        expect(component.prefix).toBe('pfx');
        expect(component.state).toHaveLength(2);
        expect(component.addState()).toBeInstanceOf(ScvdEventState);
        expect(component.state).toHaveLength(3);

        stateSpy.mockRestore();
    });

    it('ignores undefined numbers', () => {
        const component = new ScvdComponent(undefined);
        component.no = undefined;
        expect(component.no).toBeUndefined();
    });
});
