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
 * Unit test for ScvdBreak and ScvdBreaks.
 */

import { ScvdBreak, ScvdBreaks } from '../../../model/scvd-break';
import { Json } from '../../../model/scvd-base';
import { ScvdCondition } from '../../../model/scvd-condition';

describe('ScvdBreak', () => {
    it('returns false when XML is undefined', () => {
        const breaks = new ScvdBreaks(undefined);
        expect(breaks.readXml(undefined as unknown as Json)).toBe(false);
        expect(breaks.tag).toBe('XML undefined');
    });

    it('reads break entries and appends to the list', () => {
        const breaks = new ScvdBreaks(undefined);
        const breakSpy = jest.spyOn(ScvdBreak.prototype, 'readXml').mockReturnValue(true);

        expect(breaks.readXml({ break: [{}, {}] })).toBe(true);
        expect(breaks.breaks).toHaveLength(2);
        expect(breaks.addBreak()).toBeInstanceOf(ScvdBreak);
        expect(breaks.breaks).toHaveLength(3);

        breakSpy.mockRestore();
    });

    it('reads a break entry when XML is present', () => {
        const item = new ScvdBreak(undefined);
        expect(item.readXml({})).toBe(true);
    });

    it('returns false when break XML is undefined', () => {
        const item = new ScvdBreak(undefined);
        expect(item.readXml(undefined as unknown as Json)).toBe(false);
        expect(item.tag).toBe('XML undefined');
    });

    it('creates a condition and evaluates it when present', async () => {
        const item = new ScvdBreak(undefined);
        const condSpy = jest.spyOn(ScvdCondition.prototype, 'getResult').mockResolvedValue(false);

        item.cond = '1';
        expect(item.cond).toBeInstanceOf(ScvdCondition);
        await expect(item.getConditionResult()).resolves.toBe(false);

        condSpy.mockRestore();
    });

    it('ignores undefined condition assignments', () => {
        const item = new ScvdBreak(undefined);
        item.cond = undefined;
        expect(item.cond).toBeUndefined();
    });

    it('falls back to default condition when no cond is set', async () => {
        const item = new ScvdBreak(undefined);
        await expect(item.getConditionResult()).resolves.toBe(true);
    });
});
