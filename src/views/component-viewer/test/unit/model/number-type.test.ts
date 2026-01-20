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
 * Unit test for NumberType.
 */
// generated with AI

import { NumFormat, NumberType } from '../../../model/number-type';

describe('NumberType', () => {
    it('constructs from numbers and respects formats', () => {
        const num = new NumberType(42);
        expect(num.format).toBe(NumFormat.decimal);
        expect(num.displayFormat).toBe(NumFormat.decimal);
        expect(num.value).toBe(42);

        const hex = new NumberType(255, NumFormat.hexadecimal, 8);
        expect(hex.format).toBe(NumFormat.hexadecimal);
        expect(hex.displayFormat).toBe(NumFormat.hexadecimal);
        expect(hex.numOfDisplayBits).toBe(8);
    });

    it('copies from another NumberType and clamps digit setters', () => {
        const base = new NumberType(7, NumFormat.decimal);
        base.numOfDigits = 0;
        base.numOfDisplayBits = 0;
        expect(base.numOfDigits).toBe(1);
        expect(base.numOfDisplayBits).toBe(1);

        const copy = new NumberType(base);
        copy.numOfDigits = -2;
        copy.numOfDisplayBits = -3;
        expect(copy.numOfDigits).toBe(1);
        expect(copy.numOfDisplayBits).toBe(1);
        expect(copy.value).toBe(7);
    });

    it('parses string inputs and booleans', () => {
        const hex = new NumberType('0x1F');
        expect(hex.format).toBe(NumFormat.hexadecimal);
        expect(hex.getText()).toBe('0x1F');

        const bin = new NumberType('0b1010');
        expect(bin.format).toBe(NumFormat.binary);
        expect(bin.getText()).toBe('0b1010');

        const oct = new NumberType('075');
        expect(oct.format).toBe(NumFormat.octal);
        expect(oct.getText()).toBe('075');

        const dec = new NumberType('123');
        expect(dec.format).toBe(NumFormat.decimal);
        expect(dec.getText()).toBe('123');

        const t = new NumberType('true');
        const f = new NumberType('false');
        expect(t.format).toBe(NumFormat.boolean);
        expect(t.getText()).toBe('true');
        expect(f.format).toBe(NumFormat.boolean);
        expect(f.getText()).toBe('false');
    });

    it('handles invalid and empty strings', () => {
        const invalid = new NumberType('xyz');
        expect(invalid.isValid()).toBe(false);
        expect(invalid.getText()).toBe('0');

        const empty = new NumberType('');
        expect(empty.isValid()).toBe(false);
        expect(empty.getText()).toBe('0');

        const single = new NumberType('7');
        expect(single.format).toBe(NumFormat.decimal);

        const neg = new NumberType('-1');
        expect(neg.value).toBe(-1);

        const hexEmpty = new NumberType('0x');
        expect(hexEmpty.numOfDigits).toBe(1);
    });

    it('formats negative values and boolean defaults', () => {
        const neg = new NumberType(-15, NumFormat.hexadecimal);
        expect(neg.getValStrByFormat(NumFormat.hexadecimal, 2)).toBe('-0x0F');

        const bool = new NumberType(2, NumFormat.boolean);
        expect(bool.getValStrByFormat(NumFormat.boolean, 1)).toBe('true');
    });

    it('supports display formatting rules', () => {
        const display = new NumberType(0xA, NumFormat.hexadecimal, 5);
        expect(display.getDisplayText()).toBe('0x0A');

        display.displayFormat = NumFormat.decimal;
        expect(display.getDisplayText()).toBe('10');

        display.displayFormat = NumFormat.octal;
        display.numOfDisplayBits = 4;
        expect(display.getDisplayText()).toBe('012');

        display.displayFormat = NumFormat.undefined;
        expect(display.getDisplayText()).toBe('10');

        const small = new NumberType(1, NumFormat.hexadecimal, 0);
        expect(small.getDisplayText()).toBe('0x1');
    });

    it('supports min/max bounds and accessors', () => {
        const bounded = new NumberType(10);
        bounded.setMin(3);
        bounded.setMax(8);
        expect(bounded.value).toBe(8);

        bounded.value = 1;
        expect(bounded.value).toBe(3);

        bounded.setMinMax(2, undefined);
        bounded.setMinMax(undefined, 12);
        expect(bounded.min).toBe(2);
        expect(bounded.max).toBe(12);
        expect(bounded.getMinMax()).toEqual({ min: 2, max: 12 });
    });

    it('exposes format prefix and text helpers', () => {
        const num = new NumberType(0);
        expect(num.getFormatPrefix(NumFormat.decimal)).toBe('');
        expect(num.getFormatPrefix(NumFormat.hexadecimal)).toBe('0x');
        expect(num.getFormatPrefix(NumFormat.octal)).toBe('0');
        expect(num.getFormatPrefix(NumFormat.binary)).toBe('0b');
        expect(num.getFormatPrefix(NumFormat.undefined)).toBe('');

        expect(num.getFormatText(NumFormat.decimal)).toBe('decimal');
        expect(num.getFormatText(NumFormat.hexadecimal)).toBe('hexadecimal');
        expect(num.getFormatText(NumFormat.octal)).toBe('octal');
        expect(num.getFormatText(NumFormat.binary)).toBe('binary');
        expect(num.getFormatText(NumFormat.boolean)).toBe('boolean');
        expect(num.getFormatText(NumFormat.undefined)).toBe('undefined');
    });

    it('updates values and formats through setters', () => {
        const num = new NumberType();
        num.value = 3;
        expect(num.format).toBe(NumFormat.decimal);
        expect(num.displayFormat).toBe(NumFormat.decimal);

        const other = new NumberType(5, NumFormat.octal);
        num.value = other;
        expect(num.format).toBe(NumFormat.octal);

        num.value = '0b11';
        expect(num.format).toBe(NumFormat.binary);

        num.format = NumFormat.hexadecimal;
        expect(num.format).toBe(NumFormat.hexadecimal);
    });

    it('covers string setter branch directly', () => {
        const num = new NumberType();
        const setter = Object.getOwnPropertyDescriptor(NumberType.prototype, 'value')?.set;
        expect(typeof setter).toBe('function');
        setter?.call(num, '0b1');
        expect(num.format).toBe(NumFormat.binary);
    });

    it('covers non-string setter fallthrough', () => {
        const num = new NumberType(11);
        const setter = Object.getOwnPropertyDescriptor(NumberType.prototype, 'value')?.set;
        setter?.call(num, true as unknown as number);
        expect(num.value).toBe(11);
    });

    it('forces fallback when formatted text is empty', () => {
        const originalToString = Number.prototype.toString;
        Number.prototype.toString = () => '';
        try {
            const num = new NumberType(7, NumFormat.decimal);
            expect(num.getValStrByFormat(NumFormat.decimal, 1)).toBe('');
        } finally {
            Number.prototype.toString = originalToString;
        }
    });

    it('pads digits when the requested width is below one', () => {
        const num = new NumberType(5, NumFormat.hexadecimal);
        expect(num.getValStrByFormat(NumFormat.hexadecimal, 0)).toBe('0x5');
    });

    it('covers setter branches and protected toNumber parsing', () => {
        const num = new NumberType();
        num.numOfDigits = 0;
        num.numOfDigits = 2;

        num.value = '0';
        expect(num.format).toBe(NumFormat.decimal);

        const parsed = (num as unknown as { toNumber: (v: string) => { displayFormat: NumFormat } }).toNumber('-2');
        expect(parsed.displayFormat).toBe(NumFormat.decimal);

        expect(num.getFormatText(NumFormat.decimal)).toBe('decimal');
    });

    it('covers displayFormat branch when enum value is NaN', () => {
        const enumRef = NumFormat as unknown as { undefined: number };
        const original = enumRef.undefined;
        enumRef.undefined = Number.NaN;
        try {
            const num = new NumberType();
            const parsed = (num as unknown as { toNumber: (v: string) => { displayFormat: number } }).toNumber('1');
            expect(Number.isNaN(parsed.displayFormat)).toBe(true);
        } finally {
            enumRef.undefined = original;
        }
    });

    it('covers default branch in getFormatText', () => {
        const num = new NumberType();
        expect(num.getFormatText(99 as NumFormat)).toBe('undefined');
    });
});
