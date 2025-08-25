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
import { CpuStatesHistory } from './cpu-states-history';

describe('CpuStatesHistory', () => {
    let cpuStatesHistory: CpuStatesHistory;

    describe('without Pname', () => {

        beforeEach(() => {
            cpuStatesHistory = new CpuStatesHistory();
        });

        it('prints no history message', () => {
            const output: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => output.push(line));
            cpuStatesHistory.showHistory();
            expect(output).toMatchSnapshot();
        });

        it('prints history without frequency and without stop locations', () => {
            const inputData = [
                { cpuStates: BigInt(0), threadId: undefined, reason: 'step' },
                { cpuStates: BigInt(2), threadId: 1, reason: 'breakpoint' },
                { cpuStates: BigInt(8), threadId: 1, reason: 'step' },
                { cpuStates: BigInt(13), threadId: 1, reason: 'step' },
            ];
            const output: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => output.push(line));
            inputData.forEach(data => cpuStatesHistory.updateHistory(data.cpuStates, data.threadId, data.reason));
            cpuStatesHistory.showHistory();
            expect(output).toMatchSnapshot();
        });

        it('prints history with frequency and with stop locations', () => {
            const inputData = [
                { cpuStates: BigInt(0), threadId: undefined, reason: 'step', location: 'location1' },
                { cpuStates: BigInt(2), threadId: 1, reason: 'breakpoint', location: 'location2'  },
                { cpuStates: BigInt(8), threadId: 1, reason: 'step', location: 'location3'  },
                { cpuStates: BigInt(13), threadId: 1, reason: 'step', location: 'location4'  },
            ];
            const output: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => output.push(line));
            inputData.forEach(data => {
                cpuStatesHistory.updateHistory(data.cpuStates, data.threadId, data.reason);
                cpuStatesHistory.insertStopLocation(data.location, data.threadId);
            });
            cpuStatesHistory.frequency = 120000000;
            cpuStatesHistory.showHistory();
            expect(output).toMatchSnapshot();
        });

        it('prints only latest stop point after reset', () => {
            const inputData = [
                { cpuStates: BigInt(0), threadId: undefined, reason: 'step' },
                { cpuStates: BigInt(2), threadId: 1, reason: 'breakpoint' },
                { cpuStates: BigInt(8), threadId: 1, reason: 'step' },
                { cpuStates: BigInt(13), threadId: 1, reason: 'step' },
            ];
            const output: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => output.push(line));
            inputData.forEach(data => cpuStatesHistory.updateHistory(data.cpuStates, data.threadId, data.reason));
            cpuStatesHistory.showHistory();
            const lines = output.length;
            expect(lines).toEqual(inputData.length + 3); // surrounding empty lines + header
            const outputAfterReset: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => outputAfterReset.push(line));
            cpuStatesHistory.resetHistory();
            cpuStatesHistory.showHistory();
            expect(outputAfterReset).toMatchSnapshot();
            expect(outputAfterReset.length).toEqual(4); // surrounding empty lines + header + current time
        });

    });

});
