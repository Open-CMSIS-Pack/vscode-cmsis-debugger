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

import { ScvdDebugTarget } from '../scvd-debug-target';

function makeStackImage(
    totalBytes: number,
    fillPattern: number,
    magicValue: number,
    usedBytes: number,
    overrideMagic?: number
): Uint8Array {
    const data = new Uint8Array(totalBytes);
    const fill = new Uint8Array([
        fillPattern & 0xFF,
        (fillPattern >>> 8) & 0xFF,
        (fillPattern >>> 16) & 0xFF,
        (fillPattern >>> 24) & 0xFF,
    ]);
    for (let i = 0; i < totalBytes; i++) {
        // eslint-disable-next-line security/detect-object-injection -- false positive: deliberate indexed fill of test buffer
        data[i] = fill[i % 4];
    }

    // Mark some bytes as used (overwrite with non-pattern)
    for (let i = 0; i < usedBytes; i++) {
        // eslint-disable-next-line security/detect-object-injection -- false positive: deliberate indexed mutation for test setup
        data[i] = 0xaa;
    }

    // Place magic value at the end (little endian)
    const magicStart = totalBytes - 4;
    const magic = overrideMagic ?? magicValue;
    data[magicStart + 0] = magic & 0xFF;
    data[magicStart + 1] = (magic >>> 8) & 0xFF;
    data[magicStart + 2] = (magic >>> 16) & 0xFF;
    data[magicStart + 3] = (magic >>> 24) & 0xFF;
    return data;
}

describe('ScvdDebugTarget.calculateMemoryUsage', () => {
    const stackSize = 0x100;
    const fillPattern = 0xCCCCCCCC;
    const magicValue = 0xE25A2EA5;

    const setupTargetWithImage = (image: Uint8Array): ScvdDebugTarget => {
        const target = new ScvdDebugTarget();
        (target as unknown as { mock: { getMockMemoryData: (addr: number, size: number) => Uint8Array | undefined } }).mock = {
            getMockMemoryData: (_addr: number, size: number) => image.slice(0, size),
        };
        return target;
    };

    it('normal: magic intact with some free space', () => {
        const usedBytes = 0x40; // 64 bytes used, rest free, magic intact
        const target = setupTargetWithImage(makeStackImage(stackSize, fillPattern, magicValue, usedBytes));

        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expectedUsedPercent = Math.floor((usedBytes / stackSize) * 100) & 0x1ff;
        const expected = (usedBytes & 0xfffff) | (expectedUsedPercent << 20) | (1 << 31);

        expect(result).toBe(expected);
    });

    it('empty: magic intact and nothing used', () => {
        const usedBytes = 0x0; // entire stack untouched, magic intact
        const target = setupTargetWithImage(makeStackImage(stackSize, fillPattern, magicValue, usedBytes));

        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expected = (0 & 0xfffff) | (0 << 20) | (1 << 31);

        expect(result).toBe(expected);
    });

    it('full: magic intact with no free space', () => {
        const usedBytes = stackSize - 4; // everything except the magic word
        const target = setupTargetWithImage(makeStackImage(stackSize, fillPattern, magicValue, usedBytes));

        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expectedUsedPercent = Math.floor((usedBytes / stackSize) * 100) & 0x1ff;
        const expected = (usedBytes & 0xfffff) | (expectedUsedPercent << 20) | (1 << 31);

        expect(result).toBe(expected);
    });

    it('overflow: magic overwritten and no free space', () => {
        const usedBytes = stackSize; // entire stack overwritten, including magic
        const target = setupTargetWithImage(makeStackImage(stackSize, fillPattern, magicValue, usedBytes, 0xDEADBEEF));

        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expectedUsedPercent = Math.floor((usedBytes / stackSize) * 100) & 0x1ff;
        const expected = (usedBytes & 0xfffff) | (expectedUsedPercent << 20); // no overflow bit

        expect(result).toBe(expected);
    });

    it('corrupt: magic overwritten but free space remains', () => {
        const usedBytes = 0x10; // small used region
        const target = setupTargetWithImage(makeStackImage(stackSize, fillPattern, magicValue, usedBytes, 0xA5A5A5A5));

        // Used bytes counted in 4-byte chunks; magic chunk also counts as used
        const accountedUsed = usedBytes + 4;
        const result = target.calculateMemoryUsage(0, stackSize, fillPattern, magicValue);
        const expectedUsedPercent = Math.floor((accountedUsed / stackSize) * 100) & 0x1ff;
        const expected = (accountedUsed & 0xfffff) | (expectedUsedPercent << 20); // no overflow bit

        expect(result).toBe(expected);
    });
});
