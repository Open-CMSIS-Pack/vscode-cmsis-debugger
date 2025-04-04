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

import { Uri, workspace } from 'vscode';
import * as yaml from 'yaml';
import { CbuildRunType } from './cbuild-run';

const ROOT_NODE = 'cbuild-run';

export class CbuildRunReader {

    public async parse(filePath: string): Promise<CbuildRunType> {
        const uri = Uri.file(filePath);
        const binData = await workspace.fs.readFile(uri);
        const textData = new TextDecoder().decode(binData);
        const fileContentRoot = yaml.parse(textData);
        const fileContent = fileContentRoot ? fileContentRoot[ROOT_NODE] : undefined;
        if (!fileContent) {
            throw new Error(`Invalid '*.cbuild-run.yml' file: ${filePath}`);
        }
        return fileContent;
    }
}
