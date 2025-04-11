/**
 * Copyright 2025 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode';
import { GDBTargetConfiguration } from '../gdbtarget-configuration';
import { CbuildRunReader } from '../../cbuild-run';
import { logger } from '../../logger';

const DEFAULT_SVD_SETTING_NAME = 'definitionPath';

export abstract class BaseConfigurationProvider implements vscode.DebugConfigurationProvider {
    protected _cbuildRunReader?: CbuildRunReader;

    protected get cbuildRunReader(): CbuildRunReader {
        this._cbuildRunReader ??= new CbuildRunReader();
        return this._cbuildRunReader;
    };

    protected async parseCbuildRunFile(debugConfiguration: GDBTargetConfiguration): Promise<void> {
        if (!debugConfiguration.cmsis?.cbuildRunFile?.length) {
            return;
        }
        try {
            await this.cbuildRunReader.parse(debugConfiguration.cmsis.cbuildRunFile);
        } catch (error) {
            logger.warn((error as Error).message);
        }
    }

    protected async commandExists(commandName: string): Promise<boolean> {
        const commands = await vscode.commands.getCommands();
        return !!commands.find(command => command === commandName);
    };

    protected parameterExists(name: string, params: string[]): boolean {
        return !!params.find(param => param.trim() === name);
    }

    protected async shouldAppendParameter(params: string[], paramName: string, commandName?: string): Promise<boolean> {
        return !this.parameterExists(paramName, params) && (!commandName || await this.commandExists(commandName));
    }

    protected resolveSvdFile(debugConfiguration: GDBTargetConfiguration) {
        const cbuildRunFilePath = debugConfiguration.cmsis?.cbuildRunFile;
        // 'definitionPath' is current default name for SVD file settings in Eclipse CDT Cloud Peripheral Inspector.
        if (debugConfiguration[DEFAULT_SVD_SETTING_NAME] || !cbuildRunFilePath?.length) {
            return;
        }
        const svdFilePaths = this.cbuildRunReader.getSvdFilePaths(debugConfiguration?.target?.environment?.CMSIS_PACK_ROOT);
        // Needs update when we better support multiple `debugger:` YAML nodes
        debugConfiguration[DEFAULT_SVD_SETTING_NAME] = svdFilePaths[0];
    }

    protected abstract resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration>;

    public async resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        await this.parseCbuildRunFile(debugConfiguration);
        this.resolveSvdFile(debugConfiguration);
        return this.resolveServerParameters(debugConfiguration);
    }

}
