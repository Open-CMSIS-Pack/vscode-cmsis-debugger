/**
 * Copyright 2026 Arm Limited
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
// generated with AI

import * as vscode from 'vscode';

import { extensionContextFactory } from '../../__test__/vscode.factory';
import { logger } from '../../logger';
import { normalizeFsPath } from '../../utils';
import { TraceConfigurationCommands } from './trace-configuration-commands';

describe('TraceConfigurationCommands', () => {
    let context: vscode.ExtensionContext;
    let handler: (() => Promise<void>) | undefined;
    const getCBuildRunFileName = jest.fn<Promise<string | undefined>, []>();
    const createDefaultCTraceFile = jest.fn<Promise<vscode.Uri>, [vscode.Uri]>();

    beforeEach(() => {
        context = extensionContextFactory();
        handler = undefined;
        getCBuildRunFileName.mockReset();
        createDefaultCTraceFile.mockReset();
        (vscode.commands.registerCommand as jest.Mock).mockImplementation(
            (command: string, registeredHandler: () => Promise<void>) => {
                if (command === TraceConfigurationCommands.generateDefaultTraceGeneratorId) {
                    handler = registeredHandler;
                }
                return { dispose: jest.fn() };
            }
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function activateCommands(): () => Promise<void> {
        const commands = new TraceConfigurationCommands(
            { getCBuildRunFileName },
            { createDefaultCTraceFile }
        );
        commands.activate(context);
        expect(handler).toBeDefined();
        return handler as () => Promise<void>;
    }

    it('registers the command-palette handler', () => {
        activateCommands();

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            TraceConfigurationCommands.generateDefaultTraceGeneratorId,
            expect.any(Function)
        );
        expect(context.subscriptions).toHaveLength(1);
    });

    it('reads the active cbuild-run file and generates its default ctrace file', async () => {
        getCBuildRunFileName.mockResolvedValue('/workspace/out/demo.cbuild-run.yml');
        createDefaultCTraceFile.mockResolvedValue(vscode.Uri.file('/workspace/.cmsis/demo.ctrace.yml'));
        const commandHandler = activateCommands();

        await commandHandler();

        expect(getCBuildRunFileName).toHaveBeenCalledTimes(1);
        expect(createDefaultCTraceFile).toHaveBeenCalledWith(vscode.Uri.file('/workspace/out/demo.cbuild-run.yml'));
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            `Default trace configuration generated at ${normalizeFsPath('/workspace/.cmsis/demo.ctrace.yml')}.`
        );
    });

    it('reports when no active cbuild-run file is available', async () => {
        getCBuildRunFileName.mockResolvedValue(undefined);
        const commandHandler = activateCommands();

        await commandHandler();

        expect(createDefaultCTraceFile).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'No active cbuild-run file was found. Generate the project and try again.'
        );
    });

    it('reports generation failures without rejecting the command', async () => {
        const loggerSpy = jest.spyOn(logger, 'error');
        getCBuildRunFileName.mockResolvedValue('/workspace/out/demo.cbuild-run.yml');
        createDefaultCTraceFile.mockRejectedValue(new Error('invalid processor data'));
        const commandHandler = activateCommands();

        await commandHandler();

        expect(loggerSpy).toHaveBeenCalledWith(
            'Trace Configuration: Failed to generate default trace configuration: invalid processor data'
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to generate default trace configuration: invalid processor data'
        );
    });
});
