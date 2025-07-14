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
import { addToolsToPath } from './add-to-path';
import { BuiltinToolPath } from './builtin-tool-path';
import { extensionContextFactory } from '../__test__/vscode.factory';
import { isWindows } from '../utils';

jest.mock('./builtin-tool-path');
const delimiter = isWindows ? ';' : ':';
const pyOCD = 'pyocd/pyocd';
const pyOCDPath = '/tools/' + pyOCD;
const BuiltinToolPathMock = BuiltinToolPath as jest.MockedClass<typeof BuiltinToolPath>;

describe('addToolToPath', () => {
    let extensionMock: vscode.ExtensionContext;
    beforeEach(() => {
        extensionMock = extensionContextFactory();
        jest.clearAllMocks();
    });

    it('calls prepend with correct path when path is available and not already included', () => {
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue(pyOCDPath),
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate previously appended mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Append,
            value: 'pathPyOCD'
        });

        addToolsToPath(extensionMock, [pyOCD]);

        expect(extensionMock.environmentVariableCollection.prepend).toHaveBeenCalledWith('PATH', expect.stringContaining(pyOCDPath));
    });

    it('does nothing if getAbsolutePathDir returns undefined', () => {
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue(undefined),
        } as unknown as BuiltinToolPath;

        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        addToolsToPath(extensionMock, [pyOCD]);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });

    it('does nothing if PATH is already prepended with same path', () => {
        const mockInstance = {
            getAbsolutePathDir: jest.fn().mockReturnValue('/already/included/path'),
        } as unknown as BuiltinToolPath;

        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: `/already/included/path${delimiter}`
        });

        addToolsToPath(extensionMock, [pyOCD]);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });

    it('prepends a list of available paths that is not prepended yet', () => {
        const anotherTool = 'another/tool';
        const anotherToolPath = '/tools/' + anotherTool;
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn()
                .mockReturnValueOnce(pyOCDPath)
                .mockReturnValueOnce(anotherToolPath)
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue(undefined);

        addToolsToPath(extensionMock, [pyOCD, anotherTool]);

        const expectedPath = pyOCDPath + delimiter + anotherToolPath + delimiter;
        expect(extensionMock.environmentVariableCollection.prepend).toHaveBeenCalledWith('PATH', expectedPath);
    });

    it('does not prepend a list of available paths if already prepended in different order', () => {
        const anotherTool = 'another/tool';
        const anotherToolPath = '/tools/' + anotherTool;
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn()
                .mockReturnValueOnce(pyOCDPath)
                .mockReturnValueOnce(anotherToolPath)
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: `${anotherToolPath}${delimiter}${pyOCDPath}${delimiter}`
        });

        addToolsToPath(extensionMock, [pyOCD, anotherTool]);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });

    it('does not prepend a list of available paths if already prepended in different order and with other paths', () => {
        const anotherTool = 'another/tool';
        const anotherToolPath = '/tools/' + anotherTool;
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn()
                .mockReturnValueOnce(pyOCDPath)
                .mockReturnValueOnce(anotherToolPath)
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: `${anotherToolPath}${delimiter}/yet/another/tool${delimiter}${pyOCDPath}${delimiter}`
        });

        addToolsToPath(extensionMock, [pyOCD, anotherTool]);

        expect(extensionMock.environmentVariableCollection.prepend).not.toHaveBeenCalled();
    });

    it('prepends a list of available paths if existing list misses one', () => {
        const anotherTool = 'another/tool';
        const anotherToolPath = '/tools/' + anotherTool;
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn()
                .mockReturnValueOnce(pyOCDPath)
                .mockReturnValueOnce(anotherToolPath)
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue({
            type: vscode.EnvironmentVariableMutatorType.Prepend,
            value: `${anotherToolPath}${delimiter}/yet/another/tool${delimiter}`
        });

        addToolsToPath(extensionMock, [pyOCD, anotherTool]);

        const expectedPath = pyOCDPath + delimiter + anotherToolPath + delimiter;
        expect(extensionMock.environmentVariableCollection.prepend).toHaveBeenCalledWith('PATH', expectedPath);
    });

    it('prepends the available path if the other of the input list is not available', () => {
        const anotherTool = 'another/tool';
        const anotherToolPath = '/tools/' + anotherTool;
        // Mock instance of BuiltinToolPath
        const mockInstance = {
            getAbsolutePathDir: jest.fn()
                .mockReturnValueOnce(undefined)
                .mockReturnValueOnce(anotherToolPath)
        } as unknown as BuiltinToolPath;

        // Provide the fake instance when BuiltinToolPath is instantiated
        BuiltinToolPathMock.mockImplementation(() => mockInstance);

        // Simulate no existing mutator
        (extensionMock.environmentVariableCollection.get as jest.Mock).mockReturnValue(undefined);

        addToolsToPath(extensionMock, [pyOCD, anotherTool]);

        const expectedPath = anotherToolPath + delimiter;
        expect(extensionMock.environmentVariableCollection.prepend).toHaveBeenCalledWith('PATH', expectedPath);
    });

});
