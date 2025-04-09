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

import { VscodeFileReader } from './file-reader';

const TEST_FILE_PATH = 'test-data/fileReaderTest.txt'; // Relative to repo root
const TEST_FILE_CONTENTS = 'Simple file';

describe('FileReader', () => {
    it('parses a simple file', async () =>{
        const fileReader = new VscodeFileReader();
        const fileContents = await fileReader.readFileToString(TEST_FILE_PATH);
        expect(fileContents).toEqual(TEST_FILE_CONTENTS);
    });
});
