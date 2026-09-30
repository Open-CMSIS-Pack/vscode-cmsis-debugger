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

import * as path from 'node:path';

import * as vscode from 'vscode';

import { CBuildRunFileLocator } from '../../cbuild-run';
import { CSV_TABLE_EDITOR_VIEW_TYPE } from '../../views/csv-table-viewer/csv-table-editor-provider';

interface CapturedTrace {
    readonly uri: vscode.Uri;
    readonly type: 'SWO' | 'TB';
    readonly modifiedAt: number;
}

interface CapturedTraceQuickPickItem extends vscode.QuickPickItem {
    readonly trace: CapturedTrace;
}

/**
 * Finds and opens decoded trace CSV files for the active solution set.
 */
export class CapturedTraceResolver {
    public constructor(
        private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator()
    ) { }

    public async open(cbuildRunFilePath?: string): Promise<void> {
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (activeSolutionFolder === undefined) {
            return;
        }
        let solutionSet: string;
        try {
            solutionSet = await this.cbuildRunFileLocator.getDefaultSolutionSet(cbuildRunFilePath);
        } catch {
            return;
        }
        const captures = await this.findCaptures(activeSolutionFolder, solutionSet);
        if (captures.length === 0) {
            return;
        }
        if (captures.length === 1) {
            await this.openCapture(captures[0].uri);
            return;
        }

        const selected = await vscode.window.showQuickPick(
            captures.map(capture => this.toQuickPickItem(capture)),
            { placeHolder: 'Select a captured trace to open' }
        );
        if (selected !== undefined) {
            await this.openCapture(selected.trace.uri);
        }
    }

    private async openCapture(uri: vscode.Uri): Promise<void> {
        await vscode.commands.executeCommand('vscode.openWith', uri, CSV_TABLE_EDITOR_VIEW_TYPE);
    }

    private async findCaptures(activeSolutionFolder: vscode.Uri, solutionSet: string): Promise<CapturedTrace[]> {
        const traceFolder = vscode.Uri.joinPath(activeSolutionFolder, '.trace');
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(traceFolder);
        } catch {
            return [];
        }
        const candidates = entries
            .filter(([, fileType]) => (fileType & vscode.FileType.File) !== 0)
            .map(([fileName]) => ({ fileName, type: this.getCaptureType(fileName, solutionSet) }))
            .filter((candidate): candidate is { fileName: string; type: 'SWO' | 'TB' } => candidate.type !== undefined);
        const captures = await Promise.all(candidates.map(async candidate => {
            const uri = vscode.Uri.joinPath(traceFolder, candidate.fileName);
            const stat = await vscode.workspace.fs.stat(uri);
            return { uri, type: candidate.type, modifiedAt: stat.mtime };
        }));
        return captures.sort((first, second) => second.modifiedAt - first.modifiedAt);
    }

    private getCaptureType(fileName: string, solutionSet: string): 'SWO' | 'TB' | undefined {
        if (fileName === `${solutionSet}.SWO.csv`) {
            return 'SWO';
        }
        return fileName === `${solutionSet}.TB.csv`
            || (fileName.startsWith(`${solutionSet}.TB_`) && fileName.endsWith('.csv'))
            ? 'TB'
            : undefined;
    }

    private toQuickPickItem(trace: CapturedTrace): CapturedTraceQuickPickItem {
        return {
            label: `${trace.type} - ${new Date(trace.modifiedAt).toLocaleString()}`,
            detail: path.basename(trace.uri.fsPath),
            trace
        };
    }
}