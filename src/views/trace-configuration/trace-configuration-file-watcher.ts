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
import { parse } from 'yaml';

import { Disposable } from '../../desktop/yaml-file';
import { logger } from '../../logger';
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
        if (this.generatedCBuildIndexFileWatchers.length > 0) {
            return;
        }
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
            watcher.onDidCreate(uri => {
                void this.resolveAndWatchGeneratedCBuildRunFile(watchVersion, uri);
            }),
            watcher.onDidChange(uri => {
                void this.resolveAndWatchGeneratedCBuildRunFile(watchVersion, uri);
            })
        );
    }

    /**
     * processActiveCBuildRunFile asks CMSIS Solution for the active cbuild-run
     * file, watches it, and processes it immediately when it already exists.
     * When activation completed before CMSIS Solution finished loading its
     * build data, an existing index supplies the prebuilt cbuild-run path. The
     * result tells startup whether it must wait for a new index event instead.
     */
    public async processActiveCBuildRunFile(): Promise<boolean> {
        return this.resolveAndWatchGeneratedCBuildRunFile(this.generatedWatchVersion, undefined, true);
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
     * dispose releases every watcher and event emitter owned by this class when
     * the trace configuration model is no longer needed.
     */
    public dispose(): void {
        this.disposeCurrentFileWatcher();
        this.generatedWatchVersion += 1;
        this.cbuildRunResolutionVersion += 1;
        this.disposeGeneratedCBuildFileWatchers();
        this._onDidChangeGeneratedCBuildRunFileEmitter.dispose();
    }

    /**
     * resolveAndWatchGeneratedCBuildRunFile asks CMSIS Solution for the active
     * cbuild-run path and installs an exact-file watcher when this is still the
     * newest index event for the active workspace watch. If CMSIS Solution is
     * still loading its build files, an index event can supply the same path
     * directly without waiting or polling.
     */
    private async resolveAndWatchGeneratedCBuildRunFile(
        watchVersion: number,
        cbuildIndexFile?: vscode.Uri,
        findExistingCBuildIndex = false
    ): Promise<boolean> {
        const resolutionVersion = ++this.cbuildRunResolutionVersion;
        const cbuildRunFileName = await this.fileLocationManager.getCBuildRunFileName();

        if (
            watchVersion !== this.generatedWatchVersion
            || resolutionVersion !== this.cbuildRunResolutionVersion
        ) {
            return false;
        }

        if (cbuildRunFileName) {
            this.watchGeneratedCBuildRunFile(cbuildRunFileName, watchVersion);
            if (await this.processExistingGeneratedCBuildRunFile(
                cbuildRunFileName,
                watchVersion,
                resolutionVersion
            )) {
                return true;
            }
        }

        const indexFile = cbuildIndexFile ?? (findExistingCBuildIndex
            ? await this.findExistingCBuildIndexFile()
            : undefined);
        const indexedCBuildRunFileName = indexFile
            ? await this.readCBuildRunFileNameFromIndex(indexFile)
            : undefined;
        if (
            !indexedCBuildRunFileName
            || watchVersion !== this.generatedWatchVersion
            || resolutionVersion !== this.cbuildRunResolutionVersion
        ) {
            return false;
        }

        this.watchGeneratedCBuildRunFile(indexedCBuildRunFileName, watchVersion);
        return this.processExistingGeneratedCBuildRunFile(
            indexedCBuildRunFileName,
            watchVersion,
            resolutionVersion
        );
    }

    /**
     * findExistingCBuildIndexFile covers prebuilt projects whose index existed
     * before the filesystem watcher was installed. This lookup runs only after
     * CMSIS Solution activation and an unsuccessful command result, so it
     * cannot recreate the original pre-activation race.
     */
    private async findExistingCBuildIndexFile(): Promise<vscode.Uri | undefined> {
        const mainWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!mainWorkspaceFolder) {
            return undefined;
        }
        const pattern = new vscode.RelativePattern(mainWorkspaceFolder, CBUILD_INDEX_FILE_GLOB);
        const files = await vscode.workspace.findFiles(pattern, null, 1);
        return files.at(0);
    }

    /**
     * readCBuildRunFileNameFromIndex resolves the generated cbuild-run path
     * recorded by the index event. The YAML is external data, so each property
     * is checked before the path is used.
     */
    private async readCBuildRunFileNameFromIndex(cbuildIndexFile: vscode.Uri): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(cbuildIndexFile);
            const root: unknown = parse(new TextDecoder().decode(bytes));
            const buildIndex = this.getObjectProperty(root, 'build-idx');
            const cbuildRunFileName = this.getObjectProperty(buildIndex, 'cbuild-run');
            if (typeof cbuildRunFileName !== 'string' || !cbuildRunFileName.trim()) {
                return undefined;
            }
            return path.resolve(path.dirname(cbuildIndexFile.fsPath), cbuildRunFileName.trim());
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug(`Trace Configuration: Failed to read generated cbuild index file: ${errorMessage}`);
            return undefined;
        }
    }

    /**
     * getObjectProperty reads an unknown YAML mapping without trusting its
     * shape at the filesystem boundary.
     */
    private getObjectProperty(value: unknown, key: string): unknown {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return Reflect.get(value, key);
    }

    /**
     * processExistingGeneratedCBuildRunFile handles the case where generation
     * completed before the exact cbuild-run watcher was installed.
     */
    private async processExistingGeneratedCBuildRunFile(
        cbuildRunFileName: string,
        watchVersion: number,
        resolutionVersion: number
    ): Promise<boolean> {
        const uri = vscode.Uri.file(cbuildRunFileName);
        try {
            await vscode.workspace.fs.stat(uri);
        } catch (error) {
            if (!this.isFileNotFoundError(error)) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Trace Configuration: Failed to inspect generated cbuild-run file: ${errorMessage}`);
            }
            return false;
        }

        if (
            watchVersion !== this.generatedWatchVersion
            || resolutionVersion !== this.cbuildRunResolutionVersion
            || normalizeFsPath(cbuildRunFileName) !== normalizeFsPath(this.generatedCBuildRunFileName)
        ) {
            return false;
        }

        await this.handleGeneratedCBuildRunFileChange('changed', uri);
        return true;
    }

    /**
     * isFileNotFoundError recognizes missing-file errors from VS Code and Node
     * filesystem adapters while an index and its cbuild-run output converge.
     */
    private isFileNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const errorWithCode = error as { code?: unknown };
        return errorWithCode.code === 'ENOENT' || errorWithCode.code === 'FileNotFound';
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

        void this.handleGeneratedCBuildRunFileChange(type, uri);
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
    private async handleGeneratedCBuildRunFileChange(type: GeneratedCBuildRunFileChangeType, uri: vscode.Uri): Promise<void> {
        const event: GeneratedCBuildRunFileChangeEvent = { type, uri };
        this._onDidChangeGeneratedCBuildRunFileEmitter.fire(event);
        await this.callbacks.onGeneratedCBuildRunFileChanged(event);
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
