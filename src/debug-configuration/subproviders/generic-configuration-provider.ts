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
import { getCmsisPackRootPath } from '../../utils';
import { logger } from '../../logger';

export class GenericConfigurationProvider extends BaseConfigurationProvider {

    protected resolveCmsisPackRootPath(target: TargetConfiguration): void {
        if (target.environment?.CMSIS_PACK_ROOT) {
            return;
        }

        target.environment ??= {};
        target.environment.CMSIS_PACK_ROOT = getCmsisPackRootPath();
    }

    protected async resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration> {
        logger.debug('Resolving generic server parameters');
        if (!debugConfiguration.target) {
            return debugConfiguration;
        }
        // CMSIS_PACK_ROOT
        this.resolveCmsisPackRootPath(debugConfiguration.target);
        return debugConfiguration;
    }

}
