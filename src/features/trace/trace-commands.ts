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

import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../../manifest';
import { PyTsProcessManager } from '../../desktop/process/pyts-process-manager';
import { CTraceProcessManager } from '../../desktop/process/ctrace-process-manager';

/**
 * Registers commands related to trace functionality.
 */
export class TraceCommands {
    public static readonly CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';

    public static readonly launchPyTsID = `${EXTENSION_NAME}.launchPyTs`;
    public static readonly launchCTraceID = `${EXTENSION_NAME}.launchCTrace`;

    public activate(context: vscode.ExtensionContext): void {
        // Register trace commands
        context.subscriptions.push(
            vscode.commands.registerCommand(TraceCommands.launchPyTsID, () => this.handleLaunchPyTs()),
            vscode.commands.registerCommand(TraceCommands.launchCTraceID, () => this.handleLaunchCTrace()),
        );
    }

    protected async handleLaunchPyTs(): Promise<void> {
        try {
            const path = await vscode.commands.executeCommand<string | undefined>(TraceCommands.CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
            const trimmedPath = path?.trim();
            if (!trimmedPath) {
                throw new Error('No cbuild run file path provided.');
            }
            const pytsProcessManager = new PyTsProcessManager({ cbuildRunFilePath: trimmedPath });
            pytsProcessManager.launch();
            await pytsProcessManager.waitForExit();
        } catch (error) {
            console.error('Failed to launch pyTS process:', error);
        }
    }

    protected async handleLaunchCTrace(): Promise<void> {
        const ctraceProcessManager = new CTraceProcessManager({});
        try {
            ctraceProcessManager.launch();
            await ctraceProcessManager.waitForExit();
        } catch (error) {
            console.error('Failed to launch ctrace process:', error);
        }
    }

}
