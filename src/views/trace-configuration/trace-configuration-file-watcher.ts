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

import { Disposable } from '../../desktop/yaml-file';
import { CBUILD_INDEX_FILE_GLOB } from '../../manifest';
import { FileLocationManager, normalizeFsPath } from '../../utils';
import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';

export type GeneratedCBuildRunFileChangeType = 'created' | 'changed' | 'deleted';

export interface GeneratedCBuildRunFileChangeEvent {
    type: GeneratedCBuildRunFileChangeType;
    uri: vscode.Uri;
}

export interface TraceConfigurationFileWatcherCallbacks {
    /**
     * getCurrentFile returns the ctrace.yml file that should currently receive
     * reload events from the watcher.
     */
    getCurrentFile(): CTraceYamlFile | undefined;

    /**
     * onCurrentFileReloaded lets the model accept a freshly reloaded ctrace.yml
     * document after the watcher confirms the event belongs to the active file.
     */
    onCurrentFileReloaded(document: CTraceYamlDocument): void | Promise<void>;

    /**
     * onCurrentFileReloadFailed lets the model record a reload error after the
     * watcher confirms the error belongs to the active file.
     */
    onCurrentFileReloadFailed(error: unknown): void;

    /**
     * onGeneratedCBuildRunFileChanged lets the model update generated ctrace
     * files and configuration state after a generated cbuild-run file event.
     */
    onGeneratedCBuildRunFileChanged(event: GeneratedCBuildRunFileChangeEvent): void | Promise<void>;
}

/**
 * TraceConfigurationFileWatcher owns all file-system subscriptions used by the
 * trace configuration model.
 */
export class TraceConfigurationFileWatcher {
    private ctraceFileWatcher: Disposable | undefined;
    private readonly generatedCBuildIndexFileWatchers: vscode.Disposable[] = [];
    private readonly generatedCBuildRunFileWatchers: vscode.Disposable[] = [];
    private generatedCBuildRunFileName: string | undefined;
    private generatedWatchVersion = 0;
    private cbuildRunResolutionVersion = 0;
    private readonly _onDidChangeGeneratedCBuildRunFileEmitter = new vscode.EventEmitter<GeneratedCBuildRunFileChangeEvent>();

    /**
     * onDidChangeGeneratedCBuildRunFile exposes generated cbuild-run file events
     * to callers that need to observe watcher activity without processing YAML.
     */
    public readonly onDidChangeGeneratedCBuildRunFile = this._onDidChangeGeneratedCBuildRunFileEmitter.event;

    /**
     * The constructor stores callbacks that let watcher events update the model
     * without this class knowing how YAML documents or webview state are managed.
     * The file location manager resolves the active cbuild-run path through the
     * CMSIS Solution extension after a cbuild index file changes.
     */
    public constructor(
        private readonly callbacks: TraceConfigurationFileWatcherCallbacks,
        private readonly fileLocationManager: Pick<FileLocationManager, 'getCBuildRunFileName'> = new FileLocationManager()
    ) {}

    /**
     * watchGeneratedCBuildRunFiles rebuilds the main workspace watcher for
     * cbuild index files. A created or changed index file is the stable signal
     * used to resolve and watch the active generated cbuild-run file.
     */
    public watchGeneratedCBuildRunFiles(): void {
        this.generatedWatchVersion += 1;
        this.cbuildRunResolutionVersion += 1;
        this.disposeGeneratedCBuildFileWatchers();

        const mainWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!mainWorkspaceFolder) {
            return;
        }

        const watchVersion = this.generatedWatchVersion;
        const pattern = new vscode.RelativePattern(mainWorkspaceFolder, CBUILD_INDEX_FILE_GLOB);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.generatedCBuildIndexFileWatchers.push(
            watcher,
            watcher.onDidCreate(() => {
                void this.resolveAndWatchGeneratedCBuildRunFile(watchVersion);
            }),
            watcher.onDidChange(() => {
                void this.resolveAndWatchGeneratedCBuildRunFile(watchVersion);
            })
        );
    }

    /**
     * watchCurrentFile replaces the active ctrace.yml watcher with one attached
     * to the model's current file, or leaves no watcher when there is no loaded
     * trace configuration file.
     */
    public watchCurrentFile(): void {
        this.disposeCurrentFileWatcher();
        const watchedFile = this.callbacks.getCurrentFile();
        if (!watchedFile) {
            return;
        }
        this.ctraceFileWatcher = watchedFile.watch(document => {
            this.handleCurrentFileReload(watchedFile, document);
        }, error => {
            this.handleCurrentFileReloadError(watchedFile, error);
        });
    }

    /**
     * disposeCurrentFileWatcher releases the active ctrace.yml watcher so file
     * events stop flowing while the view is closed, a different file is loaded,
     * or unsaved webview edits are in memory.
     */
    public disposeCurrentFileWatcher(): void {
        this.ctraceFileWatcher?.dispose();
        this.ctraceFileWatcher = undefined;
    }

    /**
     * disposeViewResources releases only watchers tied to the current webview
     * document while keeping generated cbuild-run watchers alive for background
     * build output changes.
     */
    public disposeViewResources(): void {
        this.disposeCurrentFileWatcher();
    }

    /**
     * dispose releases every watcher and event emitter owned by this class when
     * the trace configuration model is no longer needed.
     */
    public dispose(): void {
        this.disposeViewResources();
        this.generatedWatchVersion += 1;
        this.cbuildRunResolutionVersion += 1;
        this.disposeGeneratedCBuildFileWatchers();
        this._onDidChangeGeneratedCBuildRunFileEmitter.dispose();
    }

    /**
     * resolveAndWatchGeneratedCBuildRunFile asks CMSIS Solution for the active
     * cbuild-run path and installs an exact-file watcher when this is still the
     * newest index event for the active workspace watch.
     */
    private async resolveAndWatchGeneratedCBuildRunFile(watchVersion: number): Promise<void> {
        const resolutionVersion = ++this.cbuildRunResolutionVersion;
        const cbuildRunFileName = await this.fileLocationManager.getCBuildRunFileName();

        if (
            !cbuildRunFileName
            || watchVersion !== this.generatedWatchVersion
            || resolutionVersion !== this.cbuildRunResolutionVersion
        ) {
            return;
        }

        this.watchGeneratedCBuildRunFile(cbuildRunFileName, watchVersion);
    }

    /**
     * watchGeneratedCBuildRunFile replaces the active generated-file watcher
     * with one scoped to the exact cbuild-run path returned by CMSIS Solution.
     * Repeated index events that resolve to the same path keep the existing
     * watcher and its subscriptions.
     */
    private watchGeneratedCBuildRunFile(cbuildRunFileName: string, watchVersion: number): void {
        if (
            this.generatedCBuildRunFileWatchers.length > 0
            && normalizeFsPath(this.generatedCBuildRunFileName) === normalizeFsPath(cbuildRunFileName)
        ) {
            return;
        }

        this.disposeGeneratedCBuildRunFileWatchers();
        this.generatedCBuildRunFileName = cbuildRunFileName;

        const pattern = new vscode.RelativePattern(path.dirname(cbuildRunFileName), path.basename(cbuildRunFileName));
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.generatedCBuildRunFileWatchers.push(
            watcher,
            watcher.onDidCreate(uri => this.handleWatchedGeneratedCBuildRunFileChange(watchVersion, cbuildRunFileName, 'created', uri)),
            watcher.onDidChange(uri => this.handleWatchedGeneratedCBuildRunFileChange(watchVersion, cbuildRunFileName, 'changed', uri)),
            watcher.onDidDelete(uri => this.handleWatchedGeneratedCBuildRunFileChange(watchVersion, cbuildRunFileName, 'deleted', uri))
        );
    }

    /**
     * handleWatchedGeneratedCBuildRunFileChange ignores delayed callbacks from
     * replaced watchers and forwards events only for the currently resolved
     * cbuild-run file.
     */
    private handleWatchedGeneratedCBuildRunFileChange(
        watchVersion: number,
        watchedFileName: string,
        type: GeneratedCBuildRunFileChangeType,
        uri: vscode.Uri
    ): void {
        if (
            watchVersion !== this.generatedWatchVersion
            || normalizeFsPath(watchedFileName) !== normalizeFsPath(this.generatedCBuildRunFileName)
        ) {
            return;
        }

        this.handleGeneratedCBuildRunFileChange(type, uri);
    }

    /**
     * disposeGeneratedCBuildFileWatchers releases the cbuild index entry-point
     * watcher and the currently resolved cbuild-run watcher during a workspace
     * watch refresh or full model disposal.
     */
    private disposeGeneratedCBuildFileWatchers(): void {
        for (const watcher of this.generatedCBuildIndexFileWatchers.splice(0)) {
            watcher.dispose();
        }
        this.disposeGeneratedCBuildRunFileWatchers();
    }

    /**
     * disposeGeneratedCBuildRunFileWatchers releases the exact cbuild-run
     * watcher and its event subscriptions before the resolved path changes.
     */
    private disposeGeneratedCBuildRunFileWatchers(): void {
        for (const watcher of this.generatedCBuildRunFileWatchers.splice(0)) {
            watcher.dispose();
        }
        this.generatedCBuildRunFileName = undefined;
    }

    /**
     * handleGeneratedCBuildRunFileChange emits the public generated-file event
     * and forwards the same event to the model callback that updates trace YAML
     * and configuration state.
     */
    private handleGeneratedCBuildRunFileChange(type: GeneratedCBuildRunFileChangeType, uri: vscode.Uri): void {
        const event: GeneratedCBuildRunFileChangeEvent = { type, uri };
        this._onDidChangeGeneratedCBuildRunFileEmitter.fire(event);
        void this.callbacks.onGeneratedCBuildRunFileChanged(event);
    }

    /**
     * handleCurrentFileReload ignores delayed reloads from stale ctrace.yml
     * watchers and forwards only reloads that still belong to the model's
     * current file.
     */
    private handleCurrentFileReload(watchedFile: CTraceYamlFile, document: CTraceYamlDocument): void {
        if (this.callbacks.getCurrentFile() !== watchedFile) {
            return;
        }
        void this.callbacks.onCurrentFileReloaded(document);
    }

    /**
     * handleCurrentFileReloadError ignores delayed errors from stale ctrace.yml
     * watchers and forwards only errors that still belong to the model's current
     * file.
     */
    private handleCurrentFileReloadError(watchedFile: CTraceYamlFile, error: unknown): void {
        if (this.callbacks.getCurrentFile() !== watchedFile) {
            return;
        }
        this.callbacks.onCurrentFileReloadFailed(error);
    }
}
