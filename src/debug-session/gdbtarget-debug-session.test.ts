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
import { debugSessionFactory } from '../__test__/vscode.factory';
import { GDBTargetDebugSession } from './gdbtarget-debug-session';
import { logger } from '../logger';
import { DebugProtocol } from '@vscode/debugprotocol';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root

const generateBase64FromUint8Array = (input: Uint8Array): string => {
    return Buffer.from(input).toString('base64');
};

describe('GDBTargetDebugSession', () => {
    const defaultConfig = () => {
        return {
            name: 'session-name',
            type: 'gdbtarget',
            request: 'launch'
        };
    };

    let debugSession: vscode.DebugSession;
    let gdbTargetSession: GDBTargetDebugSession;

    beforeEach(() => {
        debugSession = debugSessionFactory(defaultConfig());
        gdbTargetSession = new GDBTargetDebugSession(debugSession);
    });

    it('can create a GDBTargetDebugSession', () => {
        expect(gdbTargetSession).toBeDefined();
    });

    it('returns an undefined cbuild object of not parsing one', async () => {
        const cbuildRun = await gdbTargetSession.getCbuildRun();
        expect(cbuildRun).toBeUndefined();
    });

    it('returns a cbuild object after parsing one', async () => {
        await gdbTargetSession.parseCbuildRun(TEST_CBUILD_RUN_FILE);
        const cbuildRun = await gdbTargetSession.getCbuildRun();
        expect(cbuildRun).toMatchSnapshot();
    });

    it('evaluates a global expression without active stack frame and returns a value', async () => {
        // Only mock relevant properties, return value is body of EvaluateResponse
        (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: '1234567', variableReference: 0 });
        const result = await gdbTargetSession.evaluateGlobalExpression('myGlobalVariable');
        expect(result).toEqual({ result: '1234567', variableReference: 0 });
        expect(debugSession.customRequest as jest.Mock).toHaveBeenCalledWith('evaluate', { expression: 'myGlobalVariable', frameId: 0, context: 'hover' });
    });

    it('evaluates a global expression with active stack frame and returns a value', async () => {
        // Only mock relevant properties, return value is body of EvaluateResponse
        (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ result: '1234567', variableReference: 0 });
        (vscode.debug.activeStackItem as unknown) = { session: debugSession, threadId: 1, frameId: 2 };
        const result = await gdbTargetSession.evaluateGlobalExpression('myGlobalVariable');
        expect(result).toEqual({ result: '1234567', variableReference: 0 });
        expect(debugSession.customRequest as jest.Mock).toHaveBeenCalledWith('evaluate', { expression: 'myGlobalVariable', frameId: 2, context: 'hover' });
        // restore default
        (vscode.debug.activeStackItem as unknown) = undefined;
    });

    it('returns a string if evaluating a global expression fails', async () => {
        // Only mock relevant properties, return value is body of EvaluateResponse
        const logDebugSpy = jest.spyOn(logger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('myError'));
        const result = await gdbTargetSession.evaluateGlobalExpression('myGlobalVariable');
        expect(result).toBe('myError');
        expect(debugSession.customRequest as jest.Mock).toHaveBeenCalledWith('evaluate', { expression: 'myGlobalVariable', frameId: 0, context: 'hover' });
        expect(logDebugSpy).toHaveBeenCalledWith('Session \'session-name\': Failed to evaluate global expression \'myGlobalVariable\' - \'myError\'');
    });

    it('reads memory of an odd number of bytes', async () => {
        const memoryContents = new Uint8Array([ 0x12, 0x34, 0x56, 0x78 ]);
        const readMemory = generateBase64FromUint8Array(memoryContents);
        (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ address: '0xABABABAB', data: readMemory });
        const result = await gdbTargetSession.readMemory(0xABABABAB, 3);
        expect(new Uint8Array(result!)).toEqual(new Uint8Array(memoryContents.buffer.slice(0, 3)));
    });

    it('returns undefined for a failing memory read', async () => {
        const logDebugSpy = jest.spyOn(logger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('myError'));
        const result = await gdbTargetSession.readMemory(0xABABABAB, 4);
        expect(result).toBeUndefined();
        expect(logDebugSpy).toHaveBeenCalledWith('Session \'session-name\': Cannot read 4 Bytes from address 2880154539 - \'myError\'');
    });

    it('returns little-endian representation when it reads a U32', async() => {
        const memoryContents = new Uint8Array([ 0x12, 0x34, 0x56, 0x78 ]);
        const readMemory = generateBase64FromUint8Array(memoryContents);
        (debugSession.customRequest as jest.Mock).mockReturnValueOnce({ address: '0xABABABAB', data: readMemory });
        const result = await gdbTargetSession.readMemoryU32(0xABABABAB);
        expect(result).toEqual(0x78563412);
    });

    it('filters output events correctly', () => {
        const makeEvent = (output: string, category: string): DebugProtocol.OutputEvent => ({
            seq: 1,
            type: 'event',
            event: 'output',
            body: {
                output,
                category
            }
        });
        const makeEvents = (): DebugProtocol.OutputEvent[]  => [
            makeEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'log'),
            makeEvent('warning: (Error: pc 0x12345678 in address map, but not in symtab.)\n', 'log')
        ];
        const eventsToFilter = makeEvents();
        const referenceEvents = makeEvents();
        // Update to expected event names
        referenceEvents.forEach(event => event.event = 'cmsis-debugger-discarded');
        // Look out for logger output
        const logDebugSpy = jest.spyOn(logger, 'debug');
        // Call the filter
        eventsToFilter.forEach(event => gdbTargetSession.filterOutputEvent(event));
        // Check if logger was called (2 lines = event info + output)
        expect(logDebugSpy).toHaveBeenCalledTimes(eventsToFilter.length*2);
        // Compare the outputs
        expect(eventsToFilter).toEqual(referenceEvents);
    });

    it('does not filter output events if they do not match criteria', () => {
        const makeEvent = (output: string, category: string): DebugProtocol.OutputEvent => ({
            seq: 1,
            type: 'event',
            event: 'output',
            body: {
                output,
                category
            }
        });
        const makeEvents = (): DebugProtocol.OutputEvent[]  => [
            makeEvent('warning: (Internal error: pc 0x12345678 in read in CU, but not in symtab.)\n', 'foo'),
            makeEvent('Error: pc 0x12345678 in address map, but not in symtab.', 'log')
        ];
        const eventsToFilter = makeEvents();
        const referenceEvents = makeEvents();
        // Look out for logger output
        const logDebugSpy = jest.spyOn(logger, 'debug');
        // Call the filter
        eventsToFilter.forEach(event => gdbTargetSession.filterOutputEvent(event));
        // Check if logger was called (should not be called if not filtered)
        expect(logDebugSpy).not.toHaveBeenCalled();
        // Compare the outputs, should be exact matches as inputs should not cause a match
        expect(eventsToFilter).toEqual(referenceEvents);
    });
});
