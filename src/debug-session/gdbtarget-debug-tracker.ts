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
import { GDBTargetConfiguration } from '../debug-configuration';

export interface SessionEvent<T extends DebugProtocol.Event> {
    session: GDBTargetDebugSession;
    event: T;
}

export type ContinuedEvent = SessionEvent<DebugProtocol.ContinuedEvent>;
export type StoppedEvent = SessionEvent<DebugProtocol.StoppedEvent>;

export interface SessionStackTrace {
    session: GDBTargetDebugSession;
    threadId: number;
    stackFrames: DebugProtocol.StackFrame[];
    totalFrames?: number|undefined;
}

export type StackItem = vscode.DebugThread | vscode.DebugStackFrame | undefined;

export interface SessionStackItem {
    session: GDBTargetDebugSession;
    item: StackItem;
}

export class GDBTargetDebugTracker {
    private sessions: Map<string, GDBTargetDebugSession> = new Map();
    private stackTraceRequests: Map<string, Map<number, number>> = new Map();

    private readonly _onWillStartSession: vscode.EventEmitter<GDBTargetDebugSession> = new vscode.EventEmitter<GDBTargetDebugSession>();
    public readonly onWillStartSession: vscode.Event<GDBTargetDebugSession> = this._onWillStartSession.event;

    private readonly _onWillStopSession: vscode.EventEmitter<GDBTargetDebugSession> = new vscode.EventEmitter<GDBTargetDebugSession>();
    public readonly onWillStopSession: vscode.Event<GDBTargetDebugSession> = this._onWillStopSession.event;

    private readonly _onDidChangeActiveDebugSession: vscode.EventEmitter<GDBTargetDebugSession|undefined> = new vscode.EventEmitter<GDBTargetDebugSession|undefined>();
    public readonly onDidChangeActiveDebugSession: vscode.Event<GDBTargetDebugSession|undefined> = this._onDidChangeActiveDebugSession.event;

    private readonly _onDidChangeActiveStackItem: vscode.EventEmitter<SessionStackItem> = new vscode.EventEmitter<SessionStackItem>();
    public readonly onDidChangeActiveStackItem: vscode.Event<SessionStackItem> = this._onDidChangeActiveStackItem.event;

    private readonly _onConnected: vscode.EventEmitter<GDBTargetDebugSession> = new vscode.EventEmitter<GDBTargetDebugSession>();
    public readonly onConnected: vscode.Event<GDBTargetDebugSession> = this._onConnected.event;

    private readonly _onContinued: vscode.EventEmitter<ContinuedEvent> = new vscode.EventEmitter<ContinuedEvent>();
    public readonly onContinued: vscode.Event<ContinuedEvent> = this._onContinued.event;

    private readonly _onStopped: vscode.EventEmitter<StoppedEvent> = new vscode.EventEmitter<StoppedEvent>();
    public readonly onStopped: vscode.Event<StoppedEvent> = this._onStopped.event;

    private readonly _onStackTrace: vscode.EventEmitter<SessionStackTrace> = new vscode.EventEmitter<SessionStackTrace>();
    public readonly onStackTrace: vscode.Event<SessionStackTrace> = this._onStackTrace.event;

    public activate(context: vscode.ExtensionContext) {
        const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> => {
            return {
                onWillStartSession: () => this.handleOnWillStartSession(session),
                onWillStopSession: () => this.handleOnWillStopSession(session),
                onDidSendMessage: (message) => this.handleOnDidSendMessage(session, message),
                onWillReceiveMessage: (message) => this.handleOnWillReceiveMessage(session, message),
            };
        };

        // Register the tracker for a specific debug type (e.g., 'node')
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory(GDB_TARGET_DEBUGGER_TYPE, { createDebugAdapterTracker }),
            vscode.debug.onDidChangeActiveDebugSession(session => this._onDidChangeActiveDebugSession.fire(session?.id ? this.sessions.get(session?.id) : undefined)),
            vscode.debug.onDidChangeActiveStackItem(item => this.handleOnDidChangeActiveStackItem(item))
        );
    };

    private handleOnWillStartSession(session: vscode.DebugSession): void {
        const gdbTargetSession = new GDBTargetDebugSession(session);
        this.sessions.set(session.id, gdbTargetSession);
        this.bringConsoleToFront();
        this._onWillStartSession.fire(gdbTargetSession);
    }

    private handleOnWillStopSession(session: vscode.DebugSession): void {
        const gdbTargetSession = this.sessions.get(session.id);
        if (gdbTargetSession) {
            this.sessions.delete(session.id);
            this._onWillStopSession.fire(gdbTargetSession);
        }
        this.stackTraceRequests.delete(session.id);
    }

    protected handleOnDidSendMessage(session: vscode.DebugSession, message?: DebugProtocol.ProtocolMessage): void {
        if (!message) {
            return;
        }
        if (message.type === 'event') {
            this.handleEvent(session, message as DebugProtocol.Event);
        } else if (message.type === 'response') {
            this.handleResponse(session, message as DebugProtocol.Response);
        }
    }

    private handleEvent(session: vscode.DebugSession, event: DebugProtocol.Event): void {
        const gdbTargetSession = this.sessions.get(session.id);
        switch (event.event) {
            case 'continued':
                this._onContinued.fire({ session: gdbTargetSession, event } as ContinuedEvent);
                gdbTargetSession?.refreshTimer.start();
                break;
            case 'stopped':
                gdbTargetSession?.refreshTimer.stop();
                this._onStopped.fire({ session: gdbTargetSession, event } as StoppedEvent);
                break;
            case 'terminated':
            case 'exited':
                gdbTargetSession?.refreshTimer.stop();
                break;
            case 'output':
                gdbTargetSession?.filterOutputEvent(event as DebugProtocol.OutputEvent);
                break;
        }
    }

    private handleResponse(session: vscode.DebugSession, response: DebugProtocol.Response): void {
        const gdbTargetSession = this.sessions.get(session.id);
        if (!gdbTargetSession)  {
            return;
        }
        switch (response.command) {
            case 'launch':
            case 'attach':
                this.handleLaunchAttachResponse(gdbTargetSession, response);
                break;
            case 'stackTrace':
                this.handleStackTraceResponse(gdbTargetSession, response as DebugProtocol.StackTraceResponse);
                break;
        }
    }

    private handleLaunchAttachResponse(gdbTargetSession: GDBTargetDebugSession, response: DebugProtocol.Response): void {
        if (response.success) {
            this._onConnected.fire(gdbTargetSession);
        }
    }

    private handleStackTraceResponse(gdbTargetSession: GDBTargetDebugSession, response: DebugProtocol.StackTraceResponse): void {
        const stackTraceRequest = this.stackTraceRequests.get(gdbTargetSession.session.id);
        const threadId = stackTraceRequest?.get(response.request_seq);
        stackTraceRequest?.delete(response.request_seq);
        if (!response.success || threadId === undefined) {
            return;
        }
        const stackTrace = {
            session: gdbTargetSession,
            threadId,
            stackFrames: response.body.stackFrames,
            totalFrames: response.body.totalFrames
        };
        this._onStackTrace.fire(stackTrace);
    }

    protected handleOnWillReceiveMessage(session: vscode.DebugSession, message?: DebugProtocol.ProtocolMessage): void {
        if (!message) {
            return;
        }
        if (message.type === 'request') {
            const request = message as DebugProtocol.Request;
            const gdbTargetSession = this.sessions.get(session.id);
            if (!gdbTargetSession)  {
                return;
            }
            switch (request.command) {
                case 'launch':
                case 'attach':
                    this.handleLaunchAttachRequest(gdbTargetSession, request);
                    break;
                case 'stackTrace':
                    this.handleStackTraceRequest(gdbTargetSession, request as DebugProtocol.StackTraceRequest);
                    break;
                case 'next':
                case 'stepIn':
                case 'stepOut':
                    gdbTargetSession.refreshTimer.start();
                    break;
                case 'restart':
                case 'disconnect':
                case 'terminate':
                    this.verifySafeDisconnect(gdbTargetSession);
                    break;
            }
        }
    }

    private verifySafeDisconnect(session: GDBTargetDebugSession): void {
        const requestTypes = [ '(launch)', '(attach)' ];
        // Move to utility class, see also PR 696
        const managedConfig = (name: string): boolean => requestTypes.some(req => name.endsWith(req));
        const sessionCbuildRunPath = session.getCbuildRunPath();
        if (session.session.name.endsWith('(attach)') || !managedConfig(session.session.name) || !sessionCbuildRunPath) {
            // Not managed, no *.cbuild-run.yml, or an attach session, the latter can be safely terminated
            return;
        }
        // Look out for other managed attach sessions
        const managedSessions = Array.from(this.sessions.values()).filter(s => s !== session && s.session.name.endsWith('(attach)') && s.getCbuildRunPath());
        if (!managedSessions.length) {
            return;
        }
        // Configs for multiple CPUs of same device typically don't share same base name.
        // Assumption: Sessions for the same SoC that are managed by CMSIS Solution extension
        // are driven by the same *.cbuild-run.yml file.
        const matchingAttachSession = managedSessions.find(s => s.getCbuildRunPath() === sessionCbuildRunPath);
        if (!matchingAttachSession) {
            return;
        }
        // Disconnect might be unsafe, prompt user but don't wait for response to modal dialog
        vscode.window.showInformationMessage(
            `Stopping '${session.session.name}' might shut down debug server for '${matchingAttachSession.session.name}'. You may need to Close and restart that session.`,
            { modal: true },
        );
    }

    private handleLaunchAttachRequest(gdbTargetSession: GDBTargetDebugSession, request: DebugProtocol.Request): void {
        const gdbTargetConfig = request.arguments as GDBTargetConfiguration;
        const cbuildRunFile = gdbTargetConfig.cmsis?.cbuildRunFile;
        if (cbuildRunFile) {
            // Do not wait for it to keep the message flowing.
            // Session class will do the waiting in case requests
            // come early.
            gdbTargetSession.parseCbuildRun(cbuildRunFile);
        }
    }

    private handleStackTraceRequest(gdbTargetSession: GDBTargetDebugSession, request: DebugProtocol.StackTraceRequest): void {
        let stackTraceRequests = this.stackTraceRequests.get(gdbTargetSession.session.id);
        if (stackTraceRequests === undefined) {
            stackTraceRequests = new Map();
            this.stackTraceRequests.set(gdbTargetSession.session.id, stackTraceRequests);
        }
        stackTraceRequests.set(request.seq, request.arguments.threadId);
    }

    protected handleOnDidChangeActiveStackItem(item: StackItem): void {
        const gdbTargetSession = item?.session.id ? this.sessions.get(item?.session.id) : undefined;
        if (!gdbTargetSession) {
            return;
        }
        this._onDidChangeActiveStackItem.fire({ session: gdbTargetSession, item });
    }

    public bringConsoleToFront(): void {
        // Bring debug console to front, let promise float.
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

}
