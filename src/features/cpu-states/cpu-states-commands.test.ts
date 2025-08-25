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
import { extensionContextFactory } from '../../__test__/vscode.factory';
import { CpuStates } from './cpu-states';
import { CpuStatesCommands } from './cpu-states-commands';

jest.mock('./cpu-states');
const CpuStatesMock = CpuStates as jest.MockedClass<typeof CpuStates>;

describe('CpuStatesCommands', () => {
    let context: vscode.ExtensionContext;
    let cpuStatesCommands: CpuStatesCommands;
    let cpuStatesMock: CpuStates;
    let registeredCommands: Map<string, () => Promise<void>>;

    beforeEach(() => {
        context = extensionContextFactory();
        cpuStatesCommands = new CpuStatesCommands();
        cpuStatesMock = new CpuStatesMock();
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
        cpuStatesCommands.activate(context, cpuStatesMock);
        expect(vscode.commands.registerCommand as jest.Mock).toHaveBeenCalledWith(CpuStatesCommands.showCpuTimeHistoryID, expect.any(Function));
        expect(vscode.commands.registerCommand as jest.Mock).toHaveBeenCalledWith(CpuStatesCommands.resetCpuTimeHistoryID, expect.any(Function));
    });

    it('calls updateFrequyency and showStatesHistory for showCpuTimeHistory command', async () => {
        cpuStatesCommands.activate(context, cpuStatesMock);
        await vscode.commands.executeCommand(CpuStatesCommands.showCpuTimeHistoryID);
        expect(cpuStatesMock.updateFrequency).toHaveBeenCalledTimes(1);
        expect(cpuStatesMock.showStatesHistory).toHaveBeenCalledTimes(1);
    });

    it('calls resetStatesHistory for resetCpuTimeHistory command', async () => {
        cpuStatesCommands.activate(context, cpuStatesMock);
        await vscode.commands.executeCommand(CpuStatesCommands.resetCpuTimeHistoryID);
        expect(cpuStatesMock.resetStatesHistory).toHaveBeenCalledTimes(1);
    });

    it('calls no CpuStates method if executing commands without activation', async () => {
        await vscode.commands.executeCommand(CpuStatesCommands.showCpuTimeHistoryID);
        await vscode.commands.executeCommand(CpuStatesCommands.resetCpuTimeHistoryID);
        expect(cpuStatesMock.updateFrequency).not.toHaveBeenCalled();
        expect(cpuStatesMock.showStatesHistory).not.toHaveBeenCalled();
        expect(cpuStatesMock.resetStatesHistory).not.toHaveBeenCalled();
    });

});
