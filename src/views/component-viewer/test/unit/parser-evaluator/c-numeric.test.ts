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

import {
    DEFAULT_INTEGER_MODEL,
    IntegerModelKind,
    type CValue,
    type CType,
    applyBinary,
    applyUnary,
    cValueFromConst,
    convertToType,
    integerModelFromKind,
    parseNumericLiteral,
    parseTypeName,
    sizeofTypeName,
    usualArithmeticConversion,
} from '../../../parser-evaluator/c-numeric';

const makeValue = (type: CType, value: bigint | number): CValue => ({ type, value });

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

    it('selects integer models by kind', () => {
        expect(integerModelFromKind(IntegerModelKind.Model32)).toEqual({
            intBits: 32,
            longBits: 32,
            longLongBits: 64,
            pointerBits: 32,
        });
        expect(integerModelFromKind(IntegerModelKind.Model64)).toEqual({
            intBits: 32,
            longBits: 64,
            longLongBits: 64,
            pointerBits: 64,
        });
    });

    it('parses numeric literals across bases and suffixes', () => {
        expect(parseNumericLiteral('0b1011').value).toBe(11n);
        expect(parseNumericLiteral('0o17').value).toBe(15n);
        expect(parseNumericLiteral('077').value).toBe(63n);
        expect(parseNumericLiteral('0xFF').value).toBe(255n);
        expect(parseNumericLiteral('0xFFFFFFFF').type.name).toBe('unsigned int');
        expect(parseNumericLiteral('0x1FFFFFFFF').type.name).toBe('long long');
        expect(parseNumericLiteral('0xFFFFFFFFFFFFFFFF').type.name).toBe('unsigned long long');
        expect(parseNumericLiteral('1ul').type.name).toBe('unsigned long');
        expect(parseNumericLiteral('1ULL').type.name).toBe('unsigned long long');
        expect(parseNumericLiteral('1ll').type.name).toBe('long long');
        expect(parseNumericLiteral('123_456').value).toBe(123456n);
        expect(parseNumericLiteral('2147483648').type.name).toBe('long long');
    });

    it('parses floating literals with decimal and hex notation', () => {
        const dec = parseNumericLiteral('1.25f');
        expect(dec.type).toEqual({ kind: 'float', bits: 32, name: 'float' });
        expect(dec.value).toBeCloseTo(1.25);

        const hex = parseNumericLiteral('0x1.8p+1');
        expect(hex.type).toEqual({ kind: 'float', bits: 64, name: 'double' });
        expect(hex.value).toBeCloseTo(3);

        const exp = parseNumericLiteral('1e2');
        expect(exp.type).toEqual({ kind: 'float', bits: 64, name: 'double' });
        expect(exp.value).toBe(100);

        const badHex = parseNumericLiteral('0x1.gp1');
        expect(Number.isNaN(badHex.value as number)).toBe(true);
    });

    it('handles invalid integer literals as NaN', () => {
        const bad = parseNumericLiteral('0b2');
        expect(bad.type).toEqual({ kind: 'float', bits: 64, name: 'double' });
        expect(Number.isNaN(bad.value as number)).toBe(true);
    });

    it('converts values to target types', () => {
        const asFloat = convertToType({ type: { kind: 'int', bits: 32 }, value: 5n }, { kind: 'float', bits: 32, name: 'float' });
        expect(asFloat).toEqual({ type: { kind: 'float', bits: 32, name: 'float' }, value: 5 });
        const asFloatNumber = convertToType({ type: { kind: 'float', bits: 64, name: 'double' }, value: 2 }, { kind: 'float', bits: 64, name: 'double' });
        expect(asFloatNumber).toEqual({ type: { kind: 'float', bits: 64, name: 'double' }, value: 2 });

        const asBoolFromNumber = convertToType({ type: { kind: 'float', bits: 64 }, value: 0 }, { kind: 'bool', bits: 1, name: 'bool' });
        expect(asBoolFromNumber.value).toBe(0n);
        const asBoolFromBigint = convertToType({ type: { kind: 'int', bits: 32 }, value: 7n }, { kind: 'bool', bits: 1, name: 'bool' });
        expect(asBoolFromBigint.value).toBe(1n);

        const asInt = convertToType({ type: { kind: 'float', bits: 64 }, value: 255.9 }, { kind: 'int', bits: 8, name: 'int8' });
        expect(asInt.value).toBe(-1n);
    });

    it('creates C values from constants', () => {
        expect(cValueFromConst(true, { kind: 'int', bits: 32 })).toEqual({
            type: { kind: 'bool', bits: 1, name: 'bool' },
            value: 1n,
        });
        expect(cValueFromConst(3.5, { kind: 'float', bits: 64, name: 'double' })).toEqual({
            type: { kind: 'float', bits: 64, name: 'double' },
            value: 3.5,
        });
        expect(cValueFromConst(3.5, { kind: 'int', bits: 32 })).toEqual({
            type: { kind: 'int', bits: 32 },
            value: 3n,
        });
        expect(cValueFromConst(7n, { kind: 'int', bits: 32 })).toEqual({
            type: { kind: 'int', bits: 32 },
            value: 7n,
        });
    });

    it('applies unary operators', () => {
        const intType: CType = { kind: 'int', bits: 8, name: 'int8' };
        const floatType: CType = { kind: 'float', bits: 64, name: 'double' };
        const intVal = makeValue(intType, 1n);
        const floatVal = makeValue(floatType, 2);

        expect(applyUnary('+', intVal)).toBe(intVal);
        expect(applyUnary('-', floatVal)).toEqual({ type: floatVal.type, value: -2 });
        expect(applyUnary('-', intVal)).toEqual({ type: intVal.type, value: -1n });
        expect(applyUnary('!', floatVal)).toEqual({ type: { kind: 'int', bits: 32, name: 'int' }, value: 0n });
        expect(applyUnary('!', intVal)).toEqual({ type: { kind: 'int', bits: 32, name: 'int' }, value: 0n });
        expect(applyUnary('!', makeValue(intType, 0n))).toEqual({
            type: { kind: 'int', bits: 32, name: 'int' },
            value: 1n,
        });
        expect(applyUnary('~', floatVal)).toBeUndefined();
        expect(applyUnary('~', intVal)).toEqual({ type: intVal.type, value: -2n });
        expect(applyUnary('?', intVal)).toBeUndefined();
    });

    it('applies binary operators for logical and comparisons', () => {
        const intType: CType = { kind: 'int', bits: 32, name: 'int' };
        const floatType: CType = { kind: 'float', bits: 64, name: 'double' };
        const intVal = makeValue(intType, 2n);
        const zero = makeValue(intType, 0n);
        const floatVal = makeValue(floatType, 2);

        expect(applyBinary('&&', intVal, zero)?.value).toBe(0n);
        expect(applyBinary('||', intVal, zero)?.value).toBe(1n);
        expect(applyBinary('==', floatVal, makeValue(floatType, 2))?.value).toBe(1n);
        expect(applyBinary('!=', floatVal, makeValue(floatType, 3))?.value).toBe(1n);
        expect(applyBinary('>=', floatVal, makeValue(floatType, 2))?.value).toBe(1n);
        expect(applyBinary('<', intVal, makeValue(intType, 3n))?.value).toBe(1n);
        expect(applyBinary('<=', intVal, makeValue(intType, 2n))?.value).toBe(1n);
        expect(applyBinary('>', intVal, makeValue(intType, 1n))?.value).toBe(1n);
        expect(applyBinary('>=', intVal, makeValue(intType, 2n))?.value).toBe(1n);
    });

    it('applies binary operators for arithmetic and bitwise', () => {
        const intType: CType = { kind: 'int', bits: 8, name: 'int8' };
        const floatType: CType = { kind: 'float', bits: 64, name: 'double' };
        const intVal = makeValue(intType, 4n);
        const floatVal = makeValue(floatType, 5);

        expect(applyBinary('+', floatVal, makeValue(floatType, 1))?.value).toBe(6);
        expect(applyBinary('-', floatVal, makeValue(floatType, 2))?.value).toBe(3);
        expect(applyBinary('*', floatVal, makeValue(floatType, 2))?.value).toBe(10);
        expect(applyBinary('/', floatVal, makeValue(floatType, 2))?.value).toBe(2.5);
        expect(applyBinary('*', intVal, makeValue(intType, 2n))?.value).toBe(8n);
        expect(applyBinary('/', intVal, makeValue(intType, 2n))?.value).toBe(2n);
        expect(applyBinary('%', intVal, makeValue(intType, 3n))?.value).toBe(1n);
        expect(applyBinary('/', intVal, makeValue(intType, 0n))).toBeUndefined();
        expect(applyBinary('%', intVal, makeValue(intType, 0n))).toBeUndefined();
        expect(applyBinary('&', intVal, makeValue(intType, 1n))?.value).toBe(0n);
        expect(applyBinary('|', intVal, makeValue(intType, 1n))?.value).toBe(5n);
        expect(applyBinary('^', intVal, makeValue(intType, 1n))?.value).toBe(5n);
        expect(applyBinary('<<', intVal, makeValue(intType, 1n))?.value).toBe(8n);
        expect(applyBinary('>>', intVal, makeValue(intType, 1n))?.value).toBe(2n);
        expect(applyBinary('<<', intVal, makeValue(intType, -1n))).toBeUndefined();
        expect(applyBinary('>>', intVal, makeValue(intType, 8n))?.value).toBe(0n);
        expect(applyBinary('>>', intVal, makeValue(intType, 32n))).toBeUndefined();
        expect(applyBinary('@', intVal, makeValue(intType, 1n))).toBeUndefined();
    });

    it('performs usual arithmetic conversion for mixed types', () => {
        const floatConv = usualArithmeticConversion({ kind: 'float', bits: 32 }, { kind: 'int', bits: 32 }, DEFAULT_INTEGER_MODEL);
        expect(floatConv).toEqual({ kind: 'float', bits: 32, name: 'float' });

        const boolConv = usualArithmeticConversion({ kind: 'bool', bits: 1 }, { kind: 'int', bits: 32, name: 'int' }, DEFAULT_INTEGER_MODEL);
        expect(boolConv).toEqual({ kind: 'int', bits: 32, name: 'int' });

        const unsignedWins = usualArithmeticConversion({ kind: 'uint', bits: 32, name: 'unsigned int' }, { kind: 'int', bits: 16, name: 'short' }, DEFAULT_INTEGER_MODEL);
        expect(unsignedWins).toEqual({ kind: 'uint', bits: 32, name: 'unsigned int' });

        const signedWins = usualArithmeticConversion({ kind: 'int', bits: 64, name: 'long long' }, { kind: 'uint', bits: 32, name: 'unsigned int' }, DEFAULT_INTEGER_MODEL);
        expect(signedWins).toEqual({ kind: 'int', bits: 64, name: 'long long' });

        const sameKind = usualArithmeticConversion({ kind: 'int', bits: 16, name: 'short' }, { kind: 'int', bits: 32, name: 'int' }, DEFAULT_INTEGER_MODEL);
        expect(sameKind).toEqual({ kind: 'int', bits: 32, name: 'int' });

        const forcedUnsigned = usualArithmeticConversion({ kind: 'int', bits: Number.NaN, name: 'int' }, { kind: 'uint', bits: Number.NaN, name: 'unsigned int' }, DEFAULT_INTEGER_MODEL);
        expect(forcedUnsigned).toEqual({ kind: 'uint', bits: Number.NaN, name: 'unsigned int' });
    });

    it('parses additional type names and sizes', () => {
        expect(parseTypeName('')).toBeUndefined();
        expect(parseTypeName('uint0_t')).toEqual({ kind: 'int', bits: 32, name: 'int' });
        expect(parseTypeName('_bool')).toEqual({ kind: 'bool', bits: 1, name: 'bool' });
        expect(parseTypeName('unsigned char')).toEqual({ kind: 'uint', bits: 8, name: 'unsigned char' });
        expect(parseTypeName('short')).toEqual({ kind: 'int', bits: 16, name: 'short' });
        expect(parseTypeName('long long')).toEqual({ kind: 'int', bits: 64, name: 'long long' });
        expect(parseTypeName('long')).toEqual({ kind: 'int', bits: 32, name: 'long' });
        expect(parseTypeName('int')).toEqual({ kind: 'int', bits: 32, name: 'int' });
        expect(parseTypeName('float')).toEqual({ kind: 'float', bits: 32, name: 'float' });
        expect(parseTypeName('double')).toEqual({ kind: 'float', bits: 64, name: 'double' });
        expect(parseTypeName('size_t')).toEqual({ kind: 'int', bits: 32, name: 'size_t' });
        expect(parseTypeName('ptrdiff_t')).toEqual({ kind: 'int', bits: 32, name: 'ptrdiff_t' });
        expect(parseTypeName('unsigned long')).toEqual({ kind: 'uint', bits: 32, name: 'unsigned long' });
        expect(parseTypeName('int *')).toEqual({ kind: 'int', bits: 32, name: 'int' });
        expect(parseTypeName('void*')).toEqual({ kind: 'ptr', bits: 32, name: 'void*' });

        expect(sizeofTypeName('double')).toBe(8);
        expect(sizeofTypeName('bool')).toBe(1);
        expect(sizeofTypeName('int *')).toBe(4);
        expect(sizeofTypeName('void*')).toBe(4);
        expect(sizeofTypeName('int')).toBe(4);
        expect(sizeofTypeName('not a type')).toBeUndefined();
    });
});
