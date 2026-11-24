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
import { PyTsTraceConfigurationPrevalidator } from './trace-configuration-prevalidator';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

/** Active build metadata path used by validator tests. */
const CBUILD_RUN_FILE_NAME = path.join('/workspace', 'out', 'project+target.cbuild-run.yml');
/** Trace input associated with the active build metadata. */
const CTRACE_FILE_NAME = path.join('/workspace', '.cmsis', 'project+target.ctrace.yml');
/** Trace input outside the active build context. */
const OTHER_CTRACE_FILE_NAME = path.join('/workspace', '.cmsis', 'other.ctrace.yml');

interface FakeProcessManager {
    launch: jest.Mock<Promise<void>, [object?]>;
    waitForExit: jest.Mock<Promise<number | null>, []>;
    stop: jest.Mock<Promise<void>, [object]>;
}

/** Creates a controllable pyTS process without launching an executable. */
function createProcessManager(exitCode: number | null = 0): FakeProcessManager {
    return {
        launch: jest.fn().mockResolvedValue(undefined),
        waitForExit: jest.fn().mockResolvedValue(exitCode),
        stop: jest.fn().mockResolvedValue(undefined)
    };
}

/** Adapts the process test double at its external class boundary. */
function asProcessManager(processManager: FakeProcessManager): PyTsProcessManager {
    return processManager as unknown as PyTsProcessManager;
}

/** Creates build discovery, an existing cbuild-run input, and isolated process and file adapters. */
function createDependencies(): {
    locator: CBuildRunFileLocator;
    reader: CbuildRunReader;
    processManager: FakeProcessManager;
    fileAdapter: WorkspaceTextFileAdapter;
    } {
    const locator = new CBuildRunFileLocator();
    jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(CBUILD_RUN_FILE_NAME);
    jest.spyOn(locator, 'getCTraceUriFromCBuildRunUri')
        .mockResolvedValue(vscode.Uri.file(CTRACE_FILE_NAME));
    const reader = new CbuildRunReader();
    jest.spyOn(reader, 'parse').mockResolvedValue();
    jest.spyOn(reader, 'getTargetSet').mockReturnValue('<default>');
    const fileAdapter = new WorkspaceTextFileAdapter();
    jest.spyOn(fileAdapter, 'stat').mockImplementation(async fileName =>
        fileName === CBUILD_RUN_FILE_NAME ? { mtimeMs: 1, size: 100 } : undefined);
    jest.spyOn(fileAdapter, 'deleteTextFile').mockResolvedValue();
    return { locator, reader, processManager: createProcessManager(), fileAdapter };
}

describe('PyTsTraceConfigurationPrevalidator', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('fails before parsing or launching pyTS when the cbuild-run file is missing, then recovers', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        jest.spyOn(fileAdapter, 'stat').mockResolvedValueOnce(undefined);
        const processFactory = jest.fn(() => asProcessManager(processManager));
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, processFactory, fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: 'The required cbuild-run file does not exist.'
        });
        expect(reader.parse).not.toHaveBeenCalled();
        expect(processFactory).not.toHaveBeenCalled();
        expect(processManager.launch).not.toHaveBeenCalled();
        expect(fileAdapter.deleteTextFile).not.toHaveBeenCalled();

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({ status: 'passed' });
        expect(processManager.launch).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, '', '   '])('fails without launching pyTS when the cbuild-run path is %p', async fileName => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(fileName);
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, () => asProcessManager(processManager), fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: 'The required cbuild-run file does not exist.'
        });
        expect(fileAdapter.stat).not.toHaveBeenCalled();
        expect(reader.parse).not.toHaveBeenCalled();
        expect(processManager.launch).not.toHaveBeenCalled();
    });

    it('discards a missing-file result after cancellation during the existence check', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        let completeStat: (() => void) | undefined;
        const stat = jest.spyOn(fileAdapter, 'stat').mockImplementationOnce(() => new Promise(resolve => {
            completeStat = () => resolve(undefined);
        }));
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, () => asProcessManager(processManager), fileAdapter
        );
        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await waitForCondition('cbuild-run existence check', () => stat.mock.calls.length === 1);
        await prevalidator.cancel();
        completeStat?.();

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(reader.parse).not.toHaveBeenCalled();
        expect(processManager.launch).not.toHaveBeenCalled();
    });

    it.each(['data#0', 'ctrace'])('reports the generated %s error instead of the exit code', async ref => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        processManager.waitForExit.mockResolvedValue(2);
        const deleteOutput = jest.spyOn(fileAdapter, 'deleteTextFile').mockResolvedValue();
        jest.spyOn(fileAdapter, 'stat').mockResolvedValue({ mtimeMs: 1, size: 100 });
        const message = 'Symbol resolution is unavailable because no ELF file is available.';
        const readOutput = jest.spyOn(fileAdapter, 'readTextFile').mockResolvedValue(
            `ctrace-run:\n  ctrace-refs:\n    - ref: ${ref}\n      error: ${message}\n`
        );
        processManager.launch.mockImplementation(async () => {
            expect(deleteOutput).toHaveBeenCalledWith(expect.toEqualFsPath(
                path.join('/workspace', '.trace', '~project+target.ctrace-run.yml')
            ));
        });
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, () => asProcessManager(processManager), fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({ status: 'failed', message });
        expect(readOutput).toHaveBeenCalledWith(expect.toEqualFsPath(
            path.join('/workspace', '.trace', '~project+target.ctrace-run.yml')
        ));

        processManager.waitForExit.mockResolvedValue(0);
        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({ status: 'passed' });
        expect(readOutput).toHaveBeenCalledTimes(1);
    });

    it('retains the exit code when generated output is invalid', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        processManager.waitForExit.mockResolvedValue(2);
        jest.spyOn(fileAdapter, 'deleteTextFile').mockResolvedValue();
        jest.spyOn(fileAdapter, 'stat').mockResolvedValue({ mtimeMs: 1, size: 1 });
        jest.spyOn(fileAdapter, 'readTextFile').mockResolvedValue('ctrace-run: [');
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, () => asProcessManager(processManager), fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed', message: 'pyTS validation exited with code 2.'
        });
    });

    it('discards diagnostics read after cancellation', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        processManager.waitForExit.mockResolvedValue(2);
        jest.spyOn(fileAdapter, 'deleteTextFile').mockResolvedValue();
        jest.spyOn(fileAdapter, 'stat').mockResolvedValue({ mtimeMs: 1, size: 1 });
        let completeRead: ((text: string) => void) | undefined;
        const readOutput = jest.spyOn(fileAdapter, 'readTextFile').mockImplementation(() => new Promise(resolve => {
            completeRead = resolve;
        }));
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator, () => reader, () => asProcessManager(processManager), fileAdapter
        );
        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await waitForCondition('validation output read', () => readOutput.mock.calls.length === 1);
        await prevalidator.cancel();
        completeRead?.('ctrace-run:\n  ctrace-refs:\n    - ref: data#0\n      error: old error\n');

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
    });

    it('runs pyTS for the matching active trace configuration', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME))
            .resolves.toEqual({ status: 'passed' });

        expect(reader.parse).toHaveBeenCalledWith(expect.toEqualFsPath(CBUILD_RUN_FILE_NAME));
        expect(locator.getCTraceUriFromCBuildRunUri).toHaveBeenCalledWith(
            vscode.Uri.file(CBUILD_RUN_FILE_NAME),
            '<default>'
        );
        expect(processManager.launch).toHaveBeenCalledWith({
            cbuildRunFilePath: expect.toEqualFsPath(CBUILD_RUN_FILE_NAME)
        });
    });

    it.each([
        { exitCode: 7, exitDescription: '7' },
        { exitCode: null, exitDescription: 'null' }
    ])('reports a pyTS exit code of $exitDescription as failed', async ({ exitCode, exitDescription }) => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        processManager.waitForExit.mockResolvedValue(exitCode);
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: `pyTS validation exited with code ${exitDescription}.`
        });
        expect(error).toHaveBeenCalledWith(`Trace Configuration: pyTS validation exited with code ${exitDescription}.`);
    });

    it('reports pyTS launch failures as failed', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        const launchError = new Error('spawn failed');
        processManager.launch.mockRejectedValue(launchError);
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            fileAdapter
        );

        await expect(prevalidator.validate(CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'failed',
            message: 'spawn failed'
        });
        expect(error).toHaveBeenCalledWith('Trace Configuration: Failed to run pyTS validation:', launchError);
    });

    it('fails closed when the selected file is not the active pyTS input', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            fileAdapter
        );

        await expect(prevalidator.validate(OTHER_CTRACE_FILE_NAME)).resolves.toEqual({
            status: 'unavailable',
            message: `The selected trace configuration is not the active pyTS input. Expected ${CTRACE_FILE_NAME}.`
        });
        expect(processManager.launch).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('pyTS validation unavailable'));
    });

    it('does not launch after cancellation during cbuild-run discovery', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
        let completeDiscovery: ((fileName: string) => void) | undefined;
        jest.spyOn(locator, 'getCBuildRunFileName').mockImplementationOnce(() => new Promise(resolve => {
            completeDiscovery = resolve;
        }));
        const prevalidator = new PyTsTraceConfigurationPrevalidator(
            locator,
            () => reader,
            () => asProcessManager(processManager),
            fileAdapter
        );

        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await prevalidator.cancel();
        completeDiscovery?.(CBUILD_RUN_FILE_NAME);

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(processManager.launch).not.toHaveBeenCalled();
    });

    it('stops the active pyTS process when cancelled', async () => {
        const { locator, reader, processManager, fileAdapter } = createDependencies();
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
            () => asProcessManager(processManager),
            fileAdapter
        );
        const validation = prevalidator.validate(CTRACE_FILE_NAME);
        await waitForCondition('pyTS validation to start', () => processManager.waitForExit.mock.calls.length > 0);

        await prevalidator.cancel();

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(processManager.stop).toHaveBeenCalledWith({ timeout: 250 });
    });
});
