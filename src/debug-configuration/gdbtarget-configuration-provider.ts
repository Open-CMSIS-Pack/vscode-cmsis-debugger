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
import { logger } from '../logger';
import { GDBTargetConfiguration } from './gdbtarget-configuration';

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';

export interface GDBTargetConfigurationSubProvider {
    serverType: string;
    provider: vscode.DebugConfigurationProvider;
    triggerKind?: vscode.DebugConfigurationProviderTriggerKind;
}

export class GDBTargetConfigurationProvider implements vscode.DebugConfigurationProvider {

    public constructor(
        protected subProviders: GDBTargetConfigurationSubProvider[] = []
    ) {}

    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(GDB_TARGET_DEBUGGER_TYPE, this)
        );
    }

    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        logger.warn('Check for relevant configuration subproviders');
        const gdbTargetConfig: GDBTargetConfiguration = debugConfiguration;
        const relevantSubProviders = this.subProviders.filter(subProvider => gdbTargetConfig.target?.server === subProvider.serverType && subProvider.provider.resolveDebugConfigurationWithSubstitutedVariables);
        if (relevantSubProviders.length === 0) {
            logger.warn('No relevant configuration subproviders found');
            return debugConfiguration;
        }

        logger.warn('Apply resolveDebugConfigurationWithSubstitutedVariables from all configuration subproviders');
        const resolvedConfigPromises = relevantSubProviders.map(async (subProvider) => subProvider.provider.resolveDebugConfigurationWithSubstitutedVariables!(folder, debugConfiguration, token));
        const resolvedConfigs = await Promise.all(resolvedConfigPromises);
        const firstFailed = resolvedConfigs.findIndex(config => !config);
        if (firstFailed !== -1) {
            logger.warn(`Call to resolveDebugConfigurationWithSubstitutedVariables of configuration subprovider '${relevantSubProviders[firstFailed].serverType}'failed`);
            return resolvedConfigs[firstFailed];
        }
        logger.warn('Merging results from resolveDebugConfigurationWithSubstitutedVariables call of all configuration subproviders');
        const resolvedDebugConfiguration = resolvedConfigs.reduce((acc, config) => acc = Object.assign(acc ?? {}, config));
        return resolvedDebugConfiguration;
    }

}
