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

import * as path from 'path';
import { CbuildRunReader } from './cbuild-run-reader';
import { getCmsisPackRootPath } from '../utils';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root
const TEST_FILE_PATH = 'test-data/fileReaderTest.txt'; // Relative to repo root
const PACK_ROOT = '/my/pack/root';

const EXPECTED_CUSTOM_SVD = path.resolve(path.dirname(TEST_CBUILD_RUN_FILE), '../../MyDevice/multi-core-custom.svd');
const EXPECTED_CUSTOM_SCVD = path.resolve(path.dirname(TEST_CBUILD_RUN_FILE), '../../MyDevice/multi-core-custom.scvd');

// Compare function that compares path and allows differing drive letter casing on Windows.
const comparePath = (received: string|undefined, expected: string): boolean => {
    if (!received) {
        return false;
    }
    // Exact match first, majority of cases.
    if (received === expected) {
        return true;
    }
    // Exit if not Windows, no match
    if (process.platform !== 'win32') {
        return false;
    }
    // Split drive letter from path. Assumption: no URLs, no other colons in folder names.
    const receivedFragments = received.split(':');
    const expectedFragments = expected.split(':');
    if (receivedFragments.length !== expectedFragments.length) {
        return false;
    }
    return receivedFragments.every((receivedFragment, index) => {
        // eslint-disable-next-line security/detect-object-injection
        const expectedFragment = expectedFragments[index];
        if (index === 0) {
            // Drive letter
            return receivedFragment.toLowerCase() === expectedFragment.toLowerCase();
        }
        return receivedFragment === expectedFragment;
    });
};

describe('CbuildRunReader', () => {

    describe('Parser', () => {
        it('successfully parses a *.cbuild-run.yml file', async () => {
            const cbuildRunReader = new CbuildRunReader();
            await expect(cbuildRunReader.parse(TEST_CBUILD_RUN_FILE)).resolves.not.toThrow();
            expect(cbuildRunReader.hasContents()).toBe(true);
            const contents = cbuildRunReader.getContents();
            expect(contents).toBeDefined();
            // Snapshot match all but cbuildRunDir which is an absolute path and hence OS specific.
            // That part gets tested in separate tests.
            expect({
                ...contents,
                cbuildRunDir: expect.any(String)
            }).toMatchSnapshot();
        });

        it('throws if it parses something other than a *.cbuild-run.yml file and correctly responds to raw contents calls', async () => {
            const expectedError = /Invalid '\*\.cbuild-run\.yml' file: .*test-data\/fileReaderTest\.txt/;
            const cbuildRunReader = new CbuildRunReader();
            await expect(cbuildRunReader.parse(TEST_FILE_PATH)).rejects.toThrow(expectedError);
            expect(cbuildRunReader.hasContents()).toBe(false);
            expect(cbuildRunReader.getContents()).toBeUndefined();
        });

        it('correctly responds to raw contents calls if nothing is parsed', () => {
            const cbuildRunReader = new CbuildRunReader();
            expect(cbuildRunReader.hasContents()).toBe(false);
            expect(cbuildRunReader.getContents()).toBeUndefined();
        });
    });

    describe('Extract Values', () => {
        let cbuildRunReader: CbuildRunReader;

        beforeEach(() => {
            cbuildRunReader = new CbuildRunReader();
        });

        it.each([
            {
                info: 'no pname',
                pname: undefined,
                expectedSvdPaths: [
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core0.svd',
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core1.svd',
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_generic.svd',
                    EXPECTED_CUSTOM_SVD,
                ]
            },
            {
                info: 'Core0',
                pname: 'Core0',
                expectedSvdPaths: [
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core0.svd',
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_generic.svd',
                    EXPECTED_CUSTOM_SVD,
                ]
            },
            {
                info: 'Core1',
                pname: 'Core1',
                expectedSvdPaths: [
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core1.svd',
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_generic.svd',
                    EXPECTED_CUSTOM_SVD,
                ]
            },
        ])('returns SVD file path ($info)', async ({ pname, expectedSvdPaths }) => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const svdFilePaths = cbuildRunReader.getSvdFilePaths('/my/pack/root', pname);
            expect(svdFilePaths.length).toEqual(expectedSvdPaths.length);
            for (let i = 0; i < svdFilePaths.length; i++) {
                // eslint-disable-next-line security/detect-object-injection
                const expectedPath = path.normalize(path.resolve(expectedSvdPaths[i]));
                // eslint-disable-next-line security/detect-object-injection
                const actualPath = svdFilePaths[i];
                expect(comparePath(actualPath, expectedPath)).toBe(true);
            }
        });

        it('returns empty SVD file path list if nothing is parsed', () => {
            const svdFilePaths = cbuildRunReader.getSvdFilePaths('/my/pack/root');
            expect(svdFilePaths.length).toEqual(0);
        });

        it('returns empty SCVD file path list when nothing is parsed', async () => {
            const scvdFilePaths = cbuildRunReader.getScvdFilePaths('/my/pack/root');
            expect(scvdFilePaths.length).toEqual(0);
        });

        it('returns processor names from debug topology', async () => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const pnames = cbuildRunReader.getPnames();
            expect(pnames).toEqual(['Core0', 'Core1']);
        });

        it.each([
            { packRoot: '', info: 'empty string' },
            { packRoot: undefined, info: 'undefined' },
        ])('includes descriptors without pname when filtering by pname (SVD) and uses default pack root if input is $info', async ({ packRoot }) => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const cbuildRun = (cbuildRunReader as unknown as { cbuildRun?: { ['system-descriptions']?: Array<{ file: string; type: string; pname?: string }> } }).cbuildRun;
            const systemDescriptions = cbuildRun?.['system-descriptions'];
            expect(systemDescriptions).toBeDefined();
            const svdPaths = cbuildRunReader.getSvdFilePaths(packRoot, 'Core1');
            const expectedSvdPaths = [
                path.normalize(
                    path.resolve(getCmsisPackRootPath(), 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SVD', 'MyDevice_Core1.svd')
                ),
                path.normalize(
                    path.resolve(getCmsisPackRootPath(), 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SVD', 'MyDevice_generic.svd')
                ),
                path.normalize(EXPECTED_CUSTOM_SVD),
            ];
            // eslint-disable-next-line security/detect-object-injection
            svdPaths.forEach((svdPath, index) => expect(comparePath(svdPath, expectedSvdPaths[index])).toBe(true));
        });

        it('includes descriptors without pname when filtering by pname (SVD)', async () => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const cbuildRun = (cbuildRunReader as unknown as { cbuildRun?: { ['system-descriptions']?: Array<{ file: string; type: string; pname?: string }> } }).cbuildRun;
            const systemDescriptions = cbuildRun?.['system-descriptions'];
            expect(systemDescriptions).toBeDefined();
            const svdPaths = cbuildRunReader.getSvdFilePaths(PACK_ROOT, 'Core1');
            const expectedSvdPaths = [
                path.normalize(path.resolve(PACK_ROOT, 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SVD', 'MyDevice_Core1.svd')),
                path.normalize(path.resolve(PACK_ROOT, 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SVD', 'MyDevice_generic.svd')),
                path.normalize(EXPECTED_CUSTOM_SVD),
            ];
            // eslint-disable-next-line security/detect-object-injection
            svdPaths.forEach((svdPath, index) => expect(comparePath(svdPath, expectedSvdPaths[index])).toBe(true));
        });

        it('includes descriptors without pname when filtering by pname (SCVD)', async () => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const cbuildRun = (cbuildRunReader as unknown as { cbuildRun?: { ['system-descriptions']?: Array<{ file: string; type: string; pname?: string }> } }).cbuildRun;
            const systemDescriptions = cbuildRun?.['system-descriptions'] ?? [];
            expect(systemDescriptions).toBeDefined();
            const scvdPaths = cbuildRunReader.getScvdFilePaths(PACK_ROOT, 'Core1');
            const expectedScvdPaths = [
                path.normalize(path.resolve(PACK_ROOT, 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SCVD', 'MySoftware_component.scvd')),
                path.normalize(EXPECTED_CUSTOM_SCVD),
                path.normalize(path.resolve(PACK_ROOT, 'MyVendor', 'MyDevice', '1.0.0', 'Debug', 'SCVD', 'Core1.scvd')),
            ];
            // eslint-disable-next-line security/detect-object-injection
            scvdPaths.forEach((scvdPath, index) => expect(comparePath(scvdPath, expectedScvdPaths[index])).toBe(true));
        });

        it.each([
            {
                cbuildRunFile: TEST_CBUILD_RUN_FILE,
            },
            {
                cbuildRunFile: `.${path.sep}${TEST_CBUILD_RUN_FILE}`,
            },
        ])('resolves relative SVD paths relative to the cbuild-run.yml file location ($cbuildRunFile)', async ({ cbuildRunFile }) => {
            await cbuildRunReader.parse(cbuildRunFile);
            const svdFilePaths = cbuildRunReader.getSvdFilePaths(PACK_ROOT);
            const expectedTail = path.normalize(path.join('MyDevice', 'multi-core-custom.svd'));
            const resolvedCustom = svdFilePaths.find((p: string) => p.endsWith(expectedTail));
            expect(comparePath(resolvedCustom, path.normalize(EXPECTED_CUSTOM_SVD))).toBe(true);
        });

        it.each([
            {
                cbuildRunFile: TEST_CBUILD_RUN_FILE,
            },
            {
                cbuildRunFile: `.${path.sep}${TEST_CBUILD_RUN_FILE}`,
            },
        ])('resolves relative SCVD paths relative to the cbuild-run.yml file location ($cbuildRunFile)', async ({ cbuildRunFile }) => {
            await cbuildRunReader.parse(cbuildRunFile);
            const scvdFilePaths = cbuildRunReader.getScvdFilePaths(PACK_ROOT);
            const expectedTail = path.normalize(path.join('MyDevice', 'multi-core-custom.scvd'));
            const resolvedCustom = scvdFilePaths.find((p: string) => p.endsWith(expectedTail));
            expect(comparePath(resolvedCustom, path.normalize(EXPECTED_CUSTOM_SCVD))).toBe(true);
        });
    });
});
