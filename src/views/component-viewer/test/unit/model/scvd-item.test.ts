/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

/**
 * Unit test for ScvdItem.
 */

import { parseStringPromise } from 'xml2js';

import { ScvdCondition } from '../../../model/scvd-condition';
import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { ScvdItem } from '../../../model/scvd-item';
import { ScvdListOut } from '../../../model/scvd-list-out';
import { ScvdPrint } from '../../../model/scvd-print';
import { Json } from '../../../model/scvd-base';
import { ScvdCalc } from '../../../model/scvd-calc';
import { ScvdEvalContext } from '../../../scvd-eval-context';

describe('ScvdItem', () => {
    it('returns false when XML is undefined', () => {
        const item = new ScvdItem(undefined);
        expect(item.readXml(undefined as unknown as Json)).toBe(false);
        expect(item.tag).toBe('XML undefined');
    });

    it('reads XML and builds child lists', () => {
        const item = new ScvdItem(undefined);
        const listSpy = jest.spyOn(ScvdListOut.prototype, 'readXml').mockReturnValue(true);
        const printSpy = jest.spyOn(ScvdPrint.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            property: '1',
            value: '2',
            cond: '1',
            bold: '0',
            alert: '0',
            item: [{}],
            list: [{}],
            print: [{}],
            calc: [{ expression: '1' }]
        };

        expect(item.readXml(xml)).toBe(true);
        expect(item.property).toBeDefined();
        expect(item.value).toBeDefined();
        expect(item.cond).toBeInstanceOf(ScvdCondition);
        expect(item.bold).toBeInstanceOf(ScvdCondition);
        expect(item.alert).toBeInstanceOf(ScvdCondition);
        expect(item.item).toHaveLength(1);
        expect(item.listOut).toHaveLength(1);
        expect(item.print).toHaveLength(1);
        expect(item.calc).toHaveLength(1);

        expect(item.addItem()).toBeInstanceOf(ScvdItem);
        expect(item.addListOut()).toBeInstanceOf(ScvdListOut);
        expect(item.addPrint()).toBeInstanceOf(ScvdPrint);
        expect(item.addCalc()).toBeInstanceOf(ScvdCalc);
        expect(item.hasGuiChildren()).toBe(true);

        listSpy.mockRestore();
        printSpy.mockRestore();
    });

    it('evaluates conditions and gui fields', async () => {
        const item = new ScvdItem(undefined, '1', '1', '1');
        const condSpy = jest.spyOn(ScvdCondition.prototype, 'getResult').mockResolvedValue(true);

        await expect(item.getConditionResult()).resolves.toBe(true);
        condSpy.mockRestore();

        (item as unknown as { _property?: { getGuiValue: () => Promise<string> } })._property = {
            getGuiValue: async () => 'name'
        };
        (item as unknown as { _value?: { getGuiValue: () => Promise<string> } })._value = {
            getGuiValue: async () => 'value'
        };

        await expect(item.getGuiName()).resolves.toBe('name');
        await expect(item.getGuiValue()).resolves.toBe('value');

        (item as unknown as { _property?: undefined })._property = undefined;
        (item as unknown as { _value?: undefined })._value = undefined;
        await expect(item.getGuiName()).resolves.toBeUndefined();
        await expect(item.getGuiValue()).resolves.toBeUndefined();
    });

    it.each([
        { invstateBit: 0, expected: '' },
        { invstateBit: 1, expected: 'INVSTATE ' },
    ])('formats the XML ternary from issue #989 when INVSTATE_bit is $invstateBit', async ({ invstateBit, expected }) => {
        const xml: Json = await parseStringPromise(`
            <component_viewer>
                <objects>
                    <object name="Faults">
                        <var name="INVSTATE_bit" type="uint8_t" />
                        <out name="Fault">
                            <item value="%t[INVSTATE_bit ? &quot;INVSTATE &quot; : &quot;&quot;]" />
                        </out>
                    </object>
                </objects>
            </component_viewer>`, { explicitArray: false, mergeAttrs: true });
        const viewer = new ScvdComponentViewer(undefined);
        expect(viewer.readXml(xml)).toBe(true);
        const context = new ScvdEvalContext(viewer).getExecutionContext();
        viewer.setExecutionContextAll(context);
        expect(viewer.configureAll()).toBe(true);
        context.memoryHost.setVariable('INVSTATE_bit', 1, new Uint8Array([invstateBit]), 0);

        const item = viewer.objects?.objects[0].out[0].item[0];
        expect(item).toBeDefined();
        await expect(item?.getGuiValue()).resolves.toBe(expected);
    });

    it('defaults condition result when no cond is set', async () => {
        const item = new ScvdItem(undefined);
        expect(item.hasGuiChildren()).toBe(false);
        await expect(item.getConditionResult()).resolves.toBe(true);
    });
});
