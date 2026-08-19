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
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { debugTrackerFactory } from '../../debug-session/__test__/debug-session.factory';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { PyTsController } from './pyts-controller';

type PyTsControllerTestAccess = {
    handleCTraceFileChanged(uri: vscode.Uri): Promise<void>;
};

describe('PyTsController', () => {
    it('sends a ctrace reload request to the active debug session', async () => {
        const session = debugSessionFactory({ name: 'test', type: 'cmsis-debugger', request: 'launch' });
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: session });
        const controller = new PyTsController();

        await controller.reloadCTrace();

        expect(session.customRequest).toHaveBeenCalledWith('evaluate', {
            expression: '> monitor ctrace reload',
            context: 'repl'
        });
    });

    it('does nothing when no debug session is active', async () => {
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: undefined });
        const controller = new PyTsController();

        await expect(controller.reloadCTrace()).resolves.toBeUndefined();
    });

    it('reloads ctrace after pyTS exits when requested separately from its launch options', async () => {
        const launch = jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue();
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const reloadCTrace = jest.spyOn(controller, 'reloadCTrace').mockResolvedValue();

        await controller.run({}, true);

        expect(launch).toHaveBeenCalledWith({});
        expect(waitForExit).toHaveBeenCalledTimes(1);
        expect(reloadCTrace).toHaveBeenCalledTimes(1);
    });

    it('reloads ctrace after a ctrace configuration file changes', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue();
        const testAccess = controller as unknown as PyTsControllerTestAccess;

        await testAccess.handleCTraceFileChanged(vscode.Uri.file('/workspace/.cmsis/trace.ctrace.yml'));

        expect(run).toHaveBeenCalledWith({}, true);
    });

    it('adds and removes its ctrace configuration watch when the trace setting changes', () => {
        const tracker = debugTrackerFactory();
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
