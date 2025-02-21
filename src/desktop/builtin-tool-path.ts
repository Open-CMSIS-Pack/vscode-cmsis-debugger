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

import assert from 'assert';
import * as fs from 'fs';
import { EXTENSION_ID } from '../manifest';
import * as os from 'os';
import * as vscode from 'vscode';

const isWindows = os.platform() === 'win32';

export class BuiltinToolPath {
    constructor(protected toolPath: string) {
        assert(toolPath.length, 'BuiltinToolManager: \'toolPath\' must not be empty');
    }

    public getAbsolutePath(): vscode.Uri | undefined {
        const extensionUri = vscode.extensions.getExtension(EXTENSION_ID)?.extensionUri;
        const absoluteUri = extensionUri?.with({ path: `${extensionUri.path}/${this.toolPath}${isWindows ? '.exe' : ''}` });
        const fsPath = absoluteUri?.fsPath;
        return (fsPath && fs.existsSync(fsPath)) ? absoluteUri : undefined;
    }
}
