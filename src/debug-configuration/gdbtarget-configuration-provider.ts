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
import { GDBTargetConfigurationValidator } from './gdbtarget-configuration-validator';
import { GDBTargetConfigurationResolver } from './gdbtarget-configuration-resolver';

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';

export class GDBTargetConfigurationProvider implements vscode.DebugConfigurationProvider {

    public constructor(
        protected resolver: GDBTargetConfigurationResolver = new GDBTargetConfigurationResolver(),
        protected validator: GDBTargetConfigurationValidator = new GDBTargetConfigurationValidator(),
    ) {}

    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(GDB_TARGET_DEBUGGER_TYPE, this)
        );
    }

    public resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        logger.warn('resolving debug configuration with substituted variables');
        const originalConfig = debugConfiguration as GDBTargetConfiguration;
        logger.warn('\toriginal config');
        logger.warn(JSON.stringify(originalConfig));
        const resolvedConfig = this.resolver.resolveWithSubstitutedVariables(originalConfig);
        logger.warn('\tresolved config');
        logger.warn(JSON.stringify(resolvedConfig));
        this.validator.validate(resolvedConfig);
        logger.warn('\tconfig validated');
        return debugConfiguration;
    }
}
