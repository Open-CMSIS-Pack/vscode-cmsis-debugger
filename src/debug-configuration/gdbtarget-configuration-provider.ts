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
    JlinkConfigurationProvider,
    GenericConfigurationProvider
} from './subproviders';
import { BuiltinToolPath } from '../desktop/builtin-tool-path';
import { resolveToolPath } from '../desktop/tool-path-utils';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../debug-session';

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';
const ARM_NONE_EABI_GDB_NAME = 'arm-none-eabi-gdb';
const ARM_NONE_EABI_GDB_BUILTIN_PATH = 'tools/gdb/bin/arm-none-eabi-gdb';
const ARM_NONE_EABI_GDB_EXECUTABLE_ONLY_REGEXP = /^\s*arm-none-eabi-gdb(|.exe)\s*$/i;

export interface GDBTargetConfigurationSubProvider {
    serverRegExp: RegExp;
    provider: vscode.DebugConfigurationProvider;
}

type ResolverType = 'resolveDebugConfiguration' | 'resolveDebugConfigurationWithSubstitutedVariables';

const SUPPORTED_SUBPROVIDERS: GDBTargetConfigurationSubProvider[] = [
    { serverRegExp: PYOCD_SERVER_TYPE_REGEXP, provider: new PyocdConfigurationProvider() },
    { serverRegExp: JLINK_SERVER_TYPE_REGEXP, provider: new JlinkConfigurationProvider() },
];

const GENERIC_SUBPROVIDER: GDBTargetConfigurationSubProvider = { serverRegExp: /^.*/i, provider: new GenericConfigurationProvider() };


export class GDBTargetConfigurationProvider implements vscode.DebugConfigurationProvider {
    protected builtinArmNoneEabiGdb = new BuiltinToolPath(ARM_NONE_EABI_GDB_BUILTIN_PATH);
    protected activeSessions = new Set<GDBTargetDebugSession>();

    public constructor(
        protected subProviders: GDBTargetConfigurationSubProvider[] = SUPPORTED_SUBPROVIDERS
    ) {}

    public activate(context: vscode.ExtensionContext, debugTracker?: GDBTargetDebugTracker) {
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(GDB_TARGET_DEBUGGER_TYPE, this)
        );
        debugTracker?.onWillStartSession(session => this.activeSessions.add(session));
        debugTracker?.onWillStopSession(session => this.activeSessions.delete(session));
    }

    private logDebugConfiguration(resolverType: ResolverType, config: vscode.DebugConfiguration, message = '') {
        logger.debug(`${resolverType}: ${message}`);
        logger.debug(JSON.stringify(config));
    }

    private logGdbServerCommandLine(resolverType: ResolverType, config: vscode.DebugConfiguration) {
        logger.debug(`${resolverType}: GDB server command line`);
        const resolvedGDBConfig = config as GDBTargetConfiguration;
        logger.debug(`\t${resolvedGDBConfig.target?.server} ${resolvedGDBConfig.target?.serverParameters?.join(' ')}`);
    }

    private hasResolverFunction(resolverType: ResolverType, provider: vscode.DebugConfigurationProvider): boolean {
        switch (resolverType) {
            case 'resolveDebugConfiguration':
                return !!provider.resolveDebugConfiguration;
            case 'resolveDebugConfigurationWithSubstitutedVariables':
                return !!provider.resolveDebugConfigurationWithSubstitutedVariables;
        }
    }

    private isRelevantSubprovider(resolverType: ResolverType, serverType: string, subProvider: GDBTargetConfigurationSubProvider): boolean {
        const serverTypeMatch = subProvider.serverRegExp.test(serverType);
        return serverTypeMatch && this.hasResolverFunction(resolverType, subProvider.provider);
    }

    private getRelevantSubproviders(resolverType: ResolverType, serverType?: string): GDBTargetConfigurationSubProvider[] {
        if (!serverType) {
            return [];
        }
        return this.subProviders.filter(subProvider => this.isRelevantSubprovider(resolverType, serverType, subProvider));
    }

    private getRelevantSubprovider(resolverType: ResolverType, serverType?: string): GDBTargetConfigurationSubProvider | undefined {
        logger.debug(`${resolverType}: Check for relevant configuration subproviders`);
        const subproviders = this.getRelevantSubproviders(resolverType, serverType);
        if (!subproviders.length) {
            logger.debug('No relevant configuration subproviders found, using generic configuration');
            subproviders.push(GENERIC_SUBPROVIDER);
        }
        if (subproviders.length > 1) {
            logger.warn('Multiple configuration subproviders detected. Using first in list:');
            subproviders.forEach((subprovider, index) => logger.warn(`#${index}: '${subprovider.serverRegExp}'`));
        }
        const relevantProvider = subproviders[0];
        if (!this.hasResolverFunction(resolverType, relevantProvider.provider)) {
            logger.debug(`${resolverType}: Subprovider '${relevantProvider.serverRegExp}' does not implement '${resolverType}'.`);
            return undefined;
        }
        return relevantProvider;
    }

    private async shouldCancel(debugConfiguration: vscode.DebugConfiguration): Promise<boolean> {
        const requests = [ '(launch)', '(attach)' ];
        const managedConfig = (name: string): boolean => requests.some(req => name.endsWith(req));
        const configName = debugConfiguration.name;
        if (!managedConfig(configName)) {
            // Not a managed config
            return false;
        }
        const managedSessions = Array.from(this.activeSessions).filter(session => managedConfig(session.session.name));
        if (!managedSessions.length) {
            // No other running managed sessions
            return false;
        }
        const configNameTokens = configName.split(' ');
        const configNameBase = configNameTokens.slice(0, -1).join(' '); // Drop last part
        const alreadyRunning = managedSessions.find(session => {
            const base = session.session.name.split(' ').slice(0, -1).join(' ');
            return base === configNameBase ? session : undefined;
        })?.session.name;
        if (!alreadyRunning) {
            return false;
        }
        if (alreadyRunning === configName) {
            // Same name, let VS Code handle it
            return false;
        }
        const continueOption = 'Yes';
        const result = await vscode.window.showWarningMessage(
            'Target already running',
            {
                modal: true,
                detail: `Started '${debugConfiguration.name}' while '${alreadyRunning}' is running.\n\nContinue anyway?`,

            },
            continueOption
        );
        return result !== continueOption;
    }

    private async resolveDebugConfigurationByResolverType(
        resolverType: ResolverType,
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        this.logDebugConfiguration(resolverType, debugConfiguration, 'original config');
        const gdbTargetConfig: GDBTargetConfiguration = debugConfiguration;
        const gdbServerType = gdbTargetConfig.target?.server;
        if (await this.shouldCancel(debugConfiguration)) {
            return undefined;
        }
        const subprovider = this.getRelevantSubprovider(resolverType, gdbServerType);
        if (!subprovider) {
            this.logGdbServerCommandLine(resolverType, debugConfiguration);
            return debugConfiguration;
        }
        logger.debug(`${resolverType}: Resolve config with subprovider '${subprovider.serverRegExp}'`);
        const resolvedConfig = resolverType === 'resolveDebugConfiguration'
            ? await subprovider.provider.resolveDebugConfiguration!(folder, debugConfiguration, token)
            : await subprovider.provider.resolveDebugConfigurationWithSubstitutedVariables!(folder, debugConfiguration, token);
        if (!resolvedConfig) {
            logger.error(`${resolverType}: Resolving config failed with subprovider '${subprovider.serverRegExp}'`);
            return undefined;
        }
        this.logDebugConfiguration(resolverType, resolvedConfig, 'resolved config');
        this.logGdbServerCommandLine(resolverType, resolvedConfig);
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
        // Only resolve GDB path once, otherwise regexp check will fail
        logger.debug('resolveDebugConfigurationWithSubstitutedVariables: Resolve GDB path');
        debugConfiguration.gdb = resolveToolPath(debugConfiguration.gdb, ARM_NONE_EABI_GDB_NAME, ARM_NONE_EABI_GDB_EXECUTABLE_ONLY_REGEXP, this.builtinArmNoneEabiGdb);
        return this.resolveDebugConfigurationByResolverType('resolveDebugConfigurationWithSubstitutedVariables', folder, debugConfiguration, token);
    }

}
