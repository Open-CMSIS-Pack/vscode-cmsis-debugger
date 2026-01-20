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
 * Unit test for ScvdEndian.
 */

import { ScvdEndian } from '../../../model/scvd-endian';

describe('ScvdEndian', () => {
    it('defaults to little-endian and does no conversion', () => {
        const endian = new ScvdEndian(undefined);
        expect(endian.endian).toBe('L');
        expect(endian.isBigEndian).toBe(false);
        expect(endian.convertToBigEndian(0x1234)).toBe(0x1234);
    });

    it('handles big-endian conversion and tracks modifications', () => {
        const endian = new ScvdEndian(undefined, 'B');
        expect(endian.isBigEndian).toBe(true);
        expect(endian.convertToBigEndian(0x1234)).toBe(0x3412);

        endian.endian = 'L';
        expect(endian.isBigEndian).toBe(false);
        expect(endian.isModified).toBe(true);
    });

    it('treats unknown endianness as little-endian', () => {
        const endian = new ScvdEndian(undefined, 'X');
        expect(endian.isBigEndian).toBe(false);
        expect(endian.convertToBigEndian(0xABCD)).toBe(0xABCD);
    });

    it('falls back to zero when the hex match fails', () => {
        const endian = new ScvdEndian(undefined, 'B');
        const badValue = { toString: () => '' } as unknown as number;
        expect(endian.convertToBigEndian(badValue)).toBe(0);
    });
});
