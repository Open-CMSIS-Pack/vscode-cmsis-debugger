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
import { ExtendedGDBTargetConfiguration } from '../gdbtarget-configuration';
import { GenericConfigurationProvider } from './generic-configuration-provider';

const TEST_CBUILD_RUN_FILE = 'test-data/multi-core.cbuild-run.yml'; // Relative to repo root

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

        it.each([
            { info: 'no pname', pname: undefined, expectedSvdPath: '/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core0.svd' },
            { info: 'no pname', pname: 'Core0', expectedSvdPath: '/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core0.svd' },
            { info: 'no pname', pname: 'Core1', expectedSvdPath: '/MyVendor/MyDevice/1.0.0/Debug/SVD/MyDevice_Core1.svd' },
        ])('parses a cbuild-run file and returns pname and svd file paths ($info)', async ({ pname, expectedSvdPath }) => {
            const configProvider = new GenericConfigurationProvider();
            const config = gdbTargetConfiguration({
                name: `${pname} probe@gdbserver (launch)`,
                target: targetConfigurationFactory(),
                cmsis: {
                    cbuildRunFile: TEST_CBUILD_RUN_FILE
                }
            });
            const debugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config, undefined);
            const gdbTargetConfig = debugConfig as ExtendedGDBTargetConfiguration;
            expect(gdbTargetConfig.definitionPath?.endsWith(expectedSvdPath)).toBeTruthy();
        });

    });

});
