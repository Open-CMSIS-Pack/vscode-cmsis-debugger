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
import { GDB_TARGET_DEBUGGER_TYPE } from './constants';
import { GDBTargetDebugSession } from './gdbtarget-debug-session';

export class GDBTargetDebugSessions {
    private sessions: Map<string, GDBTargetDebugSession> = new Map();

    private readonly _onWillStartSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onWillStartSession: vscode.Event<vscode.DebugSession> = this._onWillStartSession.event;

    private readonly _onDidChangeActiveDebugSession: vscode.EventEmitter<vscode.DebugSession|undefined> = new vscode.EventEmitter<vscode.DebugSession|undefined>();
    public readonly onDidChangeActiveDebugSession: vscode.Event<vscode.DebugSession|undefined> = this._onDidChangeActiveDebugSession.event;

    public activate(context: vscode.ExtensionContext) {
        const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> => {
            return {
                onWillStartSession: () => {
                    this.sessions.set(session.id, new GDBTargetDebugSession(session));
                    this.bringConsoleToFront.apply(this);
                    this._onWillStartSession.fire(session);
                },
                onWillStopSession: () => {
                    this.sessions.delete(session.id);
                },
            };
        };

        // Register the tracker for a specific debug type (e.g., 'node')
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory(GDB_TARGET_DEBUGGER_TYPE, { createDebugAdapterTracker }),
            vscode.debug.onDidChangeActiveDebugSession(session => this._onDidChangeActiveDebugSession.fire(session))
        );
    };

    public bringConsoleToFront(): void {
        // Bring debug console to front, let promise float.
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

}
