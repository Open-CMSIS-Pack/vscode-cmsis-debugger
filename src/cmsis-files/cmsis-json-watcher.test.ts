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

import { activeSolutionWatchFactory } from '../__test__/active-solution-watch.factory';
import { extensionContextFactory } from '../__test__/vscode.factory';
import { CMSIS_JSON_FILE_GLOB } from '../manifest';
import { normalizeFsPath } from '../utils';
import { CmsisJsonWatcher } from './cmsis-json-watcher';

interface MutableWorkspace {
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
}

function encodeCmsisJson(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value));
}

describe('CmsisJsonWatcher', () => {
    const cmsisJsonFile = vscode.Uri.file('/workspace/.vscode/cmsis.json');
    const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
    const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;

    afterEach(() => {
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('registers and disposes a cmsis.json watcher after recording the initial active solution', async () => {
        const context = extensionContextFactory();
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([cmsisJsonFile]);
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(encodeCmsisJson({
            activeSolution: '../first.csolution.yml'
        }));

        await activeSolutionWatcher.activate(context, activeSolutionWatch.fileWatchManager);

        expect(activeSolutionWatch.addWatch).toHaveBeenCalledWith(expect.objectContaining({
            id: 'workspace.cmsis-json',
            globPattern: expect.objectContaining({
                base: vscode.workspace.workspaceFolders?.at(0)?.uri,
                pattern: CMSIS_JSON_FILE_GLOB
            }),
            onDidCreate: expect.any(Function),
            onDidChange: expect.any(Function),
            onDidDelete: expect.any(Function)
        }));
        expect(context.subscriptions).toContain(activeSolutionWatcher);

        activeSolutionWatcher.dispose();

        expect(activeSolutionWatch.removeWatch).toHaveBeenCalledWith('workspace.cmsis-json');
    });

    it('does not register a cmsis.json watch when no workspace folder is available', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        mutableWorkspace.workspaceFolders = undefined;

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);

        expect(activeSolutionWatch.addWatch).not.toHaveBeenCalled();
    });

    it('emits a generation event when activeSolution changes', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        const events: unknown[] = [];
        activeSolutionWatcher.onDidChangeActiveSolution(event => events.push(event));
        jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([cmsisJsonFile]);
        jest.spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValueOnce(encodeCmsisJson({ activeSolution: '../first.csolution.yml' }))
            .mockResolvedValueOnce(encodeCmsisJson({ activeSolution: '../second.csolution.yml' }));

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);
        await activeSolutionWatch.getWatch().onDidCreate?.(cmsisJsonFile);

        expect(events).toEqual([{
            previousActiveSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../first.csolution.yml')),
            activeSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../second.csolution.yml')),
            generation: 1
        }]);
    });

    it('does not emit for unrelated cmsis.json changes or active-target changes', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        const onDidChangeActiveSolution = jest.fn();
        activeSolutionWatcher.onDidChangeActiveSolution(onDidChangeActiveSolution);
        jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([cmsisJsonFile]);
        jest.spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValueOnce(encodeCmsisJson({
                activeSolution: '../project.csolution.yml',
                activeTarget: 'Project.Debug+CM33'
            }))
            .mockResolvedValueOnce(encodeCmsisJson({
                activeSolution: '../project.csolution.yml',
                activeTarget: 'Project.Release+CM33',
                unrelatedSetting: true
            }));

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);
        await activeSolutionWatch.getWatch().onDidChange?.(cmsisJsonFile);

        expect(onDidChangeActiveSolution).not.toHaveBeenCalled();
    });

    it('emits when a valid cmsis.json clears activeSolution', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        const events: unknown[] = [];
        activeSolutionWatcher.onDidChangeActiveSolution(event => events.push(event));
        jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([cmsisJsonFile]);
        jest.spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValueOnce(encodeCmsisJson({ activeSolution: '../project.csolution.yml' }))
            .mockResolvedValueOnce(encodeCmsisJson({ activeTarget: 'Project.Debug+CM33' }));

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);
        await activeSolutionWatch.getWatch().onDidChange?.(cmsisJsonFile);

        expect(events).toEqual([{
            previousActiveSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../project.csolution.yml')),
            activeSolutionPath: undefined,
            generation: 1
        }]);
    });

    it('emits when cmsis.json is deleted', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        const events: unknown[] = [];
        activeSolutionWatcher.onDidChangeActiveSolution(event => events.push(event));
        jest.spyOn(vscode.workspace, 'findFiles')
            .mockResolvedValueOnce([cmsisJsonFile])
            .mockResolvedValueOnce([]);
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(encodeCmsisJson({
            activeSolution: '../project.csolution.yml'
        }));

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);
        await activeSolutionWatch.getWatch().onDidDelete?.(cmsisJsonFile);

        expect(events).toEqual([{
            previousActiveSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../project.csolution.yml')),
            activeSolutionPath: undefined,
            generation: 1
        }]);
    });

    it('retains the last active solution after read or parse failures and emits when a later read succeeds', async () => {
        const activeSolutionWatch = activeSolutionWatchFactory();
        const activeSolutionWatcher = new CmsisJsonWatcher();
        const events: unknown[] = [];
        activeSolutionWatcher.onDidChangeActiveSolution(event => events.push(event));
        jest.spyOn(vscode.workspace, 'findFiles').mockResolvedValue([cmsisJsonFile]);
        jest.spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValueOnce(encodeCmsisJson({ activeSolution: '../first.csolution.yml' }))
            .mockRejectedValueOnce(new Error('temporarily unreadable'))
            .mockResolvedValueOnce(new TextEncoder().encode('activeSolution: ['))
            .mockResolvedValueOnce(encodeCmsisJson({ activeSolution: '../second.csolution.yml' }));

        await activeSolutionWatcher.activate(extensionContextFactory(), activeSolutionWatch.fileWatchManager);
        await activeSolutionWatch.getWatch().onDidChange?.(cmsisJsonFile);
        await activeSolutionWatch.getWatch().onDidChange?.(cmsisJsonFile);
        await activeSolutionWatch.getWatch().onDidChange?.(cmsisJsonFile);

        expect(events).toEqual([{
            previousActiveSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../first.csolution.yml')),
            activeSolutionPath: normalizeFsPath(path.resolve('/workspace/.vscode', '../second.csolution.yml')),
            generation: 1
        }]);
    });
});
