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
 * Shared string helpers used by model (ScvdVar) and intrinsics.
 */

/**
 * Encode a string to a byte array based on the element type width.
 * - typeSize 1 (or unspecified): UTF-8 encoding (1 byte per ASCII char)
 * - typeSize 2: UTF-16 LE code units (2 bytes per char)
 * - typeSize 4: Unicode code points, UTF-32 LE (4 bytes per char)
 *
 * Returns character data only — no trailing \\0.
 * The caller (typically {@link MemoryContainer}) is responsible for
 * providing the null terminator via zero-padding in the backing buffer.
 */
export function encodeStringToBytes(text: string, typeSize = 1): Uint8Array {
    if (typeSize === 2) {
        // UTF-16 LE
        const buf = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            buf[i * 2] = code & 0xFF;
            buf[i * 2 + 1] = (code >> 8) & 0xFF;
        }
        return buf;
    }
    if (typeSize === 4) {
        // UTF-32 LE (code points)
        const codePoints = [...text].map(ch => ch.codePointAt(0) ?? 0);
        const buf = new Uint8Array(codePoints.length * 4);
        const view = new DataView(buf.buffer);
        for (const [i, cp] of codePoints.entries()) {
            view.setUint32(i * 4, cp, true);
        }
        return buf;
    }
    // Default: UTF-8
    return new TextEncoder().encode(text);
}
