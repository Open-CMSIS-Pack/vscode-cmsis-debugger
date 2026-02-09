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

import { parseNumericLiteral, parseTypeName } from '../../../parser-evaluator/c-numeric';

describe('c-numeric', () => {
    it('parses i64 literal suffix as signed long long', () => {
        const v = parseNumericLiteral('123i64');
        expect(v.type.kind).toBe('int');
        expect(v.type.bits).toBe(64);
        expect(v.value).toBe(123n);
    });

    it('parses fixed-width _t types', () => {
        const u16 = parseTypeName('uint16_t');
        const i8 = parseTypeName('int8_t');
        expect(u16).toEqual({ kind: 'uint', bits: 16, name: 'uint16_t' });
        expect(i8).toEqual({ kind: 'int', bits: 8, name: 'int8_t' });
    });

    it('parses signed/unsigned and long double', () => {
        const s = parseTypeName('signed');
        const u = parseTypeName('unsigned');
        const ld = parseTypeName('long double');

        expect(s).toEqual({ kind: 'int', bits: 32, name: 'int' });
        expect(u).toEqual({ kind: 'uint', bits: 32, name: 'unsigned int' });
        expect(ld).toEqual({ kind: 'float', bits: 64, name: 'long double' });
    });
});
