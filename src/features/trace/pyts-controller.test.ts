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

import * as path from 'path';
import * as vscode from 'vscode';
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { GDBTargetDebugSession } from '../../debug-session';
import { debugTrackerFactory } from '../../debug-session/__test__/debug-session.factory';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { logger } from '../../logger';
import { isWindows, waitForCondition } from '../../utils';
import { PyTsController as BasePyTsController } from './pyts-controller';

class PyTsController extends BasePyTsController {
    public override addCTraceConfigurationWatcher(): void {
        super.addCTraceConfigurationWatcher();
    }

    public override handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        super.handleActiveSessionChanged(session);
    }

    public override handleCTraceFileChanged(uri: vscode.Uri): Promise<void> {
        return super.handleCTraceFileChanged(uri);
    }

    public override removeCTraceConfigurationWatcher(): void {
        super.removeCTraceConfigurationWatcher();
    }
}

describe('PyTsController', () => {
    const ctraceUri = vscode.Uri.file('/workspace/.cmsis/trace.ctrace.yml');
    const gdbTargetDebugSessionFactory = (cbuildRunFilePath: string): GDBTargetDebugSession => new GDBTargetDebugSession(
        debugSessionFactory({
            name: 'test',
            type: 'gdbtarget',
            request: 'launch',
            cmsis: { cbuildRunFile: cbuildRunFilePath }
        })
    );
    const generatedCTraceUri = (session: GDBTargetDebugSession, fileName: string): vscode.Uri => {
        const cbuildRunFilePath = session.getCbuildRunPath();
        if (cbuildRunFilePath === undefined) {
            throw new Error('Expected the debug session to provide a cbuild-run path.');
        }
        return vscode.Uri.file(path.join(path.dirname(path.dirname(cbuildRunFilePath)), '.cmsis', fileName));
    };

    beforeEach(() => {
        jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: initial'));
    });

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
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue(0);
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const reloadCTrace = jest.spyOn(controller, 'reloadCTrace').mockResolvedValue();

        await expect(controller.run({}, true)).resolves.toBe(0);

        expect(launch).toHaveBeenCalledWith({});
        expect(waitForExit).toHaveBeenCalledTimes(1);
        expect(reloadCTrace).toHaveBeenCalledTimes(1);
    });

    it('does not reload ctrace after a failed pyTS exit', async () => {
        jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue(17);
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const reloadCTrace = jest.spyOn(controller, 'reloadCTrace').mockResolvedValue();

        await expect(controller.run({}, true)).resolves.toBe(17);

        expect(reloadCTrace).not.toHaveBeenCalled();
    });

    it('uses the active session cbuild run path unless the caller supplies one', async () => {
        const launch = jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue(0);
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const activeSession = gdbTargetDebugSessionFactory('/workspace/active.cbuild-run.yml');
        const activeCbuildRunPath = activeSession.getCbuildRunPath();
        controller.handleActiveSessionChanged(activeSession);

        await expect(controller.run()).resolves.toBe(0);
        await expect(controller.run({ cbuildRunFilePath: '/workspace/provided.cbuild-run.yml' })).resolves.toBe(0);
        const directController = new PyTsController({ pyTsPath: 'pyTS' });
        await expect(directController.run({ args: ['--version'] })).resolves.toBe(0);

        expect(launch).toHaveBeenNthCalledWith(1, { cbuildRunFilePath: activeCbuildRunPath });
        expect(launch).toHaveBeenNthCalledWith(2, { cbuildRunFilePath: '/workspace/provided.cbuild-run.yml' });
        expect(launch).toHaveBeenNthCalledWith(3, { args: ['--version'] });
        expect(waitForExit).toHaveBeenCalledTimes(3);
    });

    it('reloads ctrace after a ctrace configuration file changes', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledWith({}, true);
    });

    it('logs a failed pyTS exit from a ctrace configuration file change', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(null);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        await controller.handleCTraceFileChanged(ctraceUri);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledWith('pyTS process exited with code null');
    });

    it('retries unchanged ctrace content after a pyTS launch error', async () => {
        const controller = new PyTsController();
        const launchError = new Error('launch failed');
        const run = jest.spyOn(controller, 'run')
            .mockRejectedValueOnce(launchError)
            .mockResolvedValue(0);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        await controller.handleCTraceFileChanged(ctraceUri);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledWith('Failed to launch pyTS process:', launchError);
    });

    it('converts unchanged ctrace content for a different cbuild-run context', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const firstSession = gdbTargetDebugSessionFactory('/workspace/build/first.cbuild-run.yml');
        const secondSession = gdbTargetDebugSessionFactory('/workspace/build/second.cbuild-run.yml');

        controller.handleActiveSessionChanged(firstSession);
        await controller.handleCTraceFileChanged(ctraceUri);
        controller.handleActiveSessionChanged(secondSession);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenNthCalledWith(1, { cbuildRunFilePath: firstSession.getCbuildRunPath() }, true);
        expect(run).toHaveBeenNthCalledWith(2, { cbuildRunFilePath: secondSession.getCbuildRunPath() }, true);
    });

    it('adds and removes its ctrace configuration watch when the trace setting changes', () => {
        const tracker = debugTrackerFactory();
        const controller = new PyTsController();
        const traceWatch = traceWatchFactory();

        controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.fireConfigurationChange(false);
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.setTraceEnabled(true);
        traceWatch.fireConfigurationChange(true);
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(1);

        traceWatch.setTraceEnabled(false);
        traceWatch.fireConfigurationChange(true);
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('pyts-ctrace-configuration');
    });

    it('coalesces watched configuration file events and removes its watch when disposed', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const tracker = debugTrackerFactory();
        const traceWatch = traceWatchFactory();
        const context = extensionContextFactory();
        traceWatch.setTraceEnabled(true);
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { configurable: true, value: undefined });

        try {
            controller.activate(context, tracker, traceWatch.fileWatchManager);
            const watch = traceWatch.getLatestWatch();
            if (watch === undefined) {
                throw new Error('Expected a ctrace configuration watch.');
            }
            expect(watch.globPattern).toBe('.cmsis/*.ctrace.{yml,yaml}');
            await Promise.all([
                watch.onDidCreate?.(ctraceUri),
                watch.onDidChange?.(ctraceUri)
            ]);
            context.subscriptions.at(-1)?.dispose();

            expect(run).toHaveBeenNthCalledWith(1, {}, true);
            expect(run).toHaveBeenCalledTimes(1);
            expect(traceWatch.removeWatch).toHaveBeenCalledWith('pyts-ctrace-configuration');
        } finally {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                configurable: true,
                value: workspaceFolders
            });
        }
    });

    it('reconverts unchanged ctrace content after an earlier conversion completes', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.handleCTraceFileChanged(ctraceUri);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledTimes(2);
    });

    it('does not require a file watch manager before activation', () => {
        const controller = new PyTsController();

        controller.addCTraceConfigurationWatcher();
        controller.removeCTraceConfigurationWatcher();
    });

    it('discards stale queued and cached state when the watcher is removed', async () => {
        const controller = new PyTsController();
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => {
            finishFirstRun = resolve;
        });
        const run = jest.spyOn(controller, 'run')
            .mockReturnValueOnce(firstRun)
            .mockResolvedValue(0);

        const firstChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition('the first pyTS conversion to start', () => run.mock.calls.length === 1);
        jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: changed'));
        const queuedChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition(
            'the changed contents to be read',
            () => jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 2
        );
        controller.removeCTraceConfigurationWatcher();
        finishFirstRun?.(0);
        await Promise.all([firstChange, queuedChange]);

        expect(run).toHaveBeenCalledTimes(1);

        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledTimes(2);
    });

    it('queues one follow-up conversion when content changes while pyTS is running', async () => {
        const controller = new PyTsController();
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => {
            finishFirstRun = resolve;
        });
        const run = jest.spyOn(controller, 'run')
            .mockReturnValueOnce(firstRun)
            .mockResolvedValue(0);

        const firstChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition('the first pyTS conversion to start', () => run.mock.calls.length === 1);
        jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: changed'));
        const secondChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition(
            'the changed contents to be read',
            () => jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 2
        );
        const duplicateChange = controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledTimes(1);
        finishFirstRun?.(0);
        await Promise.all([firstChange, secondChange, duplicateChange]);

        expect(run).toHaveBeenCalledTimes(2);
    });

    it('processes queued content after an earlier pyTS launch fails', async () => {
        const controller = new PyTsController();
        let failFirstRun: ((error: Error) => void) | undefined;
        const firstRun = new Promise<number>((_resolve, reject) => {
            failFirstRun = reject;
        });
        const run = jest.spyOn(controller, 'run')
            .mockReturnValueOnce(firstRun)
            .mockResolvedValue(0);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        const firstChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition('the first pyTS conversion to start', () => run.mock.calls.length === 1);
        jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: changed'));
        const secondChange = controller.handleCTraceFileChanged(ctraceUri);
        failFirstRun?.(new Error('launch failed'));
        await Promise.all([firstChange, secondChange]);

        expect(run).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledWith('Failed to launch pyTS process:', expect.any(Error));
    });

    it.each(['yml', 'yaml'])('converts the matching generated .ctrace.%s file', async extension => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(generatedCTraceUri(activeSession, `active.ctrace.${extension}`));

        expect(run).toHaveBeenCalledWith({ cbuildRunFilePath: activeSession.getCbuildRunPath() }, true);
    });

    it.each(['yml', 'yaml'])('converts a named target-set .ctrace.%s file', async extension => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(generatedCTraceUri(activeSession, `active@targetSet.ctrace.${extension}`));

        expect(run).toHaveBeenCalledWith({ cbuildRunFilePath: activeSession.getCbuildRunPath() }, true);
    });

    it('converts ctrace files when there is no active cbuild-run context', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledWith({}, true);
    });

    it.each([
        'inactive.ctrace.yml',
        'active-copy.ctrace.yml',
        'active@.ctrace.yml'
    ])('ignores another ctrace file in the generated project: %s', async ctraceFileName => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(generatedCTraceUri(activeSession, ctraceFileName));

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('ignores a matching ctrace file outside the active generated project', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        const activeCbuildRunPath = activeSession.getCbuildRunPath();
        if (activeCbuildRunPath === undefined) {
            throw new Error('Expected the debug session to provide a cbuild-run path.');
        }
        const projectRoot = path.dirname(path.dirname(activeCbuildRunPath));
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(
            vscode.Uri.file(path.join(projectRoot, 'other', '.cmsis', 'active.ctrace.yml'))
        );

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('matches Windows ctrace paths case-insensitively with normalized separators', async () => {
        if (!isWindows) {
            return;
        }
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('C:/Workspace/Project/out/ACTIVE.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(vscode.Uri.file('c:\\workspace\\project\\.cmsis\\active.ctrace.yaml'));

        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: activeSession.getCbuildRunPath()
        }, true);
    });

    it('recovers from a ctrace file read failure', async () => {
        const controller = new PyTsController();
        const readError = new Error('read failed');
        jest.mocked(vscode.workspace.fs.readFile)
            .mockRejectedValueOnce(readError)
            .mockResolvedValue(new TextEncoder().encode('trace: recovered'));
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        await controller.handleCTraceFileChanged(ctraceUri);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(2);
        expect(run).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith('Failed to process ctrace configuration change:', readError);
    });

    it('ignores generated ctrace files for another active project', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(generatedCTraceUri(activeSession, 'other.ctrace.yml'));

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });
});
