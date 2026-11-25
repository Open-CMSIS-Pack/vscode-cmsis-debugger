/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import * as vscode from 'vscode';

import { extensionContextFactory } from '../../__test__/vscode.factory';
import * as expressions from '../debug-expression';
import { TraceConfigurationExpressionCommands } from './trace-configuration-expression-commands';

describe('TraceConfigurationExpressionCommands', () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
    const addExpression = jest.fn<Promise<void>, [string]>();

    beforeEach(() => {
        handlers.clear();
        jest.mocked(vscode.commands.registerCommand).mockImplementation((id, callback) => {
            handlers.set(id, callback);
            return { dispose: jest.fn() };
        });
        new TraceConfigurationExpressionCommands(addExpression).activate(extensionContextFactory());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sends the editor expression to the shared operation', async () => {
        jest.spyOn(expressions, 'getEditorExpression').mockReturnValue('buffer[index]');
        await handlers.get('vscode-cmsis-debugger.traceConfiguration.addFromEditor')?.();
        expect(addExpression).toHaveBeenCalledWith('buffer[index]');
    });

    it('sends the debug expression to the shared operation without a container', async () => {
        await handlers.get('vscode-cmsis-debugger.traceConfiguration.addFromDebugView')?.({
            sessionId: 'session', variable: { name: 'member', evaluateName: 'object.member' }
        });
        expect(addExpression).toHaveBeenCalledWith('object.member');
    });

    it.each([
        { expression: 'root', value: {}, parent: undefined, expected: 'root' },
        { expression: 'child', value: { evaluateName: 'root.child' }, parent: {}, expected: 'root.child' }
    ])('sends a Live Watch expression to the shared operation', async ({ expected, ...node }) => {
        await handlers.get('vscode-cmsis-debugger.traceConfiguration.addFromLiveWatch')?.(node);
        expect(addExpression).toHaveBeenCalledWith(expected);
    });

    it('explains missing debug expressions without treating child labels as expressions', async () => {
        await handlers.get('vscode-cmsis-debugger.traceConfiguration.addFromDebugView')?.({ variable: { name: 'child' } });
        await handlers.get('vscode-cmsis-debugger.traceConfiguration.addFromLiveWatch')?.({
            expression: 'child', value: {}, parent: {}
        });
        expect(addExpression).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
    });
});
