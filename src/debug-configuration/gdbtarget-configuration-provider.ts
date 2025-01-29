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
import { PYOCD_SERVER_TYPE_REGEXP, PyocdConfigurationProvider } from './pyocd-configuration-provider';
import { JLINK_SERVER_TYPE_REGEXP, JlinkConfigurationProvider } from './jlink-configuration-provider';

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';

export interface GDBTargetConfigurationSubProvider {
    serverRegExp: RegExp;
    provider: vscode.DebugConfigurationProvider;
}

const SUPPORTED_SUBPROVIDERS: GDBTargetConfigurationSubProvider[] = [
    { serverRegExp: PYOCD_SERVER_TYPE_REGEXP, provider: new PyocdConfigurationProvider() },
    { serverRegExp: JLINK_SERVER_TYPE_REGEXP, provider: new JlinkConfigurationProvider() },
];


export class GDBTargetConfigurationProvider implements vscode.DebugConfigurationProvider {

    public constructor(
        protected subProviders: GDBTargetConfigurationSubProvider[] = SUPPORTED_SUBPROVIDERS
    ) {}

    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(GDB_TARGET_DEBUGGER_TYPE, this)
        );
    }

    private isRelevantSubprovider(serverType: string, subProvider: GDBTargetConfigurationSubProvider): boolean {
        const serverTypeMatch = subProvider.serverRegExp.test(serverType);
        const hasResolverFunction = !!subProvider.provider.resolveDebugConfigurationWithSubstitutedVariables;
        return serverTypeMatch && hasResolverFunction;
    }

    private getRelevantSubproviders(serverType?: string): GDBTargetConfigurationSubProvider[] {
        if (!serverType) {
            return [];
        }
        return this.subProviders.filter(subProvider => this.isRelevantSubprovider(serverType, subProvider));
    }

    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        logger.debug('Check for relevant configuration subproviders');
        const gdbTargetConfig: GDBTargetConfiguration = debugConfiguration;
        const gdbServerType = gdbTargetConfig.target?.server;
        const relevantSubProviders = this.getRelevantSubproviders(gdbServerType);
        if (!relevantSubProviders.length) {
            logger.debug('No relevant configuration subproviders found');
            return debugConfiguration;
        }

        logger.debug('Resolve config for relevant subproviders');
        const resolvedConfigPromises = relevantSubProviders.map(async (subProvider) => subProvider.provider.resolveDebugConfigurationWithSubstitutedVariables!(folder, debugConfiguration, token));
        const resolvedConfigs = await Promise.all(resolvedConfigPromises);
        const firstFailed = resolvedConfigs.findIndex(config => !config);
        if (firstFailed !== -1) {
            logger.error(`Resolving config failed for subprovider '${relevantSubProviders[firstFailed].serverRegExp}'`);
            return resolvedConfigs[firstFailed];
        }
        logger.debug('Merging resolved configs from all configuration subproviders');
        const resolvedDebugConfiguration = resolvedConfigs.reduce((acc, config) => acc = Object.assign(acc ?? {}, config));
        return resolvedDebugConfiguration;
    }

}
