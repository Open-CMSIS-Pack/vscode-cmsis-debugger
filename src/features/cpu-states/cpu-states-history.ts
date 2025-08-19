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
import { calculateTime } from '../../utils';

const HISTORY_ENTRIES_MAX = 5;  // Excluding current

/**
 * Reasons of stopped events for which to not
 * capture states to history.
 */
/*
const EXCLUDE_REASONS = [
    'step',
    'pause',
    'entry',
    'goto',
    'Unknown'
];
*/

interface HistoryEntry {
    cpuStates: bigint;
    reason: string;
}

interface HistoryColumn {
    title: string;
    length: number;
}

export class CpuStatesHistory {
    public frequency: number|undefined;
    private historyEntries: HistoryEntry[] = [];

    private readonly historyColumns: HistoryColumn[] = [
        { title: 'Diff', length: 6 },
        { title: 'CPU Time', length: 18 },
        { title: 'CPU States', length: 12 },
        { title: 'Reason', length: 10 },
    ];

    constructor(private pname?: string) {}

    private get effectiveHistoryColumns(): HistoryColumn[] {
        const excludeTitle = this.frequency === undefined ? 'CPU Time' : 'CPU States';
        return this.historyColumns.filter(col => col.title !== excludeTitle);
    }

    private get lastEntry(): HistoryEntry|undefined {
        if (!this.historyEntries.length) {
            return undefined;
        }
        return this.historyEntries.at(this.historyEntries.length - 1);
    }

    public updateHistory(cpuStates: bigint, reason?: string): void {
        const newReason = reason ?? 'Unknown';
        // TODO: Discuss if filtering helps. Feels like not.
        /*
        const previousEntry = this.historyValues.length ? this.historyValues.at(this.historyValues.length - 1) : undefined;
        const overwritePrevious = previousEntry && (!previousEntry.reason || EXCLUDE_REASONS.includes(previousEntry.reason));
        if (overwritePrevious) {
            previousEntry.cpuStates = cpuStates;
            previousEntry.reason = newReason;
            return;
        }
            */
        if (this.historyEntries.length >= HISTORY_ENTRIES_MAX + 1) {
            this.historyEntries.shift();
        }
        this.historyEntries.push({
            cpuStates,
            reason: newReason
        });
    }

    protected printLine(message: string) {
        vscode.debug.activeDebugConsole.appendLine(message);
    }

    protected printHeader(): void {
        const columnHeaders = this.effectiveHistoryColumns.map(columnHeader => columnHeader.title.padEnd(columnHeader.length));
        // Append pname value if present
        if (this.pname?.length) {
            columnHeaders.push(`(${this.pname})`);
        }
        const header = columnHeaders.join('');
        this.printLine(header);
    }

    protected printContents(contents: string[][]): void {
        if (contents.some(row => row.length !== this.effectiveHistoryColumns.length)) {
            throw new Error('CPU states history row has unexpected number of columns');
        }
        const paddedContents = contents.map(row => row.map((value, index) => value.padEnd(this.effectiveHistoryColumns.at(index)!.length)).join(''));
        paddedContents.forEach(line => this.printLine(line));
    }

    public showHistory(): void {
        this.printLine('');
        if (this.historyEntries.length === 0) {
            this.printLine('No CPU state history captured');
            this.printLine('');
            return;
        }

        this.printHeader();
        const contents: string[][] = [];
        if (this.historyEntries.length > 1) {
            const history = this.historyEntries.slice(0, -1);
            const historyContents = history.map((historyEntry, index) => {
                const refCpuStates = this.historyEntries.at(index + 1)!.cpuStates;
                const indexDiff = index - (this.historyEntries.length - 1);
                const diffNum = -indexDiff - 1;
                const cpuStatesDiff = refCpuStates - historyEntry.cpuStates;
                const cpuStatesDiffString = this.frequency === undefined
                    ? cpuStatesDiff.toString()
                    : calculateTime(cpuStatesDiff, this.frequency);
                return [
                    indexDiff.toString(),
                    `d${diffNum}:${cpuStatesDiffString}`,
                    historyEntry.reason,
                ];
            });
            contents.push(...historyContents);
        }
        const current = this.lastEntry!;
        const currentCpuStatesString = this.frequency === undefined
            ? current.cpuStates.toString()
            : calculateTime(current.cpuStates, this.frequency);
        const currentContents = [
            ' 0',
            currentCpuStatesString,
            current.reason,
        ];
        contents.push(currentContents);
        this.printContents(contents);
        this.printLine('');
        // Focus debug console
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

    public resetHistory(): void {
        const lastEntry = this.lastEntry;
        // Clear history and init with last entry if existent
        this.historyEntries = lastEntry ? [lastEntry] : [];
    }
};
