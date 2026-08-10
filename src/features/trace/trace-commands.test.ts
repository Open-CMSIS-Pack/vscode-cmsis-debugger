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
import { extensionContextFactory, debugSessionFactory } from '../../__test__/vscode.factory';
import { CTraceController } from './ctrace-controller';
import { PyTsController } from './pyts-controller';
import { TraceCommands } from './trace-commands';

describe('TraceCommands', () => {
    let commands: TraceCommands;
    let registeredCommands: Map<string, () => Promise<void>>;

    beforeEach(() => {
        commands = new TraceCommands(new PyTsController(), new CTraceController());
        registeredCommands = new Map();
        (vscode.commands.registerCommand as jest.Mock).mockImplementation((command: string, handler: () => Promise<void>) => {
            registeredCommands.set(command, handler);
            return { dispose: jest.fn() };
        });
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: undefined });
    });

    it('registers the ctrace reload command', () => {
        commands.activate(extensionContextFactory());

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(TraceCommands.reloadCTraceID, expect.any(Function));
    });

    it('sends a ctrace reload request to the active debug session', async () => {
        const session = debugSessionFactory({ name: 'test', type: 'cmsis-debugger', request: 'launch' });
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: session });
        commands.activate(extensionContextFactory());

        await registeredCommands.get(TraceCommands.reloadCTraceID)!();

        expect(session.customRequest).toHaveBeenCalledWith('evaluate', {
            expression: '> monitor ctrace reload',
            context: 'repl'
        });
    });

    it('does nothing when no debug session is active', async () => {
        commands.activate(extensionContextFactory());

        await expect(registeredCommands.get(TraceCommands.reloadCTraceID)!()).resolves.toBeUndefined();
    });
});
