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
import { GDBTargetConfiguration } from '../gdbtarget-configuration';

export abstract class BaseConfigurationProvider implements vscode.DebugConfigurationProvider {

    protected async commandExists(commandName: string): Promise<boolean> {
        const commands = await vscode.commands.getCommands();
        return !!commands.find(command => command === commandName);
    };

    protected parameterExists(name: string, params: string[]): boolean {
        return !!params.find(param => param.trim() === name);
    }

    protected async shouldAppendParameter(params: string[], paramName: string, commandName?: string): Promise<boolean> {
        return !this.parameterExists(paramName, params) && (!commandName || await this.commandExists(commandName));
    }

    protected abstract resolveServerParameters(debugConfiguration: GDBTargetConfiguration): Promise<GDBTargetConfiguration>;

    public resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | null | undefined> {
        return this.resolveServerParameters(debugConfiguration);
    }

}
