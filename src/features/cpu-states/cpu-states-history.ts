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

interface HistoryValues {
    cpuStates: bigint;
    reason: string;
}

interface HistoryColumn {
    title: string;
    length: number;
}

export class CpuStatesHistory {
    private historyValues: HistoryValues[] = [];
    public frequency: number|undefined;

    private readonly historyColumns: HistoryColumn[] = [
        { title: 'Diff', length: 6 },
        { title: 'CPU Time', length: 16 },
        { title: 'CPU States', length: 12 },
        { title: 'Reason', length: 8 },
        { title: '(TODO: Corename)', length: 12 },
    ];

    public updateHistory(cpuStates: bigint, reason?: string): void {
        if (this.historyValues.length >= HISTORY_ENTRIES_MAX + 1) {
            this.historyValues.shift();
        }
        this.historyValues.push({
            cpuStates,
            reason: reason ?? 'Unknown'
        });
    }

    protected printLine(message: string) {
        vscode.debug.activeDebugConsole.appendLine(message);
    }

    protected printHeader(): void {
        const columnHeaders = this.historyColumns.map(columnHeader => columnHeader.title.padEnd(columnHeader.length));
        const header = columnHeaders.join('');
        this.printLine(header);
    }

    protected printContents(contents: string[][]): void {
        if (contents.some(row => row.length !== this.historyColumns.length)) {
            throw new Error('CPU states history row has unexpected number of columns');
        }
        const paddedContents = contents.map(row => row.map((value, index) => value.padEnd(this.historyColumns.at(index)!.length)).join(''));
        paddedContents.forEach(line => this.printLine(line));
    }

    public showHistory(): void {
        this.printLine('');
        if (this.historyValues.length === 0) {
            this.printLine('No CPU state history captured');
            this.printLine('');
            return;
        }

        this.printHeader();
        const contents: string[][] = [];
        if (this.historyValues.length > 1) {
            const history = this.historyValues.slice(0, -1);
            const historyContents = history.map((historyEntry, index) => {
                const refCpuStates = this.historyValues.at(index + 1)!.cpuStates;
                const indexDiff = index - (this.historyValues.length - 1);
                const diffNum = -indexDiff - 1;
                const cpuStatesDiff = refCpuStates - historyEntry.cpuStates;
                const cpuStatesDiffString = this.frequency === undefined
                    ? cpuStatesDiff.toString()
                    : calculateTime(cpuStatesDiff, this.frequency);
                return [
                    indexDiff.toString(),
                    `d${diffNum}:${cpuStatesDiffString}`,
                    historyEntry.cpuStates.toString(),
                    historyEntry.reason,
                    '' // placeholder for pname column
                ];
            });
            contents.push(...historyContents);
        }
        const current = this.historyValues.at(this.historyValues.length - 1)!;
        const currentCpuStatesString = this.frequency === undefined
            ? current.cpuStates.toString()
            : calculateTime(current.cpuStates, this.frequency);
        const currentContents = [
            ' 0',
            currentCpuStatesString,
            current.cpuStates.toString(),
            current.reason,
            '' // placeholder for pname column
        ];
        contents.push(currentContents);
        this.printContents(contents);
        this.printLine('');
        // Focus debug console
        vscode.commands.executeCommand('workbench.debug.action.focusRepl');
    }
};
