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
import { debugSessionFactory } from '../../__test__/vscode.factory';
import { GDBTargetConfiguration } from '../../debug-configuration';
import { ContinuedEvent, GDBTargetDebugSession, GDBTargetDebugTracker, SessionStackItem, StackTraceRequest, StackTraceResponse, StoppedEvent } from '../../debug-session';
import { CpuStates } from './cpu-states';
import { DebugProtocol } from '@vscode/debugprotocol';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root

describe('CpuStates', () => {
    const defaultConfig = (): GDBTargetConfiguration => {
        return {
            name: 'session-name',
            type: 'gdbtarget',
            request: 'launch',
            cmsis: {
                cbuildRunFile: TEST_CBUILD_RUN_FILE
            }
        };
    };

    const createContinuedEvent = (session: GDBTargetDebugSession, threadId: number): ContinuedEvent => ({
        session,
        event: {
            body: {
                threadId
            }
        } as unknown as DebugProtocol.ContinuedEvent
    });

    const createStoppedEvent = (session: GDBTargetDebugSession, reason: string, threadId: number): StoppedEvent => ({
        session,
        event: {
            body: {
                reason,
                threadId
            }
        } as unknown as DebugProtocol.StoppedEvent
    });

    const createStackTraceRequest = (session: GDBTargetDebugSession, seq: number, threadId: number): StackTraceRequest => ({
        session,
        request: {
            command: 'stackTrace',
            seq,
            type: 'request',
            arguments: {
                threadId
            }
        }
    });

    const createStackTraceResponse = (session: GDBTargetDebugSession, seq: number, request_seq: number): StackTraceResponse => ({
        session,
        response: {
            command: 'stackTrace',
            type: 'response',
            seq,
            request_seq,
            success: true,
            body: {
                totalFrames: 1,
                stackFrames: [
                    {
                        column: 0,
                        id: 1,
                        line: 2,
                        name: 'myframe',
                        instructionPointerReference: '0x08000396',
                        source: {
                            name: 'myfunction'
                        }
                    }
                ]
            }
        }

    });

    let debugConfig: GDBTargetConfiguration;
    let cpuStates: CpuStates;
    let tracker: GDBTargetDebugTracker;
    let debugSession: vscode.DebugSession;
    let gdbtargetDebugSession: GDBTargetDebugSession;

    beforeEach(() => {
        debugConfig = defaultConfig();
        cpuStates = new CpuStates();
        tracker = new GDBTargetDebugTracker();
        debugSession = debugSessionFactory(debugConfig);
        gdbtargetDebugSession = new GDBTargetDebugSession(debugSession);
    });

    describe('session management and connection tests', () => {

        it('activates', () => {
            cpuStates.activate(tracker);
        });

        it('manages session lifecycles correctly', async () => {
            cpuStates.activate(tracker);
            // No active session yet
            expect(cpuStates.activeSession).toBeUndefined();
            // Add session
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            expect(cpuStates.activeSession).toBeUndefined();
            // Activate session
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect(cpuStates.activeSession?.session.id).toEqual(gdbtargetDebugSession.session.id);
            expect(cpuStates.activeSession?.session.name).toEqual(gdbtargetDebugSession.session.name);
            // Deactivate session
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(undefined);
            expect(cpuStates.activeSession).toBeUndefined();
            // Reactivate session
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect(cpuStates.activeSession).toBeDefined();
            // Delete session
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStopSession.fire(gdbtargetDebugSession);
            expect(cpuStates.activeSession).toBeUndefined();
        });

        it('adds cpu states object with defaults for new session', () => {
            // Activate and add/switch session
            cpuStates.activate(tracker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            // Check defaults
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.isRunning).toBeTruthy();
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(0));
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.hasStates).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory).toBeDefined();
        });

        it('detects cpu states is not supported without cmsis config item', async () => {
            delete debugConfig.cmsis;
            // Activate and add/switch session
            cpuStates.activate(tracker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            // Connected
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onConnected.fire(gdbtargetDebugSession);
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            expect(cpuStates.activeCpuStates?.hasStates).toEqual(false);
        });

        it.each([
            { info: 'not supported (memory access fails)', value: undefined, expected: false },
            { info: 'not supported (disabled)', value: [ 0x00, 0x00, 0x00, 0x00 ], expected: false },
            { info: 'not supported (not present)', value: [ 0x01, 0x00, 0x00, 0x02 ], expected: false },
            { info: 'supported', value: [ 0x01, 0x00, 0x00, 0x00 ], expected: true },
        ])('detects cpu states is $info', async ({ value, expected }) => {
            if (value === undefined) {
                (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('test'));
            } else {
                const arrayBuffer = new Uint8Array(value).buffer;
                (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ address: '0xE0001000', data: arrayBuffer });
            }
            // Activate and add/switch session
            cpuStates.activate(tracker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            // Connected
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onConnected.fire(gdbtargetDebugSession);
            // Let events get processed
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            expect(cpuStates.activeCpuStates?.hasStates).toEqual(expected);
        });

    });

    describe('tests with established connection and CPU states supported', () => {

        beforeEach(async () => {
            // Activate and add/switch session
            cpuStates.activate(tracker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001000',
                data:  new Uint8Array([ 0x01, 0x00, 0x00, 0x00 ]).buffer
            });
            // Connected
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onConnected.fire(gdbtargetDebugSession);
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
        });

        it('handles running state correctly', async () => {
            // Considered running after connection
            expect(cpuStates.activeCpuStates?.isRunning).toEqual(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            expect(cpuStates.activeCpuStates?.isRunning).toEqual(false);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            expect(cpuStates.activeCpuStates?.isRunning).toEqual(true);
        });

        it('captures states for multiple continued/stopped events and shows history', async () => {
            const debugConsoleOutput: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => debugConsoleOutput.push(line));
            const stopPoints = 5;
            for (let i = 0; i < stopPoints; i++) {
                (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ i, 0x00, 0x00, 0x00 ]).buffer
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(4));
            cpuStates.showStatesHistory();
            expect(debugConsoleOutput).toMatchSnapshot();
        });

        it('captures states with overflow for multiple continued/stopped events', async () => {
            (debugSession.customRequest as jest.Mock)
                .mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ 0xFE, 0xFF, 0xFF, 0xFF ]).buffer
                })
                .mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ 0xFF, 0xFF, 0xFF, 0xFF ]).buffer
                })
                .mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ 0x02, 0x00, 0x00, 0x00 ]).buffer
                });
            for (let i = 0; i < 3; i++) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(4));
        });

        it('captures states for multiple continued/stopped events and resets correctly', async () => {
            for (let i = 0; i < 3; i++) {
                (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ i*10, 0x00, 0x00, 0x00 ]).buffer
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(20));
            cpuStates.resetStatesHistory();
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(0));
        });

        it('fires refresh events on active stack item change', async () => {
            const delays: number[] = [];
            const listener = (delay: number) => delays.push(delay);
            const disposable = cpuStates.onRefresh(listener);
            expect(disposable).toBeDefined();
            const sessionStackItem: SessionStackItem = {
                session: gdbtargetDebugSession,
                item: undefined
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveStackItem.fire(sessionStackItem);
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            expect(delays.length).toEqual(1);
            expect(delays[0]).toEqual(0);
        });

        it('passes undefined frequency to states if getting SystemCoreClock throws', async () => {
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('test error'));
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toBeUndefined();
        });

        it('passes undefined frequency to states if getting SystemCoreClock does not return a number', async () => {
            (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: 'not a number' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toBeUndefined();
        });

        it('passes valid frequency to states', async () => {
            (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: '12000000' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toEqual(12000000);
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toEqual(12000000);
        });

        it('assigns frame location to captured stop point based on threadId match', async () => {
            const debugConsoleOutput: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => debugConsoleOutput.push(line));
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001004',
                data:  new Uint8Array([ 10, 0x00, 0x00, 0x00 ]).buffer
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 1 /*threadId*/));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStackTraceRequest.fire(createStackTraceRequest(gdbtargetDebugSession, 1, 1));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStackTraceResponse.fire(createStackTraceResponse(gdbtargetDebugSession, 4, 1));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            cpuStates.showStatesHistory();
            expect(debugConsoleOutput.find(line => line.includes('(PC=0x08000396 <myframe>, myfunction::2)'))).toBeDefined();
        });

        it('does not assign frame location to captured stop point due to threadId mismatch', async () => {
            const debugConsoleOutput: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => debugConsoleOutput.push(line));
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001004',
                data:  new Uint8Array([ 10, 0x00, 0x00, 0x00 ]).buffer
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 2 /*threadId*/));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStackTraceRequest.fire(createStackTraceRequest(gdbtargetDebugSession, 1, 1));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStackTraceResponse.fire(createStackTraceResponse(gdbtargetDebugSession, 4, 1));
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
            cpuStates.showStatesHistory();
            expect(debugConsoleOutput.find(line => line.includes('(PC=0x08000396 <myframe>::2)'))).toBeUndefined();
        });

    });

    describe('tests with established connection and CPU states not supported', () => {

        beforeEach(async () => {
            // Activate and add/switch session
            cpuStates.activate(tracker);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001000',
                data:  new Uint8Array([ 0x00, 0x00, 0x00, 0x00 ]).buffer
            });
            // Connected
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onConnected.fire(gdbtargetDebugSession);
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
        });

        it('shows warning notification on show history that CPU time is not available', () => {
            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage');
            cpuStates.showStatesHistory();
            expect(warningMessageSpy).toHaveBeenCalledWith('CPU Time commands not available for target');
        });

        it('shows warning notification on reset history that CPU time is not available', () => {
            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage');
            cpuStates.resetStatesHistory();
            expect(warningMessageSpy).toHaveBeenCalledWith('CPU Time commands not available for target');
        });

    });

});

