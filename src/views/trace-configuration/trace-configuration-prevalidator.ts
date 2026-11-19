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
import { normalizeFsPath } from '../../utils';
import { CTraceRunValidationMessageReader } from './ctrace-run-validation-message-reader';
import { getTraceConfigurationArtifactFileNames } from './trace-configuration-file-names';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

/** Maximum time to wait for a cancelled validator process to stop, in milliseconds. */
const PYTS_STOP_TIMEOUT_MS = 250;

export type TraceConfigurationPrevalidationResult =
    | { status: 'passed' }
    | { status: 'failed'; message: string }
    | { status: 'unavailable'; message: string }
    | { status: 'cancelled' };

export interface TraceConfigurationPrevalidator {
    validate(fileName: string): Promise<TraceConfigurationPrevalidationResult>;
    cancel(): Promise<void>;
}

type CbuildRunReaderFactory = () => CbuildRunReader;
type PyTsProcessManagerFactory = () => PyTsProcessManager;

/**
 * Runs pyTS after confirming that the active cbuild-run file exists and the
 * edited ctrace file is the input pyTS will derive from that build context.
 * Each cancellation advances a generation so asynchronous path discovery can
 * never launch or publish a result for an obsolete edit.
 */
export class PyTsTraceConfigurationPrevalidator implements TraceConfigurationPrevalidator {
    private generation = 0;
    private activeProcess: PyTsProcessManager | undefined;

    /** Injects build discovery, process creation, and the validation output filesystem. */
    public constructor(
        private readonly cbuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cbuildRunReaderFactory: CbuildRunReaderFactory = () => new CbuildRunReader(),
        private readonly processManagerFactory: PyTsProcessManagerFactory = () => new PyTsProcessManager(),
        private readonly fileAdapter = new WorkspaceTextFileAdapter()
    ) {}

    /** Validates the recovery input and reports generated diagnostics for the current edit. */
    public async validate(fileName: string): Promise<TraceConfigurationPrevalidationResult> {
        const generation = ++this.generation;
        try {
            const discoveredCbuildRunFilePath = await this.cbuildRunFileLocator.getCBuildRunFileName(undefined, true);
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            const cbuildRunFilePath = discoveredCbuildRunFilePath?.trim();
            const cbuildRunFileStat = cbuildRunFilePath
                ? await this.fileAdapter.stat(cbuildRunFilePath)
                : undefined;
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            if (!cbuildRunFilePath || !cbuildRunFileStat) {
                const message = 'The required cbuild-run file does not exist.';
                logger.error(`Trace Configuration: ${message}`);
                return { status: 'failed', message };
            }

            const reader = this.cbuildRunReaderFactory();
            await reader.parse(cbuildRunFilePath);
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            const expectedCTraceUri = await this.cbuildRunFileLocator.getCTraceUriFromCBuildRunUri(
                vscode.Uri.file(cbuildRunFilePath),
                reader.getTargetSet()
            );
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            if (normalizeFsPath(expectedCTraceUri.fsPath) !== normalizeFsPath(fileName)) {
                return this.unavailable(
                    `The selected trace configuration is not the active pyTS input. Expected ${expectedCTraceUri.fsPath}.`
                );
            }

            const outputFileName = getTraceConfigurationArtifactFileNames(fileName).backupCTraceRunFileName;
            await this.fileAdapter.deleteTextFile(outputFileName);
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }

            const processManager = this.processManagerFactory();
            this.activeProcess = processManager;
            await processManager.launch({ cbuildRunFilePath });
            if (!this.isCurrent(generation)) {
                await this.stopProcess(processManager);
                return { status: 'cancelled' };
            }

            const exitCode = await processManager.waitForExit();
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            if (exitCode === 0) {
                return { status: 'passed' };
            }
            const diagnostic = await this.readFailureMessage(outputFileName);
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            const message = diagnostic ?? `pyTS validation exited with code ${exitCode ?? 'null'}.`;
            logger.error(`Trace Configuration: ${message}`);
            return { status: 'failed', message };
        } catch (error) {
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            const message = this.errorToString(error);
            logger.error('Trace Configuration: Failed to run pyTS validation:', error);
            return { status: 'failed', message };
        } finally {
            if (this.isCurrent(generation)) {
                this.activeProcess = undefined;
            }
        }
    }

    /** Reads the first generated error, retaining the exit-code fallback for absent or invalid output. */
    private async readFailureMessage(fileName: string): Promise<string | undefined> {
        try {
            const reader = new CTraceRunValidationMessageReader(this.fileAdapter);
            const messages = await reader.readIfExists(fileName);
            return messages?.find(message => message.severity === 'error')?.message;
        } catch (error) {
            logger.error('Trace Configuration: Failed to read pyTS validation output:', error);
            return undefined;
        }
    }

    /** Invalidates pending results and stops the active validation process. */
    public async cancel(): Promise<void> {
        this.generation += 1;
        const activeProcess = this.activeProcess;
        this.activeProcess = undefined;
        if (activeProcess) {
            await this.stopProcess(activeProcess);
        }
    }

    /** Checks whether asynchronous work still belongs to the latest edit. */
    private isCurrent(generation: number): boolean {
        return generation === this.generation;
    }

    /** Logs and returns a reason validation cannot be started. */
    private unavailable(message: string): TraceConfigurationPrevalidationResult {
        logger.error(`Trace Configuration: pyTS validation unavailable: ${message}`);
        return { status: 'unavailable', message };
    }

    /** Stops a validator using the bounded cancellation timeout. */
    private async stopProcess(processManager: PyTsProcessManager): Promise<void> {
        await processManager.stop({ timeout: PYTS_STOP_TIMEOUT_MS });
    }

    /** Converts process and discovery failures into displayable text. */
    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
