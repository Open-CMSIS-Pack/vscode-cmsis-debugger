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
import { logger } from '../../../../logger';

describe('ComponentViewerTargetAccess', () => {
    const defaultConfig = () => {
        return {
            name: 'test-session',
            type: 'gdbtarget',
            request: 'launch'
        };
    };

    let debugSession: vscode.DebugSession;
    let gdbTargetSession: GDBTargetDebugSession;
    let targetAccess: ComponentViewerTargetAccess;

    beforeEach(() => {
        debugSession = debugSessionFactory(defaultConfig());
        gdbTargetSession = new GDBTargetDebugSession(debugSession);
        targetAccess = new ComponentViewerTargetAccess();
        targetAccess.setActiveSession(gdbTargetSession);
    });

    describe('evaluateSymbolAddress', () => {
        it('should evaluate symbol address successfully with default context', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x20000000',
                variablesReference: 0
            });
            (vscode.debug.activeStackItem as unknown) = { session: debugSession, threadId: 1, frameId: 5 };

            const result = await targetAccess.evaluateSymbolAddress('myVariable');

            expect(result).toBe('0x20000000');
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: '&myVariable',
                frameId: 5,
                context: 'hover'
            });

            // Cleanup
            (vscode.debug.activeStackItem as unknown) = undefined;
        });

        it('should evaluate symbol address with custom context', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x40001000',
                variablesReference: 0
            });
            (vscode.debug.activeStackItem as unknown) = { session: debugSession, threadId: 1, frameId: 3 };

            const result = await targetAccess.evaluateSymbolAddress('myStruct', 'watch');

            expect(result).toBe('0x40001000');
            expect(debugSession.customRequest).toHaveBeenCalledWith('evaluate', {
                expression: '&myStruct',
                frameId: 3,
                context: 'watch'
            });

            // Cleanup
            (vscode.debug.activeStackItem as unknown) = undefined;
        });

        it('should return undefined when no active stack frame exists', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                result: '0x30000000',
                variablesReference: 0
            });
            (vscode.debug.activeStackItem as unknown) = undefined;

            const result = await targetAccess.evaluateSymbolAddress('globalVar');

            expect(result).toBeUndefined();
            expect(debugSession.customRequest).not.toHaveBeenCalled();
        });

        it('should log when evaluation fails', async () => {
            const debugSpy = jest.spyOn(logger, 'debug');
            (vscode.debug.activeStackItem as unknown) = { session: debugSession, threadId: 1, frameId: 1 };
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('Variable not found'));

            const result = await targetAccess.evaluateSymbolAddress('unknownVar');

            expect(result).toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate address \'unknownVar\' - \'Variable not found\''
            );
        });

        it('should log when custom request fails', async () => {
            const debugSpy = jest.spyOn(logger, 'debug');
            (vscode.debug.activeStackItem as unknown) = { session: debugSession, threadId: 1, frameId: 1 };
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('custom request failed'));

            const result = await targetAccess.evaluateSymbolAddress('myVar');

            expect(result).toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to evaluate address \'myVar\' - \'custom request failed\''
            );
        });
    });

    describe('evaluateMemory', () => {
        it('should read memory successfully', async () => {
            const memoryData = 'AQIDBAU='; // Base64 encoded data
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0x20000000',
                data: memoryData
            });

            const result = await targetAccess.evaluateMemory('0x20000000', 16, 0);

            expect(result).toBe(memoryData);
            expect(debugSession.customRequest).toHaveBeenCalledWith('readMemory', {
                memoryReference: '0x20000000',
                count: 16,
                offset: 0
            });
        });

        it('should read memory with offset', async () => {
            const memoryData = 'AQIDBAU=';
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0x20000004',
                data: memoryData
            });

            const result = await targetAccess.evaluateMemory('0x20000000', 8, 4);

            expect(result).toBe(memoryData);
            expect(debugSession.customRequest).toHaveBeenCalledWith('readMemory', {
                memoryReference: '0x20000000',
                count: 8,
                offset: 4
            });
        });

        it('should return undefined when memory read fails', async () => {
            const debugSpy = jest.spyOn(logger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('Invalid memory address'));

            const result = await targetAccess.evaluateMemory('0xFFFFFFFF', 4, 0);

            expect(result).toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to read memory at address \'0xFFFFFFFF\' - \'Invalid memory address\''
            );
        });

        it('should return undefined when custom request fails for memory read', async () => {
            const debugSpy = jest.spyOn(logger, 'debug');
            (debugSession.customRequest as jest.Mock).mockRejectedValueOnce(new Error('custom request failed'));

            const result = await targetAccess.evaluateMemory('0x20000000', 4, 0);

            expect(result).toBeUndefined();
            expect(debugSpy).toHaveBeenCalledWith(
                'Session \'test-session\': Failed to read memory at address \'0x20000000\' - \'custom request failed\''
            );
        });

        it('should handle undefined response data', async () => {
            (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
                address: '0x20000000'
                // data is undefined
            });

            const result = await targetAccess.evaluateMemory('0x20000000', 4, 0);

            expect(result).toBeUndefined();
        });
    });

    describe('constructor', () => {
        it('should initialize with active session', () => {
            expect(targetAccess).toBeDefined();
            expect(targetAccess['_activeSession']).toBe(gdbTargetSession);
        });

        it('should create instance with different session', () => {
            const anotherDebugSession = debugSessionFactory({ ...defaultConfig(), name: 'another-session' });
            const anotherGDBSession = new GDBTargetDebugSession(anotherDebugSession);
            const anotherTargetAccess = new ComponentViewerTargetAccess();
            anotherTargetAccess.setActiveSession(anotherGDBSession);

            expect(anotherTargetAccess['_activeSession']).toBe(anotherGDBSession);
        });
    });
});
