/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import * as vscode from 'vscode';
import {
    ContinuedEvent,
    GDBTargetDebugSession,
    GDBTargetDebugTracker,
    StoppedEvent
} from '../../debug-session';
import {
    CTraceProcessManager,
    CTraceProcessManagerLaunchOptions,
    CTraceProcessManagerOptions
} from '../../desktop/process/ctrace-process-manager';

export class CTraceController {
    private activeSession: GDBTargetDebugSession | undefined;

    public constructor(private readonly options: CTraceProcessManagerOptions = {}) {}

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker): void {
        context.subscriptions.push(
            tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session)),
            tracker.onContinued(event => this.handleContinuedEvent(event)),
            tracker.onStopped(event => this.handleStoppedEvent(event))
        );
    }

    public async run(options: CTraceProcessManagerLaunchOptions = {}): Promise<void> {
        const processManager = new CTraceProcessManager(this.options);
        const cbuildRunFilePath = options.cbuildRunFilePath ?? this.activeSession?.getCbuildRunPath();
        const launchOptions: CTraceProcessManagerLaunchOptions = cbuildRunFilePath === undefined
            ? options
            : { ...options, cbuildRunFilePath };
        await processManager.launch(launchOptions);
        await processManager.waitForExit();
    }

    protected handleActiveSessionChanged(session: GDBTargetDebugSession | undefined): void {
        this.activeSession = session;
    }

    protected handleContinuedEvent(_event: ContinuedEvent): void {
        // TODO: Handle continued events for trace processing.
    }

    protected handleStoppedEvent(_event: StoppedEvent): void {
        // TODO: Handle stopped events for trace processing.
    }
}
