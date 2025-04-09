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
import * as path from 'path';

export interface FileReader {
    readFileToString(path: string): Promise<string>;
};

export class VscodeFileReader implements FileReader {
    public async readFileToString(filePath: string): Promise<string> {
        // VSCode Uri's must be absolute to work properly
        const filePathFragments: string[] = [];
        const workspaceFolder = workspace.workspaceFolders?.at(0)?.uri.fsPath;
        if (!path.isAbsolute(filePath) && workspaceFolder?.length) {
            filePathFragments.push(workspaceFolder);
        }
        filePathFragments.push(filePath);

        const uri = Uri.file(path.join(...filePathFragments));
        const binData = await workspace.fs.readFile(uri);
        return new TextDecoder().decode(binData);
    }
}
