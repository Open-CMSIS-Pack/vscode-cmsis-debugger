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
import { CbuildRunType } from '../../cbuild-run/cbuild-run';
import { CbuildRunReader } from '../../cbuild-run/cbuild-run-reader';
import { getCmsisPackRootPath } from '../../desktop/cmsis-utils';

const DEFAULT_SVD_SETTING_NAME = 'definitionPath';
const CMSIS_PACK_ROOT_ENVVAR = '${CMSIS_PACK_ROOT}';

export abstract class BaseConfigurationProvider implements vscode.DebugConfigurationProvider {

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

    protected async resolveSvdFile(debugConfiguration: GDBTargetConfiguration) {
        const cbuildRunFilePath = debugConfiguration.cmsis?.cbuildRunFile;
        // 'definitionPath' is current default name for SVD file settings in Eclipse CDT Cloud Peripheral Inspector.
        if (debugConfiguration[DEFAULT_SVD_SETTING_NAME] || !cbuildRunFilePath?.length) {
            return;
        }
        const cbuildRunReader = new CbuildRunReader();
        let cbuildRunContents: CbuildRunType|undefined;
        try {
            cbuildRunContents = await cbuildRunReader.parse(cbuildRunFilePath);
        } catch {
            // Failed to read file, nothing to set
            return;
        }
        const systemDescriptions = cbuildRunContents['system-descriptions'];
        const svdFileDescriptors = systemDescriptions?.filter(descriptor => descriptor.type === 'svd') ?? [];
        if (svdFileDescriptors.length === 0) {
            return;
        }
        const cmsisPackRootValue = debugConfiguration?.target?.environment?.CMSIS_PACK_ROOT ?? getCmsisPackRootPath();
        debugConfiguration[DEFAULT_SVD_SETTING_NAME] = cmsisPackRootValue
            ? svdFileDescriptors[0].file.replaceAll(CMSIS_PACK_ROOT_ENVVAR, cmsisPackRootValue)
            : svdFileDescriptors[0].file;
    }

    protected abstract resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration>;

    public async resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        await this.resolveSvdFile(debugConfiguration);
        return this.resolveServerParameters(debugConfiguration);
    }

}
