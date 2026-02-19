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

export type CScalarKind = 'int' | 'uint' | 'float' | 'bool' | 'ptr';

export interface CType {
    kind: CScalarKind;
    bits: number;
    name?: string;
}

export interface CValue {
    type: CType;
    value: bigint | number;
}

export interface IntegerModel {
    intBits: number;
    longBits: number;
    longLongBits: number;
    pointerBits: number;
}

export enum IntegerModelKind {
    Model32 = 'model32',
    Model64 = 'model64',
}

export const DEFAULT_INTEGER_MODEL: IntegerModel = {
    intBits: 32,
    longBits: 32,
    longLongBits: 64,
    pointerBits: 32,
};

export const INTEGER_MODEL_32: IntegerModel = { ...DEFAULT_INTEGER_MODEL };
export const INTEGER_MODEL_64: IntegerModel = {
    intBits: 32,
    longBits: 64,
    longLongBits: 64,
    pointerBits: 64,
};

let forceDefaultType = false;
export const __cNumericTestUtils = {
    setForceDefaultType: (value: boolean): void => {
        forceDefaultType = value;
    },
};

export function integerModelFromKind(kind: IntegerModelKind): IntegerModel {
    return kind === IntegerModelKind.Model64 ? { ...INTEGER_MODEL_64 } : { ...INTEGER_MODEL_32 };
}

type IntRankName = 'int' | 'long' | 'long long';

function makeType(kind: CScalarKind, bits: number, name?: string): CType {
    if (name) {
        return { kind, bits, name };
    }
    return { kind, bits };
}

function makeIntType(name: IntRankName, unsigned: boolean, model: IntegerModel): CType {
    const bits = name === 'int' ? model.intBits : name === 'long' ? model.longBits : model.longLongBits;
    const kind: CScalarKind = unsigned ? 'uint' : 'int';
    return makeType(kind, bits, unsigned ? `unsigned ${name}` : name);
}

function maskToBits(value: bigint, bits: number): bigint {
    if (bits <= 0) {
        return value;
    }
    const mask = (1n << BigInt(bits)) - 1n;
    return value & mask;
}

function normalizeSigned(value: bigint, bits: number): bigint {
    const masked = maskToBits(value, bits);
    const signBit = 1n << BigInt(bits - 1);
    return (masked & signBit) !== 0n ? masked - (1n << BigInt(bits)) : masked;
}

function normalizeIntegerValue(value: bigint, type: CType): bigint {
    if (type.kind === 'uint') {
        return maskToBits(value, type.bits);
    }
    if (type.kind === 'int') {
        return normalizeSigned(value, type.bits);
    }
    return value;
}

function integerRank(type: CType): number {
    return type.bits;
}

function isUnsigned(type: CType): boolean {
    return type.kind === 'uint';
}

function canRepresentUnsigned(signedBits: number, unsignedBits: number): boolean {
    return signedBits > unsignedBits;
}

function promoteInteger(type: CType, model: IntegerModel): CType {
    if (type.kind !== 'int' && type.kind !== 'uint' && type.kind !== 'bool') {
        return type;
    }
    const bits = type.bits;
    if (bits < model.intBits) {
        return makeType('int', model.intBits, 'int');
    }
    if (type.kind === 'bool') {
        return makeType('int', model.intBits, 'int');
    }
    return type;
}

export function usualArithmeticConversion(a: CType, b: CType, model: IntegerModel): CType {
    if (a.kind === 'float' || b.kind === 'float') {
        const bits = Math.max(a.bits, b.bits, 32);
        return makeType('float', bits, bits === 32 ? 'float' : 'double');
    }

    const ap = promoteInteger(a, model);
    const bp = promoteInteger(b, model);
    if (ap.kind === bp.kind) {
        return integerRank(ap) >= integerRank(bp) ? ap : bp;
    }

    const unsigned = isUnsigned(ap) ? ap : bp;
    const signed = isUnsigned(ap) ? bp : ap;
    if (integerRank(unsigned) >= integerRank(signed)) {
        return makeType('uint', unsigned.bits, unsigned.name ?? signed.name);
    }
    if (canRepresentUnsigned(signed.bits, unsigned.bits)) {
        return makeType('int', signed.bits, signed.name);
    }
    return makeType('uint', signed.bits, unsigned.name ?? signed.name);
}

export function convertToType(value: CValue, target: CType): CValue {
    if (target.kind === 'float') {
        if (typeof value.value === 'number') {
            return { type: target, value: value.value };
        }
        return { type: target, value: Number(value.value) };
    }
    if (target.kind === 'bool') {
        const truthy = typeof value.value === 'number' ? value.value !== 0 : value.value !== 0n;
        return { type: target, value: truthy ? 1n : 0n };
    }
    const intVal = typeof value.value === 'number' ? BigInt(Math.trunc(value.value)) : value.value;
    const norm = normalizeIntegerValue(intVal, target);
    return { type: target, value: norm };
}

export function parseNumericLiteral(raw: string, model: IntegerModel = DEFAULT_INTEGER_MODEL): CValue {
    const cleaned = raw.replace(/_/g, '');
    const hasHexPrefix = /^0[xX]/.test(cleaned);
    const hasDot = cleaned.includes('.');
    const hasHexExponent = /[pP]/.test(cleaned);
    const hasDecimalExponent = /[eE]/.test(cleaned);
    const hasFloatMarker = hasDot || hasHexExponent || (!hasHexPrefix && hasDecimalExponent);
    let suffix = '';
    let core = cleaned;
    if (!hasFloatMarker) {
        const i64Match = cleaned.match(/([iI]64)$/);
        if (i64Match) {
            suffix = i64Match[1];
            core = cleaned.slice(0, -suffix.length);
        }
    }
    if (!suffix) {
        const suffixMatch = hasFloatMarker
            ? cleaned.match(/([fFlL]+)$/)
            : cleaned.match(/([uUlL]+)$/);
        suffix = suffixMatch ? suffixMatch[1] : '';
        core = suffix ? cleaned.slice(0, -suffix.length) : cleaned;
    }
    const lowerSuffix = suffix.toLowerCase();
    const hasFloatSuffix = lowerSuffix.includes('f');

    const isHex = /^0[xX]/.test(core);
    const isFloat = hasFloatMarker || hasFloatSuffix;
    if (isFloat) {
        const hasHexExp = /[pP]/.test(core);
        let val = NaN;
        if (isHex && hasHexExp) {
            const parts = core.split(/[pP]/);
            const sig = parts[0] ?? '';
            const expPart = parts[1] ?? '0';
            const exp = Number.parseInt(expPart, 10);
            const sigDigits = sig.startsWith('0x') || sig.startsWith('0X') ? sig.slice(2) : sig;
            const [intPart, fracPart = ''] = sigDigits.split('.');
            const intVal = intPart ? Number.parseInt(intPart, 16) : 0;
            let fracVal = 0;
            for (let i = 0; i < fracPart.length; i++) {
                const digit = Number.parseInt(fracPart.charAt(i), 16);
                if (Number.isNaN(digit)) {
                    fracVal = NaN;
                    break;
                }
                fracVal += digit / Math.pow(16, i + 1);
            }
            const baseVal = Number.isNaN(intVal) || Number.isNaN(fracVal) ? NaN : intVal + fracVal;
            val = Number.isNaN(baseVal) || Number.isNaN(exp) ? NaN : baseVal * Math.pow(2, exp);
        } else {
            val = Number.parseFloat(core);
        }
        const bits = hasFloatSuffix ? 32 : 64;
        return { type: makeType('float', bits, bits === 32 ? 'float' : 'double'), value: Number.isFinite(val) ? val : NaN };
    }

    let base = 10;
    let digits = core;
    if (/^0[xX]/.test(core)) {
        base = 16;
        digits = core.slice(2);
    } else if (/^0[bB]/.test(core)) {
        base = 2;
        digits = core.slice(2);
    } else if (/^0[oO]/.test(core)) {
        base = 8;
        digits = core.slice(2);
    } else if (/^0[0-9]/.test(core) && core.length > 1) {
        base = 8;
        digits = core.slice(1);
    }

    let value = 0n;
    let invalid = digits.length === 0;
    if (!invalid) {
        try {
            const normalized = base === 16 ? `0x${digits}` : base === 8 ? `0o${digits}` : base === 2 ? `0b${digits}` : digits;
            value = BigInt(normalized);
        } catch {
            invalid = true;
            value = 0n;
        }
    }

    if (invalid) {
        return { type: makeType('float', 64, 'double'), value: Number.NaN };
    }

    const isUnsignedLiteral = lowerSuffix.includes('u');
    const hasI64Suffix = lowerSuffix === 'i64';
    const hasLongLong = /ll/.test(lowerSuffix);
    const hasLong = /l/.test(lowerSuffix);

    const fitsUnsigned = (bits: number) => value <= ((1n << BigInt(bits)) - 1n);
    const fitsSigned = (bits: number) => value <= ((1n << BigInt(bits - 1)) - 1n);

    let literalType: CType | undefined;
    if (hasI64Suffix) {
        literalType = makeIntType('long long', false, model);
    } else if (isUnsignedLiteral) {
        if (hasLongLong) {
            literalType = makeIntType('long long', true, model);
        } else if (hasLong) {
            literalType = makeIntType('long', true, model);
        } else {
            literalType = makeIntType('int', true, model);
        }
    } else if (hasLongLong) {
        literalType = fitsSigned(model.longLongBits) ? makeIntType('long long', false, model) : makeIntType('long long', true, model);
    } else if (hasLong) {
        literalType = fitsSigned(model.longBits) ? makeIntType('long', false, model) : makeIntType('long', true, model);
    } else if (base === 10) {
        if (fitsSigned(model.intBits)) {
            literalType = makeIntType('int', false, model);
        } else if (fitsSigned(model.longBits)) {
            literalType = makeIntType('long', false, model);
        } else {
            literalType = makeIntType('long long', false, model);
        }
    } else {
        if (fitsSigned(model.intBits)) {
            literalType = makeIntType('int', false, model);
        } else if (fitsUnsigned(model.intBits)) {
            literalType = makeIntType('int', true, model);
        } else if (fitsSigned(model.longBits)) {
            literalType = makeIntType('long', false, model);
        } else if (fitsUnsigned(model.longBits)) {
            literalType = makeIntType('long', true, model);
        } else if (fitsSigned(model.longLongBits)) {
            literalType = makeIntType('long long', false, model);
        } else {
            literalType = makeIntType('long long', true, model);
        }
    }

    if (forceDefaultType) {
        literalType = undefined;
    }
    const finalType = literalType ?? makeIntType('int', false, model);
    return { type: finalType, value: normalizeIntegerValue(value, finalType) };
}

export function cValueFromConst(value: number | bigint | boolean, type: CType): CValue {
    if (typeof value === 'boolean') {
        return { type: makeType('bool', 1, 'bool'), value: value ? 1n : 0n };
    }
    if (typeof value === 'number') {
        if (type.kind === 'float') {
            return { type, value };
        }
        return { type, value: BigInt(Math.trunc(value)) };
    }
    return { type, value };
}

export function applyUnary(op: string, value: CValue): CValue | undefined {
    if (op === '+') {
        return value;
    }
    if (op === '-') {
        if (value.type.kind === 'float') {
            return { type: value.type, value: -(value.value as number) };
        }
        const v = typeof value.value === 'number' ? BigInt(Math.trunc(value.value)) : value.value;
        const out = normalizeIntegerValue(-v, value.type);
        return { type: value.type, value: out };
    }
    if (op === '!') {
        const truthy = value.type.kind === 'float'
            ? (value.value as number) !== 0
            : (value.value as bigint) !== 0n;
        return { type: makeType('int', 32, 'int'), value: truthy ? 0n : 1n };
    }
    if (op === '~') {
        if (value.type.kind === 'float') {
            return undefined;
        }
        const v = typeof value.value === 'number' ? BigInt(Math.trunc(value.value)) : value.value;
        const out = normalizeIntegerValue(~v, value.type);
        return { type: value.type, value: out };
    }
    return undefined;
}

export function applyBinary(op: string, left: CValue, right: CValue, model: IntegerModel = DEFAULT_INTEGER_MODEL): CValue | undefined {
    if (op === '&&' || op === '||') {
        const lv = left.type.kind === 'float' ? (left.value as number) !== 0 : (left.value as bigint) !== 0n;
        const rv = right.type.kind === 'float' ? (right.value as number) !== 0 : (right.value as bigint) !== 0n;
        const out = op === '&&' ? (lv && rv) : (lv || rv);
        return { type: makeType('int', model.intBits, 'int'), value: out ? 1n : 0n };
    }

    if (op === '==' || op === '!=' || op === '<' || op === '<=' || op === '>' || op === '>=') {
        const convType = usualArithmeticConversion(left.type, right.type, model);
        const l = convertToType(left, convType);
        const r = convertToType(right, convType);
        let res = false;
        if (convType.kind === 'float') {
            const ln = l.value as number;
            const rn = r.value as number;
            if (op === '==') res = ln === rn;
            else if (op === '!=') res = ln !== rn;
            else if (op === '<') res = ln < rn;
            else if (op === '<=') res = ln <= rn;
            else if (op === '>') res = ln > rn;
            else res = ln >= rn;
        } else {
            const ln = l.value as bigint;
            const rn = r.value as bigint;
            if (op === '==') res = ln === rn;
            else if (op === '!=') res = ln !== rn;
            else if (op === '<') res = ln < rn;
            else if (op === '<=') res = ln <= rn;
            else if (op === '>') res = ln > rn;
            else res = ln >= rn;
        }
        return { type: makeType('int', model.intBits, 'int'), value: res ? 1n : 0n };
    }

    const convType = usualArithmeticConversion(left.type, right.type, model);
    const l = convertToType(left, convType);
    const r = convertToType(right, convType);

    if (convType.kind === 'float') {
        const ln = l.value as number;
        const rn = r.value as number;
        let out: number;
        if (op === '+') out = ln + rn;
        else if (op === '-') out = ln - rn;
        else if (op === '*') out = ln * rn;
        else if (op === '/') out = ln / rn;
        else return undefined;
        return { type: convType, value: out };
    }

    const ln = l.value as bigint;
    const rn = r.value as bigint;
    let out: bigint;
    switch (op) {
        case '+': out = ln + rn; break;
        case '-': out = ln - rn; break;
        case '*': out = ln * rn; break;
        case '/':
            if (rn === 0n) {
                return undefined;
            }
            out = ln / rn;
            break;
        case '%':
            if (rn === 0n) {
                return undefined;
            }
            out = ln % rn;
            break;
        case '&': out = ln & rn; break;
        case '^': out = ln ^ rn; break;
        case '|': out = ln | rn; break;
        case '<<':
            if (rn < 0n || rn >= BigInt(convType.bits)) {
                return undefined;
            }
            out = ln << rn;
            break;
        case '>>':
            if (rn < 0n || rn >= BigInt(convType.bits)) {
                return undefined;
            }
            out = ln >> rn;
            break;
        default: return undefined;
    }
    return { type: convType, value: normalizeIntegerValue(out, convType) };
}

export function parseTypeName(name: string, model: IntegerModel = DEFAULT_INTEGER_MODEL): CType | undefined {
    const trimmed = name.trim();
    if (!trimmed) {
        return undefined;
    }
    const lower = trimmed.toLowerCase();
    const isUnsigned = lower.includes('unsigned');
    const fixedWidthMatch = lower.match(/^(u?)int(8|16|32|64)_t$/);
    if (fixedWidthMatch) {
        const unsigned = fixedWidthMatch[1] === 'u';
        const bits = Number.parseInt(fixedWidthMatch[2] ?? '0', 10);
        if (bits > 0) {
            return makeType(unsigned ? 'uint' : 'int', bits, trimmed);
        }
    }
    if (lower.includes('bool') || lower === '_bool') {
        return makeType('bool', 1, 'bool');
    }
    if (lower === 'signed') {
        return makeType('int', model.intBits, 'int');
    }
    if (lower === 'unsigned') {
        return makeType('uint', model.intBits, 'unsigned int');
    }
    if (lower.includes('char')) {
        return makeType(isUnsigned ? 'uint' : 'int', 8, isUnsigned ? 'unsigned char' : 'char');
    }
    if (lower.includes('short')) {
        return makeType(isUnsigned ? 'uint' : 'int', 16, isUnsigned ? 'unsigned short' : 'short');
    }
    if (lower.includes('long double')) {
        return makeType('float', 64, 'long double');
    }
    if (lower.includes('long long')) {
        return makeIntType('long long', isUnsigned, model);
    }
    if (lower.includes('long')) {
        return makeIntType('long', isUnsigned, model);
    }
    if (lower.includes('int')) {
        return makeIntType('int', isUnsigned, model);
    }
    if (lower.includes('float')) {
        return makeType('float', 32, 'float');
    }
    if (lower.includes('double')) {
        return makeType('float', 64, 'double');
    }
    if (lower.includes('size_t') || lower.includes('ptrdiff_t')) {
        return makeType(isUnsigned ? 'uint' : 'int', model.pointerBits, trimmed);
    }
    if (lower.endsWith('*')) {
        return makeType('ptr', model.pointerBits, trimmed);
    }
    return undefined;
}

export function sizeofTypeName(name: string, model: IntegerModel = DEFAULT_INTEGER_MODEL): number | undefined {
    const type = parseTypeName(name, model);
    if (!type) {
        return undefined;
    }
    if (type.kind === 'float') {
        return type.bits / 8;
    }
    if (type.kind === 'bool') {
        return 1;
    }
    if (type.kind === 'ptr') {
        return model.pointerBits / 8;
    }
    return Math.max(1, Math.floor(type.bits / 8));
}
