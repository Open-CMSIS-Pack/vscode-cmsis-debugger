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
import { CpuStatesCommands } from './cpu-states-commands';

export interface QuickPickHandlerItem extends vscode.QuickPickItem {
    handler(): unknown;
}

export class CpuStatesStatusBarItem {
    private readonly statusBarItemID = `${EXTENSION_NAME}.cpuStatesItem`;
    private readonly statusBarItemCommandID = `${EXTENSION_NAME}.cpuStatesItemCommand`;
    private statusBarItem: vscode.StatusBarItem | undefined;
    private cpuStates?: CpuStates;

    public activate(context: vscode.ExtensionContext, cpuStates: CpuStates): void {
        // Status Bar Item
        this.statusBarItem = vscode.window.createStatusBarItem(
            this.statusBarItemID,
            vscode.StatusBarAlignment.Left
        );
        this.statusBarItem.name = 'CPU States';
        // Register item and command
        context.subscriptions.push(
            this.statusBarItem,
            vscode.commands.registerCommand(this.statusBarItemCommandID, () => this.handleItemCommand())
        );
        // Register refresh handler and save CpuStates instance
        cpuStates.onRefresh((delay) => this.handleRefresh(delay));
        this.cpuStates = cpuStates;
    }

    protected async handleRefresh(delay: number): Promise<void> {
        if (!this.statusBarItem) {
            return;
        }
        const activeSession = this.cpuStates?.activeSession;
        const sessionName = activeSession?.session?.name;
        const activeHasStates = this.cpuStates?.activeHasStates();
        if (!sessionName?.length || activeHasStates === undefined) {
            // Hide if no valid session name or if cpuStates support not yet determined
            setTimeout(() => this.statusBarItem!.hide(), delay);
            return;
        }
        // cpuStates defined, otherwise activeHasStates would have been undefined
        const displayString = await this.cpuStates!.getActiveTimeString();
        this.statusBarItem.text = `$(watch)${displayString}`;
        this.statusBarItem.command = activeHasStates ? this.statusBarItemCommandID : undefined;
        setTimeout(() => this.statusBarItem!.show(), delay);
    }

    protected async handleItemCommand(): Promise<void> {
        const items: QuickPickHandlerItem[] = [
            {
                label: 'CPU Time',
                detail: 'Print CPU execution time and history to Debug Console',
                handler: () => vscode.commands.executeCommand(CpuStatesCommands.showCpuTimeHistoryID)
            },
            {
                label: 'Reset CPU Time',
                detail: 'Reset CPU execution time and history',
                handler: () => vscode.commands.executeCommand(CpuStatesCommands.resetCpuTimeHistoryID)
            }
        ];
        const selection = await vscode.window.showQuickPick(items);
        if (!selection) {
            return;
        }
        selection.handler();
    }
};
