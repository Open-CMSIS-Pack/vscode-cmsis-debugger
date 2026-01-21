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
 * Unit test for ScvdList.
 */

import { Json } from '../../../model/scvd-base';
import { ScvdList } from '../../../model/scvd-list';
import { ScvdNode } from '../../../model/scvd-node';

class TestParent extends ScvdNode {
    constructor() {
        super(undefined);
    }

    public override getSymbol(name: string): ScvdNode | undefined {
        if (name === 'parent') {
            return this;
        }
        return undefined;
    }
}

describe('ScvdList', () => {
    it('reads XML and populates child collections', () => {
        const list = new ScvdList(undefined);
        const xml: Json = {
            '#Name': 'list',
            name: 'root',
            start: '0',
            limit: '1',
            cond: '1',
            list: { name: 'child-list' },
            readlist: { name: 'rl', size: '1' },
            read: { name: 'r', type: 'uint8_t' },
            var: { name: 'v', type: 'uint8_t' },
            calc: { name: 'c', expression: '1' }
        };

        expect(list.readXml(xml)).toBe(true);
        expect(list.start).toBeDefined();
        expect(list.limit).toBeDefined();
        expect(list.cond).toBeDefined();
        expect(list.list).toHaveLength(1);
        expect(list.readList).toHaveLength(1);
        expect(list.read).toHaveLength(1);
        expect(list.var).toHaveLength(1);
        expect(list.calc).toHaveLength(1);
        expect(list.getSymbol('v')).toBe(list.var[0]);
        expect(list.getSymbol('r')).toBe(list.read[0]);
        expect(list.getSymbol('rl')).toBe(list.readList[0]);
    });

    it('verifies limit/while conflicts', () => {
        const list = new ScvdList(undefined);
        list.limit = '1';
        list.while = '1';
        expect(list.while).toBeDefined();
        expect(list.verify()).toBe(false);

        const ok = new ScvdList(undefined);
        ok.limit = '1';
        expect(ok.verify()).toBe(true);
    });

    it('handles undefined XML and applyInit default', () => {
        const list = new ScvdList(undefined);
        expect(list.readXml(undefined as unknown as Json)).toBe(false);
        expect(list.applyInit()).toBe(true);
    });

    it('handles condition evaluation branches', async () => {
        const list = new ScvdList(undefined);
        list.cond = '1';
        const cond = (list as unknown as { _cond?: { getResult: () => Promise<boolean> } })._cond;
        if (!cond) {
            throw new Error('Expected condition to be set');
        }
        cond.getResult = async () => false;
        await expect(list.getConditionResult()).resolves.toBe(false);

        const base = new ScvdList(undefined);
        await expect(base.getConditionResult()).resolves.toBe(true);
    });

    it('falls back to parent symbol resolution', () => {
        const parent = new TestParent();
        const list = new ScvdList(parent);
        expect(list.getSymbol('parent')).toBe(parent);
        expect(list.getSymbol('missing')).toBeUndefined();
    });
});
