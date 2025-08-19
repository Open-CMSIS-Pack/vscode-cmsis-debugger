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
import { calculateTime, extractPname } from '../../utils';
import { CpuStates } from './cpu-states';
import { CpuStatesCommands } from './cpu-states-commands';

interface QuickPickHandlerItem extends vscode.QuickPickItem {
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
        this.statusBarItem.command = this.statusBarItemCommandID;
        // Register item and command
        context.subscriptions.push(
            this.statusBarItem,
            vscode.commands.registerCommand(this.statusBarItemCommandID, () => this.handleItemCommand())
        );
        // Register refresh handler and save CpuStates instance // TODO: needs better decoupling
        cpuStates.onRefresh((delay) => this.handleRefresh(delay));
        this.cpuStates = cpuStates;
    }

    protected async handleRefresh(delay: number): Promise<void> {
        if (!this.statusBarItem) {
            return;
        }
        const activeSession = this.cpuStates?.activeSession;
        const sessionName = activeSession?.session?.name;
        if (!sessionName?.length) {
            setTimeout(() => this.statusBarItem!.hide(), delay);
            return;
        }
        const cbuildRunReader = await activeSession?.getCbuildRun();
        const pnames = cbuildRunReader?.getPnames();
        const pname = pnames && pnames.length > 1 ? extractPname(sessionName) : undefined;
        await this.updateDisplayText(pname);
        setTimeout(() => this.statusBarItem!.show(), delay);
    }

    protected async updateDisplayText(pname?: string): Promise<void> {
        if (!this.statusBarItem || !this.cpuStates) {
            return;
        }
        const activeSession = this.cpuStates.activeSession;
        const activeStates = this.cpuStates.activeCpuStates;
        if (!activeSession || !activeStates) {
            return;
        }
        if (!activeStates.isRunning) {
            // Only update frequency while stopped. User previous otherwise
            // to avoid switching between states and time display.
            await this.cpuStates.updateFrequency();
        }
        const cpuName = pname ? ` ${pname} ` : '';
        const displayString = activeStates.frequency === undefined
            ? `${activeStates.states.toString()} states`
            : calculateTime(activeStates.states, activeStates.frequency);
        this.statusBarItem.text = `$(watch)${cpuName} ${displayString}`;
    }

    protected async handleItemCommand(): Promise<void> {
        const items: QuickPickHandlerItem[] = [
            {
                label: 'Run and Debug: CPU Time Information',
                detail: 'Print CPU execution time information to TBD',
                handler: () => vscode.commands.executeCommand(CpuStatesCommands.showCpuTimeHistoryCommmandID)
            }
        ];
        const selection = await vscode.window.showQuickPick(items);
        if (!selection) {
            return;
        }
        selection.handler();
    }
};
