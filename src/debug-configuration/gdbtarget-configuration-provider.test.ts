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

import { GDBTargetConfiguration, GDBTargetConfigurationProvider } from '.'; // use index.ts to cover it in one test
import { extensionContextFactory } from '../__test__/vscode.factory';

import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { debugConfigurationFactory } from './debug-configuration.factory';
import { BuiltinToolPath } from '../desktop/builtin-tool-path';
import { isWindows } from '../utils';

jest.mock('../desktop/builtin-tool-path');
const BuiltinToolPathMock = BuiltinToolPath as jest.MockedClass<typeof BuiltinToolPath>;

describe('GDBTargetConfigurationProvider', () => {

    it('should activate', async () => {
        const configProvider = new GDBTargetConfigurationProvider([]);
        const contextMock = extensionContextFactory();

        configProvider.activate(contextMock);

        expect(contextMock.subscriptions).toHaveLength(1);
        expect(vscode.debug.registerDebugConfigurationProvider as jest.Mock).toHaveBeenCalledWith('gdbtarget', configProvider);
    });

    it('resolveDebugConfiguration', async () => {
        const configProvider = new GDBTargetConfigurationProvider([]);
        const debugConfig = debugConfigurationFactory();

        const resolvedDebugConfig = await configProvider.resolveDebugConfiguration(undefined, debugConfig, undefined);

        expect(resolvedDebugConfig).toBeDefined();
    });

    it('resolveDebugConfigurationWithSubstitutedVariables', async () => {
        const configProvider = new GDBTargetConfigurationProvider([]);
        const debugConfig = debugConfigurationFactory();

        const resolvedDebugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, debugConfig, undefined);

        expect(resolvedDebugConfig).toBeDefined();
    });

    it('resolves debug configuration and keeps gdb path if other than \'arm-none-eabi-gdb\'', async () => {
        const absoluteGdbPath = '/absolute/path/to/gdb/arm-none-eabi-gdb';
        const debugConfig = debugConfigurationFactory({
            gdb: absoluteGdbPath
        });

        const getAbsolutePathSpy = jest.spyOn(BuiltinToolPath.prototype, 'getAbsolutePath');

        const configProvider = new GDBTargetConfigurationProvider([]);
        const resolvedDebugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(
            undefined,
            debugConfig,
            undefined) as GDBTargetConfiguration;

        expect(resolvedDebugConfig).toBeDefined();
        expect(resolvedDebugConfig.gdb).toEqual(absoluteGdbPath);
        expect(getAbsolutePathSpy).not.toHaveBeenCalled();
    });

    it('resolves debug configuration and replaces \'arm-none-eabi-gdb\' with built-in tool path', async () => {
        const absoluteGdbPath = '/absolute/path/to/gdb/arm-none-eabi-gdb';
        const expectedGdbPath = isWindows ? absoluteGdbPath.replaceAll('/', '\\') : absoluteGdbPath;
        const gdbUri = URI.parse(absoluteGdbPath);
        const debugConfig = debugConfigurationFactory({
            gdb: 'arm-none-eabi-gdb'
        });

        const builtinToolMockInstance = {
            getAbsolutePath: jest.fn().mockReturnValue(gdbUri),
        } as unknown as BuiltinToolPath;
        BuiltinToolPathMock.mockImplementation(() => builtinToolMockInstance);

        const configProvider = new GDBTargetConfigurationProvider([]);
        const resolvedDebugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(
            undefined,
            debugConfig,
            undefined) as GDBTargetConfiguration;

        expect(resolvedDebugConfig).toBeDefined();
        expect(resolvedDebugConfig.gdb).toEqual(expectedGdbPath);
    });
});
