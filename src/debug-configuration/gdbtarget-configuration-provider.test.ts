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
import { debugSessionFactory, extensionContextFactory } from '../__test__/vscode.factory';

import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { debugConfigurationFactory, gdbTargetConfiguration } from './debug-configuration.factory';
import { BuiltinToolPath } from '../desktop/builtin-tool-path';
import { isWindows, waitForMs } from '../utils';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../debug-session';

jest.mock('../desktop/builtin-tool-path');
const BuiltinToolPathMock = BuiltinToolPath as jest.MockedClass<typeof BuiltinToolPath>;

describe('GDBTargetConfigurationProvider', () => {

    it('should activate', () => {
        const configProvider = new GDBTargetConfigurationProvider([]);
        const contextMock = extensionContextFactory();

        configProvider.activate(contextMock);

        expect(contextMock.subscriptions).toHaveLength(1);
        expect(vscode.debug.registerDebugConfigurationProvider as jest.Mock).toHaveBeenCalledWith('gdbtarget', configProvider);
    });

    it('should activate with debug tracker', () => {
        const debugTracker = new GDBTargetDebugTracker();
        const configProvider = new GDBTargetConfigurationProvider([]);
        const contextMock = extensionContextFactory();

        configProvider.activate(contextMock, debugTracker);

        // 1 for the config provider, 2 for the debug tracker
        expect(contextMock.subscriptions).toHaveLength(1+2);
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

    describe('tests with sessions', () => {
        let debugTracker: GDBTargetDebugTracker;
        let configProvider: GDBTargetConfigurationProvider;
        let contextMock: vscode.ExtensionContext;

        const createLaunchConfig = (name: string) => gdbTargetConfiguration({
            name,
            request: 'launch'
        });

        const createAttachConfig = (name: string) => gdbTargetConfiguration({
            name,
            request: 'attach'
        });

        const createLaunchSession = (name: string) => new GDBTargetDebugSession(
            debugSessionFactory(createLaunchConfig(name))
        );

        const createAttachSession = (name: string) => new GDBTargetDebugSession(
            debugSessionFactory(createAttachConfig(name))
        );

        beforeEach(() => {
            debugTracker = new GDBTargetDebugTracker();
            configProvider = new GDBTargetConfigurationProvider([]);
            contextMock = extensionContextFactory();

            configProvider.activate(contextMock, debugTracker);

            (vscode.window.showInformationMessage as jest.Mock).mockClear();
        });

        it('can add and remove sessions', async () => {
            const debugSession = createLaunchSession('testSession');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStartSession.fire(debugSession);
            await waitForMs(0);
            expect(configProvider['activeSessions'].size).toBe(1);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStopSession.fire(debugSession);
            await waitForMs(0);
            expect(configProvider['activeSessions'].size).toBe(0);
        });

        it('starts independent sessions', async () => {
            const launchSession = createLaunchSession('pname session@1 (launch)');
            const attachSession = createAttachSession('pname session@2 (attach)');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStartSession.fire(launchSession);
            await waitForMs(0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStartSession.fire(attachSession);
            await waitForMs(0);
        });

        it.each([
            { dialogResponse: undefined, undefinedResult: true },
            { dialogResponse: 'Yes', undefinedResult: false },
        ])('asks for confirmation if starting sessions with same config base name (dialog response $dialogResponse)', async ({ dialogResponse, undefinedResult }) => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(dialogResponse);
            const launchSession = createLaunchSession('pname session@1 (launch)');
            const attachConfig = createAttachConfig('pname session@1 (attach)');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStartSession.fire(launchSession);
            await waitForMs(0);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            const result = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(
                undefined,
                attachConfig
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
            if (undefinedResult) {
                expect(result).toBeUndefined();
            } else {
                expect(result).toBeDefined();
            }
        });

        it('does not ask for confirmation if same config starts again (VS Code will do later)', async () => {
            const launchSession = createLaunchSession('pname session@1 (launch)');
            const otherLaunchConfig = createLaunchConfig('pname session@1 (launch)');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (debugTracker as any)._onWillStartSession.fire(launchSession);
            await waitForMs(0);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            const result = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(
                undefined,
                otherLaunchConfig
            );
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('does not ask for confirmation if no other session running', async () => {
            const launchConfig = createLaunchConfig('pname session@1 (launch)');
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            const result = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(
                undefined,
                launchConfig
            );
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });

});
