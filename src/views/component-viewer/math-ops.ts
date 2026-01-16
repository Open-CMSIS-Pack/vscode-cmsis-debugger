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
    if (!bits || bits <= 0) {
        return v;
    }
    if (typeof v === 'bigint') {
        const mask = (1n << BigInt(bits)) - 1n;
        return v & mask;
    }
    if (bits >= 32) {
        return v >>> 0;
    }
    const mask = (1 << bits) - 1;
    return (v >>> 0) & mask;
}

export function normalizeToWidth(v: number | bigint, bits: number | undefined, kind: ScalarKind | 'unknown'): number | bigint {
    if (!bits || bits <= 0 || kind === 'float') {
        return v;
    }
    if (kind === 'uint') {
        return maskToBits(v, bits);
    }
    // signed: mask then sign-extend
    if (typeof v === 'bigint') {
        const mask = (1n << BigInt(bits)) - 1n;
        const m = v & mask;
        const sign = 1n << BigInt(bits - 1);
        return (m & sign) ? m - (1n << BigInt(bits)) : m;
    }
    const width = bits >= 32 ? 32 : bits;
    const mask = width === 32 ? 0xFFFF_FFFF : (1 << width) - 1;
    const m = (v >>> 0) & mask;
    const sign = 1 << (width - 1);
    return (m & sign) ? (m | (~mask)) : m;
}

export function addVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    if (typeof a === 'string' || typeof b === 'string') {
        return String(a) + String(b);
    }
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = toBigInt(na) + toBigInt(nb);
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (na as number) + (nb as number);
    return unsigned ? maskToBits(out, bits) : out;
}

export function subVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = toBigInt(na) - toBigInt(nb);
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (na as number) - (nb as number);
    return unsigned ? maskToBits(out, bits) : out;
}

export function mulVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = toBigInt(na) * toBigInt(nb);
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (na as number) * (nb as number);
    return unsigned ? maskToBits(out, bits) : out;
}

export function divVals(a: MathValue, b: MathValue): MathValue {
    const nb = toNumeric(b);
    if ((typeof nb === 'bigint' && nb === 0n) || (typeof nb === 'number' && nb === 0)) {
        throw new Error('Division by zero');
    }
    const na = toNumeric(a);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na) / toBigInt(nb);
    }
    return (na as number) / (nb as number);
}

export function modVals(a: MathValue, b: MathValue): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na) % toBigInt(nb);
    }
    return ((na as number) | 0) % ((nb as number) | 0);
}

export function andVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = (toBigInt(na) & toBigInt(nb));
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (((na as number | 0) & (nb as number | 0)) >>> 0);
    return unsigned ? maskToBits(out, bits) : out;
}

export function xorVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = (toBigInt(na) ^ toBigInt(nb));
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (((na as number | 0) ^ (nb as number | 0)) >>> 0);
    return unsigned ? maskToBits(out, bits) : out;
}

export function orVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = (toBigInt(na) | toBigInt(nb));
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = (((na as number | 0) | (nb as number | 0)) >>> 0);
    return unsigned ? maskToBits(out, bits) : out;
}

export function shlVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = (toBigInt(na) << BigInt(toBigInt(nb)));
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = ((na as number | 0) << ((nb as number) & 31)) >>> 0;
    return unsigned ? maskToBits(out, bits) : out;
}

export function sarVals(a: MathValue, b: MathValue, bits?: number, unsigned?: boolean): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const out = (toBigInt(na) >> BigInt(toBigInt(nb)));
        return unsigned ? maskToBits(out, bits) : out;
    }
    const out = ((na as number | 0) >> ((nb as number) & 31)) >>> 0;
    return unsigned ? maskToBits(out, bits) : out;
}

export function shrVals(a: MathValue, b: MathValue, bits?: number): MathValue {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        const shifted = toBigInt(na) >> BigInt(toBigInt(nb));
        const out = shifted >= 0 ? shifted : 0n;
        return maskToBits(out, bits);
    }
    const out = ((na as number) >>> ((nb as number) & 31)) >>> 0;
    return maskToBits(out, bits);
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
