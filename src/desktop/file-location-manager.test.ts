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
