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
import { logger } from '../../logger';
import { BuiltinToolPath } from '../builtin-tool-path';
import {
    ProcessManager,
    ProcessManagerLaunchOptions,
    ProcessManagerOptions
} from './process-manager';

export const DEFAULT_PYTS_PATH = 'tools/pyts/pyts';
const CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';

export interface PyTsProcessManagerOptions {
    readonly pyTsPath?: string;
}

export interface PyTsProcessManagerLaunchOptions extends ProcessManagerLaunchOptions {
    readonly cbuildRunFilePath?: string;
}

export class PyTsProcessManager extends ProcessManager {
    public constructor(options: PyTsProcessManagerOptions = {}) {
        const pyTsPath = options.pyTsPath ?? new BuiltinToolPath(DEFAULT_PYTS_PATH).getAbsolutePath()?.fsPath;
        if (!pyTsPath) {
            throw new Error('Failed to resolve the absolute path for pyTS.');
        }
        const processOptions: ProcessManagerOptions = {
            command: pyTsPath,
            name: 'pyTS',
            output: { append: logger.append, appendLine: logger.appendLine }
        };
        super(processOptions);
    }

    public override async launch(options: PyTsProcessManagerLaunchOptions = {}): Promise<void> {
        const args = options.args ?? await this.getDefaultArgs(options.cbuildRunFilePath);
        super.launch({
            ...options,
            args
        });
    }

    private async getDefaultArgs(cbuildRunFilePath: string | undefined): Promise<readonly string[]> {
        const resolvedCbuildRunFilePath = cbuildRunFilePath ??
            await vscode.commands.executeCommand<string | undefined>(CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
        const trimmedPath = resolvedCbuildRunFilePath?.trim();
        if (!trimmedPath) {
            throw new Error('No cbuild run file path provided.');
        }
        return [trimmedPath, '--allow-missing'];
    }
}
