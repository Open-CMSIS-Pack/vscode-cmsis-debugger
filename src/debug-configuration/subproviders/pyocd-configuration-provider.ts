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
import { GDBTargetConfiguration, TargetConfiguration } from '../gdbtarget-configuration';
import { BuiltinToolPath } from '../../desktop/builtin-tool-path';
import { BaseConfigurationProvider } from './base-configuration-provider';

const PYOCD_BUILTIN_PATH = 'tools/pyocd/pyocd';
const PYOCD_EXECUTABLE_ONLY_REGEXP = /^\s*pyocd(|.exe)\s*$/i;
export const PYOCD_SERVER_TYPE_REGEXP = /.*pyocd(|.exe)\s*$/i;

const PYOCD_CLI_ARG_PORT = '--port';

export class PyocdConfigurationProvider extends BaseConfigurationProvider {
    protected builtinPyocd = new BuiltinToolPath(PYOCD_BUILTIN_PATH);

    protected resolveServerPath(target: TargetConfiguration): void {
        const targetServer = target.server;
        const useBuiltin = !targetServer || PYOCD_EXECUTABLE_ONLY_REGEXP.test(targetServer);
        const builtinUri = useBuiltin ? this.builtinPyocd.getAbsolutePath() : undefined;
        if (builtinUri) {
            target.server = builtinUri.fsPath;
        }
    }

    protected async resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration> {
        logger.debug('Resolving pyOCD server parameters');
        if (!debugConfiguration.target) {
            return debugConfiguration;
        }
        // server
        this.resolveServerPath(debugConfiguration.target);
        // serverParameters
        const parameters = debugConfiguration.target.serverParameters ??= [];
        // gdbserver
        if (await this.shouldAppendParam(parameters, 'gdbserver')) {
            // Prepend, it must be the first argument
            parameters.unshift('gdbserver');
        }
        // port (use value defined in 'port' outside 'serverParamters')
        const port = debugConfiguration.target?.port;
        if (port && await this.shouldAppendParam(parameters, PYOCD_CLI_ARG_PORT)) {
            parameters.push(PYOCD_CLI_ARG_PORT);
            parameters.push(`${port}`);
        }
        // cbuild-run
        const cbuildRunFile = debugConfiguration.cmsis?.cbuildRunFile;
        if (cbuildRunFile && await this.shouldAppendParam(parameters, '--cbuild-run')) {
            parameters.push('--cbuild-run');
            parameters.push(`${cbuildRunFile}`);
        }
        return debugConfiguration;
    }

}
