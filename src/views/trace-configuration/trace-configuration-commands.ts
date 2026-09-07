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

import { EXTENSION_NAME } from '../../manifest';
import { logger } from '../../logger';
import { FileLocationManager } from '../../utils';
import { TraceConfigurationGeneratedCTraceFileManager } from './trace-configuration-generated-ctrace-file-manager';

type CBuildRunFileLocator = Pick<FileLocationManager, 'getCBuildRunFileName'>;
type DefaultCTraceFileCreator = Pick<TraceConfigurationGeneratedCTraceFileManager, 'createDefaultCTraceFile'>;

/**
 * TraceConfigurationCommands owns command-palette actions related to generated
 * trace configuration files.
 */
export class TraceConfigurationCommands {
    public static readonly generateDefaultCtraceFileId = `${EXTENSION_NAME}.generateDefaultCTraceFile`;

    public constructor(
        private readonly fileLocationManager: CBuildRunFileLocator = new FileLocationManager(),
        private readonly generatedCTraceFileManager: DefaultCTraceFileCreator = new TraceConfigurationGeneratedCTraceFileManager()
    ) {}

    public activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            TraceConfigurationCommands.generateDefaultCtraceFileId,
            () => this.generateDefaultCtraceFile()
        ));
    }

    private async generateDefaultCtraceFile(): Promise<void> {
        const cbuildRunFileName = await this.fileLocationManager.getCBuildRunFileName();
        if (!cbuildRunFileName) {
            await vscode.window.showErrorMessage(
                'No active cbuild-run file was found. Generate the project and try again.'
            );
            return;
        }

        try {
            const traceFile = await this.generatedCTraceFileManager.createDefaultCTraceFile(
                vscode.Uri.file(cbuildRunFileName)
            );
            if (!traceFile) {
                await vscode.window.showInformationMessage(
                    'Trace configuration was not generated because tracing is set to off.'
                );
                return;
            }
            await vscode.window.showInformationMessage(
                `Default trace configuration generated at ${traceFile.fsPath}.`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Trace Configuration: Failed to generate default trace configuration: ${errorMessage}`);
            await vscode.window.showErrorMessage(`Failed to generate default trace configuration: ${errorMessage}`);
        }
    }
}
