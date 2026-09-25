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

import * as path from 'node:path';

import * as vscode from 'vscode';

import { CbuildRunReader, CBuildRunFileLocator } from '../../cbuild-run';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { logger } from '../../logger';
import { waitForCondition } from '../../utils';
import { TraceConfigurationRunMessageReader } from './ctrace-run-validation-message-reader';
import { PyTsTraceConfigurationPrevalidator } from './trace-configuration-prevalidator';

const CBUILD_RUN_FILE_NAME = path.join('/workspace', 'out', 'project+target.cbuild-run.yml');
const CTRACE_FILE_NAME = path.join('/workspace', '.cmsis', 'project+target.ctrace.yml');
const OTHER_CTRACE_FILE_NAME = path.join('/workspace', '.cmsis', 'other.ctrace.yml');
const PRODUCTION_CTRACE_RUN_FILE_NAME = path.join('/workspace', '.trace', 'project+target.ctrace-run.yml');
const BACKUP_CTRACE_RUN_FILE_NAME = path.join('/workspace', '.trace', '~project+target.ctrace-run.yml');

interface FakeProcessManager {
    launch: jest.Mock<Promise<void>, [object?]>;
    waitForExit: jest.Mock<Promise<number | null>, []>;
    stop: jest.Mock<Promise<void>, [object]>;
}

function createProcessManager(exitCode: number | null = 0): FakeProcessManager {
    return {
        launch: jest.fn().mockResolvedValue(undefined),
        waitForExit: jest.fn().mockResolvedValue(exitCode),
        stop: jest.fn().mockResolvedValue(undefined)
    };
}

function asProcessManager(processManager: FakeProcessManager): PyTsProcessManager {
    return processManager as unknown as PyTsProcessManager;
}

function createRunMessageReader(): jest.Mocked<TraceConfigurationRunMessageReader> {
    return {
        exists: jest.fn().mockResolvedValue(false),
        readIfExists: jest.fn().mockResolvedValue(undefined)
    };
}

function createDependencies(): {
    locator: CBuildRunFileLocator;
    reader: CbuildRunReader;
    processManager: FakeProcessManager;
    } {
    const locator = new CBuildRunFileLocator();
    jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(CBUILD_RUN_FILE_NAME);
    jest.spyOn(locator, 'getCTraceUriFromCBuildRunUri')
        .mockResolvedValue(vscode.Uri.file(CTRACE_FILE_NAME));
    const reader = new CbuildRunReader();
    jest.spyOn(reader, 'parse').mockResolvedValue();
    jest.spyOn(reader, 'getTargetSet').mockReturnValue('<default>');
    return { locator, reader, processManager: createProcessManager() };
}

describe('PyTsTraceConfigurationPrevalidator', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('runs pyTS for the matching active trace configuration', async () => {
        const { locator, reader, processManager } = createDependencies();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME))
            .resolves.toEqual({ status: 'passed', referenceMessages: [] });

        expect(reader.parse).toHaveBeenCalledWith(CBUILD_RUN_FILE_NAME);
        expect(locator.getCTraceUriFromCBuildRunUri).toHaveBeenCalledWith(
            vscode.Uri.file(CBUILD_RUN_FILE_NAME),
            '<default>'
        );
        expect(processManager.launch).toHaveBeenCalledWith({
            cbuildRunFilePath: CBUILD_RUN_FILE_NAME
        });
    });

    it('prefers messages from the backup ctrace-run generated for a backup input', async () => {
        const { locator, reader, processManager } = createDependencies();
        const runMessageReader = createRunMessageReader();
        const backupMessages = [{ ctraceRef: 'data#0', severity: 'warning' as const, message: 'aligned' }];
        runMessageReader.exists.mockResolvedValue(true);
        runMessageReader.readIfExists.mockResolvedValue(backupMessages);
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            runMessageReader
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'passed',
            referenceMessages: backupMessages
        });
        expect(runMessageReader.readIfExists).toHaveBeenCalledTimes(1);
        expect(runMessageReader.readIfExists).toHaveBeenCalledWith(BACKUP_CTRACE_RUN_FILE_NAME);
    });

    it('falls back to production messages when backup output is missing', async () => {
        const { locator, reader, processManager } = createDependencies();
        const runMessageReader = createRunMessageReader();
        const productionMessages = [{ ctraceRef: 'events#0', severity: 'info' as const, message: 'enabled' }];
        runMessageReader.exists.mockResolvedValue(true);
        runMessageReader.readIfExists
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(productionMessages);
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            runMessageReader
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'passed',
            referenceMessages: productionMessages
        });
        expect(runMessageReader.readIfExists.mock.calls.map(call => call[0])).toEqual([
            BACKUP_CTRACE_RUN_FILE_NAME,
            PRODUCTION_CTRACE_RUN_FILE_NAME
        ]);
    });

    it('ignores a stale backup output when no backup input exists', async () => {
        const { locator, reader, processManager } = createDependencies();
        const runMessageReader = createRunMessageReader();
        runMessageReader.readIfExists.mockResolvedValue([]);
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            runMessageReader
        );

        await prevalidator.validate(CTRACE_FILE_NAME);

        expect(runMessageReader.readIfExists).toHaveBeenCalledTimes(1);
        expect(runMessageReader.readIfExists).toHaveBeenCalledWith(PRODUCTION_CTRACE_RUN_FILE_NAME);
    });

    it.each([
        { exitCode: 7, exitDescription: '7' },
        { exitCode: null, exitDescription: 'null' }
    ])('reports a pyTS exit code of $exitDescription as failed', async ({ exitCode, exitDescription }) => {
        const { locator, reader, processManager } = createDependencies();
        processManager.waitForExit.mockResolvedValue(exitCode);
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: `pyTS validation exited with code ${exitDescription}.`
        });
        expect(error).toHaveBeenCalledWith(`Trace Configuration: pyTS validation exited with code ${exitDescription}.`);
    });

    it('reports pyTS launch failures as failed', async () => {
        const { locator, reader, processManager } = createDependencies();
        const launchError = new Error('spawn failed');
        processManager.launch.mockRejectedValue(launchError);
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: 'spawn failed'
        });
        expect(error).toHaveBeenCalledWith('Trace Configuration: Failed to run pyTS validation:', launchError);
    });

    it('fails closed when the selected file is not the active pyTS input', async () => {
        const { locator, reader, processManager } = createDependencies();
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );

        await expect(prevalidator.validate(OTHER_CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'unavailable',
            message: `The selected trace configuration is not the active pyTS input. Expected ${CTRACE_FILE_NAME}.`
        });
        expect(processManager.launch).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('pyTS validation unavailable'));
    });

    it('does not launch after cancellation during cbuild-run discovery', async () => {
        const { locator, reader, processManager } = createDependencies();
        let completeDiscovery: ((fileName: string) => void) | undefined;
        jest.spyOn(locator, 'getCBuildRunFileName').mockImplementationOnce(() => new Promise(resolve => {
            completeDiscovery = resolve;
        }));
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );

        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await prevalidator.cancel();
        completeDiscovery?.(CBUILD_RUN_FILE_NAME);

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(processManager.launch).not.toHaveBeenCalled();
    });

    it('stops the active pyTS process when cancelled', async () => {
        const { locator, reader, processManager } = createDependencies();
        let completeExit: ((exitCode: number | null) => void) | undefined;
        processManager.waitForExit.mockImplementationOnce(() => new Promise(resolve => {
            completeExit = resolve;
        }));
        processManager.stop.mockImplementationOnce(async () => {
            completeExit?.(null);
        });
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager)
        );
        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await waitForCondition('pyTS validation to start', () => processManager.waitForExit.mock.calls.length > 0);

        await prevalidator.cancel();

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(processManager.stop).toHaveBeenCalledWith({ timeout: 250 });
    });
});
