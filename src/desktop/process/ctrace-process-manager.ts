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
    ProcessManagerLaunchOptions,
    ProcessManagerOptions
} from './process-manager';
import { FileLocationManager } from '../../utils';

export const DEFAULT_CTRACE_PATH = 'tools/ctrace/ctrace';

export interface CTraceProcessManagerOptions {
    readonly cTracePath?: string;
}

export interface CTraceProcessManagerLaunchOptions extends ProcessManagerLaunchOptions {
    readonly traceDir?: string | undefined;
    readonly solutionSet?: string | undefined;
    readonly cbuildRunFilePath?: string | undefined;
}

export class CTraceProcessManager extends ProcessManager {
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
        super(processOptions);
    }

    public override async launch(options: CTraceProcessManagerLaunchOptions = {}): Promise<void> {
        const workspacePath = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
        if (!workspacePath) {
            throw new Error('No workspace folder is open.');
        }
        const locationManager = new FileLocationManager();
        const args = options.args ?? [
            options.traceDir ?? path.join(workspacePath, '.trace'),
            '-t', options.solutionSet ?? await locationManager.getDefaultSolutionSet(options.cbuildRunFilePath),
            '--csv'
        ];
        super.launch({
            ...options,
            args
        });
    }

}
