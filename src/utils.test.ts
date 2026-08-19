/**
 * Copyright 2025-2026 Arm Limited
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

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from './logger';
import {
    calculateTime,
    containsSubstringsInOrder,
    extractPname,
    FileLocationManager,
    getCmsisPackRootPath,
    isWindows,
    normalizeFsPath,
    waitForCondition,
    waitForImmediate
} from './utils';

const CMSIS_PACK_ROOT_DEFAULT = 'mock/path';

describe('getCmsisPackRoot', () => {

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('checks if CMSIS_PACK_ROOT already exists', () => {
        const originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv, CMSIS_PACK_ROOT: CMSIS_PACK_ROOT_DEFAULT };
        const returnValue = getCmsisPackRootPath();
        expect(returnValue).toBe(CMSIS_PACK_ROOT_DEFAULT);
        process.env = originalProcessEnv;
    });

    it('checks if CMSIS_PACK_ROOT has been added or not', () => {
        const originalProcessEnv = process.env;
        delete process.env['CMSIS_PACK_ROOT'];
        const returnValue = getCmsisPackRootPath();
        if (isWindows) {
            expect(returnValue).toBe(path.join(process.env['LOCALAPPDATA'] ?? os.homedir(), 'Arm', 'Packs'));
        } else {
            expect(returnValue).toBe(path.join(os.homedir(), '.cache', 'arm', 'packs'));
        }
        process.env = originalProcessEnv;
    });
});

describe('extractPname', () => {

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('extracts pname if first part of string but with now pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver');
        expect(result).toEqual('dev-ice_name01');
    });

    it('extracts pname if first part of string and in pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name01']);
        expect(result).toEqual('dev-ice_name01');
    });

    it('fails to extract if pname not first part of string but in pname list', () => {
        const result = extractPname('prefix dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if pname first part of string but not in pname list', () => {
        const result = extractPname('dev-ice_name01 probe@gdbserver', ['dev2', 'dev-ice_name03']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver', ['dev2', 'dev-ice_*name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname and in pname list', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver', ['dev2', 'dev-ice_*name01']);
        expect(result).toBeUndefined();
    });

    it('fails to extract if first part contains char invalid in pname and no pname list', () => {
        const result = extractPname('dev-ice_*name01 probe@gdbserver');
        expect(result).toBeUndefined();
    });

});

describe('getCbuildRunFile', () => {
    const fileLocationManager = new FileLocationManager();

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('returns cbuild-run file path from CMSIS Solution command', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('/workspace/project/example.cbuild-run.yml');

        const result = await fileLocationManager.getCBuildRunFileName();

        expect(result).toBe('/workspace/project/example.cbuild-run.yml');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
    });

    it('returns undefined when CMSIS Solution command returns an empty value', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('   ');

        const result = await new FileLocationManager().getCBuildRunFileName();

        expect(result).toBeUndefined();
    });

    it('returns undefined and logs when CMSIS Solution command fails', async () => {
        const loggerSpy = jest.spyOn(logger, 'debug');
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('command unavailable'));

        const result = await fileLocationManager.getCBuildRunFileName();

        expect(result).toBeUndefined();
        expect(loggerSpy).toHaveBeenCalledWith('Failed to get active cbuild-run file from CMSIS Solution: command unavailable');
    });

    it('supports the FileLocationManager compatibility wrapper', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('/workspace/project/example.cbuild-run.yml');

        const result = await new FileLocationManager().getCBuildRunFileName();

        expect(result).toBe('/workspace/project/example.cbuild-run.yml');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
    });
});

describe('normalizeFsPath', () => {

    it('normalizes path separators and case for filesystem comparisons', () => {
        const fileName = path.join('workspace', 'folder', '..', 'Target.ctrace.yaml');
        const expected = path.normalize(fileName);

        expect(normalizeFsPath(fileName)).toBe(isWindows ? expected.toLowerCase() : expected);
    });

    it('preserves undefined paths', () => {
        expect(normalizeFsPath(undefined)).toBeUndefined();
    });
});

describe('waitForImmediate', () => {

    it('resolves on a future event loop turn', async () => {
        let resolved = false;
        const promise = waitForImmediate().then(() => {
            resolved = true;
        });

        expect(resolved).toBe(false);
        await promise;
        expect(resolved).toBe(true);
    });
});

describe('waitForCondition', () => {

    it('waits until the condition succeeds', async () => {
        let attempts = 0;

        await waitForCondition('test condition', () => {
            attempts++;
            return attempts === 2;
        }, { timeoutMs: 100, intervalMs: 0 });

        expect(attempts).toBe(2);
    });

    it('throws when the condition times out', async () => {
        await expect(waitForCondition('test timeout', () => false, { timeoutMs: 0 }))
            .rejects.toThrow('Timed out waiting for test timeout.');
    });
});

describe('containsSubstringsInOrder', () => {

    it('returns true when each substring appears after the previous one', () => {
        expect(containsSubstringsInOrder('alpha beta gamma', ['alpha', 'beta', 'gamma'])).toBe(true);
    });

    it('returns false when a substring is missing or appears out of order', () => {
        expect(containsSubstringsInOrder('alpha beta gamma', ['alpha', 'delta'])).toBe(false);
        expect(containsSubstringsInOrder('alpha beta gamma', ['gamma', 'alpha'])).toBe(false);
    });
});

describe('calculateTime', () => {

    it.each([
        { cycles: BigInt(3), frequency: 100000000000, expected: '0.030ns' },
        { cycles: BigInt(321), frequency: 100000000000, expected: '3.210ns' },
        { cycles: BigInt(4), frequency: 1000000000, expected: '4ns' },
        { cycles: BigInt(55), frequency: 10000000, expected: '5.500us' },
        { cycles: BigInt(66666), frequency: 10000000000, expected: '6.667us' },
        { cycles: BigInt(77), frequency: 100000, expected: '770us' },
        { cycles: BigInt(777), frequency: 100000, expected: '7.770ms' },
        { cycles: BigInt(42), frequency: 1, expected: '42000ms' },
    ])('returns expected time value and unit ($cycles cycles, $frequency Hz)', ({ cycles, frequency, expected }) => {
        const result = calculateTime(cycles, frequency);
        expect(result).toEqual(expected);
    });

});
