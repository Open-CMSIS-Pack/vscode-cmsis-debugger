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

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import {
    GeneratedCBuildRunFileChangeEvent,
    TraceConfigurationFileWatcher,
    TraceConfigurationFileWatcherCallbacks
} from './trace-configuration-file-watcher';
import * as TraceConfigurationTypes from './trace-configuration-types';

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

    it('watches generated cbuild-run files and forwards their events', () => {
        mutableWorkspace.workspaceFolders = [{
            uri: vscode.Uri.file('/workspace'),
            name: 'workspace',
            index: 0
        }];
        const onGeneratedCBuildRunFileChanged = jest.fn();
        const callbacks: TraceConfigurationFileWatcherCallbacks = {
            getCurrentFile: jest.fn(),
            onCurrentFileReloaded: jest.fn(),
            onCurrentFileReloadFailed: jest.fn(),
            onGeneratedCBuildRunFileChanged
        };
        const watcher = new TraceConfigurationFileWatcher(callbacks);
        const events: GeneratedCBuildRunFileChangeEvent[] = [];
        watcher.onDidChangeGeneratedCBuildRunFile(event => events.push(event));

        watcher.watchGeneratedCBuildRunFiles();

        const fileSystemWatcher = getLastCreatedFileSystemWatcher();
        const pattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.at(-1)?.[0] as { pattern: string };
        const uri = vscode.Uri.file('/workspace/out/project.cbuild-run.yml');
        fileSystemWatcher._handlers.create[0]?.(uri);
        fileSystemWatcher._handlers.change[0]?.(uri);
        fileSystemWatcher._handlers.delete[0]?.(uri);

        expect(pattern.pattern).toBe(TraceConfigurationTypes.CBUILD_RUN_FILE_GLOB);
        expect(events).toEqual([
            { type: 'created', uri },
            { type: 'changed', uri },
            { type: 'deleted', uri }
        ]);
        expect(onGeneratedCBuildRunFileChanged).toHaveBeenCalledTimes(3);

        watcher.dispose();
        expect(fileSystemWatcher.dispose).toHaveBeenCalledTimes(1);
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

    it('keeps generated watchers alive when only view resources are disposed', () => {
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
