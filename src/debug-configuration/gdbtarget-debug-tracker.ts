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

const GDB_TARGET_DEBUGGER_TYPE = 'gdbtarget';

export class GDBTargetDebugTracker implements vscode.DebugAdapterTracker {

    public activate(context: vscode.ExtensionContext) {
        // Use vscode debug tracker
        const createDebugAdapterTracker = (_session: vscode.DebugSession): vscode.DebugAdapterTracker => ({
            onWillStartSession: () => this.onWillStartSession.apply(this)
        });

        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory(GDB_TARGET_DEBUGGER_TYPE, { createDebugAdapterTracker })
        );
    }

    public onWillStartSession(): void {
        // Bring debug console to front, let promise float.
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

}
