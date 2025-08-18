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
import { ContinuedEvent, GDBTargetDebugTracker, StoppedEvent } from '../../debug-session';
import { CbuildRunReader } from '../../cbuild-run';
import { ExtendedGDBTargetConfiguration } from '../../debug-configuration';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';

const DWT_CYCCNT_ADDRESS = 0xE0001004;

interface States {
    cpuStates: bigint;
    lastCycles?: number;
}

export class StatesStatusBarItem {
    private readonly statusBarItemID = `${EXTENSION_NAME}.statesItem`;
    private statusBarItem: vscode.StatusBarItem | undefined;
    private activeSession: GDBTargetDebugSession | undefined;
    private sessionStates: Map<string, States> = new Map();

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker): void {
        this.statusBarItem = vscode.window.createStatusBarItem(
            this.statusBarItemID,
            vscode.StatusBarAlignment.Left
        );
        this.statusBarItem.name = 'CPU States';
        context.subscriptions.push(
            this.statusBarItem
        );
        tracker.onWillStartSession(session => this.handleOnWillStartSession(session));
        tracker.onWillStopSession(session => this.handleOnWillStopSession(session));
        tracker.onDidChangeActiveDebugSession(session => this.handleActiveSessionChanged(session));
        tracker.onStopped((event) => this.handleStoppedEvent(event));
    }

    public deactivate(): void {
        this.statusBarItem = undefined;
    }

    protected async handleOnWillStartSession(session: GDBTargetDebugSession): Promise<void> {
        const states: States = {
            cpuStates: BigInt(0)
        };
        this.sessionStates.set(session.session.id, states);
    }

    protected async handleOnWillStopSession(session: GDBTargetDebugSession): Promise<void> {
        this.sessionStates.delete(session.session.id);
    }

    protected async handleActiveSessionChanged(session?: GDBTargetDebugSession): Promise<void> {
        this.activeSession = session;
        return this.updateItem();
    }

    protected async handleContinuedEvent(_event: ContinuedEvent): Promise<void> {
        // Do nothing for now
    }

    protected async handleStoppedEvent(event: StoppedEvent): Promise<void> {
        return this.updateStates(event.session);
    }

    protected async updateStates(session: GDBTargetDebugSession): Promise<void> {
        const states = this.sessionStates.get(session.session.id);
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
        states.cpuStates += BigInt(cycleAdd);
        return this.updateItem();
    }

    protected async updateItem(): Promise<void> {
        if (!this.statusBarItem) {
            return;
        }
        const session = this.activeSession?.session;
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
        await this.updateText(pname);
        this.statusBarItem.show();
    }

    protected async updateText(pname?: string): Promise<void> {
        if (!this.statusBarItem) {
            return;
        }
        if (!this.activeSession) {
            return;
        }
        const states = this.sessionStates.get(this.activeSession?.session.id);
        if (!states) {
            return;
        }
        const cpuName = pname ? ` ${pname} ` : '';
        const frequency = await this.getFrequency();
        const displayString =
            frequency === undefined || frequency // TODO: Remove
                ? states.cpuStates.toString()
                : (states.cpuStates / BigInt(frequency)).toString();
        this.statusBarItem.text = `$(watch)${cpuName} ${displayString} states`;
    }

    protected async getFrequency(): Promise<number|undefined> {
        const frequencyString = await this.activeSession?.evaluateGlobalExpression('SystemCoreClock');
        if (!frequencyString) {
            return undefined;
        }
        const frequencyValue = parseInt(frequencyString);
        return isNaN(frequencyValue) ? undefined : frequencyValue;
    }
};
