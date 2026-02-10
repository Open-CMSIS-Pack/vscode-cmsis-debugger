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
 * Unit tests for shared math helpers used by parser and evaluator.
 */

import {
    addVals,
    andVals,
    divVals,
    maskToBits,
    mergeKinds,
    modVals,
    mulVals,
    normalizeToWidth,
    orVals,
    sarVals,
    shlVals,
    shrVals,
    subVals,
    toBigInt,
    toNumeric,
    xorVals,
} from '../../../../parser-evaluator/math-ops';

describe('math-ops helpers', () => {
    it('handles numeric coercion and rejects non-numeric math', () => {
        expect(addVals(1, 2)).toBe(3);
        expect(addVals('a', 2)).toBeUndefined();
        expect(toNumeric(true)).toBe(1);
        expect(toNumeric('10')).toBe(10);
        expect(toNumeric('   ')).toBe(0);
        expect(toNumeric('bad')).toBe(0);
        expect(toBigInt('not-a-number' as unknown as string)).toBe(0n);
        expect(toBigInt(true)).toBe(1n);
        expect(toBigInt(false)).toBe(0n);
        expect(toBigInt('1.9')).toBe(1n);
        expect(toBigInt(3.7)).toBe(3n);
        expect(toBigInt(undefined)).toBe(0n);
    });

    it('masks and normalizes widths for signed and unsigned', () => {
        expect(maskToBits(0xFF, 4)).toBe(0xF);
        expect(maskToBits(0xFFn, 4)).toBe(0xFn);
        expect(normalizeToWidth(0xFF, 8, 'uint')).toBe(0xFF);
        expect(normalizeToWidth(0xFF, 8, 'int')).toBe(-1);
        expect(normalizeToWidth(0x1FFn, 8, 'int')).toBe(-1n);
        expect(maskToBits(0x1234_5678, 40)).toBe(0x1234_5678); // >=32 path
        expect(maskToBits(0xABCD, 0)).toBe(0xABCD); // no-op when bits falsy
        expect(normalizeToWidth(5, undefined, 'float')).toBe(5); // float bypass
        expect(normalizeToWidth(-1, 33, 'int')).toBe(-1); // width capped at 32
    });

    it('performs integer arithmetic with optional truncation', () => {
        expect(subVals(10, 3)).toBe(7);
        expect(mulVals(4, 3)).toBe(12);
        expect(modVals(10, 3)).toBe(1);
        expect(addVals(255, 2, 8, true)).toBe(1); // wraps to 8 bits
        expect(addVals(0x1FFn, 2n, 8, true)).toBe(1); // bigint mask path
        expect(subVals(1n, 3n)).toBe(-2n);
        expect(subVals(1n, 3n, 8, true)).toBe(254);
        expect(mulVals(2n, 3n, 4, true)).toBe(6);
        expect(mulVals(2n, 3n, 4, false)).toBe(6);
        expect(modVals(10n, 3n)).toBe(1n);
        expect(divVals(1, 0)).toBeUndefined();
        expect(divVals(5n, 2n)).toBe(2n);
        expect(divVals(6, 2)).toBe(3);
    });

    it('supports bitwise ops and shifts across kinds', () => {
        expect(andVals(0xF0, 0x0F)).toBe(0);
        expect(orVals(0xF0, 0x0F)).toBe(0xFF);
        expect(xorVals(0xAA, 0xFF)).toBe(0x55);
        expect(shlVals(1, 3, 8, true)).toBe(8);
        expect(sarVals(-16, 2)).toBe(-4);
        expect(shrVals(-1, 1, 8)).toBe(127);
        expect(andVals(0xF0n, 0x0Fn)).toBe(0n);
        expect(orVals(0xF0n, 0x0Fn)).toBe(0xFFn);
        expect(xorVals(0xAAAn, 0xFFn)).toBe(0xA55n);
        expect(andVals(0xFFn, 0xF0n, 4, true)).toBe(0);
        expect(orVals(0x10n, 0x01n, 4, true)).toBe(0x1);
        expect(xorVals(0xFn, 0x1n, 4, true)).toBe(0xE);
        expect(shlVals(1n, 65n, 8, true)).toBeUndefined(); // shift count out of range
        expect(shlVals(1n, 2n, 8, false)).toBe(4);
        expect(sarVals(8n, 1n)).toBe(4n);
        expect(sarVals(-1n, 1n, 8, true)).toBe(127);
        expect(shrVals(-1n, 1n, 8)).toBe(127);
        expect(shrVals(8n, 1n, 8)).toBe(4);
    });

    it('merges scalar kinds with float > uint > int precedence', () => {
        expect(mergeKinds({ kind: 'int' }, { kind: 'uint' })).toBe('uint');
        expect(mergeKinds({ kind: 'uint' }, { kind: 'float' })).toBe('float');
        expect(mergeKinds({ kind: 'int' }, { kind: 'int' })).toBe('int');
        expect(mergeKinds(undefined, undefined)).toBe('unknown');
    });
});
