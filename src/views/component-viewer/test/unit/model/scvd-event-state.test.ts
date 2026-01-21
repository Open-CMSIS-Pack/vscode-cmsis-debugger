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
 * Unit test for ScvdEventState.
 */

import { ScvdEventState } from '../../../model/scvd-event-state';
import { Json } from '../../../model/scvd-base';

describe('ScvdEventState', () => {
    it('returns false when XML is undefined', () => {
        const state = new ScvdEventState(undefined);
        expect(state.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads valid values from XML', () => {
        const state = new ScvdEventState(undefined);
        const xml = {
            plot: 'line',
            color: 'red',
            unique: 'true',
            dormant: 'true',
            ssel: 'false'
        };

        expect(state.readXml(xml)).toBe(true);
        expect(state.plot).toBe('line');
        expect(state.color).toBe('red');
        expect(state.unique).toBe(true);
        expect(state.dormant).toBe(true);
        expect(state.ssel).toBe(false);
    });

    it('ignores invalid plot and color updates', () => {
        const state = new ScvdEventState(undefined);
        state.plot = 'box';
        state.color = 'green';

        state.plot = 'invalid';
        state.color = 'orange';

        expect(state.plot).toBe('box');
        expect(state.color).toBe('green');
    });

    it('updates boolean flags from string and boolean values', () => {
        const state = new ScvdEventState(undefined);
        state.unique = 'true';
        state.dormant = 'false';
        state.ssel = true;

        expect(state.unique).toBe(true);
        expect(state.dormant).toBe(false);
        expect(state.ssel).toBe(true);
    });

    it('ignores undefined boolean updates', () => {
        const state = new ScvdEventState(undefined);
        state.unique = true;
        state.dormant = true;
        state.ssel = false;

        state.unique = undefined;
        state.dormant = undefined;
        state.ssel = undefined;

        expect(state.unique).toBe(true);
        expect(state.dormant).toBe(true);
        expect(state.ssel).toBe(false);
    });
});
