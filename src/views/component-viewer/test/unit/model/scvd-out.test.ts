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
 * Unit test for ScvdOut.
 */

import { Json } from '../../../model/scvd-base';
import { ScvdOut } from '../../../model/scvd-out';
import { ScvdCondition } from '../../../model/scvd-condition';

describe('ScvdOut', () => {
    it('reads XML and manages child collections', () => {
        const out = new ScvdOut(undefined);
        expect(out.readXml(undefined as unknown as Json)).toBe(false);

        const xml: Json = {
            value: '1',
            type: 'uint8_t',
            cond: '1',
            item: { name: 'item', value: '2' },
            list: { name: 'list', value: '3' }
        };
        expect(out.readXml(xml)).toBe(true);
        expect(out.value).toBeDefined();
        expect(out.type).toBeDefined();
        expect(out.cond).toBeDefined();
        expect(out.item).toHaveLength(1);
        expect(out.list).toHaveLength(1);
        expect(out.getValueType()).toBe('uint8_t');

        out.addItem();
        out.addList();
        expect(out.item.length).toBe(2);
        expect(out.list.length).toBe(2);

        out.type = 'uint16_t';
        expect(out.getValueType()).toBe('uint16_t');
    });

    it('handles condition evaluation branches', async () => {
        const out = new ScvdOut(undefined);
        await expect(out.getConditionResult()).resolves.toBe(true);

        out.cond = '1';
        const cond = (out as unknown as { _cond?: ScvdCondition })._cond;
        if (!cond) {
            throw new Error('Expected condition to be set');
        }
        cond.getResult = async () => false;
        await expect(out.getConditionResult()).resolves.toBe(false);
    });

    it('ignores undefined setter values', () => {
        const out = new ScvdOut(undefined);
        out.value = undefined;
        out.type = undefined;
        out.cond = undefined;
        expect(out.value).toBeUndefined();
        expect(out.type).toBeUndefined();
        expect(out.cond).toBeUndefined();
    });
});
