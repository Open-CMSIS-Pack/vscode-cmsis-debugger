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

import * as fs from 'fs';
import * as path from 'path';
import { CorePeripheralsIndexReader } from './core-peripherals-index-reader';

// Tests are executed with different working directory, so different input path needed.
const TEST_INDEX_BASE_PATH = path.resolve(__dirname, '../../../configs/core-peripherals');
const TEST_INDEX_PATH = path.resolve(TEST_INDEX_BASE_PATH, 'core-peripherals-index.yml');
const EMPTY_INDEX_PATH = path.resolve(__dirname, '../../../test-data/core-peripherals/empty-index/core-peripherals-index.yml');

describe('CorePeripheralsIndexReader', () => {

    it('finds all core peripherals entries of index file in folder', async () => {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const filesInDir = await fs.promises.readdir(TEST_INDEX_BASE_PATH, {
            encoding: 'buffer',
            withFileTypes: true
        });
        const scvdFilesInDir = filesInDir.filter(entry => entry.isFile() && entry.name.toString().toLowerCase().endsWith('.scvd'));
        const scvdFilePathsInDir = scvdFilesInDir.map(file => path.resolve(TEST_INDEX_BASE_PATH, file.name.toString()));
        const indexReader = new CorePeripheralsIndexReader();
        await expect(indexReader.parse(TEST_INDEX_PATH)).resolves.not.toThrow();
        const indexEntries = indexReader.getCorePeripherals().map(entry => path.resolve(TEST_INDEX_BASE_PATH, entry.file));
        expect(indexEntries.length).toBe(scvdFilePathsInDir.length);
        scvdFilePathsInDir.forEach(filePath => {
            expect(indexEntries.includes(filePath)).toBe(true);
        });
    });

    it('can read index file', async () => {
        const indexReader = new CorePeripheralsIndexReader();
        await expect(indexReader.parse(TEST_INDEX_PATH)).resolves.not.toThrow();
        expect(indexReader.hasContents()).toBe(true);
        const contents = indexReader.getContents();
        expect(contents).toMatchSnapshot();
    });

    it('returns empty array if no core peripherals parsed', async () => {
        const indexReader = new CorePeripheralsIndexReader();
        // Get peripherals without parsing file first, should return empty array.
        expect(indexReader.hasContents()).toBe(false);
        expect(indexReader.getContents()).toBeUndefined();
        expect(indexReader.getCorePeripherals()).toEqual([]);
    });

    it('throws for an empty index file', async () => {
        const indexReader = new CorePeripheralsIndexReader();
        await expect(indexReader.parse(EMPTY_INDEX_PATH)).rejects.toThrow('Invalid \'core-peripherals-index\' file');
    });

    it('parses only once', async () => {
        const indexReader = new CorePeripheralsIndexReader();
        await expect(indexReader.parse(TEST_INDEX_PATH)).resolves.not.toThrow();
        // Clear spy calls and parse an empty file. It should not throw because it should not attempt to parse the file again.
        await expect(indexReader.parse(EMPTY_INDEX_PATH)).resolves.not.toThrow();
    });

});
