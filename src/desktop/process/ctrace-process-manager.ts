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
import { logger } from '../../logger';
import { BuiltinToolPath } from '../builtin-tool-path';
import {
    ProcessManager,
    ProcessManagerOptions
} from './process-manager';

export const DEFAULT_CTRACE_PATH = 'tools/ctrace/ctrace';
const CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';
const CSOLUTION_GET_ACTIVE_TARGET_SET_COMMAND = 'cmsis-csolution.getActiveTargetSet';

export interface CTraceProcessManagerOptions {
    readonly cTracePath?: string;
}

export interface CTraceProcessManagerLaunchOptions {
    readonly rawFilePath?: string;
}

export class CTraceProcessManager {
    private readonly processManager: ProcessManager;

    public constructor(options: CTraceProcessManagerOptions = {}) {
        const cTracePath = options.cTracePath ?? new BuiltinToolPath(DEFAULT_CTRACE_PATH).getAbsolutePath()?.fsPath;
        if (!cTracePath) {
            throw new Error('Failed to resolve the absolute path for ctrace.');
        }
        const processOptions: ProcessManagerOptions = {
            command: cTracePath,
            name: 'ctrace',
            output: { append: logger.append, appendLine: logger.appendLine }
        };
        this.processManager = new ProcessManager(processOptions);
    }

    public async launch(options: CTraceProcessManagerLaunchOptions = {}): Promise<void> {
        const rawFilePath = options.rawFilePath ?? await this.getDefaultRawFilePath();
        this.processManager.launch({
            // TODO: remove --tolerant-decode when trace generation inserts sync packets at run
            args: ['-i', rawFilePath, '--csv', '--tolerant-decode']
        });
    }

    public waitForExit(): Promise<void> {
        return this.processManager.waitForExit();
    }

    private async getDefaultRawFilePath(): Promise<string> {
        const cbuildRunFilePath = await vscode.commands.executeCommand<string | undefined>(CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
        const trimmedPath = cbuildRunFilePath?.trim();
        if (!trimmedPath) {
            throw new Error('No cbuild run file path provided.');
        }
        const solutionName = trimmedPath.match(/.*[\\/](.*)\+.*\.cbuild-run\.yml$/)?.[1];
        if (!solutionName) {
            throw new Error('Failed to extract solution name from cbuild run file path.');
        }
        const activeSet = await vscode.commands.executeCommand<string | undefined>(CSOLUTION_GET_ACTIVE_TARGET_SET_COMMAND);
        const trimmedActiveSet = activeSet?.trim();
        const targetSet = trimmedActiveSet ? `+${trimmedActiveSet}` : '';
        const workspacePath = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
        if (!workspacePath) {
            throw new Error('Failed to resolve the workspace path.');
        }
        return path.join(workspacePath, '.trace', `${solutionName}${targetSet}.SWO.raw`);
    }
}
