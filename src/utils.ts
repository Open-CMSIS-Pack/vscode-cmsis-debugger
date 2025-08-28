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


import * as os from 'os';
import * as path from 'path';

export const isWindows = os.platform() === 'win32';

export const getCmsisPackRootPath = (): string => {
    const environmentValue = process.env['CMSIS_PACK_ROOT'];
    if (environmentValue) {
        return environmentValue;
    }

    const cmsisPackRootDefault = os.platform() === 'win32'
        ? path.join(process.env['LOCALAPPDATA'] ?? os.homedir(), 'Arm', 'Packs')
        : path.join(os.homedir(), '.cache', 'arm', 'packs');

    return cmsisPackRootDefault;
};

export const extractPname = (configString: string, pnames?: string[]): string | undefined => {
    const trimmedString = configString.trim();
    // Config names in debugger templates are pretty free-form. Hence, can't do a lot
    // of format validation without reading debugger templates. Only check if name
    // begins with valid pname string, and if string is part of processor list.
    const pnameRegexp = /^[-_A-Za-z0-9]+\s+.+$/;
    if (!pnameRegexp.test(trimmedString)) {
        // Not the right format, Pname is 'RestrictedString' in PDSC format.
        return undefined;
    }
    const pname = trimmedString.slice(0, trimmedString.indexOf(' '));
    if (!pnames || pnames.includes(pname)) {
        return pname;
    }
    return undefined;
};

export const calculateTime = (states: bigint, frequency: number): string => {
    const milliUnit = { unit: 'ms', factor: 1000.0, fractDigits: 3 };
    const microUnit = { unit: 'us', factor: 1000000.0, fractDigits: 3 };
    const nanoUnit = { unit: 'ns', factor: 1000000000.0, fractDigits: 3 };
    const fractionalUnits = [
        milliUnit,
        microUnit,
        nanoUnit
    ];
    const frequencyBigInt = BigInt(frequency);
    const integerPart = states / frequencyBigInt;
    const fractionalPart = states - integerPart*frequencyBigInt;
    const fractionalNumber = Number(fractionalPart) / frequency;
    const unit = integerPart > 0 ? milliUnit : fractionalUnits.find(unit => fractionalNumber*unit.factor >= 1.0) ?? nanoUnit;
    if (!unit) {
        throw new Error('Error calculating time value');
    }
    const scaledFractionalPart = (fractionalNumber*unit.factor);
    // Scaling creates additional integer part
    const scaledIntegerPart = (integerPart*BigInt(unit.factor)) + BigInt(Math.trunc(scaledFractionalPart));
    const trueFractionalPart = scaledFractionalPart - Math.trunc(scaledFractionalPart);
    if (trueFractionalPart > 0.0) {
        // Concatenate scaled fractional part with scaled integer part
        const trueFractionalString = (trueFractionalPart).toFixed(unit.fractDigits);
        return `${scaledIntegerPart.toString()}${trueFractionalString.slice(1)}${unit.unit}`;
    } else {
        // No fractional part, only print scaled integer part
        return `${scaledIntegerPart.toString()}${unit.unit}`;
    }
};

export const waitForMs = async (ms: number): Promise<void> => {
    return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
};
