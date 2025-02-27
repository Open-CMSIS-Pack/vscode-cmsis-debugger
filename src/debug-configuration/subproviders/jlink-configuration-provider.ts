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

import { logger } from '../../logger';
import { BaseConfigurationProvider } from './base-configuration-provider';
import { GDBTargetConfiguration } from '../gdbtarget-configuration';

export const JLINK_SERVER_TYPE_REGEXP = /.*JLinkGDBServer(|CL)(|.exe|Exe)\s*$/i;

const JLINK_CLI_ARG_PORT = '-port';

export class JlinkConfigurationProvider extends BaseConfigurationProvider {

    protected async resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration> {
        logger.debug('Resolving J-Link GDB server parameters');
        if (!debugConfiguration.target) {
            return debugConfiguration;
        }
        // serverParameters
        debugConfiguration.target.serverParameters ??= [];
        const parameters = debugConfiguration.target.serverParameters;
        // port (use value defined in 'port' outside 'serverParamters')
        const port = debugConfiguration.target?.port;
        if (port && await this.shouldAppendParameter(parameters, JLINK_CLI_ARG_PORT)) {
            parameters.push(JLINK_CLI_ARG_PORT, `${port}`);
        }
        return debugConfiguration;
    }

}
