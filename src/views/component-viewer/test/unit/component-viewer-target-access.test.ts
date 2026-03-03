/**
 * Copyright 2026 Arm Limited
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
// generated with AI

/**
 * Unit test for ComponentViewerTargetAccess.
 */

import * as vscode from 'vscode';
import { ComponentViewerTargetAccess } from '../../component-viewer-target-access';
import { debugSessionFactory } from '../../../../__test__/vscode.factory';
import { GDBTargetDebugSession } from '../../../../debug-session';
import { componentViewerLogger } from '../../../../logger';

function setActiveStackItem(session: vscode.DebugSession | undefined, frameId: number | undefined) {
    const value = session ? { session, threadId: 1, frameId } : undefined;
    Object.defineProperty(vscode.debug, 'activeStackItem', {
        value,
        configurable: true,
        writable: true,
    });
}

function setActiveDebugSession(session: vscode.DebugSession | undefined) {
    Object.defineProperty(vscode.debug, 'activeDebugSession', {
        value: session,
        configurable: true,
        writable: true,
    });
}

describe('ComponentViewerTargetAccess', () => {
    const defaultConfig = () => ({
        name: 'test-session',
        type: 'gdbtarget',
        request: 'launch',
    });

    let debugSession: vscode.DebugSession;
    let gdbTargetSession: GDBTargetDebugSession;
    let targetAccess: ComponentViewerTargetAccess;

    beforeEach(() => {
        debugSession = debugSessionFactory(defaultConfig());
        gdbTargetSession = new GDBTargetDebugSession(debugSession);
        targetAccess = new ComponentViewerTargetAccess();
        targetAccess.setActiveSession(gdbTargetSession);
        setActiveStackItem(debugSession, 1);
        setActiveDebugSession(debugSession);
    });

    afterEach(() => {
        setActiveStackItem(undefined, undefined);
        setActiveDebugSession(undefined);
        jest.restoreAllMocks();
    });

    describe('evaluateSymbolAddress (expression, no frameId, hover context)', () => {
        it('resolves address from expression result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x20000000'
            });

            await expect(targetAccess.evaluateSymbolAddress('myVar')).resolves.toBe('0x20000000');
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: '&myVar',
                context: 'hover',
            });
        });

        it('strips annotation from address result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x8000100 <main>'
            });

            await expect(targetAccess.evaluateSymbolAddress('main')).resolves.toBe('0x8000100');
        });

        it('returns undefined on Error result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: 'Error: No symbol "unknown" in current context.'
            });

            await expect(targetAccess.evaluateSymbolAddress('unknown')).resolves.toBeUndefined();
        });

        it('returns undefined on empty result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '' });
            await expect(targetAccess.evaluateSymbolAddress('x')).resolves.toBeUndefined();
        });

        it('logs on failure, suppresses with existCheck', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');

            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('bad'));
            await expect(targetAccess.evaluateSymbolAddress('missing')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate address \'missing\' - \'bad\''
            );

            debugSpy.mockClear();
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('probe'));
            await expect(targetAccess.evaluateSymbolAddress('probe', true)).resolves.toBeUndefined();
            expect(debugSpy).not.toHaveBeenCalled();
        });
    });

    describe('evaluateSymbolName (expression, no frameId, hover context)', () => {
        it('resolves symbol name from GDB angle-bracket annotation', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x20000000 <myVar>'
            });

            await expect(targetAccess.evaluateSymbolName(0x20000000)).resolves.toBe('myVar');
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: '(unsigned int*)0x20000000',
                context: 'hover',
            });
        });

        it('returns undefined when no angle-bracket annotation', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x20000000 Symbol'
            });

            await expect(targetAccess.evaluateSymbolName('0x20000000')).resolves.toBeUndefined();
        });

        it('returns undefined when no symbol matches', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: 'No symbol matches'
            });

            await expect(targetAccess.evaluateSymbolName('0x0')).resolves.toBeUndefined();
        });

        it('formats various address types for the expression', async () => {
            const cases = [
                { input: '0x1A' as string | number | bigint, expectedAddr: '0x1A' },
                { input: 15, expectedAddr: '0xf' },
                { input: 0x20n, expectedAddr: '0x20' },
            ];

            for (const { input, expectedAddr } of cases) {
                (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                    result: `0x0 <Sym>`
                });
                await targetAccess.evaluateSymbolName(input);
                expect(debugSession.customRequest).toHaveBeenLastCalledWith('evaluate', {
                    expression: `(unsigned int*)${expectedAddr}`,
                    context: 'hover',
                });
            }
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('oops'));

            await expect(targetAccess.evaluateSymbolName('0x1')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate name \'0x1\' - \'oops\''
            );
        });
    });

    describe('evaluateSymbolContext (expression, no frameId, hover context)', () => {
        it('resolves file/line context', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: 'Line 42 of "main.c" starts at address 0x800010c'
            });

            await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBe(
                'Line 42 of "main.c" starts at address 0x800010c'
            );
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: 'info line *0x100',
                context: 'hover',
            });
        });

        it('returns undefined when no line information', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: 'No line number information available'
            });

            await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();
        });

        it('returns undefined on empty result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '' });
            await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('context fail'));

            await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate context for \'0x100\' - \'context fail\''
            );
        });
    });

    describe('evaluateSymbolSize (expression, no frameId, hover context)', () => {
        it('resolves size from numeric result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '4' });

            await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBe(4);
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: 'sizeof(var)',
                context: 'hover',
            });
        });

        it('returns undefined on non-numeric result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: 'No symbol "var" in current context.'
            });

            await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBeUndefined();
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('size fail'));

            await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate size of \'var\' - \'size fail\''
            );
        });
    });

    describe('evaluateMemory (DAP readMemory)', () => {
        it('reads memory successfully', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ data: 'AAAA' });
            await expect(targetAccess.evaluateMemory('16', 4, 0)).resolves.toBe('AAAA');
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('bad read'));

            await expect(targetAccess.evaluateMemory('16', 4, 0)).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to read memory at address \'0x10\' - \'bad read\''
            );
        });
    });

    describe('evaluateNumberOfArrayElements (expression, no frameId, hover context)', () => {
        it('resolves array count from numeric result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '3' });

            await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBe(3);
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: 'sizeof(arr)/sizeof(arr[0])',
                context: 'hover',
            });
        });

        it('returns undefined on non-numeric result', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'No symbol' });
            await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBeUndefined();
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('count fail'));

            await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate number of elements for array \'arr\' - \'count fail\''
            );
        });
    });

    describe('evaluateRegisterValue (requires stopped target + frameId)', () => {
        it('reads register value when stopped', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x1234' });

            await expect(targetAccess.evaluateRegisterValue('r0')).resolves.toBe('0x1234');
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: '(void*)$r0',
                frameId: 1,
                context: 'hover',
            });
        });

        it('strips GDB symbol annotations from register values', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x20000420 <os_mem+424>' });
            await expect(targetAccess.evaluateRegisterValue('psp')).resolves.toBe('0x20000420');
        });

        it('returns undefined when target is running', async () => {
            gdbTargetSession.targetState = 'running';
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');

            await expect(targetAccess.evaluateRegisterValue('r0')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Skipping register read for \'r0\' - target is running'
            );
            expect(debugSession.customRequest).not.toHaveBeenCalled();
        });

        it('returns undefined when no frameId is available', async () => {
            setActiveStackItem(debugSession, undefined);

            await expect(targetAccess.evaluateRegisterValue('r0')).resolves.toBeUndefined();
            expect(debugSession.customRequest).not.toHaveBeenCalled();
        });

        it('logs on failure', async () => {
            const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('reg fail'));

            await expect(targetAccess.evaluateRegisterValue('r1')).resolves.toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate register value for \'r1\' - \'reg fail\''
            );
        });
    });

    describe('constructor', () => {
        it('initializes with active session', () => {
            expect(targetAccess).toBeDefined();
            expect(targetAccess['_activeSession']).toBe(gdbTargetSession);
        });
    });
});
