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

import { logger } from '../logger';
import { CBUILD_INDEX_FILE_GLOB } from '../manifest';
import { FileLocationManager } from './file-location-manager';

interface MutableWorkspace {
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
}

describe('FileLocationManager', () => {
    const fileLocationManager = new FileLocationManager();
    const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
    const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;

    afterEach(() => {
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('finds an existing cbuild index in the main workspace', async () => {
        const workspaceFolder = {
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        };
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        mutableWorkspace.workspaceFolders = [workspaceFolder];
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([cbuildIndexFile]);

        const result = await fileLocationManager.findExistingCBuildIndexFile();

        expect(result).toBe(cbuildIndexFile);
        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                base: workspaceFolder,
                pattern: CBUILD_INDEX_FILE_GLOB
            }),
            null,
            1
        );
    });

    it('does not search for a cbuild index without a workspace', async () => {
        mutableWorkspace.workspaceFolders = undefined;

        await expect(fileLocationManager.findExistingCBuildIndexFile()).resolves.toBeUndefined();

        expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
    });

    it('reads the cbuild-run file name relative to its cbuild index', async () => {
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(new TextEncoder().encode([
            'build-idx:',
            '  cbuild-run: out/project.cbuild-run.yml',
            ''
        ].join('\n')));

        const result = await fileLocationManager.readCBuildRunFileNameFromIndex(cbuildIndexFile);

        expect(result).toBe(path.resolve(path.dirname(cbuildIndexFile.fsPath), 'out/project.cbuild-run.yml'));
    });

    it('returns undefined and logs when a cbuild index cannot be read', async () => {
        const loggerSpy = jest.spyOn(logger, 'debug');
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(new Error('read failed'));

        const result = await fileLocationManager.readCBuildRunFileNameFromIndex(cbuildIndexFile);

        expect(result).toBeUndefined();
        expect(loggerSpy).toHaveBeenCalledWith('Trace Configuration: Failed to read generated cbuild index file: read failed');
    });

    it('returns cbuild-run file path from CMSIS Solution command', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('/workspace/project/example.cbuild-run.yml');

        const result = await fileLocationManager.getCBuildRunFileName();

        expect(result).toBe('/workspace/project/example.cbuild-run.yml');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
    });

    it('returns undefined when CMSIS Solution command returns an empty value', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('   ');

        const result = await new FileLocationManager().getCBuildRunFileName();

        expect(result).toBeUndefined();
    });

    it('returns undefined and logs when CMSIS Solution command fails', async () => {
        const loggerSpy = jest.spyOn(logger, 'debug');
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('command unavailable'));

        const result = await fileLocationManager.getCBuildRunFileName();

        expect(result).toBeUndefined();
        expect(loggerSpy).toHaveBeenCalledWith('Failed to get active cbuild-run file from CMSIS Solution: command unavailable');
    });

    it('supports separate FileLocationManager instances', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('/workspace/project/example.cbuild-run.yml');

        const result = await new FileLocationManager().getCBuildRunFileName();

        expect(result).toBe('/workspace/project/example.cbuild-run.yml');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
    });
});
