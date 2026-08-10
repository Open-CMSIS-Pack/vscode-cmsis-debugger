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
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';
import { CTraceController } from './ctrace-controller';

const CBUILD_RUN_FILE_PATH = '/workspace/solution+target.cbuild-run.yml';
const RAW_TRACE_URI = vscode.Uri.file('/workspace/.trace/solution.SWO.raw');

type CTraceControllerTestAccess = {
    traceEnabled: boolean;
    handleDecodeTrigger(session: GDBTargetDebugSession | undefined): Promise<void>;
    handleRawTraceFileChanged(uri: vscode.Uri): Promise<void>;
};

describe('CTraceController', () => {
    const createSession = (id: string, cbuildRunFilePath: string): GDBTargetDebugSession => ({
        session: { id },
        getCbuildRun: jest.fn().mockResolvedValue({ getFilePath: () => cbuildRunFilePath }),
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
        const tracker = {
            onDidChangeActiveDebugSession: jest.fn(() => ({ dispose: jest.fn() })),
            onStopped: jest.fn(() => ({ dispose: jest.fn() })),
            onWillStopSession: jest.fn(() => ({ dispose: jest.fn() })),
        } as unknown as GDBTargetDebugTracker;
        const traceWatch = traceWatchFactory();

        controller.activate(extensionContextFactory(), tracker, traceWatch.fileWatchManager);
        expect(traceWatch.addWatch).not.toHaveBeenCalled();

        traceWatch.setTraceEnabled(true);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.addWatch).toHaveBeenCalledTimes(1);

        traceWatch.setTraceEnabled(false);
        traceWatch.fireTraceConfigurationChange();
        expect(traceWatch.removeWatch).toHaveBeenCalledWith('ctrace-raw-trace');
    });
});
