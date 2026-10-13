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
 * Runs pyTS against the active cbuild-run file after first confirming that the
 * edited ctrace file is the input pyTS will derive from that build context.
 * Each cancellation advances a generation so asynchronous path discovery can
 * never launch or publish a result for an obsolete edit.
 */
export class PyTsTraceConfigurationPrevalidator implements TraceConfigurationPrevalidator {
    private generation = 0;
    private activeProcess: PyTsProcessManager | undefined;

    public constructor(
        private readonly cbuildRunFileLocator = new CBuildRunFileLocator(),
        private readonly cbuildRunReaderFactory: CbuildRunReaderFactory = () => new CbuildRunReader(),
        private readonly processManagerFactory: PyTsProcessManagerFactory = () => new PyTsProcessManager()
    ) {}

    public async validate(fileName: string): Promise<TraceConfigurationPrevalidationResult> {
        const generation = ++this.generation;
        try {
            const discoveredCbuildRunFilePath = await this.cbuildRunFileLocator.getCBuildRunFileName(undefined, true);
            if (!this.isCurrent(generation)) {
                return { status: 'cancelled' };
            }
            const cbuildRunFilePath = discoveredCbuildRunFilePath?.trim();
            if (!cbuildRunFilePath) {
                return this.unavailable('No active cbuild-run file is available for pyTS validation.');
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
            const message = `pyTS validation exited with code ${exitCode ?? 'null'}.`;
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

    public async cancel(): Promise<void> {
        this.generation += 1;
        const activeProcess = this.activeProcess;
        this.activeProcess = undefined;
        if (activeProcess) {
            await this.stopProcess(activeProcess);
        }
    }

    private isCurrent(generation: number): boolean {
        return generation === this.generation;
    }

    private unavailable(message: string): TraceConfigurationPrevalidationResult {
        logger.error(`Trace Configuration: pyTS validation unavailable: ${message}`);
        return { status: 'unavailable', message };
    }

    private async stopProcess(processManager: PyTsProcessManager): Promise<void> {
        await processManager.stop({ timeout: PYTS_STOP_TIMEOUT_MS });
    }

    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
