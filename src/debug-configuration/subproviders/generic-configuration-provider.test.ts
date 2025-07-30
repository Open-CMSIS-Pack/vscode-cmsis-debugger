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

import { gdbTargetConfiguration, targetConfigurationFactory } from '../debug-configuration.factory';
import { GenericConfigurationProvider } from './generic-configuration-provider';

describe('GenericConfigurationProvider', () => {

    describe('resolveDebugConfigurationWithSubstitutedVariables', () => {

        it('adds gdbserver to minimal configuration serverParameters', async () => {
            const configProvider = new GenericConfigurationProvider();
            const config = gdbTargetConfiguration({
                target: targetConfigurationFactory(),
            });
            const debugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config, undefined);
            expect(debugConfig).toBeDefined();
        });
    });

});
