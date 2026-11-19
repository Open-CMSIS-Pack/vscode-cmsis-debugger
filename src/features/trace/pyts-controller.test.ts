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
import { activeSolutionWatchFactory } from '../../__test__/active-solution-watch.factory';
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { CBuildRunFileLocator } from '../../cbuild-run';
import { GDBTargetDebugSession } from '../../debug-session';
import { debugTrackerFactory } from '../../debug-session/__test__/debug-session.factory';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { logger } from '../../logger';
import { isWindows, waitForCondition, waitForImmediate } from '../../utils';
import { PyTsController as BasePyTsController } from './pyts-controller';

class PyTsController extends BasePyTsController {
    public override addCTraceConfigurationWatcher(): Promise<void> {
        return super.addCTraceConfigurationWatcher();
    }

    public override handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        super.handleActiveSessionChanged(session);
    }

    public override handleCTraceFileChanged(uri: vscode.Uri, watcherGeneration?: number): Promise<void> {
        return super.handleCTraceFileChanged(uri, watcherGeneration);
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

    const getCbuildRunFilePath = (session: GDBTargetDebugSession): string => {
        const cbuildRunFilePath = session.getCbuildRunPath();
        if (cbuildRunFilePath === undefined) {
            throw new Error('Expected a cbuild-run file path.');
        }
        return cbuildRunFilePath;
    };
    const ctraceUriInSolution = (fileName: string, solutionFolder = '/workspace'): vscode.Uri =>
        vscode.Uri.file(path.join(solutionFolder, '.cmsis', fileName));
    const controllerForSolution = (solutionFolder = '/workspace'): PyTsController => {
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder').mockResolvedValue(vscode.Uri.file(solutionFolder));
        return new PyTsController({}, locator);
    };

    beforeEach(() => {
        jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: initial'));
    });

    it('does not reload ctrace after pyTS exits', async () => {
        const launch = jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue(0);
        const session = debugSessionFactory({ name: 'test', type: 'cmsis-debugger', request: 'launch' });
        Object.defineProperty(vscode.debug, 'activeDebugSession', { configurable: true, value: session });
        const controller = new PyTsController({ pyTsPath: 'pyTS' });

        await expect(controller.run()).resolves.toBe(0);

        expect(launch).toHaveBeenCalledWith({});
        expect(waitForExit).toHaveBeenCalledTimes(1);
        expect(session.customRequest).not.toHaveBeenCalled();
    });

    it('leaves a concurrent manual conversion running when automatic watchers are removed', async () => {
        jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        let finishRuns: ((code: number) => void) | undefined;
        const exit = new Promise<number>(resolve => {
            finishRuns = resolve;
        });
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockReturnValue(exit);
        const stop = jest.spyOn(PyTsProcessManager.prototype, 'stop').mockResolvedValue();
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const automatic = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition('the automatic conversion to start', () => waitForExit.mock.calls.length === 1);
        const manual = controller.run();
        try {
            await waitForCondition('the manual conversion to start', () => waitForExit.mock.calls.length === 2);
            controller.removeCTraceConfigurationWatcher();
            expect(stop).not.toHaveBeenCalled();
        } finally {
            finishRuns?.(0);
            await Promise.all([automatic, manual]);
        }
    });

    it('uses the active session cbuild run path unless the caller supplies one', async () => {
        const launch = jest.spyOn(PyTsProcessManager.prototype, 'launch').mockResolvedValue();
        const waitForExit = jest.spyOn(PyTsProcessManager.prototype, 'waitForExit').mockResolvedValue(0);
        const controller = new PyTsController({ pyTsPath: 'pyTS' });
        const activeSession = gdbTargetDebugSessionFactory('/workspace/active.cbuild-run.yml');
        const activeCbuildRunPath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);

        await expect(controller.run()).resolves.toBe(0);
        await expect(controller.run({ cbuildRunFilePath: '/workspace/provided.cbuild-run.yml' })).resolves.toBe(0);
        const directController = new PyTsController({ pyTsPath: 'pyTS' });
        await expect(directController.run({ args: ['--version'] })).resolves.toBe(0);

        expect(launch).toHaveBeenNthCalledWith(1, {
            cbuildRunFilePath: expect.toEqualFsPath(activeCbuildRunPath)
        });
        expect(launch).toHaveBeenNthCalledWith(2, {
            cbuildRunFilePath: expect.toEqualFsPath('/workspace/provided.cbuild-run.yml')
        });
        expect(launch).toHaveBeenNthCalledWith(3, { args: ['--version'] });
        expect(waitForExit).toHaveBeenCalledTimes(3);
    });

    it('converts an explicit request without an active ctrace watcher', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';

        await controller.convertCTrace(ctraceUri, cbuildRunFilePath);

        expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(ctraceUri);
        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(cbuildRunFilePath)
        });
    });

    it('retries an explicit conversion after a cbuild-run input read fails', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';
        const failure = new Error('build input unavailable');
        jest.mocked(vscode.workspace.fs.readFile)
            .mockResolvedValueOnce(new TextEncoder().encode('trace: initial'))
            .mockRejectedValueOnce(failure);

        await expect(controller.convertCTrace(ctraceUri, cbuildRunFilePath)).rejects.toThrow(failure);
        expect(run).not.toHaveBeenCalled();

        await controller.convertCTrace(ctraceUri, cbuildRunFilePath);

        expect(run).toHaveBeenCalledTimes(1);
    });

    it('coalesces explicit and watched requests for one context while serializing another', async () => {
        const controller = controllerForSolution();
        const activeSession = gdbTargetDebugSessionFactory('/workspace/build/trace.cbuild-run.yml');
        const cbuildRunFilePath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => {
            finishFirstRun = resolve;
        });
        const run = jest.spyOn(controller, 'run')
            .mockReturnValueOnce(firstRun)
            .mockResolvedValue(0);

        let firstRequestCompleted = false;
        const firstRequest = controller.convertCTrace(ctraceUri, cbuildRunFilePath).then(() => {
            firstRequestCompleted = true;
        });
        await waitForCondition('the explicit pyTS conversion to start', () => run.mock.calls.length === 1);
        const watchedChange = controller.handleCTraceFileChanged(ctraceUri);
        const duplicateRequest = controller.convertCTrace(ctraceUri, cbuildRunFilePath);
        const otherCbuildRunFilePath = '/workspace/build/other.cbuild-run.yml';
        const otherRequest = controller.convertCTrace(
            ctraceUriInSolution('other.ctrace.yml'), otherCbuildRunFilePath
        );
        await waitForCondition(
            'all conversion requests to read ctrace',
            () => jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 8
        );
        await Promise.resolve();
        expect(run).toHaveBeenCalledTimes(1);
        expect(firstRequestCompleted).toBe(false);
        finishFirstRun?.(0);
        await Promise.all([firstRequest, watchedChange, duplicateRequest, otherRequest]);

        expect(firstRequestCompleted).toBe(true);
        expect(run).toHaveBeenCalledTimes(2);
        expect(run).toHaveBeenNthCalledWith(2, {
            cbuildRunFilePath: expect.toEqualFsPath(otherCbuildRunFilePath)
        });
    });

    it.each(['explicit', 'watched'] as const)('queues one latest conversion for changed cbuild-run contents from %s requests', async source => {
        const controller = controllerForSolution();
        const activeSession = gdbTargetDebugSessionFactory('/workspace/build/trace.cbuild-run.yml');
        const cbuildRunFilePath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);
        let buildContents = 'build: initial';
        jest.mocked(vscode.workspace.fs.readFile).mockImplementation(async uri =>
            new TextEncoder().encode(uri.fsPath === ctraceUri.fsPath ? 'trace: unchanged' : buildContents));
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => { finishFirstRun = resolve; });
        const convertedBuilds: string[] = [];
        const run = jest.spyOn(controller, 'run').mockImplementation(() => {
            convertedBuilds.push(buildContents);
            return convertedBuilds.length === 1 ? firstRun : Promise.resolve(0);
        });
        const request = (): Promise<void> => source === 'explicit'
            ? controller.convertCTrace(ctraceUri, cbuildRunFilePath)
            : controller.handleCTraceFileChanged(ctraceUri);
        const requests: Promise<void>[] = [];

        try {
            requests.push(request());
            await waitForCondition('initial conversion', () => run.mock.calls.length === 1);
            for (const contents of ['build: intermediate', 'build: latest', 'build: latest']) {
                buildContents = contents;
                requests.push(request());
                await waitForCondition('conversion input read', () =>
                    jest.mocked(vscode.workspace.fs.readFile).mock.calls.filter(([uri]) => uri.fsPath !== ctraceUri.fsPath).length
                    === requests.length);
            }
            expect(run).toHaveBeenCalledTimes(1);
            finishFirstRun?.(0);
            await Promise.all(requests);

            expect(convertedBuilds).toEqual(['build: initial', 'build: latest']);
        } finally {
            finishFirstRun?.(0);
            await Promise.all(requests);
        }
    });

    it('replaces older pending build input even when the latest input matches the active conversion', async () => {
        const controller = new PyTsController();
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';
        let buildContents = 'build: initial';
        jest.mocked(vscode.workspace.fs.readFile).mockImplementation(async uri =>
            new TextEncoder().encode(uri.fsPath === ctraceUri.fsPath ? 'trace: unchanged' : buildContents));
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => { finishFirstRun = resolve; });
        let finishSecondRun: ((exitCode: number) => void) | undefined;
        const secondRun = new Promise<number>(resolve => { finishSecondRun = resolve; });
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(firstRun).mockReturnValueOnce(secondRun).mockResolvedValue(0);
        const requests = [controller.convertCTrace(ctraceUri, cbuildRunFilePath)];

        try {
            await waitForCondition('initial conversion', () => run.mock.calls.length === 1);
            buildContents = 'build: intermediate';
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath));
            await waitForCondition('intermediate build input', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.filter(([uri]) => uri.fsPath !== ctraceUri.fsPath).length === 2);
            buildContents = 'build: initial';
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath));
            await waitForCondition('latest build input', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.filter(([uri]) => uri.fsPath !== ctraceUri.fsPath).length === 3);
            finishFirstRun?.(0);
            await waitForCondition('trailing conversion', () => run.mock.calls.length === 2);
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath));
            await waitForCondition('duplicate latest build input', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.filter(([uri]) => uri.fsPath !== ctraceUri.fsPath).length === 4);
            finishSecondRun?.(0);
            await Promise.all(requests);

            expect(run).toHaveBeenCalledTimes(2);
        } finally {
            finishFirstRun?.(0);
            finishSecondRun?.(0);
            await Promise.all(requests);
        }
    });

    it.each([1, 3])('coalesces %i forced dependency refreshes into one follow-up run', async refreshCount => {
        const controller = new PyTsController();
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';
        let finishConversion: ((exitCode: number) => void) | undefined;
        const conversion = new Promise<number>(resolve => {
            finishConversion = resolve;
        });
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(conversion).mockResolvedValue(0);
        const initial = controller.convertCTrace(ctraceUri, cbuildRunFilePath);
        const refreshes: Promise<void>[] = [];
        try {
            await waitForCondition('initial conversion to start', () => run.mock.calls.length === 1);
            for (let index = 0; index < refreshCount; index += 1) {
                refreshes.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath, { forceRerun: true }));
            }
            await waitForCondition('refresh source reads to finish', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === (refreshCount + 1) * 2);
            await waitForImmediate();
            expect(run).toHaveBeenCalledTimes(1);
            finishConversion?.(0);
            await Promise.all([initial, ...refreshes]);
            expect(run).toHaveBeenCalledTimes(2);
        } finally {
            finishConversion?.(0);
            await Promise.all([initial, ...refreshes]);
        }
    });

    it('does not revive a stale queued refresh when a same-build request can join the active conversion', async () => {
        const controller = new PyTsController();
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';
        const firstRun = Promise.withResolvers<number>();
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(firstRun.promise).mockResolvedValue(0);
        const requests = [controller.convertCTrace(ctraceUri, cbuildRunFilePath)];
        let current = true;

        try {
            await waitForCondition('initial conversion to start', () => run.mock.calls.length === 1);
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath, {
                forceRerun: true,
                isCurrent: () => current
            }));
            await waitForCondition('image refresh source reads to finish', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 4);
            await waitForImmediate();
            current = false;
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath));
            await waitForCondition('same-build source reads to finish', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 6);
            await waitForImmediate();
            firstRun.resolve(0);
            await Promise.all(requests);

            expect(run).toHaveBeenCalledTimes(1);
        } finally {
            firstRun.resolve(0);
            await Promise.all(requests);
        }
    });

    it.each([
        { survivor: 'manual', survivorFirst: true },
        { survivor: 'manual', survivorFirst: false },
        { survivor: 'current image refresh', survivorFirst: true },
        { survivor: 'current image refresh', survivorFirst: false }
    ])('retains a $survivor coalesced with a stale refresh (survivor first: $survivorFirst)', async ({ survivor, survivorFirst }) => {
        const controller = new PyTsController();
        const firstRun = Promise.withResolvers<number>();
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(firstRun.promise).mockResolvedValue(0);
        const initial = controller.convertCTrace(ctraceUri, '/workspace/build/initial.cbuild-run.yml');
        const requests: Promise<void>[] = [];
        let current = true;
        const staleOptions = { forceRerun: true, isCurrent: () => current };
        const survivorOptions = survivor === 'manual' ? {} : { forceRerun: true, isCurrent: () => true };
        const options = survivorFirst ? [survivorOptions, staleOptions] : [staleOptions, survivorOptions];
        const cbuildRunFilePath = '/workspace/build/other.cbuild-run.yml';

        try {
            await waitForCondition('initial conversion to start', () => run.mock.calls.length === 1);
            for (const requestOptions of options) {
                requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath, requestOptions));
            }
            await waitForCondition('coalesced requests to read the source', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 6);
            await waitForImmediate();
            current = false;
            controller.removeCTraceConfigurationWatcher();
            firstRun.resolve(0);
            await Promise.all([initial, ...requests]);

            expect(run).toHaveBeenCalledTimes(2);
            expect(run).toHaveBeenLastCalledWith({ cbuildRunFilePath: expect.toEqualFsPath(cbuildRunFilePath) });
        } finally {
            firstRun.resolve(0);
            await Promise.all([initial, ...requests]);
        }
    });

    it('allows a watched request to retry contents from a discarded stale image refresh', async () => {
        const controller = controllerForSolution();
        const cbuildRunFilePath = '/workspace/build/trace.cbuild-run.yml';
        controller.handleActiveSessionChanged(gdbTargetDebugSessionFactory(cbuildRunFilePath));
        const firstRun = Promise.withResolvers<number>();
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(firstRun.promise).mockResolvedValue(0);
        const initial = controller.convertCTrace(ctraceUri, cbuildRunFilePath);
        const requests: Promise<void>[] = [initial];
        let current = true;

        try {
            await waitForCondition('initial conversion to start', () => run.mock.calls.length === 1);
            jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode('trace: changed'));
            requests.push(controller.convertCTrace(ctraceUri, cbuildRunFilePath, {
                forceRerun: true,
                isCurrent: () => current
            }));
            await waitForCondition('image refresh to read the changed source', () =>
                jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 4);
            await waitForImmediate();
            current = false;
            firstRun.resolve(0);
            await Promise.all(requests);
            expect(run).toHaveBeenCalledTimes(1);

            await controller.handleCTraceFileChanged(ctraceUri);

            expect(run).toHaveBeenCalledTimes(2);
        } finally {
            firstRun.resolve(0);
            await Promise.all(requests);
        }
    });

    it('keeps an explicit queued request when the ctrace watcher is removed', async () => {
        const controller = new PyTsController();
        let finishFirstRun: ((exitCode: number) => void) | undefined;
        const firstRun = new Promise<number>(resolve => {
            finishFirstRun = resolve;
        });
        const run = jest.spyOn(controller, 'run')
            .mockReturnValueOnce(firstRun)
            .mockResolvedValue(0);

        const watchedChange = controller.handleCTraceFileChanged(ctraceUri);
        await waitForCondition('the watched pyTS conversion to start', () => run.mock.calls.length === 1);
        const cbuildRunFilePath = '/workspace/build/other.cbuild-run.yml';
        const explicitRequest = controller.convertCTrace(
            ctraceUriInSolution('other.ctrace.yml'), cbuildRunFilePath
        );
        await waitForCondition(
            'the explicit ctrace contents to be read',
            () => jest.mocked(vscode.workspace.fs.readFile).mock.calls.length === 3
        );
        controller.removeCTraceConfigurationWatcher();
        finishFirstRun?.(0);
        await Promise.all([watchedChange, explicitRequest]);

        expect(run).toHaveBeenCalledTimes(2);
        expect(run).toHaveBeenNthCalledWith(2, {
            cbuildRunFilePath: expect.toEqualFsPath(cbuildRunFilePath)
        });
    });

    it('logs a failed pyTS exit for an explicit request', async () => {
        const controller = new PyTsController();
        jest.spyOn(controller, 'run').mockResolvedValue(7);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        await controller.convertCTrace(ctraceUri, '/workspace/build/trace.cbuild-run.yml');

        expect(error).toHaveBeenCalledWith('pyTS process exited with code 7');
    });

    it('logs a pyTS launch failure for an explicit request', async () => {
        const controller = new PyTsController();
        const launchError = new Error('launch failed');
        jest.spyOn(controller, 'run').mockRejectedValue(launchError);
        const error = jest.spyOn(logger, 'error').mockImplementation();

        await controller.convertCTrace(ctraceUri, '/workspace/build/trace.cbuild-run.yml');

        expect(error).toHaveBeenCalledWith('Failed to launch pyTS process:', launchError);
    });

    it('converts ctrace after a ctrace configuration file changes', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledWith({});
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
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const firstSession = gdbTargetDebugSessionFactory('/workspace/build/trace.cbuild-run.yml');
        const secondSession = gdbTargetDebugSessionFactory('/workspace/alternate/trace.cbuild-run.yml');
        const firstCbuildRunFilePath = getCbuildRunFilePath(firstSession);
        const secondCbuildRunFilePath = getCbuildRunFilePath(secondSession);

        controller.handleActiveSessionChanged(firstSession);
        await controller.handleCTraceFileChanged(ctraceUri);
        controller.handleActiveSessionChanged(secondSession);
        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenNthCalledWith(1, {
            cbuildRunFilePath: expect.toEqualFsPath(firstCbuildRunFilePath)
        });
        expect(run).toHaveBeenNthCalledWith(2, {
            cbuildRunFilePath: expect.toEqualFsPath(secondCbuildRunFilePath)
        });
    });

    it('adds its ctrace configuration watch on activation', async () => {
        const tracker = debugTrackerFactory();
        const controller = new PyTsController();
        const traceWatch = traceWatchFactory();

        await controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);

        expect(traceWatch.addWatch).toHaveBeenCalledTimes(1);
    });

    it('coalesces watched configuration file events and removes its watch when disposed', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const tracker = debugTrackerFactory();
        const traceWatch = traceWatchFactory();
        const context = extensionContextFactory();
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { configurable: true, value: undefined });

        try {
            await controller.activate(context, tracker, traceWatch.fileWatchManager);
            await waitForCondition('the ctrace configuration watcher to be registered', () => traceWatch.addWatch.mock.calls.length === 1);
            const watch = traceWatch.getLatestWatch();
            if (watch === undefined) {
                throw new Error('Expected a ctrace configuration watch.');
            }
            expect(watch.globPattern).toBe('.cmsis/[!~]*.ctrace.{yml,yaml}');
            await Promise.all([
                watch.onDidCreate?.(ctraceUri),
                watch.onDidChange?.(ctraceUri)
            ]);
            context.subscriptions.at(-1)?.dispose();

            expect(run).toHaveBeenNthCalledWith(1, {});
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
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        const activeCbuildRunFilePath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(ctraceUriInSolution(`active.ctrace.${extension}`));

        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(activeCbuildRunFilePath)
        });
    });

    it.each(['yml', 'yaml'])('converts a named target-set .ctrace.%s file', async extension => {
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        const activeCbuildRunFilePath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(ctraceUriInSolution(`active@targetSet.ctrace.${extension}`));

        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(activeCbuildRunFilePath)
        });
    });

    it('ignores an unrelated ctrace file and converts the active project\'s ctrace file', async () => {
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/build/artifacts/active.cbuild-run.yml');
        const activeCbuildRunFilePath = getCbuildRunFilePath(activeSession);
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(ctraceUriInSolution('other.ctrace.yml'));
        await controller.handleCTraceFileChanged(ctraceUriInSolution('active.ctrace.yml'));

        expect(vscode.workspace.fs.readFile).toHaveBeenCalledTimes(2);
        expect(vscode.workspace.fs.readFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
            fsPath: expect.toEqualFsPath(ctraceUriInSolution('active.ctrace.yml').fsPath)
        }));
        expect(vscode.workspace.fs.readFile).toHaveBeenNthCalledWith(2, expect.objectContaining({
            fsPath: expect.toEqualFsPath(activeCbuildRunFilePath)
        }));
        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(activeCbuildRunFilePath)
        });
    });

    it('converts ctrace files when there is no active cbuild-run context', async () => {
        const controller = new PyTsController();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.handleCTraceFileChanged(ctraceUri);

        expect(run).toHaveBeenCalledWith({});
    });

    it.each([
        'inactive.ctrace.yml',
        'active-copy.ctrace.yml',
        'active@.ctrace.yml',
        '~active.ctrace.yml'
    ])('ignores another ctrace file in the generated project: %s', async ctraceFileName => {
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(ctraceUriInSolution(ctraceFileName));

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('ignores a matching ctrace file outside the active generated project', async () => {
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(
            ctraceUriInSolution('active.ctrace.yml', '/workspace/other')
        );

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('matches Windows ctrace paths case-insensitively with normalized separators', async () => {
        if (!isWindows) {
            return;
        }
        const controller = controllerForSolution('C:/Workspace/Project');
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeCbuildRunFilePath = 'C:/Workspace/Project/out/ACTIVE.cbuild-run.yml';
        const activeSession = gdbTargetDebugSessionFactory(activeCbuildRunFilePath);
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(vscode.Uri.file('c:\\workspace\\project\\.cmsis\\active.ctrace.yaml'));

        expect(run).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(activeCbuildRunFilePath)
        });
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
        const controller = controllerForSolution();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);
        const activeSession = gdbTargetDebugSessionFactory('/workspace/out/active.cbuild-run.yml');
        controller.handleActiveSessionChanged(activeSession);

        await controller.handleCTraceFileChanged(ctraceUriInSolution('other.ctrace.yml'));

        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('replaces the ctrace watch and ignores callbacks from the previous solution', async () => {
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder')
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/first'))
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/second'));
        const activeSolutionWatch = activeSolutionWatchFactory();
        const controller = new PyTsController({}, locator, activeSolutionWatch.cmsisJsonWatcher);
        const traceWatch = traceWatchFactory();
        const run = jest.spyOn(controller, 'run').mockResolvedValue(0);

        await controller.activate(extensionContextFactory(), debugTrackerFactory(), traceWatch.fileWatchManager);
        const firstWatch = traceWatch.getLatestWatch();
        activeSolutionWatch.fireActiveSolutionChange({
            previousActiveSolutionPath: '/workspace/first/first.csolution.yml',
            activeSolutionPath: '/workspace/second/second.csolution.yml',
            generation: 1
        });
        await waitForCondition('the replacement ctrace configuration watcher', () => traceWatch.addWatch.mock.calls.length === 2);
        const secondWatch = traceWatch.getLatestWatch();

        await firstWatch?.onDidChange?.(ctraceUri);

        expect(traceWatch.removeWatch).toHaveBeenCalledWith('pyts-ctrace-configuration');
        expect(firstWatch?.globPattern).toEqual(expect.objectContaining({ base: vscode.Uri.file('/workspace/first') }));
        expect(secondWatch?.globPattern).toEqual(expect.objectContaining({ base: vscode.Uri.file('/workspace/second') }));
        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

});
