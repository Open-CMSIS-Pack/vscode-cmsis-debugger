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

import { GDBTargetConfigurationProvider } from './gdbtarget-configuration-provider';
import { extensionContextFactory } from '../__test__/vscode.factory';

import * as vscode from 'vscode';
import { debugConfigurationFactory } from './debug-configuration.factory';

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
});
