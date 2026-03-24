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
 * Unit tests for encodeStringToBytes (string-ops).
 */

import { encodeStringToBytes } from '../../../parser-evaluator/string-ops';

describe('encodeStringToBytes', () => {
    describe('UTF-8 (typeSize=1, default)', () => {
        it('encodes ASCII text', () => {
            const out = encodeStringToBytes('ABC');
            expect(out).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
        });

        it('encodes multi-byte UTF-8 characters', () => {
            const out = encodeStringToBytes('\u00e9'); // é = 0xC3 0xA9
            expect(out).toEqual(new Uint8Array([0xc3, 0xa9]));
        });

        it('uses UTF-8 when typeSize defaults to 1', () => {
            const out = encodeStringToBytes('A');
            expect(out).toEqual(new Uint8Array([0x41]));
        });

        it('returns empty Uint8Array for empty string', () => {
            expect(encodeStringToBytes('')).toEqual(new Uint8Array([]));
        });
    });

    describe('UTF-16 LE (typeSize=2)', () => {
        it('encodes ASCII as 2-byte LE code units', () => {
            const out = encodeStringToBytes('AB', 2);
            expect(out).toEqual(new Uint8Array([0x41, 0x00, 0x42, 0x00]));
        });

        it('encodes non-ASCII BMP characters', () => {
            // 'é' = U+00E9 → LE: 0xE9, 0x00
            const out = encodeStringToBytes('\u00e9', 2);
            expect(out).toEqual(new Uint8Array([0xe9, 0x00]));
        });

        it('returns empty for empty string', () => {
            expect(encodeStringToBytes('', 2)).toEqual(new Uint8Array([]));
        });

        it('encodes CJK character', () => {
            // '中' = U+4E2D → LE: 0x2D, 0x4E
            const out = encodeStringToBytes('\u4e2d', 2);
            expect(out).toEqual(new Uint8Array([0x2d, 0x4e]));
        });
    });

    describe('UTF-32 LE (typeSize=4)', () => {
        it('encodes ASCII as 4-byte LE code points', () => {
            const out = encodeStringToBytes('A', 4);
            expect(out).toEqual(new Uint8Array([0x41, 0x00, 0x00, 0x00]));
        });

        it('encodes supplementary plane character (emoji)', () => {
            // '😀' = U+1F600 → LE: 0x00, 0xF6, 0x01, 0x00
            const out = encodeStringToBytes('😀', 4);
            const view = new DataView(out.buffer);
            expect(view.getUint32(0, true)).toBe(0x1f600);
        });

        it('encodes multiple characters', () => {
            const out = encodeStringToBytes('AB', 4);
            expect(out.length).toBe(8);
            const view = new DataView(out.buffer);
            expect(view.getUint32(0, true)).toBe(0x41);
            expect(view.getUint32(4, true)).toBe(0x42);
        });

        it('returns empty for empty string', () => {
            expect(encodeStringToBytes('', 4)).toEqual(new Uint8Array([]));
        });
    });
});
