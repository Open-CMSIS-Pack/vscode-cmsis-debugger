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
import { addPyocdToPath } from './add-to-path';
import { BuiltinToolPath } from './builtin-tool-path';
import { extensionContextFactory } from '../__test__/vscode.factory';
import { isWindows } from '../utils';

jest.mock('./builtin-tool-path');
const pathPyOCD = 'tools/pyocd/pyocd';
const BuiltinToolPathMock = BuiltinToolPath as jest.MockedClass<typeof BuiltinToolPath>;

describe('addPyocdToPath', () => {
    let extensionMock: vscode.ExtensionContext;
    beforeEach(() => {
        extensionMock = extensionContextFactory();
        jest.clearAllMocks();
    });

    it('calls prepend with correct path when path is available and not already included', () => {
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue(pathPyOCD),
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Append,
            value: 'pathPyOCD'
        });

        addPyocdToPath(extensionMock);

        expect(extensionMock.environmentVariableCollection.prepend).toHaveBeenCalledWith('PATH', expect.stringContaining(pathPyOCD));
    });

    it('does nothing if getAbsolutePathDir returns undefined', () => {
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue(undefined),
        } as unknown as BuiltinToolPath;

        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        addPyocdToPath(extensionMock);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });

    it('does nothing if PATH is already prepended with same path', () => {
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue('/already/included/path'),
        } as unknown as BuiltinToolPath;

        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        isWindows? (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: '/already/included/path;'
        }):(extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: '/already/included/path:'
        });

        addPyocdToPath(extensionMock);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });
});
