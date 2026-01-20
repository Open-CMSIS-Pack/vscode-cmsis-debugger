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
 * Unit test for scvd-utils.
 */

import {
    AddText,
    clearSignBit,
    getArrayFromJson,
    getLineNumberFromJson,
    getObjectFromJson,
    getStringField,
    getStringFromJson,
    getTextBodyFromJson,
    insertString,
    unsignedRShift
} from '../../../model/scvd-utils';

import { Json } from '../../../model/scvd-base';

describe('scvd-utils coverage', () => {
    it('adds text with string and array inputs', () => {
        expect(AddText('', 'a')).toBe('a');
        expect(AddText('a', 'b')).toBe('a b');
        expect(AddText('', ['a', 'b'])).toBe('a b');
        expect(AddText('a', ['b', 'c'])).toBe('a b c');
    });

    it('inserts strings at requested positions', () => {
        expect(insertString('abc', 'X', 0)).toBe('Xabc');
        expect(insertString('abc', 'X', 10)).toBe('abcX');
        expect(insertString('abcd', 'X', 2)).toBe('abXcd');
    });

    it('handles bit operations', () => {
        expect(unsignedRShift(-1, 1)).toBe(0x7fffffff);
        expect(clearSignBit(-1)).toBe(0xffffffff);
    });

    it('parses objects and strings from JSON', () => {
        expect(getObjectFromJson(undefined)).toBeUndefined();
        expect(getObjectFromJson(null)).toBeUndefined();
        expect(getObjectFromJson('x')).toBeUndefined();
        const obj = { key: 'value' };
        expect(getObjectFromJson(obj)).toBe(obj);

        expect(getStringFromJson('x')).toBe('x');
        expect(getStringFromJson(1)).toBeUndefined();

        expect(getStringField(undefined, 'key')).toBeUndefined();
        expect(getStringField({ key: 'value' }, 'key')).toBe('value');
        expect(getStringField({ key: 1 }, 'key')).toBeUndefined();
    });

    it('returns arrays from JSON values', () => {
        expect(getArrayFromJson(undefined)).toBeUndefined();
        expect(getArrayFromJson([1, 2])).toEqual([1, 2]);
        expect(getArrayFromJson('x')).toEqual(['x']);
    });

    it('extracts text bodies', () => {
        expect(getTextBodyFromJson('a;b' as unknown as Json)).toEqual(['a', 'b']);
        expect(getTextBodyFromJson({ '#text': 'a\n b ' })).toEqual(['a', 'b']);
        expect(getTextBodyFromJson({ _: 'a;\n\r' })).toEqual(['a']);
        expect(getTextBodyFromJson({ text: 'a; b; ' })).toEqual(['a', 'b']);
        expect(getTextBodyFromJson({} as Json)).toBeUndefined();
    });

    it('reads line numbers from json', () => {
        expect(getLineNumberFromJson({ __line: '12' })).toBe('12');
        expect(getLineNumberFromJson({ __line: 12 } as unknown as Json)).toBeUndefined();
    });
});
