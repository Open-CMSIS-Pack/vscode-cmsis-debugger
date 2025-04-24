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

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuiltinToolPath } from './builtin-tool-path';

const TOOL_EXTENSION = os.platform() === 'win32' ? '.exe' : '';

describe('BuiltinToolPath', () => {

    let testFolder: string;

    beforeEach(() => {
        testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
            extensionUri: vscode.Uri.file(testFolder),
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        fs.rmSync(testFolder, { recursive: true, force: true });
    });

    it('should return the correct path for a given tool', () => {
        const builtinToolPath = new BuiltinToolPath('tools/pyocd/pyocd');

        fs.mkdirSync(`${testFolder}/tools/pyocd`, { recursive: true });
        fs.writeFileSync(`${testFolder}/tools/pyocd/pyocd${TOOL_EXTENSION}`, '');

        const expected = vscode.Uri.file(`${testFolder}/tools/pyocd/pyocd${TOOL_EXTENSION}`);
        const result = builtinToolPath.getAbsolutePath();
        expect(result?.fsPath).toBe(expected.fsPath);
    });

    it('should return undefined if tool does not exist', () => {
        const builtinToolPath = new BuiltinToolPath('tools/pyocd/pyocd');

        const result = builtinToolPath.getAbsolutePath();
        expect(result).toBeUndefined();
    });

    it('should return the directory of the tool', () => {
        const builtinToolPath = new BuiltinToolPath('tools/pyocd/pyocd');
        fs.mkdirSync(`${testFolder}/tools/pyocd`, { recursive: true });
        fs.writeFileSync(`${testFolder}/tools/pyocd/pyocd${TOOL_EXTENSION}`, '');

        const expected = vscode.Uri.file(`${testFolder}/tools/pyocd`);
        const result = builtinToolPath.getAbsolutePathDir();
        expect(result).toBe(expected.fsPath);
    });

    it('should return undefined if tool does not exist', () => {
        const builtinToolPath = new BuiltinToolPath('tools/pyocd/pyocd');

        const result = builtinToolPath.getAbsolutePathDir();
        expect(result).toBeUndefined();
    });

});

