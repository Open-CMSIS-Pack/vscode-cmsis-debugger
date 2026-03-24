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
 * Unit tests for byte-encoding helpers (encode/decode LE bytes ↔ typed values).
 */

import {
    leIntToBytes,
    leBigIntToBytes,
    encodeToLeBytes,
    leToNumber,
    leToSignedNumber,
    leToFloat16,
    decodeBytesToValue,
} from '../../../data-host/byte-encoding';

describe('byte-encoding', () => {
    describe('leIntToBytes', () => {
        it('encodes a 32-bit number as LE bytes', () => {
            expect(leIntToBytes(0x12345678, 4)).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
        });

        it('encodes a 16-bit number', () => {
            expect(leIntToBytes(0xABCD, 2)).toEqual(new Uint8Array([0xCD, 0xAB]));
        });

        it('encodes a single byte', () => {
            expect(leIntToBytes(0xFF, 1)).toEqual(new Uint8Array([0xFF]));
        });

        it('delegates to bigint path for size > 4', () => {
            // -1 as a 64-bit LE integer should be all 0xFF bytes
            const out = leIntToBytes(-1, 8);
            expect(out).toEqual(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
        });

        it('preserves positive values for size > 4', () => {
            const out = leIntToBytes(0x12, 6);
            expect(out).toEqual(new Uint8Array([0x12, 0x00, 0x00, 0x00, 0x00, 0x00]));
        });
    });

    describe('leBigIntToBytes', () => {
        it('encodes a 64-bit bigint as LE bytes', () => {
            const out = leBigIntToBytes(0x0102030405060708n, 8);
            expect(out).toEqual(new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]));
        });
    });

    describe('encodeToLeBytes', () => {
        it('encodes number', () => {
            expect(encodeToLeBytes(0x1234, 2)).toEqual(new Uint8Array([0x34, 0x12]));
        });

        it('encodes bigint', () => {
            expect(encodeToLeBytes(0x0102n, 2)).toEqual(new Uint8Array([0x02, 0x01]));
        });

        it('passes through Uint8Array of correct size', () => {
            const data = new Uint8Array([1, 2, 3]);
            expect(encodeToLeBytes(data, 3)).toBe(data); // same reference
        });

        it('truncates Uint8Array if too large', () => {
            const data = new Uint8Array([1, 2, 3, 4]);
            const out = encodeToLeBytes(data, 2);
            expect(out).toEqual(new Uint8Array([1, 2]));
            expect(out).not.toBe(data);
        });

        it('zero-pads Uint8Array if too small', () => {
            const data = new Uint8Array([1, 2]);
            const out = encodeToLeBytes(data, 4);
            expect(out).toEqual(new Uint8Array([1, 2, 0, 0]));
        });

        it('truncates float to int', () => {
            expect(encodeToLeBytes(3.7, 1)).toEqual(new Uint8Array([3]));
        });
    });

    describe('leToNumber', () => {
        it('decodes LE bytes as unsigned 32-bit', () => {
            expect(leToNumber(new Uint8Array([0x78, 0x56, 0x34, 0x12]))).toBe(0x12345678);
        });

        it('wraps to unsigned', () => {
            expect(leToNumber(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]))).toBe(0xFFFFFFFF);
        });

        it('clamps to low 4 bytes when input exceeds 4 bytes', () => {
            // 5-byte input: only the first 4 bytes should be decoded
            expect(leToNumber(new Uint8Array([0x78, 0x56, 0x34, 0x12, 0xFF]))).toBe(0x12345678);
        });
    });

    describe('leToSignedNumber', () => {
        it('sign-extends 8-bit', () => {
            expect(leToSignedNumber(new Uint8Array([0x80]))).toBe(-128);
            expect(leToSignedNumber(new Uint8Array([0x7F]))).toBe(127);
        });

        it('sign-extends 16-bit', () => {
            expect(leToSignedNumber(new Uint8Array([0x00, 0x80]))).toBe(-32768);
        });

        it('sign-extends 32-bit (uses |0)', () => {
            expect(leToSignedNumber(new Uint8Array([0x00, 0x00, 0x00, 0x80]))).toBe(-2147483648);
        });
    });

    describe('leToFloat16', () => {
        it('decodes +1.0', () => {
            expect(leToFloat16(new Uint8Array([0x00, 0x3c]))).toBeCloseTo(1.0);
        });

        it('decodes +0', () => {
            expect(leToFloat16(new Uint8Array([0x00, 0x00]))).toBe(0);
        });

        it('decodes -0', () => {
            expect(Object.is(leToFloat16(new Uint8Array([0x00, 0x80])), -0)).toBe(true);
        });

        it('decodes subnormal', () => {
            expect(leToFloat16(new Uint8Array([0x01, 0x00]))).toBeGreaterThan(0);
        });

        it('decodes +Infinity', () => {
            expect(leToFloat16(new Uint8Array([0x00, 0x7c]))).toBe(Infinity);
        });

        it('decodes NaN', () => {
            expect(Number.isNaN(leToFloat16(new Uint8Array([0x01, 0x7c])))).toBe(true);
        });

        it('returns NaN for too-short input', () => {
            expect(Number.isNaN(leToFloat16(new Uint8Array([0x00])))).toBe(true);
        });
    });

    describe('decodeBytesToValue', () => {
        it('decodes uint ≤4 bytes', () => {
            expect(decodeBytesToValue(new Uint8Array([0x78, 0x56, 0x34, 0x12]), 4, { kind: 'uint' }))
                .toBe(0x12345678);
        });

        it('decodes int ≤4 bytes (sign-extended)', () => {
            expect(decodeBytesToValue(new Uint8Array([0x80]), 1, { kind: 'int' })).toBe(-128);
            expect(decodeBytesToValue(new Uint8Array([0x7F]), 1, { kind: 'int' })).toBe(127);
        });

        it('defaults to unsigned for unknown kind', () => {
            expect(decodeBytesToValue(new Uint8Array([0xFF]), 1, undefined)).toBe(255);
        });

        it('decodes 8-byte value as bigint', () => {
            const bytes = new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]);
            expect(decodeBytesToValue(bytes, 8, { kind: 'uint' })).toBe(0x0102030405060708n);
        });

        it('decodes >8 bytes as raw copy', () => {
            const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const out = decodeBytesToValue(bytes, 10, undefined);
            expect(out).toEqual(bytes);
            expect(out).not.toBe(bytes); // must be a copy
        });

        it('decodes float16', () => {
            const val = decodeBytesToValue(new Uint8Array([0x00, 0x3c]), 2, { kind: 'float' });
            expect(val).toBeCloseTo(1.0);
        });

        it('decodes float32', () => {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, 1.25, true);
            const val = decodeBytesToValue(new Uint8Array(buf), 4, { kind: 'float' });
            expect(val).toBeCloseTo(1.25);
        });

        it('decodes float64', () => {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, 2.5, true);
            const val = decodeBytesToValue(new Uint8Array(buf), 8, { kind: 'float' });
            expect(val).toBeCloseTo(2.5);
        });

        it('falls back to raw bytes for non-standard float widths', () => {
            const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
            expect(decodeBytesToValue(bytes, 6, { kind: 'float' })).toEqual(bytes);
        });

        it('returns raw bytes when widthBytes exceeds natural type size', () => {
            // IPv4 address: uint8_t with size="4" should return raw bytes
            const bytes = new Uint8Array([192, 168, 1, 1]);
            const out = decodeBytesToValue(bytes, 4, { kind: 'uint', bits: 8 });
            expect(out).toEqual(bytes);
        });

        it('does NOT return raw bytes for floats even when widthBytes > typeSize', () => {
            // floats should still decode via the float path
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, 1.5, true);
            const out = decodeBytesToValue(new Uint8Array(buf), 4, { kind: 'float', bits: 16 });
            expect(out).toBeCloseTo(1.5);
        });
    });
});
