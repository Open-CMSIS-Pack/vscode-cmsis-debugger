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
import { ContinuedEvent, GDBTargetDebugTracker, StoppedEvent } from '../../debug-session';
import { CbuildRunReader } from '../../cbuild-run';
import { ExtendedGDBTargetConfiguration } from '../../debug-configuration';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';
import { logger } from '../../logger';

const DWT_CYCCNT_ADDRESS = 0xE0001004;

const HISTORIC_STATES_MAX = 5;

interface HistoricStates {
    states: bigint;
    reason: string;
}

interface States {
    states: bigint;
    lastCycles?: number;
    statesHistory: HistoricStates[];  // FIFO containing previous 5 historic states with reason
}

interface StatesHistoryColumn {
    title: string;
    length: number;
}

export class StatesStatusBarItem {
    private readonly statusBarItemID = `${EXTENSION_NAME}.statesItem`;
    private readonly showStatesHistoryCommmandID = `${EXTENSION_NAME}.showStatesHistory`;
    private statusBarItem: vscode.StatusBarItem | undefined;
    private activeSession: GDBTargetDebugSession | undefined;
    private sessionStates: Map<string, States> = new Map();
    private readonly statesHistoryColumns: StatesHistoryColumn[] = [
        { title: 'Diff', length: 4+2 },
        { title: 'CPU TIME', length: 8+9 },
        // { title: 'CPU STATES', length: 8+7 },
        { title: 'Reason (TODO: Corename)', length: 6+17 }
    ];

    public activate(context: vscode.ExtensionContext, tracker: GDBTargetDebugTracker): void {
        this.statusBarItem = vscode.window.createStatusBarItem(
            this.statusBarItemID,
            vscode.StatusBarAlignment.Left
        );
        this.statusBarItem.name = 'CPU States';
        this.statusBarItem.command = 'vscode-cmsis-debugger.showStatesHistory';
        context.subscriptions.push(
            this.statusBarItem,
            vscode.commands.registerCommand(this.showStatesHistoryCommmandID, () => this.handleShowStatesHistory())
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
            states: BigInt(0),
            statesHistory: []
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
        // TODO: Temp solution, needs to be connected to stacktrace request and cancelled
        // on continued event before stacktrace event.
        setTimeout(() => this.updateStates(event.session, event.event.body.reason), 50);
        return ;
    }

    protected async updateStates(session: GDBTargetDebugSession, reason?: string): Promise<void> {
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
        if (states.statesHistory.length >= HISTORIC_STATES_MAX + 1) {
            states.statesHistory.shift();
        }
        states.states += BigInt(cycleAdd);
        states.statesHistory.push({
            states: states.states,
            reason: reason ?? 'Unknown'
        });
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
            frequency === undefined
                ? `${states.states.toString()} states`
                : calculateTime(states.states, frequency);
        this.statusBarItem.text = `$(watch)${cpuName} ${displayString}`;
    }

    protected async getFrequency(): Promise<number|undefined> {
        const frequencyString = await this.activeSession?.evaluateGlobalExpression('SystemCoreClock');
        if (!frequencyString) {
            return undefined;
        }
        const frequencyValue = parseInt(frequencyString);
        return isNaN(frequencyValue) ? undefined : frequencyValue;
    }

    protected printStatesHistoryHeader(): void {
        const columnHeaders = this.statesHistoryColumns.map(columnHeader => columnHeader.title.padEnd(columnHeader.length));
        const header = columnHeaders.join('');
        logger.error(header);
    }

    protected printStatesHistoryContents(contents: string[][]): void {
        if (contents.some(row => row.length !== this.statesHistoryColumns.length)) {
            throw new Error('States history row has unexpected number of columns');
        }
        const paddedContents = contents.map(row => row.map((value, index) => value.padEnd(this.statesHistoryColumns.at(index)!.length)).join(''));
        paddedContents.forEach(line => logger.error(line));
    }

    protected async handleShowStatesHistory(): Promise<void> {
        if (!this.activeSession) {
            return;
        }
        const states = this.sessionStates.get(this.activeSession?.session.id);
        if (!states) {
            return;
        }
        const frequency = await this.getFrequency();
        this.printStatesHistoryHeader();
        const contents: string[][] = [];
        if (states.statesHistory.length === 0) {
            logger.error('No state history captured');
            return;
        } else if (states.statesHistory.length > 1) {
            const history = states.statesHistory.slice(0, -1);
            const historyContents = history.map((histStates, index) => {
                const referenceStates = states.statesHistory.at(index + 1)!.states;
                const indexDiff = index - (states.statesHistory.length - 1);
                const diffNum = -indexDiff - 1;
                const statesDiff = referenceStates - histStates.states;
                const statesDiffString = frequency === undefined ? statesDiff.toString() : calculateTime(statesDiff, frequency);
                return [
                    indexDiff.toString(),
                    `d${diffNum}:${statesDiffString}`,
                    // histStates.states.toString(),
                    histStates.reason
                ];
            });
            contents.push(...historyContents);
        }
        const currentStates = states.statesHistory.at(states.statesHistory.length - 1)!;
        const statesString = frequency === undefined ? currentStates.states.toString() : calculateTime(currentStates.states, frequency);
        const currentContents = [
            '0',
            statesString,
            // currentStates.states.toString(),
            currentStates.reason
        ];
        contents.push(currentContents);
        this.printStatesHistoryContents(contents);
    }
};
