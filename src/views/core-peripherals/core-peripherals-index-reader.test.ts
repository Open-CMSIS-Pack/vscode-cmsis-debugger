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

import * as path from 'path';
import { CorePeripheralsIndexReader } from './core-peripherals-index-reader';

// Tests are executed with different working directory, so different input path needed.
const TEST_INDEX_PATH = path.resolve(__dirname, '../../../configs/core-peripherals/core-peripherals-index.yml');

describe('CorePeripheralsIndexReader', () => {

    it('can read index file', async () => {
        const indexReader = new CorePeripheralsIndexReader();
        await expect(indexReader.parse(TEST_INDEX_PATH)).resolves.not.toThrow();
        expect(indexReader.hasContents()).toBe(true);
        const contents = indexReader.getContents();
        expect(contents).toMatchSnapshot();
    });

});
