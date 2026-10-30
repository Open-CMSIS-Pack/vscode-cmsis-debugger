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

/** Locates the trace directory used by resolver tests. */
const ACTIVE_SOLUTION_FOLDER = vscode.Uri.file('/workspace/solution');
/** Pins the build file supplied by existing callers. */
const CBUILD_RUN_FILE_PATH = '/workspace/solution+target.cbuild-run.yml';
/** Identifies matching capture filenames. */
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

    it('reports whether the active solution set has an SWO or TB capture file', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock)
            .mockResolvedValueOnce([
                [`${SOLUTION_SET}.TB_0.csv`, vscode.FileType.File],
            ])
            .mockResolvedValueOnce([]);

        await expect(resolver.hasCapture(CBUILD_RUN_FILE_PATH)).resolves.toBe(true);
        await expect(resolver.hasCapture(CBUILD_RUN_FILE_PATH)).resolves.toBe(false);
    });

    it('rejects a supported capture path that is not a file', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.Directory],
        ]);

        await expect(resolver.hasCapture(CBUILD_RUN_FILE_PATH)).resolves.toBe(false);
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

    it('prefers the SWO capture when SWO and TB captures exist', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.TB_0.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB.csv`, vscode.FileType.File],
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            vscode.Uri.file(`/workspace/solution/.trace/${SOLUTION_SET}.SWO.csv`),
            CSV_TABLE_EDITOR_VIEW_TYPE,
        );
    });

    it('opens the first indexed TB capture when multiple buffers exist', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.TB_1.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB_0.csv`, vscode.FileType.File],
            [`${SOLUTION_SET}.TB.csv`, vscode.FileType.File],
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            vscode.Uri.file(`/workspace/solution/.trace/${SOLUTION_SET}.TB_0.csv`),
            CSV_TABLE_EDITOR_VIEW_TYPE,
        );
    });

    it('focuses an existing hidden CSV tab in its original group during automatic opening', async () => {
        const uri = vscode.Uri.file(`/workspace/solution/.trace/${SOLUTION_SET}.SWO.csv`);
        const tabs: vscode.Tab[] = [];
        const group: vscode.TabGroup = { isActive: false, viewColumn: vscode.ViewColumn.Two, activeTab: undefined, tabs };
        tabs.push({
            input: new vscode.TabInputCustom(uri, CSV_TABLE_EDITOR_VIEW_TYPE),
            label: 'Trace', group, isActive: false, isDirty: false, isPinned: true, isPreview: false,
        });
        jest.spyOn(vscode.window.tabGroups, 'all', 'get').mockReturnValue([group]);
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH, { preserveFocus: false });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith', uri, CSV_TABLE_EDITOR_VIEW_TYPE,
            { preserveFocus: false, viewColumn: vscode.ViewColumn.Two },
        );
    });

    it('opens and focuses a new automatic capture beside the source', async () => {
        (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File],
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH, { preserveFocus: false });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            vscode.Uri.file(`/workspace/solution/.trace/${SOLUTION_SET}.SWO.csv`),
            CSV_TABLE_EDITOR_VIEW_TYPE,
            { preserveFocus: false, viewColumn: vscode.ViewColumn.Beside },
        );
    });

    it('checks the resolved selection after asynchronous capture discovery', async () => {
        const directory = Promise.withResolvers<[string, vscode.FileType][]>();
        jest.mocked(vscode.workspace.fs.readDirectory).mockReturnValue(directory.promise);
        const canOpen = jest.fn().mockResolvedValue(false);
        const opening = resolver.open(CBUILD_RUN_FILE_PATH, {}, canOpen);

        directory.resolve([[`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File]]);
        await opening;

        expect(canOpen).toHaveBeenCalledWith(SOLUTION_SET);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('opens a capture accepted by the asynchronous selection guard', async () => {
        jest.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([
            [`${SOLUTION_SET}.SWO.csv`, vscode.FileType.File]
        ]);

        await resolver.open(CBUILD_RUN_FILE_PATH, {}, async () => true);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith', expect.anything(), CSV_TABLE_EDITOR_VIEW_TYPE);
    });
});
