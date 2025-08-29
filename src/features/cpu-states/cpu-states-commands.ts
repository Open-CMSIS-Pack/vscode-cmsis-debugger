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
import { EXTENSION_NAME } from '../../manifest';
import { CpuStates } from './cpu-states';

export class CpuStatesCommands {
    public static readonly showCpuTimeHistoryID = `${EXTENSION_NAME}.showCpuTimeHistory`;
    public static readonly resetCpuTimeHistoryID = `${EXTENSION_NAME}.resetCpuTimeHistory`;
    private cpuStates?: CpuStates;

    public activate(context: vscode.ExtensionContext, cpuStates: CpuStates): void {
        // Register item and command
        context.subscriptions.push(
            vscode.commands.registerCommand(CpuStatesCommands.showCpuTimeHistoryID, () => this.handleShowHistory()),
            vscode.commands.registerCommand(CpuStatesCommands.resetCpuTimeHistoryID, () => this.handleResetHistory())
        );
        this.cpuStates = cpuStates;
    }

    protected async handleShowHistory(): Promise<void> {
        if (!this.cpuStates) {
            return;
        }
        await this.cpuStates.updateFrequency();
        this.cpuStates.showStatesHistory();
    }

    protected async handleResetHistory(): Promise<void> {
        if (!this.cpuStates) {
            return;
        }
        this.cpuStates.resetStatesHistory();
    }
};
