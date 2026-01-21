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
 * Unit test for ScvdEnum.
 */

import { ScvdEnum } from '../../../model/scvd-enum';
import { Json } from '../../../model/scvd-base';
import { ScvdExpression } from '../../../model/scvd-expression';

describe('ScvdEnum', () => {
    it('initializes value from previous enum', () => {
        const parent = new ScvdEnum(undefined, undefined);
        const next = new ScvdEnum(undefined, parent);

        expect(parent.value.expression).toBe('0');
        expect(next.value.expression).toBe('(0) + 1');
    });

    it('reads XML and replaces the expression', () => {
        const item = new ScvdEnum(undefined, undefined);
        const readSpy = jest.spyOn(ScvdExpression.prototype, 'readXml').mockReturnValue(true);

        const xml = { value: '5' };
        expect(item.readXml(xml)).toBe(true);
        expect(item.value).toBeInstanceOf(ScvdExpression);
        expect(item.value.expression).toBe('5');

        readSpy.mockRestore();
    });

    it('returns false when XML is undefined', () => {
        const item = new ScvdEnum(undefined, undefined);
        expect(item.readXml(undefined as unknown as Json)).toBe(false);
        expect(item.tag).toBe('XML undefined');
    });

    it('ignores undefined value updates', () => {
        const item = new ScvdEnum(undefined, undefined);
        const current = item.value;
        item.value = undefined;
        expect(item.value).toBe(current);
    });
});
