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
    alignRight?: boolean;
    deltaIndex?: boolean;
}

export class CpuStatesHistory {
    public frequency: number|undefined;
    private historyEntries: HistoryEntry[] = [];

    private readonly historyColumns: HistoryColumn[] = [
        { title: 'Diff', length: 6, alignRight: true },
        { title: 'CPU Time', length: 18, alignRight: true, deltaIndex: true },
        { title: 'CPU States', length: 12, alignRight: true, deltaIndex: true },
        { title: 'Reason', length: 10, alignRight: false },
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

    protected formatContents(contents: string[][]): void {
        this.effectiveHistoryColumns.forEach((col, columnIndex) => {
            let widest = 0;
            contents.forEach(rowEntry => {
                widest = Math.max(widest, rowEntry.at(columnIndex)?.length ?? 0);
            });
            contents.forEach((rowEntry, rowIndex) => {
                const value = col.alignRight ? rowEntry.at(columnIndex)?.padStart(widest, ' ') : rowEntry.at(columnIndex)?.padEnd(widest, ' ');
                const deltaNum = contents.length - rowIndex - 2;
                if (col.deltaIndex) {
                    const prefix = (rowIndex !== contents.length - 1) ? `d${deltaNum.toString()}: ` : '    ';
                    // eslint-disable-next-line security/detect-object-injection
                    rowEntry[columnIndex] = `${prefix}${value ?? ''}`;
                } else {
                    // eslint-disable-next-line security/detect-object-injection
                    rowEntry[columnIndex] = value ?? '';
                }
            });
        });
    }

    protected prepareDiffRowContents(entry: HistoryEntry, index: number): string[] {
        const refCpuStates = this.historyEntries.at(index + 1)!.cpuStates;
        const indexDiff = index - (this.historyEntries.length - 1);
        const cpuStatesDiff = refCpuStates - entry.cpuStates;
        const cpuStatesDiffString = this.frequency === undefined
            ? cpuStatesDiff.toString()
            : calculateTime(cpuStatesDiff, this.frequency);
        return [
            indexDiff.toString(),
            `${cpuStatesDiffString}`,
            entry.reason,
        ];
    }

    protected prepareCurrentRowContents(): string[] {
        const current = this.lastEntry!;
        const currentCpuStatesString = this.frequency === undefined
            ? current.cpuStates.toString()
            : calculateTime(current.cpuStates, this.frequency);
        return [
            '0',
            `${currentCpuStatesString}`,
            current.reason,
        ];
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
            const historyContents = history.map((historyEntry, index) => this.prepareDiffRowContents(historyEntry, index));
            contents.push(...historyContents);
        }
        const currentContents = this.prepareCurrentRowContents();
        contents.push(currentContents);
        this.formatContents(contents);
        this.printContents(contents);
        this.printLine('');

        // Focus debug console
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }

    public resetHistory(): void {
        const lastEntry = this.lastEntry;
        if (lastEntry) {
            lastEntry.cpuStates = BigInt(0);
        }
        // Clear history and init with last entry if existent
        this.historyEntries = lastEntry ? [lastEntry] : [];
    }
};
