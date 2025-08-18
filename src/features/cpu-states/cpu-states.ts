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
import { ContinuedEvent, GDBTargetDebugTracker, StoppedEvent } from '../../debug-session';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';
import { CpuStatesHistory } from './cpu-states-history';

const DWT_CYCCNT_ADDRESS = 0xE0001004;

interface SessionCpuStates {
    states: bigint;
    frequency: number|undefined;
    lastCycles?: number;
    statesHistory: CpuStatesHistory;
}

export class CpuStates {
    private readonly _onRefresh: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onRefresh: vscode.Event<void> = this._onRefresh.event;

    public activeSession: GDBTargetDebugSession | undefined;
    private sessionCpuStates: Map<string, SessionCpuStates> = new Map();

    public get activeCpuStates(): SessionCpuStates|undefined {
        if (!this.activeSession) {
            return undefined;
        }
        return this.sessionCpuStates.get(this.activeSession?.session.id);
    }

    public activate(tracker: GDBTargetDebugTracker): void {
        tracker.onWillStartSession(session => this.handleOnWillStartSession(session));
        tracker.onWillStopSession(session => this.handleOnWillStopSession(session));
        tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session));
        tracker.onStopped((event) => this.handleStoppedEvent(event));
    }

    protected handleOnWillStartSession(session: GDBTargetDebugSession): void {
        const states: SessionCpuStates = {
            states: BigInt(0),
            frequency: undefined,
            statesHistory: new CpuStatesHistory()
        };
        this.sessionCpuStates.set(session.session.id, states);
    }

    protected handleOnWillStopSession(session: GDBTargetDebugSession): void {
        this.sessionCpuStates.delete(session.session.id);
    }

    protected handleActiveSessionChanged(session?: GDBTargetDebugSession): void {
        this.activeSession = session;
        this._onRefresh.fire();
    }

    protected handleContinuedEvent(_event: ContinuedEvent): void {
        // Do nothing for now
    }

    protected async handleStoppedEvent(event: StoppedEvent): Promise<void> {
        // TODO: Temp solution, needs to be connected to stacktrace request and cancelled
        // on continued event before stacktrace event.
        setTimeout(() => this.updateCpuStates(event.session, event.event.body.reason), 500);
        return ;
    }

    protected async updateCpuStates(session: GDBTargetDebugSession, reason?: string): Promise<void> {
        // Update for passed session, not necessarily the active session
        const states = this.sessionCpuStates.get(session.session.id);
        if (!states) {
            return;
        }
        const newCycles = await session.readMemoryU32(DWT_CYCCNT_ADDRESS);
        if (newCycles === undefined) {
            return;
        }
        if (states.lastCycles === undefined) {
            states.lastCycles = newCycles;
        }
        const cycleDiff = newCycles - states.lastCycles;
        const cycleAdd = cycleDiff >= 0 ? cycleDiff : newCycles + Math.pow(2, 32) - states.lastCycles;
        // Caution with types...
        states.lastCycles = newCycles;
        states.states += BigInt(cycleAdd);
        states.statesHistory.updateHistory(states.states, reason);
        this._onRefresh.fire();
    }

    public async updateFrequency(): Promise<void> {
        const states = this.activeCpuStates;
        if (!states) {
            return;
        }
        const frequency = await this.getFrequency();
        states.frequency = frequency;
        states.statesHistory.frequency = frequency;
    }

    protected async getFrequency(): Promise<number|undefined> {
        const frequencyString = await this.activeSession?.evaluateGlobalExpression('SystemCoreClock');
        if (!frequencyString) {
            return undefined;
        }
        const frequencyValue = parseInt(frequencyString);
        return isNaN(frequencyValue) ? undefined : frequencyValue;
    }

    public showStatesHistory(): void {
        const states = this.activeCpuStates;
        if (!states) {
            return;
        }
        states.statesHistory.showHistory();
    }
};
