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

import { activeSolutionWatchFactory } from '../../__test__/active-solution-watch.factory';
import { CBuildRunFileLocator } from '../../cbuild-run';
import { FileWatchManager, FileWatchRegistrationOptions } from '../../desktop/filesystem/file-watch-manager';
import { CBUILD_INDEX_FILE_GLOB, CMSIS_JSON_FILE_GLOB } from '../../manifest';
import { normalizeFsPath, waitForCondition } from '../../utils';
import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import {
    GeneratedCBuildRunFileChangeEvent,
    TraceConfigurationFileWatcher,
    TraceConfigurationFileWatcherCallbacks
} from './trace-configuration-file-watcher';

interface MockFileSystemWatcher {
    dispose: jest.Mock;
    onDidCreate: jest.Mock;
    onDidChange: jest.Mock;
    onDidDelete: jest.Mock;
    _handlers: {
        create: Array<(uri: vscode.Uri) => void>;
        change: Array<(uri: vscode.Uri) => void>;
        delete: Array<(uri: vscode.Uri) => void>;
    };
}

interface MutableWorkspace {
    workspaceFolders: vscode.WorkspaceFolder[] | undefined;
}

interface MockCTraceYamlFile {
    file: CTraceYamlFile;
    reloadIfChanged: jest.Mock;
}

function getLastCreatedFileSystemWatcher(): MockFileSystemWatcher {
    const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.at(-1)?.value as MockFileSystemWatcher | undefined;
    expect(watcher).toBeDefined();
    return watcher as MockFileSystemWatcher;
}

function createMockCTraceYamlFile(): MockCTraceYamlFile {
    const document = CTraceYamlDocument.parse('ctrace:\n');
    const reloadIfChanged = jest.fn().mockResolvedValue(true);
    return {
        file: {
            fileName: '/workspace/.cmsis/target.ctrace.yml',
            document,
            reloadIfChanged
        } as unknown as CTraceYamlFile,
        reloadIfChanged
    };
}

function createCBuildRunFileLocator(getCBuildRunFileNameFromCommand: jest.Mock): CBuildRunFileLocator {
    const cbuildRunFileLocator = new CBuildRunFileLocator();
    jest.spyOn(cbuildRunFileLocator, 'getActiveSolutionFolder').mockResolvedValue(vscode.Uri.file('/workspace'));
    jest.spyOn(cbuildRunFileLocator, 'getCBuildRunFileNameFromCommand').mockImplementation(getCBuildRunFileNameFromCommand);
    return cbuildRunFileLocator;
}

describe('TraceConfigurationFileWatcher', () => {
    const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
    const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;

    afterEach(() => {
        jest.restoreAllMocks();
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
    });

    it('registers and removes every trace configuration watch through the manager', async () => {
        const watchedFile = createMockCTraceYamlFile();
        const addWatch = jest.fn();
        const removeWatch = jest.fn();
        const fileWatchManager = { addWatch, removeWatch } as unknown as FileWatchManager;
        const watcher = new TraceConfigurationFileWatcher(
            {
                getCurrentFile: () => watchedFile.file,
                onCurrentFileReloaded: jest.fn(),
                onCurrentFileReloadFailed: jest.fn(),
                onGeneratedCBuildRunFileChanged: jest.fn()
            },
            undefined,
            fileWatchManager
        );

        await watcher.watchGeneratedCBuildRunFiles();
        watcher.watchCurrentFile();
        watcher.dispose();

        expect(addWatch.mock.calls.map(call => (call[0] as FileWatchRegistrationOptions).id)).toEqual([
            'trace-configuration.cbuild-index',
            'trace-configuration.current-ctrace'
        ]);
        expect(removeWatch).toHaveBeenCalledWith('trace-configuration.cbuild-index');
        expect(removeWatch).toHaveBeenCalledWith('trace-configuration.generated-cbuild-run');
        expect(removeWatch).toHaveBeenCalledWith('trace-configuration.current-ctrace');
    });

    it('resolves and watches the generated cbuild-run file after a cbuild index file is created', async () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const getCBuildRunFileNameFromCommand = jest.fn().mockResolvedValue('/workspace/out/project.cbuild-run.yml');
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, createCBuildRunFileLocator(getCBuildRunFileNameFromCommand));
        const events: GeneratedCBuildRunFileChangeEvent[] = [];
        watcher.onDidChangeGeneratedCBuildRunFile(event => events.push(event));

        await watcher.watchGeneratedCBuildRunFiles();

        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        const cbuildIndexPattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls[0]?.[0] as { pattern: string };
        cbuildIndexWatcher._handlers.create[0]?.(vscode.Uri.file('/workspace/project.cbuild-idx.yml'));
        await waitForCondition('resolved cbuild-run watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length === 2);

        const cbuildRunWatcher = getLastCreatedFileSystemWatcher();
        const cbuildRunPattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls[1]?.[0] as {
            base: string;
            pattern: string;
        };
        const uri = vscode.Uri.file('/workspace/out/project.cbuild-run.yml');
        cbuildRunWatcher._handlers.create[0]?.(uri);
        cbuildRunWatcher._handlers.change[0]?.(uri);
        cbuildRunWatcher._handlers.delete[0]?.(uri);

        expect(cbuildIndexPattern.pattern).toBe(CBUILD_INDEX_FILE_GLOB);
        expect(getCBuildRunFileNameFromCommand).toHaveBeenCalledTimes(1);
        expect(cbuildRunPattern.base).toBe('/workspace/out');
        expect(cbuildRunPattern.pattern).toBe('project.cbuild-run.yml');
        expect(events).toEqual([
            { type: 'created', uri },
            { type: 'changed', uri },
            { type: 'deleted', uri }
        ]);
        expect(onGeneratedCBuildRunFileChanged).toHaveBeenCalledTimes(3);

        watcher.dispose();
        expect(cbuildIndexWatcher.dispose).toHaveBeenCalledTimes(1);
        expect(cbuildRunWatcher.dispose).toHaveBeenCalledTimes(1);
    });

    it('processes an existing cbuild-run file after installing its watcher', async () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const cbuildRunFile = vscode.Uri.file(path.resolve('test-data/multi-core.cbuild-run.yml'));
        const getCBuildRunFileNameFromCommand = jest.fn().mockResolvedValue(cbuildRunFile.fsPath);
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, createCBuildRunFileLocator(getCBuildRunFileNameFromCommand));

        await watcher.watchGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        cbuildIndexWatcher._handlers.create[0]?.(vscode.Uri.file('/workspace/project.cbuild-idx.yml'));
        await waitForCondition('existing cbuild-run processing', () =>
            onGeneratedCBuildRunFileChanged.mock.calls.length === 1);

        const cbuildRunWatcher = getLastCreatedFileSystemWatcher();
        const inspectedUri = (vscode.workspace.fs.stat as jest.Mock).mock.calls.at(-1)?.[0] as vscode.Uri | undefined;
        expect(normalizeFsPath(inspectedUri?.fsPath)).toBe(normalizeFsPath(cbuildRunFile.fsPath));
        const changeEvent = onGeneratedCBuildRunFileChanged.mock.calls.at(-1)?.[0] as
            GeneratedCBuildRunFileChangeEvent | undefined;
        expect(changeEvent?.type).toBe('changed');
        expect(normalizeFsPath(changeEvent?.uri.fsPath)).toBe(normalizeFsPath(cbuildRunFile.fsPath));

        cbuildRunWatcher._handlers.change[0]?.(cbuildRunFile);

        expect(onGeneratedCBuildRunFileChanged).toHaveBeenCalledTimes(2);
        watcher.dispose();
        expect(cbuildRunWatcher.dispose).toHaveBeenCalledTimes(1);
    });

    it('resolves the cbuild-run path from a changed index when the command file does not exist', async () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const cbuildRunFile = vscode.Uri.file(path.resolve('test-data/multi-core.cbuild-run.yml'));
        const getCBuildRunFileNameFromCommand = jest.fn().mockResolvedValue('/workspace/out/stale.cbuild-run.yml');
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(new TextEncoder().encode([
            'build-idx:',
            `  cbuild-run: ${JSON.stringify(cbuildRunFile.fsPath)}`,
            ''
        ].join('\n')));
        jest.spyOn(vscode.workspace.fs, 'stat')
            .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
            .mockResolvedValue({
                type: vscode.FileType.File,
                ctime: 0,
                mtime: 0,
                size: 0
            });
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, createCBuildRunFileLocator(getCBuildRunFileNameFromCommand));

        await watcher.watchGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        cbuildIndexWatcher._handlers.change[0]?.(vscode.Uri.file('/workspace/project.cbuild-idx.yml'));
        await waitForCondition('indexed cbuild-run processing', () =>
            onGeneratedCBuildRunFileChanged.mock.calls.length === 1);

        const cbuildRunWatcher = getLastCreatedFileSystemWatcher();
        const cbuildRunPattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls[1]?.[0] as {
            base: string;
            pattern: string;
        };
        expect(getCBuildRunFileNameFromCommand).toHaveBeenCalledTimes(1);
        expect(cbuildRunPattern.base).toBe(path.dirname(cbuildRunFile.fsPath));
        expect(cbuildRunPattern.pattern).toBe(path.basename(cbuildRunFile.fsPath));
        const changeEvent = onGeneratedCBuildRunFileChanged.mock.calls.at(-1)?.[0] as
            GeneratedCBuildRunFileChangeEvent | undefined;
        expect(changeEvent?.type).toBe('changed');
        expect(normalizeFsPath(changeEvent?.uri.fsPath)).toBe(normalizeFsPath(cbuildRunFile.fsPath));

        watcher.dispose();
        expect(cbuildRunWatcher.dispose).toHaveBeenCalledTimes(1);
    });

    it('processes a prebuilt cbuild-run from an existing index when the activation command is empty', async () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const cbuildRunFile = vscode.Uri.file(path.resolve('test-data/multi-core.cbuild-run.yml'));
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        const getCBuildRunFileNameFromCommand = jest.fn().mockResolvedValue('');
        (vscode.workspace.findFiles as jest.Mock)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([cbuildIndexFile]);
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(new TextEncoder().encode([
            'build-idx:',
            `  cbuild-run: ${JSON.stringify(cbuildRunFile.fsPath)}`,
            ''
        ].join('\n')));
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, createCBuildRunFileLocator(getCBuildRunFileNameFromCommand));

        await watcher.watchGeneratedCBuildRunFiles();
        await expect(watcher.processActiveCBuildRunFile()).resolves.toBe(true);

        const cmsisJsonPattern = (vscode.workspace.findFiles as jest.Mock).mock.calls[0]?.[0] as string;
        const indexPattern = (vscode.workspace.findFiles as jest.Mock).mock.calls[1]?.[0] as {
            base: vscode.Uri;
            pattern: string;
        };
        expect(cmsisJsonPattern).toBe(CMSIS_JSON_FILE_GLOB);
        expect(indexPattern.base.fsPath).toBe(normalizeFsPath('/workspace'));
        expect(indexPattern.pattern).toBe(CBUILD_INDEX_FILE_GLOB);
        expect(getCBuildRunFileNameFromCommand).toHaveBeenCalledTimes(1);
        const changeEvent = onGeneratedCBuildRunFileChanged.mock.calls.at(-1)?.[0] as
            GeneratedCBuildRunFileChangeEvent | undefined;
        expect(changeEvent?.type).toBe('changed');
        expect(normalizeFsPath(changeEvent?.uri.fsPath)).toBe(normalizeFsPath(cbuildRunFile.fsPath));

        watcher.dispose();
    });

    it('replaces the generated cbuild-run watcher when the resolved path changes', async () => {
        const getCBuildRunFileNameFromCommand = jest.fn()
            .mockResolvedValueOnce('/workspace/out/first.cbuild-run.yml')
            .mockResolvedValueOnce('/workspace/out/second.cbuild-run.yml');
        jest.spyOn(vscode.workspace.fs, 'stat').mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' })
        );
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, createCBuildRunFileLocator(getCBuildRunFileNameFromCommand));

        await watcher.watchGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        const watcherCount = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length;
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        cbuildIndexWatcher._handlers.create[0]?.(cbuildIndexFile);
        await waitForCondition('first cbuild-run watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length >= watcherCount + 1);
        const firstCBuildRunWatcher = getLastCreatedFileSystemWatcher();

        cbuildIndexWatcher._handlers.change[0]?.(cbuildIndexFile);
        await waitForCondition('replacement cbuild-run watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length >= watcherCount + 2);
        const secondCBuildRunWatcher = getLastCreatedFileSystemWatcher();
        firstCBuildRunWatcher._handlers.change[0]?.(vscode.Uri.file('/workspace/out/first.cbuild-run.yml'));
        secondCBuildRunWatcher._handlers.change[0]?.(vscode.Uri.file('/workspace/out/second.cbuild-run.yml'));

        expect(firstCBuildRunWatcher.dispose).toHaveBeenCalledTimes(1);
        expect(onGeneratedCBuildRunFileChanged.mock.calls.map(call => call[0])).toEqual([{
            type: 'changed',
            uri: vscode.Uri.file('/workspace/out/second.cbuild-run.yml')
        }]);

        watcher.dispose();
    });

    it('forwards current ctrace reloads and ignores stale watcher callbacks', async () => {
        const firstWatchedFile = createMockCTraceYamlFile();
        const secondWatchedFile = createMockCTraceYamlFile();
        let currentFile: CTraceYamlFile | undefined = firstWatchedFile.file;
        const onCurrentFileReloaded = jest.fn();
        const onCurrentFileReloadFailed = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: () => currentFile,
            onCurrentFileReloaded,
            onCurrentFileReloadFailed,
            onGeneratedCBuildRunFileChanged: jest.fn()
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks);

        watcher.watchCurrentFile();
        const firstFileSystemWatcher = getLastCreatedFileSystemWatcher();

        await firstFileSystemWatcher._handlers.change[0]?.(vscode.Uri.file(firstWatchedFile.file.fileName));
        firstWatchedFile.reloadIfChanged.mockRejectedValueOnce(new Error('first failure'));
        await firstFileSystemWatcher._handlers.delete[0]?.(vscode.Uri.file(firstWatchedFile.file.fileName));

        currentFile = secondWatchedFile.file;
        watcher.watchCurrentFile();
        await firstFileSystemWatcher._handlers.change[0]?.(vscode.Uri.file(firstWatchedFile.file.fileName));

        expect(onCurrentFileReloaded).toHaveBeenCalledTimes(1);
        expect(onCurrentFileReloaded).toHaveBeenCalledWith(firstWatchedFile.file.document);
        expect(onCurrentFileReloadFailed).toHaveBeenCalledTimes(1);

        watcher.disposeCurrentFileWatcher();
        expect(firstFileSystemWatcher.dispose).toHaveBeenCalledTimes(1);
    });

    it('keeps current and generated file watchers alive when only the webview is disposed', async () => {
        const watchedFile = createMockCTraceYamlFile();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: () => watchedFile.file,
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged: jest.fn()
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks);

        await watcher.watchGeneratedCBuildRunFiles();
        watcher.watchCurrentFile();
        const fileSystemWatcher = getLastCreatedFileSystemWatcher();


        expect(fileSystemWatcher.dispose).not.toHaveBeenCalled();

        watcher.dispose();
        expect(fileSystemWatcher.dispose).toHaveBeenCalledTimes(1);
    });

    it('keeps an existing cbuild index watcher when startup discovery is armed again', async () => {
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged: jest.fn()
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks);

        await watcher.watchGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        await watcher.watchGeneratedCBuildRunFiles();

        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        expect(cbuildIndexWatcher.dispose).not.toHaveBeenCalled();

        watcher.dispose();
    });

    it('resets active-solution watches and ignores an old ctrace callback after the active solution changes', async () => {
        const watchedFile = createMockCTraceYamlFile();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: () => watchedFile.file,
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged: jest.fn()
        };
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder')
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/first'))
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/second'));
        jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const activeSolutionWatch = activeSolutionWatchFactory();
        const watcher = new TraceConfigurationFileWatcher(
            callbacks,
            locator,
            undefined,
            activeSolutionWatch.cmsisJsonWatcher
        );

        await watcher.watchGeneratedCBuildRunFiles();
        watcher.watchCurrentFile();
        const firstCTraceWatcher = getLastCreatedFileSystemWatcher();
        activeSolutionWatch.fireActiveSolutionChange({
            previousActiveSolutionPath: '/workspace/first/first.csolution.yml',
            activeSolutionPath: '/workspace/second/second.csolution.yml',
            generation: 1
        });
        await waitForCondition('the replacement cbuild index watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length === 3);

        firstCTraceWatcher._handlers.change[0]?.(vscode.Uri.file(watchedFile.file.fileName));

        expect(firstCTraceWatcher.dispose).toHaveBeenCalledTimes(1);
        expect(watchedFile.reloadIfChanged).not.toHaveBeenCalled();
        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenLastCalledWith(
            expect.objectContaining({ base: vscode.Uri.file('/workspace/second'), pattern: CBUILD_INDEX_FILE_GLOB }),
            false,
            false,
            true
        );

        watcher.dispose();
    });

    it('discovers and processes an existing cbuild-run file for the new solution', async () => {
        const cbuildRunFile = vscode.Uri.file('/workspace/second/out/project.cbuild-run.yml');
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder')
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/first'))
            .mockResolvedValueOnce(vscode.Uri.file('/workspace/second'));
        jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(cbuildRunFile.fsPath);
        jest.spyOn(vscode.workspace.fs, 'stat').mockResolvedValue({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0
        });
        const activeSolutionWatch = activeSolutionWatchFactory();
        const watcher = new TraceConfigurationFileWatcher(
            callbacks,
            locator,
            undefined,
            activeSolutionWatch.cmsisJsonWatcher
        );

        await watcher.watchGeneratedCBuildRunFiles();
        activeSolutionWatch.fireActiveSolutionChange({
            previousActiveSolutionPath: '/workspace/first/first.csolution.yml',
            activeSolutionPath: '/workspace/second/second.csolution.yml',
            generation: 1
        });
        await waitForCondition('the new solution cbuild-run processing', () =>
            onGeneratedCBuildRunFileChanged.mock.calls.length === 1);

        const changeEvent = onGeneratedCBuildRunFileChanged.mock.calls.at(0)?.[0] as GeneratedCBuildRunFileChangeEvent;
        expect(changeEvent.type).toBe('changed');
        expect(normalizeFsPath(changeEvent.uri.fsPath)).toBe(normalizeFsPath(cbuildRunFile.fsPath));
        expect((vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.map(call => {
            const pattern = call[0] as { pattern?: string };
            return pattern.pattern;
        })).toContain('project.cbuild-run.yml');

        watcher.dispose();
    });
});
