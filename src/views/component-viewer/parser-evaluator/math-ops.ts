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

/**
 * Shared numeric helpers used by the evaluator and parser constant folding.
 */

import {
    applyBinary,
    convertToType,
    DEFAULT_INTEGER_MODEL,
    type IntegerModel,
    type CType,
    type CValue,
} from './c-numeric';
import { perf } from '../stats-config';

export type ScalarKind = 'int' | 'uint' | 'float';

export interface ScalarType {
    kind: ScalarKind;
    bits?: number;
    name?: string;
    typename?: string;
}

export type MathValue =
    | number
    | bigint
    | string
    | boolean
    | Uint8Array
    // very loose function type to accept evaluator-provided callables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((...args: any[]) => any)
    | undefined;

function toCType(bits?: number, unsigned?: boolean, kindOverride?: ScalarKind): CType | undefined {
    if (!bits || bits <= 0) {
        return undefined;
    }
    if (kindOverride === 'float') {
        return { kind: 'float', bits, name: bits === 32 ? 'float' : 'double' };
    }
    return { kind: unsigned ? 'uint' : 'int', bits, name: unsigned ? `uint${bits}` : `int${bits}` };
}

function toCValueFromMath(value: MathValue, target?: CType, model: IntegerModel = DEFAULT_INTEGER_MODEL): CValue | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === 'bigint') {
        const type = target ?? { kind: 'int', bits: model.longLongBits, name: 'long long' };
        const cv: CValue = { type, value };
        return target ? convertToType(cv, type) : cv;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return undefined;
        }
        if (target) {
            if (target.kind === 'float') {
                return { type: target, value };
            }
            const cv: CValue = { type: target, value: BigInt(Math.trunc(value)) };
            return convertToType(cv, target);
        }
        if (Number.isInteger(value)) {
            return { type: { kind: 'int', bits: model.intBits, name: 'int' }, value: BigInt(Math.trunc(value)) };
        }
        return { type: { kind: 'float', bits: 64, name: 'double' }, value };
    }
    if (typeof value === 'boolean') {
        const type = target ?? { kind: 'bool', bits: 1, name: 'bool' } as CType;
        const cv: CValue = { type, value: value ? 1n : 0n };
        return target ? convertToType(cv, type) : cv;
    }
    return undefined;
}

function fromCValue(value: CValue): number | bigint {
    if (value.type.kind === 'float') {
        return value.value as number;
    }
    const big = value.value as bigint;
    const bits = value.type.bits ?? 0;
    if (bits > 32) {
        return big;
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (big > maxSafe || big < minSafe) {
        return big;
    }
    return Number(big);
}

export function toNumeric(x: MathValue): number | bigint {
    if (typeof x === 'number' || typeof x === 'bigint') {
        return x;
    }
    if (typeof x === 'boolean') {
        return x ? 1 : 0;
    }
    if (typeof x === 'string' && x.trim() !== '') {
        const n = Number(x);
        if (Number.isFinite(n)) {
            return n;
        }
        try {
            return BigInt(x);
        } catch {
            return 0;
        }
    }
    return 0;
}

export function toBigInt(x: MathValue): bigint {
    if (typeof x === 'bigint') {
        return x;
    }
    if (typeof x === 'number') {
        return BigInt(Math.trunc(x));
    }
    if (typeof x === 'boolean') {
        return x ? 1n : 0n;
    }
    if (typeof x === 'string' && x.trim() !== '') {
        try {
            return BigInt(x);
        } catch {
            const n = Number(x);
            return BigInt(Math.trunc(Number.isFinite(n) ? n : 0));
        }
    }
    return 0n;
}

export function maskToBits(v: number | bigint, bits?: number): number | bigint {
    const perfStart = perf?.start() ?? 0;
    if (!bits || bits <= 0) {
        perf?.end(perfStart, 'cNumericMaskMs', 'cNumericMaskCalls');
        return v;
    }
    const big = typeof v === 'bigint' ? v : BigInt(Math.trunc(v));
    const mask = (1n << BigInt(bits)) - 1n;
    const out = big & mask;
    if (typeof v === 'bigint') {
        perf?.end(perfStart, 'cNumericMaskMs', 'cNumericMaskCalls');
        return out;
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (out > maxSafe || out < minSafe) {
        perf?.end(perfStart, 'cNumericMaskMs', 'cNumericMaskCalls');
        return out;
    }
    perf?.end(perfStart, 'cNumericMaskMs', 'cNumericMaskCalls');
    return Number(out);
}

export function normalizeToWidth(v: number | bigint, bits: number | undefined, kind: ScalarKind | 'unknown'): number | bigint {
    const perfStart = perf?.start() ?? 0;
    if (!bits || bits <= 0 || kind === 'float') {
        perf?.end(perfStart, 'cNumericNormalizeMs', 'cNumericNormalizeCalls');
        return v;
    }
    if (kind === 'uint') {
        const out = maskToBits(v, bits);
        perf?.end(perfStart, 'cNumericNormalizeMs', 'cNumericNormalizeCalls');
        return out;
    }
    // signed: mask then sign-extend
    const big = typeof v === 'bigint' ? v : BigInt(Math.trunc(v));
    const mask = (1n << BigInt(bits)) - 1n;
    const m = big & mask;
    const sign = 1n << BigInt(bits - 1);
    const out = (m & sign) ? m - (1n << BigInt(bits)) : m;
    if (typeof v === 'bigint') {
        perf?.end(perfStart, 'cNumericNormalizeMs', 'cNumericNormalizeCalls');
        return out;
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (out > maxSafe || out < minSafe) {
        perf?.end(perfStart, 'cNumericNormalizeMs', 'cNumericNormalizeCalls');
        return out;
    }
    perf?.end(perfStart, 'cNumericNormalizeMs', 'cNumericNormalizeCalls');
    return Number(out);
}

export function addVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('+', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function subVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('-', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function mulVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('*', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function divVals(a: MathValue, b: MathValue, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const ca = toCValueFromMath(a, undefined, model);
    const cb = toCValueFromMath(b, undefined, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('/', ca, cb, model);
    if (!out) {
        return undefined;
    }
    return fromCValue(out);
}

export function modVals(a: MathValue, b: MathValue, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const ca = toCValueFromMath(a, undefined, model);
    const cb = toCValueFromMath(b, undefined, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('%', ca, cb, model);
    if (!out) {
        return undefined;
    }
    return fromCValue(out);
}

export function andVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('&', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function xorVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('^', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function orVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('|', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function shlVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('<<', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function sarVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, unsigned);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('>>', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function shrVals(a: MathValue, b: MathValue, bits?: number, model: IntegerModel = DEFAULT_INTEGER_MODEL): MathValue {
    const target = toCType(bits, true);
    const ca = toCValueFromMath(a, target, model);
    const cb = toCValueFromMath(b, target, model);
    if (!ca || !cb) {
        return undefined;
    }
    const out = applyBinary('>>', ca, cb, model);
    if (!out) {
        return undefined;
    }
    const converted = target ? convertToType(out, target) : out;
    return fromCValue(converted);
}

export function mergeKinds(a?: ScalarType, b?: ScalarType): ScalarKind | 'unknown' {
    const ka = a?.kind;
    const kb = b?.kind;
    if (ka === 'float' || kb === 'float') {
        return 'float';
    }
    if (ka === 'uint' || kb === 'uint') {
        return 'uint';
    }
    if (ka === 'int' || kb === 'int') {
        return 'int';
    }
    return 'unknown';
}
