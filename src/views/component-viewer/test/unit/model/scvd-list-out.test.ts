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
 * Unit test for ScvdListOut.
 */

import { Json } from '../../../model/scvd-base';
import { ScvdListOut } from '../../../model/scvd-list-out';

describe('ScvdListOut coverage', () => {
    it('reads XML and manages child items/lists', async () => {
        const listOut = new ScvdListOut(undefined);

        expect(listOut.readXml(undefined as unknown as Json)).toBe(false);
        expect(listOut.tag).toBe('XML undefined');

        const xml: Json = {
            '#Name': 'listout',
            name: 'root',
            start: '1',
            limit: '2',
            while: '3',
            cond: '1',
            item: {
                name: 'item0',
                property: 'prop',
                value: 'val'
            },
            list: {
                name: 'child',
                start: '0'
            }
        };
        expect(listOut.readXml(xml)).toBe(true);
        expect(listOut.start).toBeDefined();
        expect(listOut.limit).toBeDefined();
        expect(listOut.while).toBeDefined();
        expect(listOut.cond).toBeDefined();
        expect(listOut.item).toHaveLength(1);
        expect(listOut.list).toHaveLength(2);

        expect(listOut.listOut).toHaveLength(0);
        listOut.addListOut();
        expect(listOut.listOut).toHaveLength(1);

        await expect(listOut.getGuiName()).resolves.toBeUndefined();
    });

    it('verifies limit/while conflicts via base implementation', () => {
        const listOut = new ScvdListOut(undefined);
        listOut.limit = '1';
        listOut.while = '1';
        expect(listOut.verify()).toBe(false);
    });
});
