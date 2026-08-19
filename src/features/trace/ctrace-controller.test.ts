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
import { traceWatchFactory } from '../../__test__/trace-watch.factory';
import { GDBTargetDebugSession } from '../../debug-session';
import { debugTrackerFactory, gdbTargetDebugSessionFactory } from '../../debug-session/__test__/debug-session.factory';
import { CTraceProcessManager } from '../../desktop/process/ctrace-process-manager';
import { CTraceController } from './ctrace-controller';

const CBUILD_RUN_FILE_PATH = '/workspace/solution+target.cbuild-run.yml';
const RAW_TRACE_URI = vscode.Uri.file('/workspace/.trace/solution.SWO.raw');

type CTraceControllerTestAccess = {
    traceEnabled: boolean;
    addRawTraceWatcher(): void;
    handleDecodeTrigger(session: GDBTargetDebugSession | undefined): Promise<void>;
    handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void;
    handleRawTraceFileChanged(uri: vscode.Uri): Promise<void>;
    removeRawTraceWatcher(): void;
};

describe('CTraceController', () => {
    const createSession = (id: string, cbuildRunFilePath: string): GDBTargetDebugSession => ({
        session: { id },
        getCbuildRun: jest.fn().mockResolvedValue({ getFilePath: () => cbuildRunFilePath }),
        getCbuildRunPath: () => cbuildRunFilePath,
    } as unknown as GDBTargetDebugSession);

    let now: number;
    let controller: CTraceController;
    let run: jest.SpiedFunction<CTraceController['run']>;
    let session: GDBTargetDebugSession;
    let testAccess: CTraceControllerTestAccess;

    beforeEach(() => {
        now = 10_000;
        controller = new CTraceController({}, () => now);
        run = jest.spyOn(controller, 'run').mockResolvedValue();
        session = createSession('session-1', CBUILD_RUN_FILE_PATH);
        testAccess = controller as unknown as CTraceControllerTestAccess;
        testAccess.traceEnabled = true;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('runs ctrace with the active session cbuild run path unless the caller supplies one', async () => {
        const launch = jest.spyOn(CTraceProcessManager.prototype, 'launch').mockResolvedValue();
        const waitForExit = jest.spyOn(CTraceProcessManager.prototype, 'waitForExit').mockResolvedValue();
        const runningController = new CTraceController({ cTracePath: 'ctrace-path' });
        const runningControllerAccess = runningController as unknown as CTraceControllerTestAccess;
        runningControllerAccess.handleActiveSessionChanged(session);

        await runningController.run();
        await runningController.run({ cbuildRunFilePath: '/workspace/provided.cbuild-run.yml' });
        const directController = new CTraceController({ cTracePath: 'ctrace-path' });
        await directController.run({ args: ['--version'] });

        expect(launch).toHaveBeenNthCalledWith(1, { cbuildRunFilePath: CBUILD_RUN_FILE_PATH });
        expect(launch).toHaveBeenNthCalledWith(2, { cbuildRunFilePath: '/workspace/provided.cbuild-run.yml' });
        expect(launch).toHaveBeenNthCalledWith(3, { args: ['--version'] });
        expect(waitForExit).toHaveBeenCalledTimes(3);
    });

    it('decodes when a raw trace file is saved after the target stops', async () => {
        await testAccess.handleDecodeTrigger(session);
        now += 250;
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);

        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith({ cbuildRunFilePath: CBUILD_RUN_FILE_PATH });
    });

    it('decodes when the target stops shortly after a raw trace file is saved', async () => {
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);
        now += 250;
        await testAccess.handleDecodeTrigger(session);

        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith({ cbuildRunFilePath: CBUILD_RUN_FILE_PATH });
    });

    it('does not decode when the raw trace file save is outside the correlation window', async () => {
        await testAccess.handleDecodeTrigger(session);
        now += 2_001;
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);

        expect(run).not.toHaveBeenCalled();
    });

    it('expires raw trace saves that predate a stop event', async () => {
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);
        now += 2_001;
        await testAccess.handleDecodeTrigger(session);

        expect(run).not.toHaveBeenCalled();
    });

    it('ignores trace events while disabled or without a debug session', async () => {
        testAccess.traceEnabled = false;

        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);
        await testAccess.handleDecodeTrigger(session);

        testAccess.traceEnabled = true;
        await testAccess.handleDecodeTrigger(undefined);

        expect(run).not.toHaveBeenCalled();
    });

    it('consumes a raw trace save after decoding to prevent duplicate decodes', async () => {
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);
        await testAccess.handleDecodeTrigger(session);
        now += 50;
        await testAccess.handleDecodeTrigger(session);

        expect(run).toHaveBeenCalledTimes(1);
    });

    it('decodes only the most recent pending session for a raw trace save', async () => {
        const newerCbuildRunFilePath = '/workspace/newer+target.cbuild-run.yml';
        const newerSession = createSession('session-2', newerCbuildRunFilePath);
        await testAccess.handleDecodeTrigger(session);
        now += 100;
        await testAccess.handleDecodeTrigger(newerSession);
        now += 100;
        await testAccess.handleRawTraceFileChanged(RAW_TRACE_URI);

        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith({ cbuildRunFilePath: newerCbuildRunFilePath });
    });

    it('adds and removes its raw trace watch when the trace setting changes', () => {
        const tracker = debugTrackerFactory();
        const traceWatch = traceWatchFactory();

        controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.fireUnrelatedConfigurationChange();
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.setTraceEnabled(true);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(1);

        traceWatch.setTraceEnabled(false);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('ctrace-raw-trace');
    });

    it('routes registered tracker events and removes its watch when disposed', async () => {
        const tracker = debugTrackerFactory();
        const trackerSession = gdbTargetDebugSessionFactory('tracker-session');
        const traceWatch = traceWatchFactory();
        const context = extensionContextFactory();

        controller.activate(context, tracker, traceWatch.fileWatchManager);
        await tracker.callbacks.activeSession?.(trackerSession);
        await tracker.callbacks.stopped?.({ session: trackerSession });
        await tracker.callbacks.willStop?.(trackerSession);
        context.subscriptions.at(-1)?.dispose();

        expect(traceWatch.removeWatch).toHaveBeenCalledWith('ctrace-raw-trace');
    });

    it('forwards raw trace file creation and changes through its registered watch', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const tracker = debugTrackerFactory();
        const traceWatch = traceWatchFactory();
        traceWatch.setTraceEnabled(true);
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { configurable: true, value: undefined });

        try {
            controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);
            const watch = traceWatch.getLatestWatch();
            if (watch === undefined) {
                throw new Error('Expected a raw trace file watch.');
            }
            expect(watch.globPattern).toBe('.trace/*.{SWO,TB}.raw');

            await watch.onDidCreate?.(RAW_TRACE_URI);
            await watch.onDidChange?.(RAW_TRACE_URI);

            expect(run).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                configurable: true,
                value: workspaceFolders
            });
        }
    });

    it('does not require a file watch manager before activation', () => {
        const unactivatedController = new CTraceController();
        const unactivatedControllerAccess = unactivatedController as unknown as CTraceControllerTestAccess;

        unactivatedControllerAccess.addRawTraceWatcher();
        unactivatedControllerAccess.removeRawTraceWatcher();
    });
});
