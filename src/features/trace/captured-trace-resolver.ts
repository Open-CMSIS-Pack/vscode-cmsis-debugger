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

import { CBuildRunFileLocator } from '../../cbuild-run';
import { CSV_TABLE_EDITOR_VIEW_TYPE } from '../../views/csv-table-viewer/csv-table-editor-provider';

interface CapturedTrace {
    readonly uri: vscode.Uri;
    readonly type: 'SWO' | 'TB';
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
        const capture = captures.find(({ type }) => type === 'SWO') ?? captures[0];
        if (capture !== undefined) {
            await this.openCapture(capture.uri);
        }
    }

    public async hasCapture(cbuildRunFilePath?: string): Promise<boolean> {
        const activeSolutionFolder = await this.cbuildRunFileLocator.getActiveSolutionFolder();
        if (activeSolutionFolder === undefined) {
            return false;
        }
        try {
            const solutionSet = await this.cbuildRunFileLocator.getDefaultSolutionSet(cbuildRunFilePath);
            return (await this.findCaptures(activeSolutionFolder, solutionSet)).length > 0;
        } catch {
            return false;
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
        return candidates
            .sort((first, second) => first.fileName.localeCompare(second.fileName))
            .map(candidate => ({
                uri: vscode.Uri.joinPath(traceFolder, candidate.fileName),
                type: candidate.type
            }));
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

}
