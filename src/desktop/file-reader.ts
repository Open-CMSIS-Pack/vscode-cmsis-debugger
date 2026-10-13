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

import * as path from 'node:path';

import { Uri, workspace } from 'vscode';

import { CBuildRunFileLocator } from '../cbuild-run/cbuild-run-file-locator';

export interface FileReader {
    readFileToString(path: string): Promise<string>;
};

export class VscodeFileReader implements FileReader {
    public constructor(
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator()
    ) {}

    public async readFileToString(filePath: string): Promise<string> {
        // VSCode Uri's must be absolute to work properly
        const filePathFragments: string[] = [];
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (!path.isAbsolute(filePath) && activeSolutionFolder) {
            filePathFragments.push(activeSolutionFolder.fsPath);
        }
        filePathFragments.push(filePath);

        const uri = Uri.file(path.join(...filePathFragments));
        const binData = await workspace.fs.readFile(uri);
        return new TextDecoder().decode(binData);
    }
}
