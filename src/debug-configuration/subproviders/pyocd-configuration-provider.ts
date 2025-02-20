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
import { logger } from '../../logger';
import { GDBTargetConfiguration } from '../gdbtarget-configuration';

export const PYOCD_SERVER_TYPE_REGEXP = /.*pyocd(|.exe)\s*$/i;

export class PyocdConfigurationProvider implements vscode.DebugConfigurationProvider {

    protected async hasCommand(commandName: string): Promise<boolean> {
        const commands = await vscode.commands.getCommands();
        return !!commands.find(command => command === commandName);
    };

    protected hasParam(name: string, params: string[]): boolean {
        return !!params.find(param => param.trim() === name);
    }

    protected async shouldAppendParam(params: string[], paramName: string, commandName?: string): Promise<boolean> {
        return !this.hasParam(paramName, params) && (!commandName || await this.hasCommand(commandName));
    }

    protected async resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration> {
        if (!debugConfiguration.target) {
            return debugConfiguration;
        }
        const parameters = debugConfiguration.target.serverParameters ??= [];
        // gdbserver
        if (await this.shouldAppendParam(parameters, 'gdbserver')) {
            // Prepend, it must be the first argument
            parameters.unshift('gdbserver');
        }
        // port (use value defined in 'port' outside 'serverParamters')
        const port = debugConfiguration.target?.port;
        if (await this.shouldAppendParam(parameters, '--port') && port) {
            parameters.push('--port');
            parameters.push(`${port}`);
        }
        // cbuild-run (ToDo: comment in the code when pyOCD supports it)
        /*
        const cbuildRunFile = debugConfiguration.cmsis?.cbuildRunFile;
        if (await this.shouldAppendParam(parameters, '--cbuild-run') && cbuildRunFile) {
            parameters.push('--cbuild-run');
            parameters.push(`${cbuildRunFile}`);
        }
        */
        return debugConfiguration;
    }

    public async resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        logger.debug('Resolving pyOCD configuration');
        const resolvedConfig = await this.resolveServerParameters(debugConfiguration);
        return resolvedConfig;
    }

}
