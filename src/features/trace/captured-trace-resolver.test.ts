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
import { CapturedTraceResolver } from './captured-trace-resolver';

const ACTIVE_SOLUTION_FOLDER = vscode.Uri.file('/workspace/solution');
const CBUILD_RUN_FILE_PATH = '/workspace/solution+target.cbuild-run.yml';
const SOLUTION_SET = 'solution+target';

describe('CapturedTraceResolver', () => {
    let locator: CBuildRunFileLocator;
    let resolver: CapturedTraceResolver;

    beforeEach(() => {
        locator = new CBuildRunFileLocator();
        resolver = new CapturedTraceResolver(locator);
        jest.spyOn(locator, 'getActiveSolutionFolder').mockResolvedValue(ACTIVE_SOLUTION_FOLDER);
        jest.spyOn(locator, 'getDefaultSolutionSet').mockResolvedValue(SOLUTION_SET);
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([]);
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({ mtime: 0 } as vscode.FileStat);
    });

    afterEach(() => jest.restoreAllMocks());

    it('silently does nothing when no matching capture exists', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            ['other+target.SWO.csv', vscode.FileType.File],
            [`${SOLUTION_SET}.raw.csv`, vscode.FileType.File],
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('silently does nothing when the active cbuild-run file is unavailable', async () => {
        jest.spyOn(locator, 'getDefaultSolutionSet').mockRejectedValue(new Error('No cbuild run file path provided.'));

        await expect(resolver.open()).resolves.toBeUndefined();

        expect(vscode.workspace.fs.readDirectory).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('opens a single supported capture directly', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
        ]);
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({ mtime: 1_000 } as vscode.FileStat);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            vscode.Uri.file(`/workspace/solution/.trace/${SOLUTION_SET}.SWO.csv`),
            CSV_TABLE_EDITOR_VIEW_TYPE,
        );
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('sorts multiple supported captures newest first and opens the selected one', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB_0.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB_invalid.txt`, vscode.FileType.File],
        ]);
        (vscode.workspace.fs.stat as jest.Mock)
            .mockResolvedValueOnce({ mtime: 1_000 } as vscode.FileStat)
            .mockResolvedValueOnce({ mtime: 3_000 } as vscode.FileStat)
            .mockResolvedValueOnce({ mtime: 2_000 } as vscode.FileStat);
        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: vscode.QuickPickItem[]) => items[0]);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.window.showQuickPick).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ label: expect.stringMatching(/^TB - /), detail: `${SOLUTION_SET}.TB_0.csv` }),
            expect.objectContaining({ label: expect.stringMatching(/^TB - /), detail: `${SOLUTION_SET}.TB.csv` }),
            expect.objectContaining({ label: expect.stringMatching(/^SWO - /), detail: `${SOLUTION_SET}.SWO.csv` }),
        ]), expect.any(Object));
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            expect.objectContaining({ path: `/workspace/solution/.trace/${SOLUTION_SET}.TB_0.csv` }),
            CSV_TABLE_EDITOR_VIEW_TYPE,
        );
    });

    it('silently does nothing when the capture picker is cancelled', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB.csv`, vscode.FileType.File],
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});
