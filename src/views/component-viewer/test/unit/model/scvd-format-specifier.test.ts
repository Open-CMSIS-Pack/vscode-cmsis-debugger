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
 * Unit test for ScvdFormatSpecifier.
 */

import { ScvdFormatSpecifier } from '../../../model/scvd-format-specifier';

describe('ScvdFormatSpecifier', () => {
    const formatter = new ScvdFormatSpecifier();

    it('formats numbers by type and bit width', () => {
        expect(formatter.formatNumberByType(3.7, { kind: 'int' })).toBe('3');
        expect(formatter.formatNumberByType(-1, { kind: 'uint', bits: 8 })).toBe('255');
        expect(formatter.formatNumberByType(0xFF, { kind: 'int', bits: 8 })).toBe('-1');
        expect(formatter.formatNumberByType(1.23456, { kind: 'float', bits: 32 })).toBe('1.235');
        expect(formatter.formatNumberByType(42, { kind: 'uint', bits: 64 })).toBe('42');
        expect(formatter.formatNumberByType(5n, { kind: 'uint', bits: 64 })).toBe('5');
        expect(formatter.formatNumberByType(10n, { kind: 'uint' })).toBe('10');
        expect(formatter.formatNumberByType(-5n, { kind: 'int' })).toBe('-5');
        expect(formatter.formatNumberByType(7n, { kind: 'unknown' })).toBe('7');
        expect(formatter.formatNumberByType(0xFFn, { kind: 'int', bits: 8 })).toBe('-1');
        expect(formatter.formatNumberByType(0x7Fn, { kind: 'int', bits: 8 })).toBe('127');
        expect(formatter.formatNumberByType(0xFFFF, { kind: 'int', bits: 16 })).toBe('-1');
        expect(formatter.formatNumberByType(0xFFFF, { kind: 'uint', bits: 16 })).toBe('65535');
        expect(formatter.formatNumberByType(3.14, { kind: 'unknown' })).toBe('3.14');
        expect(formatter.formatNumberByType(Number.NaN, { kind: 'uint', bits: 64 })).toBe('NaN');
        expect(formatter.formatNumberByType(Number.POSITIVE_INFINITY, { kind: 'int' })).toBe('Infinity');
    });

    it('formats hex with padding and finite checks', () => {
        expect(formatter.formatHex(15, 8, true)).toBe('0x0F');
        expect(formatter.formatHex(9, 8)).toBe('0x9');
        expect(formatter.formatHex(15n, 8, true)).toBe('0x0F');
        expect(formatter.formatHex(1, 128, true)).toBe('0x0000000000000001');
        expect(formatter.formatHex(1n, { kind: 'int', bits: 16 }, false)).toBe('0x1');
        expect(formatter.formatHex(1, undefined, false)).toBe('0x1');
        expect(formatter.formatHex(2, { kind: 'int' }, false)).toBe('0x2');
        expect(formatter.formatHex(3, 0, true)).toBe('0x3');
        expect(formatter.formatHex(3n, undefined, true)).toBe('0x3');
        expect(formatter.formatHex(Number.NaN, 8, true)).toBe('NaN');
    });

    it('formats base specifiers', () => {
        expect(formatter.format('d', 4.9)).toBe('4');
        expect(formatter.format('d', true)).toBe('1');
        expect(formatter.format('d', { bad: 'value' } as unknown as number)).toBe('NaN');
        expect(formatter.format('d', 5, { typeInfo: { kind: 'int', bits: 16 } })).toBe('5');
        expect(formatter.format('d', 5n)).toBe('5');
        expect(formatter.format('u', -1.9)).toBe('4294967295');
        expect(formatter.format('u', false)).toBe('0');
        expect(formatter.format('u', 5n)).toBe('5');
        expect(formatter.format('x', 15, { typeInfo: { kind: 'int', bits: 8 }, padHex: true })).toBe('0x0F');
        expect(formatter.format('x', '5')).toBe('0x00000005');
        expect(formatter.format('x', 'bad')).toBe('NaN');
        expect(formatter.format('x', 10n)).toBe('0xA');
        expect(formatter.format('t', 'ok %% text')).toBe('ok %% text');
        expect(formatter.format('t', 'bad %s')).toBe('bad literal - %t: text with embedded %format specifier(s)');
        expect(formatter.format('t', 5n)).toBe('5');
        expect(formatter.format('C', 1)).toMatch(/^0x/i);
        expect(formatter.format('S', 'addr')).toBe('addr');
        expect(formatter.format('E', 5)).toBe('5');
        expect(formatter.format('E', 5, { enumText: '7' })).toBe('7');
        expect(formatter.format('E', 'bad')).toBe('bad');
        expect(formatter.format('N', 12)).toBe('12');
        expect(formatter.format('U', 'nope')).toBe('nope');
        expect(formatter.format('%', 0)).toBe('%');
        expect(formatter.format('q', 9, { allowUnknownSpec: true })).toBe('<unknown format specifier %q>');
        expect(formatter.format('q', 9)).toBe('9');
        expect(formatter.format_u(5)).toBe('5');
        expect(formatter.format_d('bad')).toBe('bad');
    });

    it('formats text and byte array variants', () => {
        expect(formatter.format_t('hi')).toBe('hi');
        expect(formatter.format_t(4)).toBe('4');
        expect(formatter.format_t(new Uint8Array([65, 66]))).toBe('AB');
        expect(formatter.format_t({ bad: 'value' } as unknown as number)).toBe('[object Object]');
        expect(formatter.format_t(new Uint8Array([65, 0, 66]))).toBe('A');
        expect(formatter.format('t', new Uint8Array([65, 0, 66]))).toBe('A');
        expect(formatter.format('N', new Uint8Array([65, 66, 0, 67]))).toBe('AB');
        expect(formatter.format('U', new Uint8Array([65, 0, 0, 0]))).toBe('A');
    });

    it('formats address-like and enum types', () => {
        expect(formatter.format_address_like('0x123')).toBe('0x123');
        expect(formatter.format_address_like({} as number)).toBe('<undefined>');
        expect(formatter.format_C(2)).toMatch(/^0x/i);
        expect(formatter.format_S(3)).toMatch(/^0x/i);
        expect(formatter.format_E('7')).toBe('7');
    });

    it('formats IPv4/IPv6 and MAC values', () => {
        expect(formatter.format_I('1.2.3.4')).toBe('1.2.3.4');
        expect(formatter.format_I(0x01020304)).toBe('1.2.3.4');
        expect(formatter.format_I(10n)).toBe('0.0.0.10');
        expect(formatter.format_I(Number.NaN)).toBe('NaN');
        expect(formatter.format('I', 0x01020304)).toBe('1.2.3.4');

        const ipv4 = new Uint8Array([1, 2, 3, 4]);
        const ipv4Short = new Uint8Array([1, 2, 3]);
        expect(formatter.format('I', ipv4)).toBe('1.2.3.4');
        expect(formatter.format('I', ipv4Short)).toBe('<IPV4: access out of bounds>');

        const ipv6 = new Uint8Array([
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 1
        ]);
        const ipv6Short = new Uint8Array([0, 0, 0, 0]);
        expect(formatter.format('J', ipv6)).toBe('::1');
        expect(formatter.format('J', ipv6Short)).toBe('<IPV6: access out of bounds>');
        expect(formatter.format('J', 0x10)).toBe('0x10');
        expect(formatter.format_J('::1')).toBe('::1');
        expect(formatter.format_J(0x10)).toBe('0x10');

        const ipv6Middle = new Uint8Array([
            0x20, 0x01, 0, 0, 0, 0, 0, 1,
            0, 0, 0, 0, 0, 0, 0, 1
        ]);
        expect(formatter.formatIpv6(ipv6Middle)).toBe('2001:0:0:1::1');

        const ipv6End = new Uint8Array([
            0, 1, 0, 2, 0, 3, 0, 4,
            0, 0, 0, 0, 0, 0, 0, 0
        ]);
        expect(formatter.formatIpv6(ipv6End)).toBe('1:2:3:4::');

        const ipv6NoCollapse = new Uint8Array([
            0, 1, 0, 0, 0, 2, 0, 3,
            0, 4, 0, 5, 0, 6, 0, 7
        ]);
        expect(formatter.formatIpv6(ipv6NoCollapse)).toBe('1:0:2:3:4:5:6:7');

        const mac = new Uint8Array([0, 1, 2, 3, 4, 5]);
        const macShort = new Uint8Array([0, 1]);
        expect(formatter.format('M', mac)).toBe('00-01-02-03-04-05');
        expect(formatter.format('M', new Uint8Array([1, 2, 3, 4, 5, 6]))).toBe('01-02-03-04-05-06');
        expect(formatter.formatMac(macShort)).toBe('<MAC: access out of bounds>');
        expect(formatter.format_M(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('00-01-02-03-04-05');
        expect(formatter.format_M('AA:BB:CC')).toBe('00-00-00-AA-BB-CC');
        expect(formatter.format('M', Number.NaN)).toBe('NaN');

        const savedMatch = String.prototype.match;
        try {
            String.prototype.match = function (): RegExpMatchArray | null {
                return null;
            };
            expect(formatter.format_M('AA')).toBe('AA');
        } finally {
            String.prototype.match = savedMatch;
        }
    });

    it('formats typed hex and float values', () => {
        expect(formatter.format_T('3.14', { kind: 'float', bits: 32 })).toBe('3.140');
        expect(formatter.format_T(5.9, { kind: 'unknown' }, true)).toBe('5.90000');
        expect(formatter.format_T('bad', { kind: 'int' })).toBe('bad');
        expect(formatter.format_T(5, { kind: 'int', bits: 8 }, true)).toBe('0x05');
        expect(formatter.format_T(10, { kind: 'unknown' })).toBe('0xA');
        expect(formatter.format_T(5n, { kind: 'float', bits: 32 })).toBe('5.000');
        expect(formatter.format_T(10n, { kind: 'int', bits: 8 }, true)).toBe('0x0A');
        expect(formatter.format_T({ bad: 'value' })).toBe('[object Object]');
        expect(formatter.format('T', 255, { typeInfo: { kind: 'int', bits: 8 }, padHex: true })).toBe('0xFF');
    });

    it('sanitizes literals and escapes non-printable characters', () => {
        expect(formatter.sanitizeLiteral('ok %% text')).toBe('ok %% text');
        expect(formatter.sanitizeLiteral('bad %s')).toBeUndefined();

        const text = `A\n\r\t\v\f\b${String.fromCharCode(7)}${String.fromCharCode(1)}B\0C`;
        const escaped = formatter.escapeNonPrintable(text);
        expect(escaped).toContain('\\n');
        expect(escaped).toContain('\\r');
        expect(escaped).toContain('\\t');
        expect(escaped).toContain('\\v');
        expect(escaped).toContain('\\f');
        expect(escaped).toContain('\\b');
        expect(escaped).toContain('\\a');
        expect(escaped).toContain('\\01');
        expect(escaped).toContain('B');
        expect(escaped).not.toContain('C');
        expect(formatter.escapeNonPrintable(String.fromCharCode(0x80))).toBe('\\80');
    });

    it('prints USB descriptors for supported types', () => {
        expect(formatter.printUsbDescriptor(new Uint8Array([]))).toBe('(invalid: too short)');
        expect(formatter.printUsbDescriptor(new Uint8Array([1, 3]))).toBe('USB String: (invalid)');
        expect(formatter.printUsbDescriptor(new Uint8Array([2, 3]))).toBe('USB String: (empty)');

        const str = new Uint8Array([6, 3, 65, 0, 66, 0]);
        expect(formatter.printUsbDescriptor(str)).toBe('USB String: "AB"');

        const device = new Uint8Array([18, 1, 0, 2, 3, 4, 5, 64, 1, 0, 2, 0, 3, 0, 4, 5, 6, 1]);
        expect(formatter.printUsbDescriptor(device)).toContain('USB Device');

        const config = new Uint8Array([9, 2, 9, 0, 1, 1, 0, 0x80, 50]);
        expect(formatter.printUsbDescriptor(config)).toContain('USB Configuration');
        const configLengthFallback = new Uint8Array([0, 2, 9, 0, 1, 1, 0, 0x80, 50]);
        expect(formatter.printUsbDescriptor(configLengthFallback)).toContain('USB Configuration');

        const iface = new Uint8Array([9, 4, 1, 0, 2, 0xff, 0, 0, 0]);
        expect(formatter.printUsbDescriptor(iface)).toContain('USB Interface');

        const endpoint = new Uint8Array([7, 5, 0x81, 2, 64, 0, 10]);
        expect(formatter.printUsbDescriptor(endpoint)).toContain('USB Endpoint');
        const endpointShort = new Uint8Array([2, 5]);
        expect(formatter.printUsbDescriptor(endpointShort)).toContain('USB Endpoint');

        const qualifier = new Uint8Array([10, 6, 0, 2, 0, 0, 0, 64, 1, 0]);
        expect(formatter.printUsbDescriptor(qualifier)).toContain('USB Device Qualifier');

        const bos = new Uint8Array([5, 0x0f, 5, 0, 1]);
        expect(formatter.printUsbDescriptor(bos)).toContain('USB BOS');
        const bosShort = new Uint8Array([3, 0x0f, 5]);
        expect(formatter.printUsbDescriptor(bosShort)).toContain('USB BOS');

        const unknown = new Uint8Array([4, 0x99, 1, 2, 3]);
        expect(formatter.printUsbDescriptor(unknown)).toContain('Type 0x99');

        const savedU8At = Uint8Array.prototype.at;
        const savedU16At = Uint16Array.prototype.at;
        try {
            Uint8Array.prototype.at = function (index: number): number | undefined {
                if (index === 2 || index === 3) {
                    return undefined;
                }
                return savedU8At.call(this, index);
            };
            Uint16Array.prototype.at = function (index: number): number | undefined {
                if (index === 0) {
                    return undefined;
                }
                return savedU16At.call(this, index);
            };
            const patched = formatter.printUsbDescriptor(str);
            expect(patched).toContain('USB String: "');
            const patchedConfig = formatter.printUsbDescriptor(config);
            expect(patchedConfig).toContain('USB Configuration');
        } finally {
            Uint8Array.prototype.at = savedU8At;
            Uint16Array.prototype.at = savedU16At;
        }
    });

    it('covers fallback string decoding and non-finite hex', () => {
        const globalAny = globalThis as { TextDecoder?: typeof TextDecoder };
        const savedDecoder = globalAny.TextDecoder;
        delete globalAny.TextDecoder;
        try {
            expect(formatter.format_t(new Uint8Array([65, 66, 0]))).toBe('AB');
        } finally {
            if (savedDecoder) {
                globalAny.TextDecoder = savedDecoder;
            }
        }
        expect(formatter.format_x(Number.NaN)).toBe('NaN');
        expect(formatter.format_u('bad')).toBe('bad');
    });
});
