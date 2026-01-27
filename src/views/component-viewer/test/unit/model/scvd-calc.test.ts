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
 * Unit test for ScvdCalc.
 */

import { ScvdCalc } from '../../../model/scvd-calc';
import { Json } from '../../../model/scvd-base';
import { ScvdCondition } from '../../../model/scvd-condition';

describe('ScvdCalc', () => {
    it('returns false when XML is undefined', () => {
        const calc = new ScvdCalc(undefined);
        expect(calc.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads conditions and expressions from text body', () => {
        const calc = new ScvdCalc(undefined);
        const xml = {
            cond: '1',
            '#text': 'A;B\nC'
        };

        expect(calc.readXml(xml)).toBe(true);
        expect(calc.cond).toBeInstanceOf(ScvdCondition);
        expect(calc.expression).toHaveLength(3);
    });

    it('reuses the same condition instance for updates', () => {
        const calc = new ScvdCalc(undefined);
        calc.cond = '1';
        const original = calc.cond;
        calc.cond = '2';

        expect(calc.cond).toBe(original);
    });

    it('uses condition when present', async () => {
        const calc = new ScvdCalc(undefined);
        calc.cond = '1';

        const resultSpy = jest.spyOn(ScvdCondition.prototype, 'getResult').mockResolvedValue(false);
        await expect(calc.getConditionResult()).resolves.toBe(false);

        resultSpy.mockRestore();
    });

    it('returns default condition when none is set', async () => {
        const calc = new ScvdCalc(undefined);
        await expect(calc.getConditionResult()).resolves.toBe(true);
    });

    it('returns undefined when adding an empty expression', () => {
        const calc = new ScvdCalc(undefined);
        const addExpression = (calc as unknown as { addExpression: (value: string | undefined) => unknown }).addExpression;
        expect(addExpression(undefined)).toBeUndefined();
    });
});
