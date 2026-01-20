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
 *
 * Coverage for ScvdComponentNumber.
 */

import { ScvdComponentNumber } from '../../model/scvd-component-number';

describe('ScvdComponentNumber coverage', () => {
    it('returns undefined for out-of-range values', () => {
        const component = new ScvdComponentNumber(undefined);
        expect(component.getComponentRange(-1)).toBeUndefined();
        expect(component.getComponentRange(0x100)).toBeUndefined();
    });

    it('classifies component ranges', () => {
        const component = new ScvdComponentNumber(undefined);
        expect(component.getComponentRange(0x00)).toBe('User application software component');
        expect(component.getComponentRange(0x40)).toBe('Third party middleware component');
        expect(component.getComponentRange(0x80)).toBe('MDK-Middleware component');
        expect(component.getComponentRange(Number.NaN)).toBeUndefined();
        expect(component.getComponentRange(0xEE)).toBe('Fault component');
        expect(component.getComponentRange(0xEF)).toBe('Event statistics start/stop');
        expect(component.getComponentRange(0xF0)).toBe('RTOS kernel');
        expect(component.getComponentRange(0xFC)).toBe('RTOS kernel');
        expect(component.getComponentRange(0xFD)).toBe('Inter-process communication layer');
        expect(component.getComponentRange(0xFE)).toBe('printf-style debug output');
        expect(component.getComponentRange(0xFF)).toBe('Event Recorder message');
    });

    it('stores component numbers', () => {
        const component = new ScvdComponentNumber(undefined);
        component.componentNumber = 3;
        expect(component.componentNumber).toBe(3);
    });
});
