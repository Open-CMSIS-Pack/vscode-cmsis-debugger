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
import { BuiltinToolPath } from '../../desktop/builtin-tool-path';

const PYTS_BUILTIN_PATH = 'tools/pyts/pyts';
const CTRACE_BUILTIN_PATH = 'tools/ctrace/ctrace';

/**
 * Registers commands related to trace functionality.
 */
export class TraceCommands {
    public static readonly CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';
    public static readonly CSOLUTION_GET_ACTIVE_TARGET_SET_COMMAND = 'cmsis-csolution.getActiveTargetSet';

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
            const builtInPyTs = new BuiltinToolPath(PYTS_BUILTIN_PATH);
            const pyTsAbsolutePath = builtInPyTs.getAbsolutePath();
            if (!pyTsAbsolutePath) {
                throw new Error('Failed to resolve the absolute path for pyTS.');
            }
            const pytsProcessManager = new PyTsProcessManager({
                cbuildRunFilePath: trimmedPath,
                pyTsPath: pyTsAbsolutePath.fsPath
            });
            pytsProcessManager.launch();
            await pytsProcessManager.waitForExit();
        } catch (error) {
            console.error('Failed to launch pyTS process:', error);
        }
    }

    protected async handleLaunchCTrace(): Promise<void> {
        try {
            const path = await vscode.commands.executeCommand<string | undefined>(TraceCommands.CSOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
            const trimmedPath = path?.trim();
            if (!trimmedPath) {
                throw new Error('No cbuild run file path provided.');
            }
            const solutionMatches = trimmedPath.match(/.*[\\/](.*)\+.*\.cbuild-run\.yml$/);
            const solutionName = solutionMatches?.[1];
            if (!solutionName) {
                throw new Error('Failed to extract solution name from cbuild run file path.');
            }
            const activeSet = await vscode.commands.executeCommand<string | undefined>(TraceCommands.CSOLUTION_GET_ACTIVE_TARGET_SET_COMMAND);
            const trimmedActiveSet = activeSet?.trim();
            const targetSet = trimmedActiveSet ? `+${trimmedActiveSet}` : '';
            const workspacePath = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
            const rawFilePath = `${workspacePath}/.trace/${solutionName}${targetSet}.SWO.raw`;
            const builtInCTrace = new BuiltinToolPath(CTRACE_BUILTIN_PATH);
            const cTraceAbsolutePath = builtInCTrace.getAbsolutePath();
            if (!cTraceAbsolutePath) {
                throw new Error('Failed to resolve the absolute path for ctrace.');
            }
            const ctraceProcessManager = new CTraceProcessManager({
                rawFilePath,
                cTracePath: cTraceAbsolutePath.fsPath
            });
            ctraceProcessManager.launch();
            await ctraceProcessManager.waitForExit();
        } catch (error) {
            console.error('Failed to launch ctrace process:', error);
        }
    }

}
