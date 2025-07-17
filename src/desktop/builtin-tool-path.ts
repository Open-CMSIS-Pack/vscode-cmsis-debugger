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

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from '../manifest';
import { isWindows } from '../utils';
import assert from 'assert';

export class BuiltinToolPath {
    constructor(public readonly toolPath: string) {
        assert(toolPath.length, 'BuiltinToolManager: \'toolPath\' must not be empty');
    }

    public getAbsolutePath(): vscode.Uri | undefined {
        const extensionUri = vscode.extensions.getExtension(EXTENSION_ID)?.extensionUri;
        const absoluteUri = extensionUri?.with({ path: `${extensionUri.path}/${this.toolPath}${isWindows ? '.exe' : ''}` });
        const fsPath = absoluteUri?.fsPath;
        return (fsPath && fs.existsSync(fsPath)) ? absoluteUri : undefined;
    }

    public getAbsolutePathDir(): string | undefined{
        const pathToFile = this.getAbsolutePath()?.fsPath;
        if (pathToFile) {
            return path.dirname(pathToFile);
        }
        return undefined;
    }
}
