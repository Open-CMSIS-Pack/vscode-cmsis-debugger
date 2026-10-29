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
import { activeSolutionWatchFactory } from '../../__test__/active-solution-watch.factory';
import { extensionContextFactory } from '../../__test__/vscode.factory';
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { CBuildRunFileLocator } from '../../cbuild-run';
import { debugTrackerFactory, gdbTargetDebugSessionFactory } from '../../debug-session/__test__/debug-session.factory';
import { CTraceProcessManager } from '../../desktop/process/ctrace-process-manager';
import { logger } from '../../logger';
import { CTraceController } from './ctrace-controller';
import { CapturedTraceResolver } from './captured-trace-resolver';
import { OPEN_CAPTURED_TRACE_AFTER_DECODE_SETTING } from '../../manifest';

/** Identifies the generated build file returned independently of debugger state. */
const CBUILD_RUN_FILE_PATH = '/workspace/Demo+Board.cbuild-run.yml';
/** Preserves the capitalization and named target set returned by CMSIS Solution. */
const SOLUTION_SET = 'Demo+Board@Release';

describe('CTraceController', () => {
    let configurationGet: jest.Mock;
    let locator: CBuildRunFileLocator;
    let solutionWatch: ReturnType<typeof activeSolutionWatchFactory>;
    let traceWatch: ReturnType<typeof traceWatchFactory>;
    let tracker: ReturnType<typeof debugTrackerFactory>;
    let context: vscode.ExtensionContext;
    let controller: CTraceController;
    let launch: jest.SpiedFunction<CTraceProcessManager['launch']>;
    let waitForExit: jest.SpiedFunction<CTraceProcessManager['waitForExit']>;
    let open: jest.SpiedFunction<CapturedTraceResolver['open']>;
    let hasCapture: jest.SpiedFunction<CapturedTraceResolver['hasCapture']>;

    /** Returns a raw trace URI in the watched solution folder. */
    function rawUri(channel = 'SWO', solutionSet = SOLUTION_SET): vscode.Uri {
        return vscode.Uri.file(`/workspace/.trace/${solutionSet}.${channel}.raw`);
    }

    /** Delivers raw-file notifications without starting a debug session. */
    async function change(channel = 'SWO', solutionSet = SOLUTION_SET, event: 'onDidCreate' | 'onDidChange' = 'onDidChange'): Promise<void> {
        const watch = traceWatch.getWatch('ctrace-raw-trace');
        if (watch === undefined) {
            throw new Error('Missing raw trace watch.');
        }
        if (event === 'onDidCreate') {
            await watch.onDidCreate?.(rawUri(channel, solutionSet));
        } else {
            await watch.onDidChange?.(rawUri(channel, solutionSet));
        }
    }

    /** Advances debounce timers and drains asynchronous queue work deterministically. */
    async function advance(milliseconds = 1_000): Promise<void> {
        await jest.advanceTimersByTimeAsync(milliseconds);
    }

    /** Disposes all subscriptions installed by this test's controller. */
    function dispose(): void {
        context.subscriptions.forEach(subscription => subscription.dispose());
    }

    /** Changes the active solution through the existing shared notification. */
    function switchSolution(): void {
        jest.mocked(locator.getActiveSolutionFolder).mockResolvedValue(vscode.Uri.file('/other'));
        solutionWatch.fireActiveSolutionChange({
            previousActiveSolutionPath: '/workspace/Demo.csolution.yml',
            activeSolutionPath: '/other/Other.csolution.yml',
            generation: 1
        });
    }

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.mocked(vscode.commands.executeCommand).mockReset();
        locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder').mockResolvedValue(vscode.Uri.file('/workspace'));
        jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(CBUILD_RUN_FILE_PATH);
        jest.spyOn(locator, 'getDefaultSolutionSet').mockResolvedValue(SOLUTION_SET);
        solutionWatch = activeSolutionWatchFactory();
        traceWatch = traceWatchFactory();
        tracker = debugTrackerFactory();
        context = extensionContextFactory();
        const resolver = new CapturedTraceResolver(locator);
        open = jest.spyOn(resolver, 'open').mockResolvedValue();
        hasCapture = jest.spyOn(resolver, 'hasCapture').mockResolvedValue(false);
        launch = jest.spyOn(CTraceProcessManager.prototype, 'launch').mockResolvedValue();
        waitForExit = jest.spyOn(CTraceProcessManager.prototype, 'waitForExit').mockResolvedValue(0);
        jest.mocked(vscode.workspace.fs.stat).mockResolvedValue({
            type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1
        });
        configurationGet = jest.fn().mockImplementation((_name: string, defaultValue: unknown) => defaultValue);
        jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: configurationGet, has: jest.fn(), inspect: jest.fn(), update: jest.fn()
        });
        controller = new CTraceController({ cTracePath: 'ctrace-test' }, locator, solutionWatch.cmsisJsonWatcher, resolver);
        await controller.activate(context, tracker, traceWatch.fileWatchManager);
    });

    afterEach(() => {
        dispose();
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('keeps both solution-folder watches without decoding pre-existing files or subscribing to stop events', () => {
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(2);
        expect(traceWatch.getWatch('ctrace-raw-trace')?.globPattern).toEqual(expect.objectContaining({
            baseUri: vscode.Uri.file('/workspace'), pattern: '.trace/*.{SWO,TB}.raw'
        }));
        expect(traceWatch.getWatch('ctrace-captured-trace')).toBeDefined();
        expect(tracker.callbacks.stopped).toBeUndefined();
        expect(tracker.callbacks.willStop).toBeUndefined();
        expect(launch).not.toHaveBeenCalled();
        expect(vscode.workspace.fs.stat).not.toHaveBeenCalled();
    });

    it.each(['onDidCreate', 'onDidChange'] as const)('decodes without a debug session after one second of quiet following %s', async event => {
        await change('SWO', SOLUTION_SET, event);
        await advance(999);
        expect(launch).not.toHaveBeenCalled();
        await advance(1);
        expect(launch).toHaveBeenCalledTimes(1);
        expect(launch).toHaveBeenCalledWith({ traceDir: expect.toEqualFsPath('/workspace/.trace'), solutionSet: SOLUTION_SET });
        expect(locator.getCBuildRunFileName).toHaveBeenCalledWith(undefined, true);
        expect(locator.getDefaultSolutionSet).toHaveBeenCalledWith(CBUILD_RUN_FILE_PATH);
    });

    it('uses the existing CMSIS Solution commands without requiring activeTarget metadata and preserves filename case', async () => {
        jest.mocked(locator.getCBuildRunFileName).mockRestore();
        jest.mocked(locator.getDefaultSolutionSet).mockRestore();
        jest.mocked(vscode.commands.executeCommand)
            .mockResolvedValueOnce(CBUILD_RUN_FILE_PATH)
            .mockResolvedValueOnce('Board@Release');

        await change();
        await advance();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getActiveTargetSet');
        expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        expect(launch).toHaveBeenCalledWith({ traceDir: expect.toEqualFsPath('/workspace/.trace'), solutionSet: SOLUTION_SET });
    });

    it('shares the quiet period across raw channels and postpones decoding throughout continuous writes', async () => {
        await change();
        for (let index = 0; index < 5; index += 1) {
            await advance(800);
            await change(index % 2 === 0 ? 'TB' : 'SWO');
        }
        expect(launch).not.toHaveBeenCalled();
        await advance(999);
        expect(launch).not.toHaveBeenCalled();
        await advance(1);
        expect(launch).toHaveBeenCalledTimes(1);
    });

    it('ignores raw files belonging to other targets or solutions', async () => {
        await change('SWO', 'Other+Board@Release');
        await change('TB', 'Demo+Other');
        await advance();
        expect(launch).not.toHaveBeenCalled();
    });

    it.each([0, 1_000])('retains matching events when another file changes during a lookup delayed by %s ms', async delay => {
        const lookup = Promise.withResolvers<string>();
        jest.mocked(locator.getDefaultSolutionSet).mockReturnValueOnce(lookup.promise);
        await change();
        await advance();
        await change('TB', 'Demo+Other');
        await advance(delay);
        lookup.resolve(SOLUTION_SET);
        await advance(0);
        await advance(1_000 - delay);

        expect(launch).toHaveBeenCalledTimes(1);
        expect(launch).toHaveBeenCalledWith({ traceDir: expect.toEqualFsPath('/workspace/.trace'), solutionSet: SOLUTION_SET });
    });

    it('uses the current target when queued work begins without replacing folder watches', async () => {
        await change();
        jest.mocked(locator.getDefaultSolutionSet).mockResolvedValue('Demo+Board@Debug');
        await advance();
        expect(launch).not.toHaveBeenCalled();
        await change('TB', 'Demo+Board@Debug');
        await advance();
        expect(launch).toHaveBeenCalledWith({ traceDir: expect.toEqualFsPath('/workspace/.trace'), solutionSet: 'Demo+Board@Debug' });
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(2);
    });

    it('decodes when either triggering channel still exists and skips deleted captures', async () => {
        await change();
        jest.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce({ code: 'FileNotFound' });
        await advance();
        expect(launch).not.toHaveBeenCalled();
        await change();
        await change('TB');
        jest.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce({ code: 'FileNotFound' });
        await advance();
        expect(launch).toHaveBeenCalledTimes(1);
    });

    it('replaces both watches and cancels pending work on solution changes', async () => {
        const oldWatch = traceWatch.getWatch('ctrace-raw-trace');
        await change();
        switchSolution();
        await oldWatch?.onDidChange?.(rawUri());
        await advance();
        expect(launch).not.toHaveBeenCalled();
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('ctrace-raw-trace');
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('ctrace-captured-trace');
        expect(traceWatch.getWatch('ctrace-raw-trace')?.globPattern).toEqual(expect.objectContaining({ baseUri: vscode.Uri.file('/other') }));
    });

    it('coalesces settled events while a conversion is running and serializes its follow-up', async () => {
        const first = Promise.withResolvers<number | null>();
        waitForExit.mockReturnValueOnce(first.promise);
        await change();
        await advance();
        await change();
        await advance();
        await change('TB');
        await advance();
        expect(launch).toHaveBeenCalledTimes(1);
        first.resolve(0);
        await advance(0);
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('waits for the remaining quiet period after a conversion finishes', async () => {
        const first = Promise.withResolvers<number | null>();
        waitForExit.mockReturnValueOnce(first.promise);
        await change();
        await advance();
        await change();
        await advance(500);
        first.resolve(0);
        await advance(499);
        expect(launch).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('cancels queued work and suppresses opening after a solution switch', async () => {
        configurationGet.mockReturnValue(true);
        const first = Promise.withResolvers<number | null>();
        waitForExit.mockReturnValueOnce(first.promise);
        await change();
        await advance();
        await change();
        await advance();
        switchSolution();
        await advance(0);
        first.resolve(0);
        await advance(0);
        expect(launch).toHaveBeenCalledTimes(1);
        expect(open).not.toHaveBeenCalled();
    });

    it('processes the new solution after cancelling an older queued conversion', async () => {
        const first = Promise.withResolvers<number | null>();
        waitForExit.mockReturnValueOnce(first.promise);
        await change();
        await advance();
        await change();
        await advance();
        switchSolution();
        await advance(0);
        jest.mocked(locator.getDefaultSolutionSet).mockResolvedValue('Other+Board');
        await traceWatch.getWatch('ctrace-raw-trace')?.onDidChange?.(vscode.Uri.file('/other/.trace/Other+Board.SWO.raw'));
        await advance();
        first.resolve(0);
        await advance(0);

        expect(launch).toHaveBeenCalledTimes(2);
        expect(launch).toHaveBeenLastCalledWith({ traceDir: expect.toEqualFsPath('/other/.trace'), solutionSet: 'Other+Board' });
    });

    it.each([7, null])('logs exit code %s and allows later events to retry', async code => {
        const error = jest.spyOn(logger, 'error').mockImplementation();
        waitForExit.mockResolvedValueOnce(code);
        await change();
        await advance();
        expect(error).toHaveBeenCalledWith(`ctrace process exited with code ${code}`);
        expect(open).not.toHaveBeenCalled();
        await change();
        await advance();
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it.each(['launch', 'lookup'] as const)('recovers from a failed %s', async operation => {
        const failure = new Error('failed');
        const error = jest.spyOn(logger, 'error').mockImplementation();
        if (operation === 'launch') {
            launch.mockRejectedValueOnce(failure);
        } else {
            jest.mocked(locator.getDefaultSolutionSet).mockRejectedValueOnce(failure);
        }
        await change();
        await advance();
        expect(error).toHaveBeenCalledWith('Failed to launch ctrace process:', failure);
        await change();
        await advance();
        expect(waitForExit).toHaveBeenCalledTimes(1);
    });

    it('honors automatic opening and guards against target changes during discovery', async () => {
        await change();
        await advance();
        expect(open).not.toHaveBeenCalled();
        configurationGet.mockImplementation((name: string) => name === OPEN_CAPTURED_TRACE_AFTER_DECODE_SETTING);
        await change();
        await advance();
        expect(open).toHaveBeenCalledWith(CBUILD_RUN_FILE_PATH, { preserveFocus: false }, expect.any(Function));
        const canOpen = open.mock.calls[0]?.[2];
        expect(canOpen).toBeDefined();
        await expect(canOpen?.(SOLUTION_SET)).resolves.toBe(true);
        await expect(canOpen?.('Demo+Other')).resolves.toBe(false);
        jest.mocked(locator.getDefaultSolutionSet).mockResolvedValue('Demo+Board@Debug');
        await expect(canOpen?.(SOLUTION_SET)).resolves.toBe(false);
        switchSolution();
        await expect(canOpen?.(SOLUTION_SET)).resolves.toBe(false);
    });

    it('logs opening errors without blocking subsequent conversions', async () => {
        configurationGet.mockReturnValue(true);
        const failure = new Error('open failed');
        const error = jest.spyOn(logger, 'error').mockImplementation();
        open.mockRejectedValueOnce(failure);
        await change();
        await advance();
        expect(error).toHaveBeenCalledWith('Failed to open captured trace:', failure);
        await change();
        await advance();
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('refreshes captured-trace availability and ignores stale asynchronous lookups', async () => {
        const watch = traceWatch.getWatch('ctrace-captured-trace');
        const csvUri = vscode.Uri.file(`/workspace/.trace/${SOLUTION_SET}.SWO.csv`);
        hasCapture.mockResolvedValueOnce(true);
        await watch?.onDidCreate?.(csvUri);
        expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'vscode-cmsis-debugger.hasCapturedTrace', true);
        const availability = Promise.withResolvers<boolean>();
        hasCapture.mockReturnValueOnce(availability.promise);
        const oldRead = watch?.onDidChange?.(csvUri);
        switchSolution();
        await advance(0);
        availability.resolve(true);
        await oldRead;
        expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'vscode-cmsis-debugger.hasCapturedTrace', false);
    });

    it('does not reinstall watches after disposal during delayed solution resolution', async () => {
        dispose();
        const initial = Promise.withResolvers<vscode.Uri | undefined>();
        jest.mocked(locator.getActiveSolutionFolder).mockReturnValue(initial.promise);
        context = extensionContextFactory();
        const activation = controller.activate(context, tracker, traceWatch.fileWatchManager);
        dispose();
        initial.resolve(vscode.Uri.file('/workspace'));
        await activation;
        expect(traceWatch.getWatch('ctrace-raw-trace')).toBeUndefined();
    });

    it('disposes timers and watches and ignores stale callbacks', async () => {
        const oldWatch = traceWatch.getWatch('ctrace-raw-trace');
        await change();
        dispose();
        await oldWatch?.onDidChange?.(rawUri());
        await advance();
        expect(launch).not.toHaveBeenCalled();
        expect(traceWatch.getWatch('ctrace-raw-trace')).toBeUndefined();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('preserves caller options and active-session defaults for manual conversions', async () => {
        await controller.run();
        await controller.run({ args: ['--version'] });
        expect(launch).toHaveBeenNthCalledWith(1, {});
        expect(launch).toHaveBeenNthCalledWith(2, { args: ['--version'] });
        const session = Object.assign(gdbTargetDebugSessionFactory('debug'), { getCbuildRunPath: () => '/session.cbuild-run.yml' });
        await tracker.callbacks.activeSession?.(session);
        expect(controller.getActiveCbuildRunFilePath()).toBe('/session.cbuild-run.yml');
        await controller.run();
        await controller.run({ cbuildRunFilePath: '/explicit.cbuild-run.yml' });
        expect(launch).toHaveBeenNthCalledWith(3, { cbuildRunFilePath: '/session.cbuild-run.yml' });
        expect(launch).toHaveBeenNthCalledWith(4, { cbuildRunFilePath: '/explicit.cbuild-run.yml' });
    });

    it('serializes manual and automatic conversions while resolving the automatic target independently of the session', async () => {
        const session = Object.assign(gdbTargetDebugSessionFactory('debug'), { getCbuildRunPath: () => '/session.cbuild-run.yml' });
        await tracker.callbacks.activeSession?.(session);
        const manualExit = Promise.withResolvers<number | null>();
        waitForExit.mockReturnValueOnce(manualExit.promise);
        const manual = controller.run();
        await advance(0);
        await change();
        await advance();
        expect(launch).toHaveBeenCalledTimes(1);
        manualExit.resolve(0);
        await manual;
        await advance(0);
        expect(launch).toHaveBeenLastCalledWith({ traceDir: expect.toEqualFsPath('/workspace/.trace'), solutionSet: SOLUTION_SET });
        expect(launch).toHaveBeenCalledTimes(2);
    });
});
