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

import { CbuildRunReader, CBuildRunFileLocator } from '../../cbuild-run';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { logger } from '../../logger';
import { waitForCondition } from '../../utils';
import { PyTsTraceConfigurationPrevalidator } from './trace-configuration-prevalidator';

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

function createDependencies(): {
    locator: CBuildRunFileLocator;
    reader: CbuildRunReader;
    processManager: FakeProcessManager;
    } {
    const locator = new CBuildRunFileLocator();
    jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue('/workspace/out/project+target.cbuild-run.yml');
    jest.spyOn(locator, 'getCTraceUriFromCBuildRunUri')
        .mockResolvedValue(vscode.Uri.file('/workspace/.cmsis/project+target.ctrace.yml'));
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

        await expect(prevalidator.validate('/workspace/.cmsis/project+target.ctrace.yml'))
            .resolves.toEqual({ status: 'passed' });

        expect(reader.parse).toHaveBeenCalledWith('/workspace/out/project+target.cbuild-run.yml');
        expect(locator.getCTraceUriFromCBuildRunUri).toHaveBeenCalledWith(
            vscode.Uri.file('/workspace/out/project+target.cbuild-run.yml'),
            '<default>'
        );
        expect(processManager.launch).toHaveBeenCalledWith({
            cbuildRunFilePath: '/workspace/out/project+target.cbuild-run.yml'
        });
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

        await expect(prevalidator.validate('/workspace/.cmsis/project+target.ctrace.yml')).resolves.toEqual({
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

        await expect(prevalidator.validate('/workspace/.cmsis/project+target.ctrace.yml')).resolves.toEqual({
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

        await expect(prevalidator.validate('/workspace/.cmsis/other.ctrace.yml')).resolves.toEqual({
            status: 'unavailable',
            message: 'The selected trace configuration is not the active pyTS input. Expected /workspace/.cmsis/project+target.ctrace.yml.'
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

        const validation = prevalidator.validate('/workspace/.cmsis/project+target.ctrace.yml');
        await prevalidator.cancel();
        completeDiscovery?.('/workspace/out/project+target.cbuild-run.yml');

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
        const validation = prevalidator.validate('/workspace/.cmsis/project+target.ctrace.yml');
        await waitForCondition('pyTS validation to start', () => processManager.waitForExit.mock.calls.length > 0);

        await prevalidator.cancel();

        await expect(validation).resolves.toEqual({ status: 'cancelled' });
        expect(processManager.stop).toHaveBeenCalledWith({ timeout: 250 });
    });
});
