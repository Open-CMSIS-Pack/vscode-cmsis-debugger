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
import {
    PYOCD_SERVER_TYPE_REGEXP,
    PyocdConfigurationProvider,
    JLINK_SERVER_TYPE_REGEXP,
    JlinkConfigurationProvider
} from './subproviders';

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';

export interface GDBTargetConfigurationSubProvider {
    serverRegExp: RegExp;
    provider: vscode.DebugConfigurationProvider;
}

type ResolverType = 'resolveDebugConfiguration' | 'resolveDebugConfigurationWithSubstitutedVariables';

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

    private isRelevantSubprovider(resolverType: ResolverType, serverType: string, subProvider: GDBTargetConfigurationSubProvider): boolean {
        const serverTypeMatch = subProvider.serverRegExp.test(serverType);
        const hasResolverFunction = !!subProvider.provider[resolverType];
        return serverTypeMatch && hasResolverFunction;
    }

    private getRelevantSubproviders(resolverType: ResolverType, serverType?: string): GDBTargetConfigurationSubProvider[] {
        if (!serverType) {
            return [];
        }
        return this.subProviders.filter(subProvider => this.isRelevantSubprovider(resolverType, serverType, subProvider));
    }

    private getRelevantSubprovider(resolverType: ResolverType, serverType?: string): GDBTargetConfigurationSubProvider | undefined {
        const subproviders = this.getRelevantSubproviders(resolverType, serverType);
        if (!subproviders.length) {
            logger.debug('No relevant configuration subproviders found');
            return undefined;
        }
        if (subproviders.length > 1) {
            logger.warn('Multiple configuration subproviders detected. Using first in list:');
            subproviders.forEach((subprovider, index) => logger.warn(`#${index}: '${subprovider.serverRegExp}'`));
        }
        return subproviders[0];
    }

    private async resolveDebugConfigurationByResolverType(
        resolverType: ResolverType,
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        logger.debug(`${resolverType}: Check for relevant configuration subproviders`);
        const gdbTargetConfig: GDBTargetConfiguration = debugConfiguration;
        const gdbServerType = gdbTargetConfig.target?.server;
        const subprovider = this.getRelevantSubprovider(resolverType, gdbServerType);
        if (!subprovider) {
            return debugConfiguration;
        }
        if (!subprovider.provider[resolverType]) {
            logger.debug(`${resolverType}: Subprovider '${subprovider.serverRegExp}' does not implement '${resolverType}'.`);
            return debugConfiguration;
        }
        logger.debug(`${resolverType}: Resolve config with subprovider '${subprovider.serverRegExp}'`);
        logger.debug(`${resolverType}: original config:`);
        logger.debug(JSON.stringify(debugConfiguration));
        const resolvedConfig = await subprovider.provider[resolverType](folder, debugConfiguration, token);
        if (!resolvedConfig) {
            logger.error(`${resolverType}: Resolving config failed with subprovider '${subprovider.serverRegExp}'`);
        }
        logger.debug(`${resolverType}: resolved config:`);
        logger.debug(JSON.stringify(resolvedConfig));
        logger.debug(`${resolverType}: expected server command line:`);
        const resolvedGDBConfig = resolvedConfig as GDBTargetConfiguration;
        logger.debug(`${resolvedGDBConfig.target?.server} ${resolvedGDBConfig.target?.serverParameters?.join(' ')}`);
        return resolvedConfig;
    }

    public resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        return this.resolveDebugConfigurationByResolverType('resolveDebugConfiguration', folder, debugConfiguration, token);
    }

    public resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        return this.resolveDebugConfigurationByResolverType('resolveDebugConfigurationWithSubstitutedVariables', folder, debugConfiguration, token);
    }
}
