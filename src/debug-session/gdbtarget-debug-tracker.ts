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
import { DebugProtocol } from '@vscode/debugprotocol';
import { GDB_TARGET_DEBUGGER_TYPE } from './constants';
import { GDBTargetDebugSession } from './gdbtarget-debug-session';

export interface SessionEvent<T extends DebugProtocol.Event> {
    session: GDBTargetDebugSession;
    event: T;
}

export type ContinuedEvent = SessionEvent<DebugProtocol.ContinuedEvent>;
export type StoppedEvent = SessionEvent<DebugProtocol.StoppedEvent>;

export class GDBTargetDebugTracker {
    private sessions: Map<string, GDBTargetDebugSession> = new Map();

    private readonly _onWillStartSession: vscode.EventEmitter<GDBTargetDebugSession> = new vscode.EventEmitter<GDBTargetDebugSession>();
    public readonly onWillStartSession: vscode.Event<GDBTargetDebugSession> = this._onWillStartSession.event;

    private readonly _onWillStopSession: vscode.EventEmitter<GDBTargetDebugSession> = new vscode.EventEmitter<GDBTargetDebugSession>();
    public readonly onWillStopSession: vscode.Event<GDBTargetDebugSession> = this._onWillStopSession.event;

    private readonly _onDidChangeActiveDebugSession: vscode.EventEmitter<GDBTargetDebugSession|undefined> = new vscode.EventEmitter<GDBTargetDebugSession|undefined>();
    public readonly onDidChangeActiveDebugSession: vscode.Event<GDBTargetDebugSession|undefined> = this._onDidChangeActiveDebugSession.event;

    private readonly _onContinued: vscode.EventEmitter<ContinuedEvent> = new vscode.EventEmitter<ContinuedEvent>();
    public readonly onContinued: vscode.Event<ContinuedEvent> = this._onContinued.event;

    private readonly _onStopped: vscode.EventEmitter<StoppedEvent> = new vscode.EventEmitter<StoppedEvent>();
    public readonly onStopped: vscode.Event<StoppedEvent> = this._onStopped.event;

    public activate(context: vscode.ExtensionContext) {
        const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> => {
            return {
                onWillStartSession: () => {
                    const gdbTargetSession = new GDBTargetDebugSession(session);
                    this.sessions.set(session.id, gdbTargetSession);
                    this.bringConsoleToFront.apply(this);
                    this._onWillStartSession.fire(gdbTargetSession);
                },
                onWillStopSession: () => {
                    const gdbTargetSession = this.sessions.get(session.id);
                    if (gdbTargetSession) {
                        this.sessions.delete(session.id);
                        this._onWillStopSession.fire(gdbTargetSession);
                    }
                },
                onDidSendMessage: (message) => this.handleOnDidSendMessage(session, message),
            };
        };

        // Register the tracker for a specific debug type (e.g., 'node')
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory(GDB_TARGET_DEBUGGER_TYPE, { createDebugAdapterTracker }),
            vscode.debug.onDidChangeActiveDebugSession(session => this._onDidChangeActiveDebugSession.fire(session?.id ? this.sessions.get(session?.id) : undefined))
        );
    };

    protected handleOnDidSendMessage(session: vscode.DebugSession, message?: DebugProtocol.ProtocolMessage): void {
        if (!message) {
            return;
        }
        if (message.type === 'event') {
            const event = message as DebugProtocol.Event;
            const gdbTargetSession = this.sessions.get(session.id);
            switch (event.event) {
                case 'continued':
                    this._onContinued.fire({ session: gdbTargetSession, event } as ContinuedEvent);
                    break;
                case 'stopped':
                    this._onStopped.fire({ session: gdbTargetSession, event } as StoppedEvent);
                    break;
            }
        }
    }

    public bringConsoleToFront(): void {
        // Bring debug console to front, let promise float.
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

}
