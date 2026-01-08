/**
 * Copyright 2025 Arm Limited
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


export class ScvdFormatSpecifier {
    private utf16leDecoder: TextDecoder;

    constructor(
    ) {
        this.utf16leDecoder = new TextDecoder('utf-16le');
    }

    public format_d(value: number | string): string {
        const n = Number(value);
        return Number.isFinite(n) ? n.toString(10) : `${value}`;
    }

    public format_u(value: number | string): string {
        const n = Number(value);
        if (!Number.isFinite(n)) return `${value}`;
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
            for (let i = 0; i < end; i++) {
                s += String.fromCharCode(value[i]);
            }
            return s;
        }

        // Fallback in case something weird sneaks in
        return String(value);
    }

    public format_x(value: number | string): string {
        const n = Number(value);
        if (!Number.isFinite(n)) return `${value}`;
        return '0x' + (n >>> 0).toString(16);
    }

    public format_address_like(value: number | string): string {
        if( typeof value === 'string') {
            return value;
        }
        if(typeof value === 'number') {
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

    public format_I(value: number | string): string {
        if (typeof value === 'string') return value;
        const n = Number(value);
        if (!Number.isFinite(n)) return `${value}`;
        const b0 = (n >>> 24) & 0xFF;
        const b1 = (n >>> 16) & 0xFF;
        const b2 = (n >>> 8) & 0xFF;
        const b3 = n & 0xFF;
        return `${b0}.${b1}.${b2}.${b3}`;
    }

    public format_J(value: number | string): string {
        // If already a string, assume formatted IPv6
        if (typeof value === 'string') return value;
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
        if (!Number.isFinite(n)) return `${value}`;
        const parts: string[] = [];
        for (let i = 5; i >= 0; i--) {
            parts.push(((n >> (i * 8)) & 0xFF).toString(16).padStart(2, '0'));
        }
        return parts.join('-').toUpperCase();
    }

    public format_T(value: number | string): string {
        if (typeof value === 'number') {
            if (Number.isInteger(value)) return this.format_x(value);
            return value.toString();
        }
        const n = Number(value);
        if (Number.isFinite(n)) {
            if (Number.isInteger(n)) return this.format_x(n);
            return n.toString();
        }
        return `${value}`;
    }

    public format_percent(): string {
        return '%';
    }


    private decodeWcharFromBytes(bytes: Uint8Array): string {
        // If you have a null terminator, trim at the first 0x0000
        let end = bytes.length;
        for (let i = 0; i + 1 < bytes.length; i += 2) {
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
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b === 0) break;     // if you use C-style null termination
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
        if (!value || value.length < 2) return '(invalid: too short)';
        const bLength = value[0] || value.length; // be forgiving if devices put 0
        const bType = value[1];
        const len = Math.min(bLength, value.length);

        const u16 = (off: number) =>
            off + 1 < len ? (value[off] | (value[off + 1] << 8)) : 0;

        const hex = (n: number, w = 2) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
        const hexdump = (arr: Uint8Array) =>
            Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ');

        const typeMap: Record<number, string> = Object.create(null);
        typeMap[0x01] = 'Device';
        typeMap[0x02] = 'Configuration';
        typeMap[0x03] = 'String';
        typeMap[0x04] = 'Interface';
        typeMap[0x05] = 'Endpoint';
        typeMap[0x06] = 'Device Qualifier';
        typeMap[0x07] = 'Other Speed Config';
        typeMap[0x08] = 'Interface Power';
        typeMap[0x0F] = 'BOS';
        const typeName = (t: number) =>
            Object.prototype.hasOwnProperty.call(typeMap, t) ? typeMap[t] : `Type ${hex(t)}`;

        // --- String Descriptor (Type 0x03) ---
        // bLength, bDescriptorType, then UTF-16LE code units
        if (bType === 0x03) {
            if (len < 2) return 'USB String: (invalid)';
            if (len === 2) return 'USB String: (empty)';
            // indices 2..len-1 contain UTF-16LE units
            const codeUnitCount = Math.max(0, (len - 2) >> 1);
            const units = new Uint16Array(codeUnitCount);
            for (let i = 0; i < codeUnitCount; i++) {
                const lo = value[2 + (i << 1)] ?? 0;
                const hi = value[3 + (i << 1)] ?? 0;
                units[i] = lo | (hi << 8);
            }
            // Convert UTF-16 units to JS string safely (surrogates pass through)
            let out = '';
            for (let i = 0; i < units.length; i++) out += String.fromCharCode(units[i]);
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
            const xferType = ['Control', 'Isochronous', 'Bulk', 'Interrupt'][attrs & 0x3] || 'Unknown';
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
