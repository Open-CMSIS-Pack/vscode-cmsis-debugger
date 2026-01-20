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
 * Unit test for ScvdPrint.
 */

import { ScvdCondition } from '../../../model/scvd-condition';
import { ScvdPrint } from '../../../model/scvd-print';
import { ScvdValueOutput } from '../../../model/scvd-value-output';
import { Json } from '../../../model/scvd-base';

describe('ScvdPrint', () => {
    it('returns false when XML is undefined', () => {
        const print = new ScvdPrint(undefined);
        expect(print.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads properties and conditions from XML', () => {
        const print = new ScvdPrint(undefined);
        const xml = {
            cond: '1',
            property: 'prop',
            value: 'val',
            bold: '1',
            alert: '0'
        };

        expect(print.readXml(xml)).toBe(true);
        expect(print.cond).toBeInstanceOf(ScvdCondition);
        expect(print.property).toBeInstanceOf(ScvdValueOutput);
        expect(print.value).toBeInstanceOf(ScvdValueOutput);
        expect(print.bold).toBeInstanceOf(ScvdCondition);
        expect(print.alert).toBeInstanceOf(ScvdCondition);
    });

    it('uses conditions when present', async () => {
        const print = new ScvdPrint(undefined);
        print.cond = '1';
        const condSpy = jest.spyOn(ScvdCondition.prototype, 'getResult').mockResolvedValue(false);

        await expect(print.getConditionResult()).resolves.toBe(false);

        condSpy.mockRestore();
    });

    it('returns default condition result when no condition is set', async () => {
        const print = new ScvdPrint(undefined);
        await expect(print.getConditionResult()).resolves.toBe(true);
    });

    it('returns GUI name/value from value outputs', async () => {
        const print = new ScvdPrint(undefined);

        await expect(print.getGuiName()).resolves.toBeUndefined();
        await expect(print.getGuiValue()).resolves.toBeUndefined();

        const nameSpy = jest.spyOn(ScvdValueOutput.prototype, 'getGuiName').mockResolvedValue('NAME');
        const valueSpy = jest.spyOn(ScvdValueOutput.prototype, 'getGuiValue').mockResolvedValue('VALUE');

        print.property = 'prop';
        print.value = 'val';

        await expect(print.getGuiName()).resolves.toBe('NAME');
        await expect(print.getGuiValue()).resolves.toBe('VALUE');

        nameSpy.mockRestore();
        valueSpy.mockRestore();
    });

    it('ignores undefined setter inputs', () => {
        const print = new ScvdPrint(undefined);
        print.property = undefined;
        print.value = undefined;
        print.cond = undefined;
        print.bold = undefined;
        print.alert = undefined;

        expect(print.property).toBeUndefined();
        expect(print.value).toBeUndefined();
        expect(print.cond).toBeUndefined();
        expect(print.bold).toBeUndefined();
        expect(print.alert).toBeUndefined();
    });
});
