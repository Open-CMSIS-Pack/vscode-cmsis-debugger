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

import { GDBTargetDebugTracker } from './gdbtarget-debug-tracker';
import { extensionContextFactory } from '../__test__/vscode.factory';

import * as vscode from 'vscode';

describe('GDBTargetDebugTracker', () => {

    it('should activate', async () => {
        const debugTracker = new GDBTargetDebugTracker();
        const contextMock = extensionContextFactory();

        debugTracker.activate(contextMock);

        expect(contextMock.subscriptions).toHaveLength(1);
        expect(vscode.debug.registerDebugAdapterTrackerFactory as jest.Mock).toHaveBeenCalledWith('gdbtarget', expect.objectContaining({createDebugAdapterTracker: expect.any(Function)}));
    });

    it('brings the debug console to front \'onWillStartSession\' is called', async () => {
        const debugTracker = new GDBTargetDebugTracker();

        debugTracker.onWillStartSession();

        expect(vscode.commands.executeCommand as jest.Mock).toHaveBeenCalledWith('workbench.debug.action.focusRepl');
    });

});
