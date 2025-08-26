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
const COLUMN_SEPARATOR = '   ';  // 3 spaces
const DELTA_PLACEHOLDER = '    ';  // 4 spaces ('d<n>: ')
const DELTA = '\u0394';  // Capital Delta

interface HistoryEntry {
    cpuStates: bigint;
    threadId: number|undefined;
    location: string|undefined;
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
        { title: `${DELTA}T`, length: 2, alignRight: true },
        { title: 'CPU Time', length: 8, alignRight: true, deltaIndex: true },
        { title: 'CPU States', length: 10, alignRight: true, deltaIndex: true },
        { title: 'Reason', length: 6, alignRight: false },
        { title: '', length: 0, alignRight: false },
    ];

    constructor(private pname?: string) {}

    private get effectiveHistoryColumns(): HistoryColumn[] {
        if (this.frequency === undefined) {
            return this.historyColumns.filter(col => col.title !== 'CPU Time');
        }
        return this.historyColumns;
    }

    private get lastEntry(): HistoryEntry|undefined {
        if (!this.historyEntries.length) {
            return undefined;
        }
        return this.historyEntries.at(this.historyEntries.length - 1);
    }

    public updateHistory(cpuStates: bigint, threadId?: number, reason?: string): void {
        const newReason = reason ?? 'Unknown';
        if (this.historyEntries.length >= HISTORY_ENTRIES_MAX + 1) {
            this.historyEntries.shift();
        }
        this.historyEntries.push({
            cpuStates,
            threadId,
            location: undefined,
            reason: newReason
        });
    }

    public insertStopLocation(location: string, threadId?: number|undefined) {
        if (!this.historyEntries.length) {
            return;
        }
        const entryToUpdate = this.historyEntries.findLast(entry => !entry.location && (threadId === undefined || entry.threadId === threadId));
        if (!entryToUpdate) {
            return;
        }
        entryToUpdate.location = location;
    }

    protected printLine(message: string) {
        vscode.debug.activeDebugConsole.appendLine(message);
    }

    protected printContents(contents: string[][]): void {
        if (contents.some(row => row.length !== this.effectiveHistoryColumns.length)) {
            throw new Error('CPU states history row has unexpected number of columns');
        }
        const paddedContents = contents.map(row => row.map((value, index) => value.padEnd(this.effectiveHistoryColumns.at(index)!.length)).join(COLUMN_SEPARATOR));
        paddedContents.forEach(line => this.printLine(line));
    }

    protected formatContents(headers: string[], contents: string[][]): void {
        this.effectiveHistoryColumns.forEach((col, columnIndex) => {
            let widestContent = 0;
            contents.forEach(rowEntry => {
                widestContent = Math.max(widestContent, rowEntry.at(columnIndex)?.length ?? 0);
            });
            const headerWidth = headers.at(columnIndex)?.length ?? 0;
            const widest = Math.max(widestContent, col.deltaIndex ? headerWidth - 4 : headerWidth);
            const headerPadWidth = col.deltaIndex ? widest + DELTA_PLACEHOLDER.length : widest;
            const header = headers.at(columnIndex);
            if (header) {
                // eslint-disable-next-line security/detect-object-injection
                headers[columnIndex] = header.padEnd(headerPadWidth, ' ');
            }
            contents.forEach((rowEntry, rowIndex) => {
                const value = col.alignRight ? rowEntry.at(columnIndex)?.padStart(widest, ' ') : rowEntry.at(columnIndex)?.padEnd(widest, ' ');
                const deltaNum = contents.length - rowIndex - 2;
                if (col.deltaIndex) {
                    const prefix = (rowIndex !== contents.length - 1) ? `${DELTA}${deltaNum.toString()}: ` : DELTA_PLACEHOLDER;
                    // eslint-disable-next-line security/detect-object-injection
                    rowEntry[columnIndex] = `${prefix}${value ?? ''}`;
                } else {
                    // eslint-disable-next-line security/detect-object-injection
                    rowEntry[columnIndex] = value ?? '';
                }
            });
        });
    }

    protected prepareHeaderContents(): string[] {
        const columnHeaders = this.effectiveHistoryColumns.map(columnHeader => {
            const title = columnHeader.title.padEnd(columnHeader.length);
            // Set title to Pname
            const setPname = (columnHeader.title === '' && !!this.pname?.length);
            return setPname ? `(${this.pname})` : title;
        });
        return columnHeaders;
    }

    protected prepareDiffRowContents(entry: HistoryEntry, index: number): string[] {
        const refCpuStates = this.historyEntries.at(index + 1)!.cpuStates;
        const indexDiff = index - (this.historyEntries.length - 1);
        const cpuStatesDiff = refCpuStates - entry.cpuStates;
        const cpuStatesDiffString = cpuStatesDiff.toString();
        if (this.frequency === undefined) {
            return [
                indexDiff.toString(),
                cpuStatesDiffString,
                entry.reason,
                entry.location?.length ? `(${entry.location})` : ''
            ];
        } else {
            const cpuTimeDiffString = calculateTime(cpuStatesDiff, this.frequency);
            return [
                indexDiff.toString(),
                cpuTimeDiffString,
                cpuStatesDiffString,
                entry.reason,
                entry.location?.length ? `(${entry.location})` : ''
            ];
        }
    }

    protected prepareCurrentRowContents(): string[] {
        const current = this.lastEntry!;
        const cpuStatesString = current.cpuStates.toString();
        const currentCpuTimeString = this.frequency === undefined
            ? cpuStatesString
            : calculateTime(current.cpuStates, this.frequency);
        if (this.frequency === undefined) {
            return [
                '0',
                cpuStatesString,
                current.reason,
                current.location?.length ? `(${current.location})` : ''
            ];
        } else {
            return [
                '0',
                currentCpuTimeString,
                cpuStatesString,
                current.reason,
                current.location?.length ? `(${current.location})` : ''
            ];
        }
    }

    public showHistory(): void {
        this.printLine('');
        if (this.historyEntries.length === 0) {
            this.printLine('No CPU state history captured');
            this.printLine('');
            return;
        }

        const contents: string[][] = [];
        const headerContents = this.prepareHeaderContents();
        if (this.historyEntries.length > 1) {
            const history = this.historyEntries.slice(0, -1);
            const historyContents = history.map((historyEntry, index) => this.prepareDiffRowContents(historyEntry, index));
            contents.push(...historyContents);
        }
        const currentContents = this.prepareCurrentRowContents();
        contents.push(currentContents);
        this.formatContents(headerContents, contents);
        this.printLine(headerContents.join(COLUMN_SEPARATOR));
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
