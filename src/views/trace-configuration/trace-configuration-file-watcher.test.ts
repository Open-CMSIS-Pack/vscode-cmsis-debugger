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

import { CBUILD_INDEX_FILE_GLOB } from '../../manifest';
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
    dispose: jest.Mock;
    file: CTraceYamlFile;
    watch: jest.Mock;
}

function getLastCreatedFileSystemWatcher(): MockFileSystemWatcher {
    const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.at(-1)?.value as MockFileSystemWatcher | undefined;
    expect(watcher).toBeDefined();
    return watcher as MockFileSystemWatcher;
}

function createMockCTraceYamlFile(): MockCTraceYamlFile {
    const dispose = jest.fn();
    const watch = jest.fn((
        _onDidReload: (document: CTraceYamlDocument) => void,
        _onError: (error: unknown) => void
    ) => ({ dispose }));
    return {
        dispose,
        file: { watch } as unknown as CTraceYamlFile,
        watch
    };
}

function getCurrentFileReloadHandler(watch: jest.Mock): (document: CTraceYamlDocument) => void {
    const handler = watch.mock.calls.at(-1)?.[0] as ((document: CTraceYamlDocument) => void) | undefined;
    expect(handler).toBeDefined();
    return handler as (document: CTraceYamlDocument) => void;
}

function getCurrentFileErrorHandler(watch: jest.Mock): (error: unknown) => void {
    const handler = watch.mock.calls.at(-1)?.[1] as ((error: unknown) => void) | undefined;
    expect(handler).toBeDefined();
    return handler as (error: unknown) => void;
}

describe('TraceConfigurationFileWatcher', () => {
    const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
    const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;

    afterEach(() => {
        jest.restoreAllMocks();
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
    });

    it('resolves and watches the generated cbuild-run file after a cbuild index file is created', async () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const getCBuildRunFileName = jest.fn().mockResolvedValue('/workspace/out/project.cbuild-run.yml');
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, { getCBuildRunFileName });
        const events: GeneratedCBuildRunFileChangeEvent[] = [];
        watcher.onDidChangeGeneratedCBuildRunFile(event => events.push(event));

        watcher.watchGeneratedCBuildRunFiles();

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
        expect(getCBuildRunFileName).toHaveBeenCalledTimes(1);
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
        const getCBuildRunFileName = jest.fn().mockResolvedValue(cbuildRunFile.fsPath);
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, { getCBuildRunFileName });

        watcher.watchGeneratedCBuildRunFiles();
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

    it('replaces the generated cbuild-run watcher when the resolved path changes', async () => {
        const getCBuildRunFileName = jest.fn()
            .mockResolvedValueOnce('/workspace/out/first.cbuild-run.yml')
            .mockResolvedValueOnce('/workspace/out/second.cbuild-run.yml');
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks, { getCBuildRunFileName });

        watcher.watchGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        const cbuildIndexFile = vscode.Uri.file('/workspace/project.cbuild-idx.yml');
        cbuildIndexWatcher._handlers.create[0]?.(cbuildIndexFile);
        await waitForCondition('first cbuild-run watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length === 2);
        const firstCBuildRunWatcher = getLastCreatedFileSystemWatcher();

        cbuildIndexWatcher._handlers.change[0]?.(cbuildIndexFile);
        await waitForCondition('replacement cbuild-run watcher', () =>
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length === 3);
        const secondCBuildRunWatcher = getLastCreatedFileSystemWatcher();
        firstCBuildRunWatcher._handlers.change[0]?.(vscode.Uri.file('/workspace/out/first.cbuild-run.yml'));
        secondCBuildRunWatcher._handlers.change[0]?.(vscode.Uri.file('/workspace/out/second.cbuild-run.yml'));

        expect(firstCBuildRunWatcher.dispose).toHaveBeenCalledTimes(1);
        expect(onGeneratedCBuildRunFileChanged).toHaveBeenCalledTimes(1);
        expect(onGeneratedCBuildRunFileChanged).toHaveBeenCalledWith({
            type: 'changed',
            uri: vscode.Uri.file('/workspace/out/second.cbuild-run.yml')
        });

        watcher.dispose();
    });

    it('forwards current ctrace reloads and ignores stale watcher callbacks', () => {
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
        const document = CTraceYamlDocument.parse('ctrace:\n');

        watcher.watchCurrentFile();

        const firstReloadHandler = getCurrentFileReloadHandler(firstWatchedFile.watch);
        const firstErrorHandler = getCurrentFileErrorHandler(firstWatchedFile.watch);
        firstReloadHandler(document);
        firstErrorHandler(new Error('first failure'));

        currentFile = secondWatchedFile.file;
        watcher.watchCurrentFile();
        firstReloadHandler(document);
        firstErrorHandler(new Error('stale failure'));

        expect(firstWatchedFile.dispose).toHaveBeenCalledTimes(1);
        expect(secondWatchedFile.watch).toHaveBeenCalledTimes(1);
        expect(onCurrentFileReloaded).toHaveBeenCalledTimes(1);
        expect(onCurrentFileReloaded).toHaveBeenCalledWith(document);
        expect(onCurrentFileReloadFailed).toHaveBeenCalledTimes(1);

        watcher.disposeCurrentFileWatcher();
        expect(secondWatchedFile.dispose).toHaveBeenCalledTimes(1);
    });

    it('keeps generated index watchers alive when only view resources are disposed', () => {
        const watchedFile = createMockCTraceYamlFile();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: () => watchedFile.file,
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged: jest.fn()
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks);

        watcher.watchGeneratedCBuildRunFiles();
        watcher.watchCurrentFile();
        const fileSystemWatcher = getLastCreatedFileSystemWatcher();

        watcher.disposeViewResources();

        expect(watchedFile.dispose).toHaveBeenCalledTimes(1);
        expect(fileSystemWatcher.dispose).not.toHaveBeenCalled();

        watcher.dispose();
        expect(fileSystemWatcher.dispose).toHaveBeenCalledTimes(1);
    });
});
