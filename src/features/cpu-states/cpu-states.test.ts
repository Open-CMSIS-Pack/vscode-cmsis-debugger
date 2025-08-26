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
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';
import { CpuStates } from './cpu-states';

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

