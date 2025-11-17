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
import { extensionContextFactory } from '../__test__/vscode.factory';
import { GenericCommands } from './generic-commands';

describe('GenericCommands', () => {
    let context: vscode.ExtensionContext;
    let genericCommands: GenericCommands;
    let registeredCommands: Map<string, () => Promise<void>>;

    beforeEach(() => {
        context = extensionContextFactory();
        genericCommands = new GenericCommands();
        registeredCommands = new Map();
        (vscode.commands.registerCommand as jest.Mock).mockImplementation(async (command: string, handler: () => Promise<void>) => {
            registeredCommands.set(command, handler);
        });
        (vscode.commands.executeCommand as jest.Mock).mockImplementation(async (command: string) => {
            const handler = registeredCommands.get(command);
            if (handler) {
                await handler();
            }
        });
    });

    it('registers expected commands', () => {
        genericCommands.activate(context);
        expect(vscode.commands.registerCommand as jest.Mock).toHaveBeenCalledWith(GenericCommands.openDisassemblyViewID, expect.any(Function));
    });

    it('calls \'debug.action.openDisassemblyView\' command', async () => {
        genericCommands.activate(context);
        await vscode.commands.executeCommand(GenericCommands.openDisassemblyViewID);
        expect(vscode.commands.executeCommand as jest.Mock).toHaveBeenCalledWith('debug.action.openDisassemblyView');
    });

});
