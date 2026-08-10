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

import { extensionContextFactory } from '../../__test__/vscode.factory';
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { GDBTargetDebugTracker } from '../../debug-session';
import { PyTsController } from './pyts-controller';

describe('PyTsController', () => {
    it('adds and removes its ctrace configuration watch when the trace setting changes', () => {
        const tracker = {
            onDidChangeActiveDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
        } as unknown as GDBTargetDebugTracker;
        const controller = new PyTsController();
        const traceWatch = traceWatchFactory();

        controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.setTraceEnabled(true);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(1);

        traceWatch.setTraceEnabled(false);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('pyts-ctrace-configuration');
    });
});
