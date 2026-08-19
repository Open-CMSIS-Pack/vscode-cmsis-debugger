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
import { CTraceController } from './ctrace-controller';
import { PyTsController } from './pyts-controller';
import { TraceCommands } from './trace-commands';

describe('TraceCommands', () => {
    let commands: TraceCommands;
    // Kept at describe scope so individual tests can spy on its methods.
    let pyTsController: PyTsController;
    let cTraceController: CTraceController;
    let registeredCommands: Map<string, () => Promise<void>>;

    beforeEach(() => {
        pyTsController = new PyTsController();
        cTraceController = new CTraceController();
        commands = new TraceCommands(pyTsController, cTraceController);
        registeredCommands = new Map();
        (vscode.commands.registerCommand as jest.Mock).mockImplementation((command: string, handler: () => Promise<void>) => {
            registeredCommands.set(command, handler);
            return { dispose: jest.fn() };
        });
    });

    it('registers all trace commands and adds their disposables to the extension context', () => {
        const context = extensionContextFactory();

        commands.activate(context);

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(TraceCommands.reloadCTraceID, expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(TraceCommands.launchPyTsID, expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(TraceCommands.launchCTraceID, expect.any(Function));
        expect(context.subscriptions).toHaveLength(3);
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(TraceCommands.reloadCTraceID, expect.any(Function));
    });

    it('requests a ctrace reload after pyTS completes', async () => {
        const run = jest.spyOn(pyTsController, 'run').mockResolvedValue();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchPyTsID)!();

        expect(run).toHaveBeenCalledWith({}, true);
    });

    it('runs ctrace when its command is invoked', async () => {
        const run = jest.spyOn(cTraceController, 'run').mockResolvedValue();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchCTraceID)!();

        expect(run).toHaveBeenCalledWith();
    });

    it('reports a pyTS launch failure', async () => {
        const error = new Error('pyTS failed');
        const run = jest.spyOn(pyTsController, 'run').mockRejectedValue(error);
        const consoleError = jest.spyOn(console, 'error').mockImplementation();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchPyTsID)!();

        expect(run).toHaveBeenCalledWith({}, true);
        expect(consoleError).toHaveBeenCalledWith('Failed to launch pyTS process:', error);
    });

    it('reports a ctrace launch failure', async () => {
        const error = new Error('ctrace failed');
        const run = jest.spyOn(cTraceController, 'run').mockRejectedValue(error);
        const consoleError = jest.spyOn(console, 'error').mockImplementation();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchCTraceID)!();

        expect(run).toHaveBeenCalledWith();
        expect(consoleError).toHaveBeenCalledWith('Failed to launch ctrace process:', error);
    });

    it('delegates the ctrace reload command to the pyTS controller', async () => {
        const reloadCTrace = jest.spyOn(pyTsController, 'reloadCTrace').mockResolvedValue();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.reloadCTraceID)!();

        expect(reloadCTrace).toHaveBeenCalledTimes(1);
    });
});
