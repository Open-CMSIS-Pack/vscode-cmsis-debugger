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
import { logger } from '../../logger';
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

    it('runs pyTS when its command is invoked', async () => {
        const run = jest.spyOn(pyTsController, 'run').mockResolvedValue(0);
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchPyTsID)!();

        expect(run).toHaveBeenCalledWith();
    });

    it('runs ctrace when its command is invoked', async () => {
        const run = jest.spyOn(cTraceController, 'run').mockResolvedValue(0);
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchCTraceID)!();

        expect(run).toHaveBeenCalledWith();
    });

    it('reports a pyTS launch failure', async () => {
        const error = new Error('pyTS failed');
        const run = jest.spyOn(pyTsController, 'run').mockRejectedValue(error);
        const loggerError = jest.spyOn(logger, 'error').mockImplementation();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchPyTsID)!();

        expect(run).toHaveBeenCalledWith();
        expect(loggerError).toHaveBeenCalledWith('Failed to launch pyTS process:', error);
    });

    it('reports a ctrace launch failure', async () => {
        const error = new Error('ctrace failed');
        const run = jest.spyOn(cTraceController, 'run').mockRejectedValue(error);
        const loggerError = jest.spyOn(logger, 'error').mockImplementation();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchCTraceID)!();

        expect(run).toHaveBeenCalledWith();
        expect(loggerError).toHaveBeenCalledWith('Failed to launch ctrace process:', error);
    });

    it('logs non-zero and null process exit codes', async () => {
        jest.spyOn(pyTsController, 'run').mockResolvedValue(7);
        jest.spyOn(cTraceController, 'run').mockResolvedValue(null);
        const loggerError = jest.spyOn(logger, 'error').mockImplementation();
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.launchPyTsID)!();
        await registeredCommands.get(TraceCommands.launchCTraceID)!();

        expect(loggerError).toHaveBeenCalledWith('pyTS process exited with code 7');
        expect(loggerError).toHaveBeenCalledWith('ctrace process exited with code null');
    });

    it('sends a ctrace reload request to the active debug session', async () => {
        const session = {
            customRequest: jest.fn()
        };
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: session });
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.reloadCTraceID)!();

        expect(session.customRequest).toHaveBeenCalledWith('evaluate', {
            expression: '> monitor ctrace reload',
            context: 'repl'
        });
    });

    it('does nothing when no debug session is active', async () => {
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: undefined });
        commands.activate(extensionContextFactory());

        await expect(registeredCommands.get(TraceCommands.reloadCTraceID)!()).resolves.toBeUndefined();
    });
});
