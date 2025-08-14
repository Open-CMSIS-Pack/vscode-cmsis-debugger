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
import { extractPname } from '../../utils';
import { GDBTargetDebugSessions } from '../../debug-session';
import { CbuildRunReader } from '../../cbuild-run';
import { ExtendedGDBTargetConfiguration } from '../../debug-configuration';

export class StatesStatusBarItem {
    private readonly statusBarItemID = `${EXTENSION_NAME}.statesItem`;
    private statusBarItem: vscode.StatusBarItem | undefined;

    public activate(context: vscode.ExtensionContext, sessions: GDBTargetDebugSessions): void {
        this.statusBarItem = vscode.window.createStatusBarItem(
            this.statusBarItemID,
            vscode.StatusBarAlignment.Left
        );
        this.statusBarItem.name = 'CPU States';
        context.subscriptions.push(
            this.statusBarItem
        );
        sessions.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session));
    }

    public deactivate(): void {
        this.statusBarItem = undefined;
    }

    protected async handleActiveSessionChanged(session: vscode.DebugSession | undefined): Promise<void> {
        if (!this.statusBarItem) {
            return;
        }
        if (!session?.name.length) {
            this.statusBarItem.hide();
            return;
        }
        // TODO: refactor & cache, no need to re-read file on every session switch,
        // can be a centralized instance for other functionality during debug session
        const cbuildRunReader = new CbuildRunReader();
        const cbuildRunPath = (session.configuration as ExtendedGDBTargetConfiguration)?.cmsis?.cbuildRunFile;
        if (cbuildRunPath) {
            await cbuildRunReader.parse(cbuildRunPath);
        }
        const pnames = cbuildRunReader.getPnames();
        const pname = pnames.length > 1 ? extractPname(session.name) : undefined;
        this.updateText(pname);
        this.statusBarItem.show();
    }

    protected updateText(pname?: string): void {
        if (!this.statusBarItem) {
            return;
        }
        const cpuName = pname ? ` ${pname} ` : '';
        this.statusBarItem.text = `$(watch)${cpuName} 0ms`;
    }
};
