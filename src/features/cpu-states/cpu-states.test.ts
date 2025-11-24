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
import { ContinuedEvent, GDBTargetDebugSession, GDBTargetDebugTracker, SessionStackItem, SessionStackTrace, StoppedEvent } from '../../debug-session';
import { CpuStates } from './cpu-states';
import { DebugProtocol } from '@vscode/debugprotocol';
import { waitForMs } from '../../utils';
import { gdbTargetConfiguration } from '../../debug-configuration/debug-configuration.factory';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root

describe('CpuStates', () => {
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

    const createStackFrame = (): DebugProtocol.StackFrame => ({
        column: 0,
        id: 1,
        line: 2,
        name: 'myframe',
        instructionPointerReference: '0x08000396',
        source: {
            name: 'myfunction'
        }
    });

    const createSessionStackTrace = (session: GDBTargetDebugSession, threadId: number): SessionStackTrace => ({
        session,
        threadId,
        stackFrames: [
            createStackFrame()
        ],
        totalFrames: 1
    });

    let debugConfig: GDBTargetConfiguration;
    let cpuStates: CpuStates;
    let tracker: GDBTargetDebugTracker;
    let debugSession: vscode.DebugSession;
    let gdbtargetDebugSession: GDBTargetDebugSession;

    beforeEach(() => {
        debugConfig = gdbTargetConfiguration({ cmsis: { cbuildRunFile: TEST_CBUILD_RUN_FILE } });
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
            expect(cpuStates.activeHasStates()).toBeUndefined();
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
            await waitForMs(0);
            expect(cpuStates.activeHasStates()).toEqual(false);
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
            await waitForMs(0);
            expect(cpuStates.activeHasStates()).toEqual(expected);
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
            await waitForMs(0);
        });

        it('handles running state correctly', async () => {
            // Considered running after connection
            expect(cpuStates.activeCpuStates?.isRunning).toEqual(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
            await waitForMs(0);
            expect(cpuStates.activeCpuStates?.isRunning).toEqual(false);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
            await waitForMs(0);
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
                await waitForMs(0);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await waitForMs(0);
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(4));
            expect(await cpuStates.getActivePname()).toBeUndefined();
            expect(await cpuStates.getActiveTimeString()).toEqual(' 4 states');
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
                await waitForMs(0);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await waitForMs(0);
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(4));
            expect(await cpuStates.getActivePname()).toBeUndefined();
            expect(await cpuStates.getActiveTimeString()).toEqual(' 4 states');
        });

        it('captures states for multiple continued/stopped events and resets correctly', async () => {
            for (let i = 0; i < 3; i++) {
                (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                    address: '0xE0001004',
                    data:  new Uint8Array([ i*10, 0x00, 0x00, 0x00 ]).buffer
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
                await waitForMs(0);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tracker as any)._onContinued.fire(createContinuedEvent(gdbtargetDebugSession, 0));
                await waitForMs(0);
            }
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(20));
            expect(await cpuStates.getActiveTimeString()).toEqual(' 20 states');
            cpuStates.resetStatesHistory();
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(0));
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0 states');
        });

        it('captures states for periodic refreshes but does not add to history', async () => {
            const debugConsoleOutput: string[] = [];
            (vscode.debug.activeDebugConsole.appendLine as jest.Mock).mockImplementation(line => debugConsoleOutput.push(line));

            // Initial stopped event to capture initial states.
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001004',
                data:  new Uint8Array([ 0x01, 0x00, 0x00, 0x00 ]).buffer
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'step', 0));
            await waitForMs(0);

            // Capture initial history and clear console while keeping object unchanged for above callback.
            cpuStates.showStatesHistory();
            const initialHistoryLength = debugConsoleOutput.length;

            // Refresh event to add states but not history entry.
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0xE0001004',
                data:  new Uint8Array([ 0x04, 0x00, 0x00, 0x00 ]).buffer
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (gdbtargetDebugSession.refreshTimer as any)._onRefresh.fire(gdbtargetDebugSession);
            await waitForMs(0);

            // Diff is 4 - 1 = 3 states, but no new history entry.
            expect(cpuStates.activeCpuStates?.states).toEqual(BigInt(3));
            expect(await cpuStates.getActiveTimeString()).toEqual(' 3 states');
            cpuStates.showStatesHistory();
            // Expecting same output length, i.e. no additional lines due to added history entries.
            expect(debugConsoleOutput.length).toEqual(2*initialHistoryLength);
            // Match snapshot to notice any unexpected changes.
            expect(debugConsoleOutput).toMatchSnapshot();
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
            await waitForMs(0);
            expect(delays.length).toEqual(1);
            expect(delays[0]).toEqual(0);
        });

        it('passes undefined frequency to states if getting SystemCoreClock throws', async () => {
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('test error'));
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toBeUndefined();
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0 states');
        });

        it('passes undefined frequency to states if getting SystemCoreClock does not return a number', async () => {
            (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: 'not a number' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toBeUndefined();
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0 states');
        });

        it('passes valid frequency to states', async () => {
            (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: '12000000' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toEqual(12000000);
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toEqual(12000000);
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0ns');
        });

        it('skips updating frequency after getting SystemCoreClock throws until next CPU states reset', async () => {
            // Bring into stopped state
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStopped.fire(createStoppedEvent(gdbtargetDebugSession, 'breakpoint', 0));
            await waitForMs(0);
            expect(cpuStates.activeCpuStates?.skipFrequencyUpdate).toEqual(false);
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('test error'));
            // First update causing CPU states to skip further updates, time string in states
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates).toBeDefined();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.statesHistory.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.skipFrequencyUpdate).toEqual(true);
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0 states');
            // Second update, valid frequency, time string still in states
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '12000000' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates?.frequency).toBeUndefined();
            expect(cpuStates.activeCpuStates?.skipFrequencyUpdate).toEqual(true);
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0 states');
            // Reset states, skipFrequencyUpdate reset to false
            cpuStates.resetStatesHistory();
            expect(cpuStates.activeCpuStates?.skipFrequencyUpdate).toEqual(false);
            // Now update again
            // Third update, valid frequency, time string now in time
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '12000000' });
            await cpuStates.updateFrequency();
            expect(cpuStates.activeCpuStates?.frequency).toEqual(12000000);
            expect(cpuStates.activeCpuStates?.skipFrequencyUpdate).toEqual(false);
            expect(await cpuStates.getActiveTimeString()).toEqual(' 0ns');
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
            await waitForMs(0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tracker as any)._onStackTrace.fire(createSessionStackTrace(gdbtargetDebugSession, 1));
            await waitForMs(0);
            cpuStates.showStatesHistory();
            expect(debugConsoleOutput.find(line => line.includes('(PC=0x08000396 <myframe>, myfunction::2)'))).toBeDefined();
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
            await waitForMs(0);
        });

        it('shows warning notification on show history that CPU time is not available', async () => {
            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage');
            cpuStates.showStatesHistory();
            expect(warningMessageSpy).toHaveBeenCalledWith('CPU Time commands not available for target');
            expect(await cpuStates.getActiveTimeString()).toEqual(' N/A');
        });

        it('shows warning notification on reset history that CPU time is not available', async () => {
            const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage');
            cpuStates.resetStatesHistory();
            expect(warningMessageSpy).toHaveBeenCalledWith('CPU Time commands not available for target');
            expect(await cpuStates.getActiveTimeString()).toEqual(' N/A');
        });

    });

});

