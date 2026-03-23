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

import type { EvalValue, ScalarType } from '../parser-evaluator/ref-container';

// --- Little-endian encode helpers ---

/**
 * Encode a JS number as a little-endian Uint8Array of `size` bytes.
 * For size > 4, delegates to the bigint path to preserve sign extension
 * beyond the 32-bit range of `>>> 0`.
 */
export function leIntToBytes(v: number, size: number): Uint8Array {
    if (size > 4) {
        return leBigIntToBytes(BigInt(v), size);
    }
    const out = new Uint8Array(size);
    let tmp = v >>> 0;
    for (let i = 0; i < size; i++) {
        out.set([tmp & 0xff], i);
        tmp >>>= 8;
    }
    return out;
}

/** Encode a BigInt as a little-endian Uint8Array of `size` bytes. */
export function leBigIntToBytes(v: bigint, size: number): Uint8Array {
    const out = new Uint8Array(size);
    let tmp = v;
    for (let i = 0; i < size; i++) {
        // eslint-disable-next-line security/detect-object-injection
        out[i] = Number(tmp & 0xffn);
        tmp >>= 8n;
    }
    return out;
}

/**
 * Encode a value (number, bigint, or Uint8Array) to exactly `size` LE bytes.
 * - number  → little-endian integer
 * - bigint  → little-endian integer
 * - Uint8Array → truncated or zero-padded to `size`
 */
export function encodeToLeBytes(value: number | bigint | Uint8Array, size: number): Uint8Array {
    if (typeof value === 'number') {
        return leIntToBytes(Math.trunc(value), size);
    }
    if (typeof value === 'bigint') {
        return leBigIntToBytes(value, size);
    }
    // Uint8Array: avoid extra allocation when already the right size.
    // Safe to return the original reference because callers (e.g. MemoryContainer.write)
    // always copy via TypedArray.set().
    if (value.length === size) {
        return value;
    }
    const out = new Uint8Array(size);
    out.set(value.subarray(0, size), 0);
    return out;
}

// --- Little-endian decode helpers ---

/**
 * Decode a little-endian Uint8Array as an unsigned 32-bit number.
 * Only valid for up to 4 bytes; larger inputs silently overflow.
 */
export function leToNumber(bytes: Uint8Array): number {
    if (bytes.length > 4) {
        // Only the low 4 bytes are meaningful in 32-bit arithmetic.

        bytes = bytes.subarray(0, 4);
    }
    let out = 0;
    for (const b of Array.from(bytes).reverse()) {
        out = (out << 8) | (b & 0xff);
    }
    return out >>> 0;
}

/** Decode a little-endian Uint8Array as a signed integer (sign-extended). */
export function leToSignedNumber(bytes: Uint8Array): number {
    const unsigned = leToNumber(bytes);
    const bits = bytes.length * 8;
    if (bits <= 0 || bits >= 32) {
        return unsigned | 0;
    }
    const signBit = 1 << (bits - 1);
    return (unsigned & signBit) ? (unsigned | (~0 << bits)) : unsigned;
}

/** Decode a 2-byte little-endian IEEE 754 half-precision float. */
export function leToFloat16(bytes: Uint8Array): number {
    if (bytes.length < 2) {
        return NaN;
    }
    const half = bytes[0] | (bytes[1] << 8);
    const sign = (half & 0x8000) ? -1 : 1;
    const exp = (half >> 10) & 0x1f;
    const frac = half & 0x03ff;
    if (exp === 0) {
        if (frac === 0) {
            return sign < 0 ? -0 : 0;
        }
        return sign * Math.pow(2, -14) * (frac / 1024);
    }
    if (exp === 0x1f) {
        return frac === 0 ? (sign * Infinity) : NaN;
    }
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/**
 * Interpret raw LE bytes as a typed EvalValue.
 *
 * This is the type-interpretation logic extracted from the old MemoryHost.readValue.
 * The caller is responsible for reading the raw bytes from the byte store.
 *
 * @param raw       The raw bytes to interpret.
 * @param widthBytes  How many bytes were read.
 * @param valueType   Scalar type hint (optional).
 * @returns The decoded value as a number, bigint, or Uint8Array copy.
 */
export function decodeBytesToValue(
    raw: Uint8Array,
    widthBytes: number,
    valueType: ScalarType | undefined,
): EvalValue {
    // Check if widthBytes exceeds the natural type size.
    // This indicates a multi-byte value (e.g., uint8_t with size="4" for IP address)
    // that should remain as raw bytes rather than being converted to a number.
    const typeSize = valueType?.bits ? valueType.bits / 8 : undefined;
    if (typeSize && widthBytes > typeSize && valueType?.kind !== 'float') {
        return raw.slice();
    }

    // Float kinds decode as float16/float32/float64
    if (valueType?.kind === 'float') {
        if (widthBytes === 2) {
            return leToFloat16(raw);
        }
        if (widthBytes === 4) {
            const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
            return dv.getFloat32(0, true);
        }
        if (widthBytes === 8) {
            const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
            return dv.getFloat64(0, true);
        }
        // Non-standard float width: return a copy of the raw bytes
        return raw.slice();
    }

    // ≤4 bytes: JS number (uint32 or signed)
    if (widthBytes <= 4) {
        return valueType?.kind === 'int' ? leToSignedNumber(raw) : leToNumber(raw);
    }

    // 8 bytes: BigInt for full 64-bit integer fidelity
    if (widthBytes === 8) {
        let out = 0n;
        for (let i = 0; i < 8; i++) {
            // eslint-disable-next-line security/detect-object-injection
            out |= BigInt(raw[i]) << BigInt(8 * i);
        }
        return out;
    }

    // >8 bytes: return a copy of the raw bytes
    return raw.slice();
}
