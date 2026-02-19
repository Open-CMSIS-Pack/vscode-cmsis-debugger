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

    it('formats addresses consistently for symbol lookups', async () => {
        setActiveStackItem(debugSession, 7);

        const cases = [
            { input: '', expected: '(unsigned int*)' },
            { input: '  0x1A ', expected: '(unsigned int*)0x1A' },
            { input: '15', expected: '(unsigned int*)0xf' },
            { input: 16, expected: '(unsigned int*)0x10' },
            { input: 0x20n, expected: '(unsigned int*)0x20' },
            { input: 'not-a-number', expected: '(unsigned int*)not-a-number' },
        ];

        const expectedExpressions = cases.map(({ expected }) => expected);
        (debugSession.customRequest as jest.Mock).mockImplementation(async (_command, args) => {
            const expectedExpression = expectedExpressions.shift();
            expect(args).toEqual({
                expression: expectedExpression ?? '',
                frameId: 7,
                context: 'hover',
            });
            return { result: '0x0 <Sym>' };
        });

        for (const { input } of cases) {
            await expect(targetAccess.evaluateSymbolName(input)).resolves.toBe('Sym');
        }
        expect(expectedExpressions).toHaveLength(0);
    });

    it('evaluates symbol address and handles failures', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x20000000 extra' });
        setActiveStackItem(debugSession, 9);

        await expect(targetAccess.evaluateSymbolAddress('myVar')).resolves.toBe('0x20000000');

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'Error: failed' });
        await expect(targetAccess.evaluateSymbolAddress('bad')).resolves.toBeUndefined();

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('bad'));

        await expect(targetAccess.evaluateSymbolAddress('missing')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate address \'missing\' - \'bad\''
        );
    });

    it('returns undefined without logging when exist check fails', async () => {
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('probe failed'));

        await expect(targetAccess.evaluateSymbolAddress('missing', 'hover', true)).resolves.toBeUndefined();
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('evaluates symbol name with valid and missing results', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x20000000 <MySymbol>' });
        setActiveStackItem(debugSession, 1);

        await expect(targetAccess.evaluateSymbolName(0x20000000)).resolves.toBe('MySymbol');

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x20000000 <Other>' });
        setActiveStackItem(debugSession, 2);
        await expect(targetAccess.evaluateSymbolName('0x20000000')).resolves.toBe('Other');
        expect(debugSession.customRequest).toHaveBeenLastCalledWith('evaluate', {
            expression: '(unsigned int*)0x20000000',
            frameId: 2,
            context: 'hover',
        });

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'No symbol matches' });
        await expect(targetAccess.evaluateSymbolName('0x0')).resolves.toBeUndefined();

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x20000000 Symbol' });
        await expect(targetAccess.evaluateSymbolName('0x20000000')).resolves.toBeUndefined();

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('oops'));
        await expect(targetAccess.evaluateSymbolName('0x1')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate name \'0x1\' - \'oops\''
        );
    });

    it('evaluates symbol context', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'main.c:10' });
        await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBe('main.c:10');

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'No line information' });
        await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '' });
        await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('context fail'));
        await expect(targetAccess.evaluateSymbolContext('0x100')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate context for \'0x100\' - \'context fail\''
        );
    });

    it('evaluates symbol size', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '4' });
        await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBe(4);

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'nan' });
        await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBeUndefined();

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('size fail'));
        await expect(targetAccess.evaluateSymbolSize('var')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate size of \'var\' - \'size fail\''
        );
    });

    it('reads memory and handles errors', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ data: 'AAAA' });
        await expect(targetAccess.evaluateMemory('16', 4, 0)).resolves.toBe('AAAA');

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('custom request failed'));
        await expect(targetAccess.evaluateMemory('16', 4, 0)).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to read memory at address \'0x10\' - \'custom request failed\''
        );

        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('bad read'));
        await expect(targetAccess.evaluateMemory('16', 4, 0)).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to read memory at address \'0x10\' - \'bad read\''
        );
    });

    it('evaluates number of array elements', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '  3 ' });
        await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBe(3);

        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: 'NaN' });
        await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBeUndefined();

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('count fail'));
        await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate number of elements for array \'arr\' - \'count fail\''
        );
    });

    it('evaluates register values', async () => {
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({ result: '0x1234' });
        await expect(targetAccess.evaluateRegisterValue('r0')).resolves.toBe('0x1234');

        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');
        (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('reg fail'));
        await expect(targetAccess.evaluateRegisterValue('r1')).resolves.toBeUndefined();
        expect(debugSpy).toHaveBeenCalledWith(
            'Session \'test-session\': Failed to evaluate register value for \'r1\' - \'reg fail\''
        );
    });

    it('returns undefined when no frameId is available', async () => {
        setActiveStackItem(debugSession, undefined);

        await expect(targetAccess.evaluateSymbolName('0x1')).resolves.toBeUndefined();
        await expect(targetAccess.evaluateSymbolContext('0x1')).resolves.toBeUndefined();
        await expect(targetAccess.evaluateSymbolSize('sym')).resolves.toBeUndefined();
        await expect(targetAccess.evaluateNumberOfArrayElements('arr')).resolves.toBeUndefined();
        await expect(targetAccess.evaluateRegisterValue('r0')).resolves.toBeUndefined();
    });
});
