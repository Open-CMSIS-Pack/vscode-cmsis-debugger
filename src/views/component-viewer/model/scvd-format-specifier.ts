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
 */

import { NumberType, NumFormat } from './number-type';

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html


/*  Note:
    Question 1 (HEX display of float):
    What should be the expected behavior for displaying float32 and float64 values in hexadecimal format? Should they be shown as truncated unsigned integers (UINT) or in their raw IEEE representation?
    A: show as truncated integers

    Question 2 (0x000... padding):
    What should be the maximum padding size for HEX zeros (0x000...<num>): 32 or 64?
    A: show the value without padding zeros, i.e. 0x3, 0x3bc4
*/

export type FormatKind = 'int' | 'uint' | 'float' | 'unknown';
export interface FormatTypeInfo {
    kind: FormatKind;
    bits?: number;
}

export interface FormatOptions {
    typeInfo?: FormatTypeInfo;
    enumText?: string;
    allowUnknownSpec?: boolean;
    padHex?: boolean;
}

export class ScvdFormatSpecifier {
    private utf16leDecoder: TextDecoder;

    constructor(
    ) {
        this.utf16leDecoder = new TextDecoder('utf-16le');
    }

    public formatNumberByType(value: number | bigint, opts: { kind: 'int' | 'uint' | 'float' | 'unknown'; bits?: number }): string {
        const { kind, bits } = opts;
        // normalize number inputs for integer-like kinds
        if ((kind === 'int' || kind === 'uint') && typeof value === 'number') {
            value = Math.trunc(value);
        }
        const asBig = (v: number | bigint): bigint | undefined => {
            if (typeof v === 'bigint') {
                return v;
            }
            if (!Number.isFinite(v)) {
                return undefined;
            }
            return BigInt(Math.trunc(v));
        };

        const preferBig = kind !== 'float' && (typeof value === 'bigint' || (!!bits && bits > 32));
        if (preferBig) {
            const vb = asBig(value);
            if (vb === undefined) {
                return `${value}`;
            }
            if (kind === 'uint') {
                if (bits && bits > 0) {
                    const mask = (1n << BigInt(bits)) - 1n;
                    return (vb & mask).toString(10);
                }
                return vb.toString(10);
            }
            if (kind === 'int') {
                if (bits && bits > 0) {
                    const mask = (1n << BigInt(bits)) - 1n;
                    let m = vb & mask;
                    const sign = 1n << BigInt(bits - 1);
                    if ((m & sign) !== 0n) {
                        m -= (1n << BigInt(bits));
                    }
                    return m.toString(10);
                }
                return vb.toString(10);
            }
            return vb.toString(10);
        }

        if (!Number.isFinite(value as number)) {
            return `${value}`;
        }

        if (kind === 'float') {
            // Keep floats readable but short; mirror legacy behaviour (float ~3 decimals, double ~6+).
            if (bits && bits <= 32) {
                return (value as number).toFixed(3);
            }
            return (value as number).toPrecision(6);
        }

        if (kind === 'int') {
            if (bits && bits < 32) {
                const shift = 32 - bits;
                const signed = ((value as number) << shift) >> shift;
                return signed.toString(10);
            }
            return ((value as number) | 0).toString(10);
        }

        if (kind === 'uint') {
            if (bits && bits < 32) {
                const mask = (1 << bits) >>> 0;
                return (((value as number) >>> 0) & mask).toString(10);
            }
            return ((value as number) >>> 0).toString(10);
        }

        return (value as number).toString(10);
    }

    /**
     * Central formatter that applies printf-like specifiers to the already-resolved value.
     * All data fetching and symbol/memory lookups should happen before calling this.
     */
    public format(spec: string, value: unknown, options?: FormatOptions): string {
        const typeInfo = options?.typeInfo;
        const enumText = options?.enumText;
        const padHex = options?.padHex ?? false;

        const toNumeric = (v: unknown): number | bigint => {
            if (typeof v === 'number' || typeof v === 'bigint') {
                return v;
            }
            if (typeof v === 'boolean') {
                return v ? 1 : 0;
            }
            if (typeof v === 'string') {
                const n = Number(v);
                return Number.isFinite(n) ? n : NaN;
            }
            return NaN;
        };

        const toNumber = toNumeric;

        const numOpts = (kind: FormatKind) => {
            const o: { kind: FormatKind; bits?: number } = { kind };
            if (typeInfo?.bits !== undefined) {
                o.bits = typeInfo.bits;
            }
            return o;
        };

        switch (spec) {
            case 'd': {
                let n = toNumber(value);
                if (typeof n === 'number') {
                    n = Math.trunc(n);
                }
                return this.formatNumberByType(n, numOpts('int'));
            }
            case 'u': {
                let n = toNumber(value);
                if (typeof n === 'number') {
                    n = Math.trunc(n);
                }
                return this.formatNumberByType(n, numOpts('uint'));
            }
            case 'x': {
                let n = toNumeric(value);
                if (typeof n === 'number' && (typeInfo?.kind ?? 'unknown') !== 'float') {
                    n = Math.trunc(n);
                }
                return this.format_x(n, typeInfo, padHex);
            }
            case 't': {
                if (typeof value === 'string') {
                    const sanitized = this.sanitizeLiteral(value);
                    if (!sanitized) {
                        return 'bad literal - %t: text with embedded %format specifier(s)';
                    }
                    return this.escapeNonPrintable(sanitized);
                }
                if (value instanceof Uint8Array) {
                    return this.escapeNonPrintable(this.format_N(value));
                }
                return String(value);
            }
            case 'C': {
                return this.format_C(value as number | string);
            }
            case 'S': {
                return this.format_S(value as number | string);
            }
            case 'E': {
                if (enumText) {
                    return this.format_E(enumText);
                }
                const n = toNumber(value);
                return this.format_E(Number.isFinite(n) ? this.formatNumberByType(n, numOpts('int')) : String(value));
            }
            case 'I': {
                if (value instanceof Uint8Array) {
                    return this.formatIpv4(value);
                }
                const n = toNumber(value);
                return this.format_I(n as number | bigint);
            }
            case 'J': {
                if (value instanceof Uint8Array) {
                    return this.formatIpv6(value);
                }
                return this.format_J(value as number | string | bigint);
            }
            case 'N': {
                if (value instanceof Uint8Array) {
                    return this.format_N(value);
                }
                return String(value);
            }
            case 'M': {
                if (value instanceof Uint8Array) {
                    return this.formatMac(value);
                }
                return this.format_M(value as number | string);
            }
            case 'T': {
                return this.format_T(value, typeInfo, padHex);
            }
            case 'U': {
                if (value instanceof Uint8Array) {
                    return this.format_U(value);
                }
                return String(value);
            }
            case '%': {
                return this.format_percent();
            }
            default: {
                if (options?.allowUnknownSpec) {
                    return `<unknown format specifier %${spec}>`;
                }
                return String(value);
            }
        }
    }

    public formatHex(value: number | bigint, bitsOrTypeInfo?: number | FormatTypeInfo, padZeroes: boolean = false): string {
        const bits = typeof bitsOrTypeInfo === 'number' ? bitsOrTypeInfo : bitsOrTypeInfo?.bits;

        if (typeof value === 'bigint') {
            const widthRaw = bits ? Math.ceil(bits / 4) : 0;
            const width = padZeroes && widthRaw > 0 ? Math.min(widthRaw, 16) : 0;
            const hex = value.toString(16);
            const padded = width > 0 ? hex.padStart(width, '0') : hex;
            return '0x' + padded;
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return `${value}`;
        }
        const widthRaw = bits ? Math.ceil(bits / 4) : 0;
        const width = padZeroes && widthRaw > 0 ? Math.min(widthRaw, 16) : 0; // cap padding to 64-bit to avoid runaway zeros
        const hex = (n >>> 0).toString(16);
        const padded = width > 0 ? hex.padStart(width, '0') : hex;
        return '0x' + padded;
    }

    public format_d(value: number | string): string {
        const n = Number(value);
        return Number.isFinite(n) ? n.toString(10) : `${value}`;
    }

    public format_u(value: number | string): string {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return `${value}`;
        }
        return (n >>> 0).toString(10);
    }

    public format_t(value: number | string | Uint8Array): string {
        // Already a string: nothing to do
        if (typeof value === 'string') {
            return value;
        }

        // Number: whatever your existing formatting rule is
        if (typeof value === 'number') {
            return value.toString();
        }

        // C string: null-terminated Uint8Array
        if (value instanceof Uint8Array) {
            // Find first 0 byte (C '\0')
            let end = value.indexOf(0);
            if (end === -1) {
                end = value.length;
            }

            // Prefer UTF-8 decode (typical for C strings nowadays)
            if (typeof TextDecoder !== 'undefined') {
                const dec = new TextDecoder('utf-8', { fatal: false });
                return dec.decode(value.subarray(0, end));
            }

            // Fallback: simple byte→char (ASCII / Latin-1 style)
            let s = '';
            for (const ch of value.subarray(0, end)) {
                s += String.fromCharCode(ch);
            }
            return s;
        }

        // Fallback in case something weird sneaks in
        return String(value);
    }

    public format_x(value: number | string | bigint, typeInfo?: FormatTypeInfo, padZeroes: boolean = false): string {
        if (typeof value === 'bigint') {
            return this.formatHex(value, typeInfo, padZeroes);
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return `${value}`;
        }
        return this.formatHex(n, typeInfo, padZeroes);
    }

    public format_address_like(value: number | string): string {
        if ( typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number') {
            const num = new NumberType(value, NumFormat.hexadecimal, 32);
            return num.getDisplayText();
        }
        return '<undefined>';
    }

    public format_C(value: number | string): string {
        return this.format_address_like(value);
    }

    public format_S(value: number | string): string {
        return this.format_address_like(value);
    }

    public format_E(value: number | string): string {
        return this.format_d(value);    // either string or number
    }

    public format_I(value: number | string | bigint): string {
        if (typeof value === 'string') {
            return value;
        }
        const n = typeof value === 'bigint' ? Number(value) : Number(value);
        if (!Number.isFinite(n)) {
            return `${value}`;
        }
        const b0 = (n >>> 24) & 0xFF;
        const b1 = (n >>> 16) & 0xFF;
        const b2 = (n >>> 8) & 0xFF;
        const b3 = n & 0xFF;
        return `${b0}.${b1}.${b2}.${b3}`;
    }

    public format_J(value: number | string | bigint): string {
        // If already a string, assume formatted IPv6
        if (typeof value === 'string') {
            return value;
        }
        // Cannot reliably format numeric IPv6 (needs 128-bit); fallback to hex
        return this.format_x(value);
    }

    // ASCII string
    public format_N(value: Uint8Array): string {
        return this.decodeAscii(value);
    }

    // Unicode string
    public format_U(value: Uint8Array): string {
        return this.decodeWcharFromBytes(value);
    }


    public format_M(value: number | string): string {
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^0-9a-fA-F]/g, '').slice(0, 12).padStart(12, '0');
            return cleaned.match(/.{1,2}/g)?.join('-').toUpperCase() ?? value;
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return `${value}`;
        }
        const parts: string[] = [];
        for (let i = 5; i >= 0; i--) {
            parts.push(((n >> (i * 8)) & 0xFF).toString(16).padStart(2, '0'));
        }
        return parts.join('-').toUpperCase();
    }

    public format_T(value: unknown, typeInfo?: FormatTypeInfo, padZeroes: boolean = false): string {
        // Spec: Value in format derived from expression type (hexadecimal or floating number)
        const asNumeric = (v: unknown): number | bigint | undefined => {
            if (typeof v === 'number' || typeof v === 'bigint') {
                return v;
            }
            if (typeof v === 'string') {
                const n = Number(v);
                return Number.isFinite(n) ? n : undefined;
            }
            return undefined;
        };

        const n = asNumeric(value);
        if (n === undefined) {
            return String(value);
        }

        const kind: FormatKind =
            typeInfo?.kind && typeInfo.kind !== 'unknown'
                ? typeInfo.kind
                : (typeof n === 'number' && !Number.isInteger(n) ? 'float' : 'int');

        if (kind === 'float') {
            // Preserve fractional part for floats
            const v = typeof n === 'bigint' ? Number(n) : n;
            const bits = typeInfo?.bits;
            const opts = bits !== undefined ? { kind: 'float' as const, bits } : { kind: 'float' as const };
            return this.formatNumberByType(v, opts);
        }

        // integer-like → hex with optional padding based on bits; truncate if number is fractional
        const bits = typeInfo?.bits;
        const paddedBits = bits && bits > 0 ? bits : undefined;
        const v = typeof n === 'number' ? Math.trunc(n) : n;
        return this.formatHex(v, paddedBits, padZeroes);
    }

    public format_percent(): string {
        return '%';
    }

    public formatIpv4(bytes: Uint8Array): string {
        if (bytes.length < 4) {
            return '<IPV4: access out of bounds>';
        }
        return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
    }

    public formatIpv6(bytes: Uint8Array): string {
        /* eslint-disable security/detect-object-injection */
        if (bytes.length < 16) {
            return '<IPV6: access out of bounds>';
        }
        const words: number[] = [];
        for (let i = 0; i < 8; i++) {
            words.push(((bytes[i * 2] << 8) | (bytes[i * 2 + 1])) >>> 0);
        }
        // Collapse the longest run of zeros for compact form
        const hexWords = words.map(w => w.toString(16));
        let bestStart = -1; let bestLen = 0;
        let curStart = -1; let curLen = 0;
        for (let i = 0; i < hexWords.length; i++) {
            if (words[i] === 0) {
                if (curStart === -1) {
                    curStart = i; curLen = 1;
                } else {
                    curLen++;
                }
            } else {
                if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
                curStart = -1; curLen = 0;
            }
        }
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }

        const out: string[] = [];
        for (let i = 0; i < hexWords.length; i++) {
            if (bestLen >= 2 && i >= bestStart && i < bestStart + bestLen) {
                if (out[out.length - 1] !== '') {
                    out.push('');
                }
                if (i === bestStart) {
                    out.push('');
                }
                continue;
            }
            out.push(hexWords[i]);
        }
        return out.join(':').replace(/^:/, '::').replace(/:::/, '::');
        /* eslint-enable security/detect-object-injection */
    }

    public formatMac(bytes: Uint8Array): string {
        if (bytes.length < 6) {
            return '<MAC: access out of bounds>';
        }
        return Array.from(bytes.subarray(0, 6)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('-');
    }

    public sanitizeLiteral(str: string): string | undefined {
        /* eslint-disable security/detect-object-injection */
        // Reject embedded unescaped '%' to match legacy %t semantics
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '%') {
                if (str[i + 1] === '%') {
                    i++; // skip escaped %%
                    continue;
                }
                return undefined;
            }
        }
        return str;
        /* eslint-enable security/detect-object-injection */
    }

    public escapeNonPrintable(str: string): string {
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            if (ch === 0) {
                break;
            }
            if (ch === 0x0A) { out += '\\n'; continue; }
            if (ch === 0x0D) { out += '\\r'; continue; }
            if (ch === 0x09) { out += '\\t'; continue; }
            if (ch === 0x0B) { out += '\\v'; continue; }
            if (ch === 0x0C) { out += '\\f'; continue; }
            if (ch === 0x08) { out += '\\b'; continue; }
            if (ch === 0x07) { out += '\\a'; continue; }
            if (ch < 0x20 || ch >= 0x7F) {
                out += `\\${ch.toString(16).padStart(2, '0').toUpperCase()}`;
                continue;
            }
            out += str.charAt(i);
        }
        return out;
    }

    private decodeWcharFromBytes(bytes: Uint8Array): string {
        // If you have a null terminator, trim at the first 0x0000
        let end = bytes.length;
        for (let i = 0; i + 1 < bytes.length; i += 2) {
            // eslint-disable-next-line security/detect-object-injection -- false positive: controlled typed-array indexing for UTF-16 scanning
            if (bytes[i] === 0 && bytes[i + 1] === 0) {
                end = i;
                break;
            }
        }
        const slice = bytes.subarray(0, end);
        return this.utf16leDecoder.decode(slice);
    }

    private decodeAscii(bytes: Uint8Array): string {
        const chars: number[] = [];
        for (const b of bytes) {
            if (b === 0) {
                break;
            }     // if you use C-style null termination
            chars.push(b & 0x7F);   // or just `chars.push(b);` if high bits never set
        }
        return String.fromCharCode(...chars);
    }


    /**
     * Pretty-prints a USB descriptor as text.
     * - Accepts the raw descriptor bytes (starting at bLength, bDescriptorType).
     * - Supports Device(1), Config(2), String(3), Interface(4), Endpoint(5),
     *   Device Qualifier(6), BOS(0x0F). Unknown types are hex-dumped.
     */
    public printUsbDescriptor(value: Uint8Array): string {
        if (!value || value.length < 2) {
            return '(invalid: too short)';
        }
        const bLength = value[0] || value.length; // be forgiving if devices put 0
        const bType = value[1];
        const len = Math.min(bLength, value.length);

        const u16 = (off: number) =>
            off + 1 < len ? ((value.at(off) ?? 0) | ((value.at(off + 1) ?? 0) << 8)) : 0;

        const hex = (n: number, w = 2) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
        const hexdump = (arr: Uint8Array) =>
            Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ');

        const typeMap = new Map<number, string>([
            [0x01, 'Device'],
            [0x02, 'Configuration'],
            [0x03, 'String'],
            [0x04, 'Interface'],
            [0x05, 'Endpoint'],
            [0x06, 'Device Qualifier'],
            [0x07, 'Other Speed Config'],
            [0x08, 'Interface Power'],
            [0x0F, 'BOS'],
        ]);
        const typeName = (t: number) => typeMap.get(t) ?? `Type ${hex(t)}`;

        // --- String Descriptor (Type 0x03) ---
        // bLength, bDescriptorType, then UTF-16LE code units
        if (bType === 0x03) {
            if (len < 2) {
                return 'USB String: (invalid)';
            }
            if (len === 2) {
                return 'USB String: (empty)';
            }
            // indices 2..len-1 contain UTF-16LE units
            const codeUnitCount = Math.max(0, (len - 2) >> 1);
            const units = new Uint16Array(codeUnitCount);
            for (let i = 0; i < codeUnitCount; i++) {
                const lo = value.at(2 + (i << 1)) ?? 0;
                const hi = value.at(3 + (i << 1)) ?? 0;
                units.set([lo | (hi << 8)], i);
            }
            // Convert UTF-16 units to JS string safely (surrogates pass through)
            let out = '';
            for (let i = 0; i < units.length; i++) {
                out += String.fromCharCode(units.at(i) ?? 0);
            }
            return `USB String: "${out}"`;
        }

        // --- Device Descriptor (Type 0x01, 18 bytes) ---
        if (bType === 0x01) {
            return [
                `USB Device (len=${len})`,
                `  bcdUSB           ${hex(u16(2), 4)}`,
                `  bDeviceClass     ${hex(value[4])}`,
                `  bDeviceSubClass  ${hex(value[5])}`,
                `  bDeviceProtocol  ${hex(value[6])}`,
                `  bMaxPacketSize0  ${value[7]}`,
                `  idVendor         ${hex(u16(8), 4)}`,
                `  idProduct        ${hex(u16(10), 4)}`,
                `  bcdDevice        ${hex(u16(12), 4)}`,
                `  iManufacturer    ${value[14]}`,
                `  iProduct         ${value[15]}`,
                `  iSerialNumber    ${value[16]}`,
                `  bNumConfigurations ${value[17]}`
            ].join('\n');
        }

        // --- Configuration Descriptor (Type 0x02, 9 bytes) ---
        if (bType === 0x02) {
            return [
                `USB Configuration (len=${len})`,
                `  wTotalLength     ${u16(2)} bytes`,
                `  bNumInterfaces   ${value[4]}`,
                `  bConfigurationValue ${value[5]}`,
                `  iConfiguration   ${value[6]}`,
                `  bmAttributes     ${hex(value[7])}`,
                `  bMaxPower        ${value[8] * 2} mA`
            ].join('\n');
        }

        // --- Interface Descriptor (Type 0x04, 9 bytes) ---
        if (bType === 0x04) {
            return [
                `USB Interface (len=${len})`,
                `  bInterfaceNumber ${value[2]}`,
                `  bAlternateSetting ${value[3]}`,
                `  bNumEndpoints    ${value[4]}`,
                `  bInterfaceClass  ${hex(value[5])}`,
                `  bInterfaceSubCls ${hex(value[6])}`,
                `  bInterfaceProto  ${hex(value[7])}`,
                `  iInterface       ${value[8]}`
            ].join('\n');
        }

        // --- Endpoint Descriptor (Type 0x05, 7 bytes) ---
        if (bType === 0x05) {
            const addr = value[2] ?? 0;
            const epNum = addr & 0x0F;
            const dirIn = (addr & 0x80) !== 0;
            const attrs = value[3] ?? 0;
            const xferType = ['Control', 'Isochronous', 'Bulk', 'Interrupt'][attrs & 0x3];
            return [
                `USB Endpoint (len=${len})`,
                `  bEndpointAddress ${hex(addr)} (EP${epNum} ${dirIn ? 'IN' : 'OUT'})`,
                `  bmAttributes     ${hex(attrs)} (${xferType})`,
                `  wMaxPacketSize   ${u16(4)}`,
                `  bInterval        ${value[6] ?? 0}`
            ].join('\n');
        }

        // --- Device Qualifier (Type 0x06, 10 bytes) ---
        if (bType === 0x06) {
            return [
                `USB Device Qualifier (len=${len})`,
                `  bcdUSB           ${hex(u16(2), 4)}`,
                `  bDeviceClass     ${hex(value[4])}`,
                `  bDeviceSubClass  ${hex(value[5])}`,
                `  bDeviceProtocol  ${hex(value[6])}`,
                `  bMaxPacketSize0  ${value[7]}`,
                `  bNumConfigurations ${value[8]}`
            ].join('\n');
        }

        // --- BOS (Type 0x0F, 5 bytes) ---
        if (bType === 0x0F) {
            return [
                `USB BOS (len=${len})`,
                `  wTotalLength     ${u16(2)} bytes`,
                `  bNumDeviceCaps   ${value[4] ?? 0}`
            ].join('\n');
        }

        // Fallback: generic dump
        return `${typeName(bType)} (len=${len}): ${hexdump(value.subarray(0, len))}`;
    }
}
