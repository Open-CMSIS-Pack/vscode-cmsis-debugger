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

import { CbuildRunReader } from './cbuild-run-reader';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root
const TEST_FILE_PATH = 'test-data/fileReaderTest.txt'; // Relative to repo root

describe('CbuildRunReader', () => {

    describe('Parser', () => {
        it('successfully parses a *.cbuild-run.yml file', async () => {
            const cbuildRunReader = new CbuildRunReader();
            await expect(cbuildRunReader.parse(TEST_CBUILD_RUN_FILE)).resolves.not.toThrow();
            expect(cbuildRunReader.hasContents()).toBe(true);
            const contents = cbuildRunReader.getContents();
            expect(contents).toBeDefined();
            expect(contents).toMatchSnapshot();
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
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core1.svd'
                ]
            },
            {
                info: 'Core0',
                pname: 'Core0',
                expectedSvdPaths: [
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core0.svd',
                ]
            },
            {
                info: 'Core1',
                pname: 'Core1',
                expectedSvdPaths: [
                    '/my/pack/root/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core1.svd'
                ]
            },
        ])('returns SVD file path ($info)', async ({ pname, expectedSvdPaths }) => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const svdFilePaths = cbuildRunReader.getSvdFilePaths('/my/pack/root', pname);
            expect(svdFilePaths.length).toEqual(svdFilePaths.length);
            for (let i = 0; i < svdFilePaths.length; i++) {
                // eslint-disable-next-line security/detect-object-injection
                expect(expectedSvdPaths[i]).toEqual(svdFilePaths[i]);
            }
        });

        it('returns empty SVD file path list if nothing is parsed', () => {
            const svdFilePaths = cbuildRunReader.getSvdFilePaths('/my/pack/root');
            expect(svdFilePaths.length).toEqual(0);
        });

        it('returns empty SCVD file path list when none exist', async () => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const scvdFilePaths = cbuildRunReader.getScvdFilePaths('/my/pack/root');
            expect(scvdFilePaths).toEqual([]);
        });

        it('returns processor names from debug topology', async () => {
            await cbuildRunReader.parse(TEST_CBUILD_RUN_FILE);
            const pnames = cbuildRunReader.getPnames();
            expect(pnames).toEqual(['Core0', 'Core1']);
        });

        it('includes descriptors without pname when filtering by pname (SVD)', async () => {
            const contents = [
                'cbuild-run:',
                '  system-descriptions:',
                '    - file: ${CMSIS_PACK_ROOT}/Vendor/Device/Debug/SVD/Device.svd',
                '      type: svd',
                '    - file: ${CMSIS_PACK_ROOT}/Vendor/Device/Debug/SVD/Core0.svd',
                '      type: svd',
                '      pname: Core0',
            ].join('\n');
            const readerWithStub = new CbuildRunReader({
                readFileToString: async () => contents
            } as unknown as { readFileToString: () => Promise<string> });

            await readerWithStub.parse('in-memory.cbuild-run.yml');
            const svdPaths = readerWithStub.getSvdFilePaths('/packs', 'Core0');

            expect(svdPaths).toEqual([
                '/packs/Vendor/Device/Debug/SVD/Device.svd',
                '/packs/Vendor/Device/Debug/SVD/Core0.svd',
            ]);
        });

        it('includes descriptors without pname when filtering by pname (SCVD)', async () => {
            const contents = [
                'cbuild-run:',
                '  system-descriptions:',
                '    - file: ${CMSIS_PACK_ROOT}/Vendor/Device/Debug/SCVD/Device.scvd',
                '      type: scvd',
                '    - file: ${CMSIS_PACK_ROOT}/Vendor/Device/Debug/SCVD/Core1.scvd',
                '      type: scvd',
                '      pname: Core1',
            ].join('\n');
            const readerWithStub = new CbuildRunReader({
                readFileToString: async () => contents
            } as unknown as { readFileToString: () => Promise<string> });

            await readerWithStub.parse('in-memory.cbuild-run.yml');
            const scvdPaths = readerWithStub.getScvdFilePaths('/packs', 'Core1');

            expect(scvdPaths).toEqual([
                '/packs/Vendor/Device/Debug/SCVD/Device.scvd',
                '/packs/Vendor/Device/Debug/SCVD/Core1.scvd',
            ]);
        });
    });
});
