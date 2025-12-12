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

import { BaseConfigurationProvider } from './base-configuration-provider';
import { GDBTargetConfiguration, TargetConfiguration } from '../gdbtarget-configuration';
import { BuiltinToolPath } from '../../desktop/builtin-tool-path';
import { getCmsisPackRootPath } from '../../utils';
import { logger } from '../../logger';
import { resolveToolPath } from '../../desktop/tool-path-utils';

const PYOCD_NAME = 'pyocd';
const PYOCD_BUILTIN_PATH = 'tools/pyocd/pyocd';
const PYOCD_EXECUTABLE_ONLY_REGEXP = /^\s*pyocd(|.exe)\s*$/i;
export const PYOCD_SERVER_TYPE_REGEXP = /.*pyocd(|.exe)\s*$/i;

const PYOCD_CLI_ARG_GDBSERVER = 'gdbserver';
const PYOCD_CLI_ARG_CBUILDRUN = '--cbuild-run';

export class PyocdConfigurationProvider extends BaseConfigurationProvider {
    protected builtinPyocd = new BuiltinToolPath(PYOCD_BUILTIN_PATH);

    protected resolveCmsisPackRootPath(target: TargetConfiguration): void {
        if (target.environment?.CMSIS_PACK_ROOT) {
            return;
        }

        target.environment ??= {};
        target.environment.CMSIS_PACK_ROOT = getCmsisPackRootPath();
    }

    protected async resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration> {
        logger.debug('Resolving pyOCD server parameters');
        if (!debugConfiguration.target) {
            return debugConfiguration;
        }
        // server
        debugConfiguration.target.server = resolveToolPath(debugConfiguration.target.server, PYOCD_NAME, PYOCD_EXECUTABLE_ONLY_REGEXP, this.builtinPyocd);
        // serverParameters
        debugConfiguration.target.serverParameters ??= [];
        const parameters = debugConfiguration.target.serverParameters;
        // gdbserver
        if (await this.shouldAppendParameter(parameters, PYOCD_CLI_ARG_GDBSERVER)) {
            // Prepend, it must be the first argument
            parameters.unshift(PYOCD_CLI_ARG_GDBSERVER);
        }
        // cbuild-run
        const cbuildRunFile = debugConfiguration.cmsis?.cbuildRunFile;
        if (cbuildRunFile && await this.shouldAppendParameter(parameters, PYOCD_CLI_ARG_CBUILDRUN)) {
            parameters.push(PYOCD_CLI_ARG_CBUILDRUN, `${cbuildRunFile}`);
        }
        // CMSIS_PACK_ROOT
        this.resolveCmsisPackRootPath(debugConfiguration.target);
        return debugConfiguration;
    }

}
