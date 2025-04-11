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
import { GDBTargetConfiguration } from '../gdbtarget-configuration';
import { JlinkConfigurationProvider } from './jlink-configuration-provider';

describe('JlinkConfigurationProvider', () => {

    describe('resolveDebugConfigurationWithSubstitutedVariables', () => {

        it('does not add undefined server parameters', async () => {
            const configProvider = new JlinkConfigurationProvider();
            const config = gdbTargetConfiguration({
                target: targetConfigurationFactory(),
            });
            const debugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config, undefined);
            expect(debugConfig).toBeDefined();
            const gdbtargetConfig = debugConfig as GDBTargetConfiguration;
            expect(gdbtargetConfig?.target?.serverParameters).not.toContain('-port');
        });

        it('adds port to server parameters', async () => {
            const configProvider = new JlinkConfigurationProvider();
            const config = gdbTargetConfiguration({
                target: targetConfigurationFactory({ port: '4711' }),
            });
            const debugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config, undefined);
            expect(debugConfig).toBeDefined();
            const gdbtargetConfig = debugConfig as GDBTargetConfiguration;
            expect(gdbtargetConfig?.target?.serverParameters).toContain('-port');
            expect(gdbtargetConfig?.target?.serverParameters).toContain('4711');
        });

        it('does not overwrite port in server parameters', async () => {
            const configProvider = new JlinkConfigurationProvider();
            const config = gdbTargetConfiguration({
                target: targetConfigurationFactory({
                    port: '4711',
                    serverParameters: ['-port', '10815'],
                }),
            });
            const debugConfig = await configProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config, undefined);
            expect(debugConfig).toBeDefined();
            const gdbtargetConfig = debugConfig as GDBTargetConfiguration;
            expect(gdbtargetConfig?.target?.serverParameters).toContain('-port');
            expect(gdbtargetConfig?.target?.serverParameters).toContain('10815');
        });

    });

});
