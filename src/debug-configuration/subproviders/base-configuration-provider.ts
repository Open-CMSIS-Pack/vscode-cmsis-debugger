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
import { ExtendedGDBTargetConfiguration, GDBTargetConfiguration } from '../gdbtarget-configuration';
import { CbuildRunReader } from '../../cbuild-run';
import { logger } from '../../logger';
import { extractPname } from '../../utils';

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

    protected resolveSvdFile(debugConfiguration: GDBTargetConfiguration, pname?: string) {
        const extDebugConfig = debugConfiguration as ExtendedGDBTargetConfiguration;
        const cbuildRunFilePath = debugConfiguration.cmsis?.cbuildRunFile;
        // 'definitionPath' is current default name for SVD file settings in Eclipse CDT Cloud Peripheral Inspector.
        if (extDebugConfig.definitionPath !== undefined || !cbuildRunFilePath?.length) {
            return;
        }
        const svdFilePaths = this.cbuildRunReader.getSvdFilePaths(debugConfiguration?.target?.environment?.CMSIS_PACK_ROOT, pname);
        if (!svdFilePaths.length) {
            // No SVD file found for config
            return;
        }
        // Only one SVD file per pname should be left, log a warning if more
        if (svdFilePaths.length > 1) {
            let message = 'Found more than one SVD file';
            if (pname) {
                message += ` for Pname '${pname}'`;
            }
            message += ', using first';
            logger.warn(message);
        }
        extDebugConfig.definitionPath = svdFilePaths[0];
    }

    protected extractPnameFromDebugConfig(debugConfiguration: GDBTargetConfiguration): string | undefined {
        const pnames = this.cbuildRunReader.getPnames();
        if (!pnames.length) {
            return undefined;
        }
        return extractPname(debugConfiguration.name, pnames);
    }

    protected abstract resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration>;

    public async resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        await this.parseCbuildRunFile(debugConfiguration);
        this.resolveSvdFile(debugConfiguration, this.extractPnameFromDebugConfig(debugConfiguration));
        return this.resolveServerParameters(debugConfiguration);
    }

}
