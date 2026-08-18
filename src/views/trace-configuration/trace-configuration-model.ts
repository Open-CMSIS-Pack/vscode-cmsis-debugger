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
import { TextDecoder, TextEncoder } from 'node:util';

import * as vscode from 'vscode';

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { isYamlMapItem, isYamlScalarItem, isYamlSequenceItem, YamlTreeItem, yamlScalarToString } from '../../desktop/yaml-dom';
import { Disposable } from '../../desktop/yaml-file';
import { logger } from '../../logger';
import { CTraceProcessorTraceSetup, CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import {
    TraceConfigurationRow,
    TraceConfigurationState,
} from './trace-configuration-protocol';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';
import { TraceConfigurationRowBuilder } from './trace-configuration-row-builder';
import * as TraceConfigurationTypes from './trace-configuration-types';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

type GeneratedCBuildRunFileChangeType = 'created' | 'changed' | 'deleted';

interface GeneratedTraceProcessor {
    core: string;
    pname?: string | undefined;
}

export interface GeneratedCBuildRunFileChangeEvent {
    type: GeneratedCBuildRunFileChangeType;
    uri: vscode.Uri;
}

/**
 * TraceConfigurationModel owns the ctrace.yml document lifecycle and file mutations for the trace
 * configuration webview. It deliberately delegates processor capability lookup and row projection to
 * smaller helper classes so this file stays focused on reading, writing, watching, and saving YAML.
 */
export class TraceConfigurationModel {
    private ctraceFile: CTraceYamlFile | undefined;
    private ctraceFileWatcher: Disposable | undefined;
    private readonly generatedCBuildRunFileWatchers: vscode.Disposable[] = [];
    private readonly _onDidChangeGeneratedCBuildRunFileEmitter = new vscode.EventEmitter<GeneratedCBuildRunFileChangeEvent>();
    public readonly onDidChangeGeneratedCBuildRunFile = this._onDidChangeGeneratedCBuildRunFileEmitter.event;
    private loading = false;
    private dirty = false;
    private errorMessage: string | undefined;
    private focusedRowId: string | undefined;
    private readonly collapsedRows = new Set<string>();
    private readonly processorCapabilities: TraceConfigurationProcessorCapabilities;
    private readonly rowBuilder: TraceConfigurationRowBuilder;

    /**
     * The constructor wires together the file model, capability mapper, and row builder. The optional
     * collaborators make this class easy to test while the default path uses the production helpers.
     */
    public constructor(
        private onDidChange: () => void = () => {},
        processorCapabilities?: TraceConfigurationProcessorCapabilities,
        rowBuilder?: TraceConfigurationRowBuilder
    ) {
        this.processorCapabilities = processorCapabilities ?? new TraceConfigurationProcessorCapabilities(() => this.ctraceFile);
        this.rowBuilder = rowBuilder ?? new TraceConfigurationRowBuilder(
            () => this.ctraceFile,
            () => this.loading,
            () => this.dirty,
            () => this.errorMessage,
            this.collapsedRows,
            this.processorCapabilities.capabilities
        );
        this.watchGeneratedCBuildRunFiles();
    }

    /**
     * setOnDidChange installs the callback used whenever model state changes.
     * The provider calls this after construction so even an injected model can
     * post fresh state to the webview without the model importing webview APIs.
     */
    public setOnDidChange(onDidChange: () => void): void {
        this.onDidChange = onDidChange;
    }

    /**
     * dispose releases file-system resources owned by the model. The webview
     * provider calls this when the view or extension is disposed so the model
     * cannot continue reacting to stale ctrace.yml watcher events.
     */
    public dispose(): void {
        this.disposeViewResources();
        this.disposeGeneratedCBuildRunFileWatchers();
    }

    /**
     * disposeViewResources releases resources tied to the current webview
     * instance. Generated cbuild-run watching is intentionally kept alive
     * across webview disposal because builds can happen while the view is
     * closed.
     */
    public disposeViewResources(): void {
        this.disposeCurrentFileWatcher();
    }

    /**
     * watchGeneratedCBuildRunFiles starts one workspace-relative watcher per
     * workspace folder. Generated cbuild-run files are expected directly under
     * <workspace>/out, so nested out folders are intentionally ignored.
     */
    private watchGeneratedCBuildRunFiles(): void {
        this.disposeGeneratedCBuildRunFileWatchers();

        for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
            const pattern = new vscode.RelativePattern(workspaceFolder, TraceConfigurationTypes.CBUILD_RUN_FILE_GLOB);
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            this.generatedCBuildRunFileWatchers.push(
                watcher,
                watcher.onDidCreate(uri => this.handleGeneratedCBuildRunFileChange('created', uri)),
                watcher.onDidChange(uri => this.handleGeneratedCBuildRunFileChange('changed', uri)),
                watcher.onDidDelete(uri => this.handleGeneratedCBuildRunFileChange('deleted', uri))
            );
        }
    }

    private disposeGeneratedCBuildRunFileWatchers(): void {
        for (const watcher of this.generatedCBuildRunFileWatchers.splice(0)) {
            watcher.dispose();
        }
    }

    private handleGeneratedCBuildRunFileChange(type: GeneratedCBuildRunFileChangeType, uri: vscode.Uri): void {
        const event: GeneratedCBuildRunFileChangeEvent = { type, uri };
        this._onDidChangeGeneratedCBuildRunFileEmitter.fire(event);
        void this.refreshProcessorCapabilitiesFromGeneratedCBuildRunFile(event);
    }

    private async refreshProcessorCapabilitiesFromGeneratedCBuildRunFile(event: GeneratedCBuildRunFileChangeEvent): Promise<void> {
        try {
            logger.debug(`Trace Configuration: Generated cbuild-run file ${event.type}: ${event.uri.fsPath}`);
            switch (event.type) {
                case 'created':
                case 'changed':
                    await this.createOrUpdateGeneratedCTraceFile(event.uri);
                    await this.setTraceGenerationWebviewEnabled(true);
                    break;
                case 'deleted':
                    await this.setTraceGenerationWebviewEnabled(false);
                    break;
            }
            this.errorMessage = undefined;
        } catch (error) {
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Failed to process generated cbuild-run file change: ${this.errorMessage}`);
        } finally {
            this.notifyStateChanged();
        }
    }

    /**
     * loadInitialFile finds the best ctrace.yml candidate and loads it as soon
     * as the webview appears. The active editor is preferred because it is the
     * clearest user intent; otherwise the workspace is searched for trace YAML
     * files and the first result is used.
     */
    public async loadInitialFile(): Promise<void> {
        this.watchGeneratedCBuildRunFiles();
        this.loading = true;
        this.errorMessage = undefined;
        this.notifyStateChanged();
        try {
            const candidate = await this.findInitialCTraceFile();
            if (!candidate) {
                this.disposeCurrentFileWatcher();
                this.ctraceFile = undefined;
                this.processorCapabilities.clear();
                this.errorMessage = undefined;
                return;
            }
            await this.loadFile(candidate.fsPath);
        } catch (error) {
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Failed to load ctrace file: ${this.errorMessage}`);
        } finally {
            this.loading = false;
            this.notifyStateChanged();
        }
    }

    /**
     * findInitialCTraceFile applies the discovery policy used by
     * loadInitialFile. It deliberately avoids prompting because resolve happens
     * during view creation; prompts are reserved for the explicit Open button in
     * the webview.
     */
    private async findInitialCTraceFile(): Promise<vscode.Uri | undefined> {
        const activeFile = vscode.window.activeTextEditor?.document.uri;
        if (activeFile && TraceConfigurationModel.isCTraceFileName(activeFile.fsPath)) {
            return activeFile;
        }
        const files = await vscode.workspace.findFiles(TraceConfigurationTypes.CTRACE_FILE_GLOB, '**/{node_modules,dist,coverage}/**', 10);
        return files.find(file => TraceConfigurationModel.isCTraceFileName(file.fsPath));
    }

    /**
     * isCTraceFileName centralizes filename recognition so active-editor,
     * workspace-search, and open-dialog paths all use the same rule. The rule is
     * intentionally broad enough to accept ctrace.yml, ctrace.yaml, and
     * target-specific names such as board.ctrace.yml.
     */
    public static isCTraceFileName(fileName: string): boolean {
        const baseName = path.basename(fileName).toLowerCase();
        return baseName === 'ctrace.yml'
            || baseName === 'ctrace.yaml'
            || baseName.endsWith('.ctrace.yml')
            || baseName.endsWith('.ctrace.yaml');
    }

    /**
     * loadFile creates the CTraceYamlFile wrapper and parses the supplied file.
     * It also assigns internal ctrace references and loads processor trace
     * capabilities so the webview can hide unsupported controls before the first
     * state snapshot is posted.
     */
    private async loadFile(fileName: string): Promise<void> {
        const nextFile = new CTraceYamlFile(fileName, new WorkspaceTextFileAdapter());
        const document = await nextFile.load(fileName);
        this.disposeCurrentFileWatcher();
        this.ctraceFile = nextFile;
        document.assignCTraceRefs();
        await this.loadProcessorCapabilities();
        this.watchCurrentFile();
        this.dirty = false;
    }

    /**
     * loadProcessorCapabilities delegates processor lookup to the capability mapper whenever the
     * active ctrace file changes. Keeping this wrapper here makes the file lifecycle code read like a
     * single sequence: load YAML, refresh capabilities, then notify the UI.
     */
    private async loadProcessorCapabilities(): Promise<void> {
        await this.processorCapabilities.load();
    }

    private async createOrUpdateGeneratedCTraceFile(cbuildRunFileUri: vscode.Uri): Promise<void> {
        const workspaceFolder = this.getGeneratedCBuildRunWorkspaceFolder(cbuildRunFileUri);
        const projectName = this.getProjectNameFromGeneratedCBuildRunFile(cbuildRunFileUri);
        const processors = await this.readGeneratedCBuildRunProcessors(cbuildRunFileUri);
        const traceFileUri = await this.resolveGeneratedCTraceFileUri(workspaceFolder.uri, projectName);
        const traceFileExists = await this.fileExists(traceFileUri);
        const document = traceFileExists
            ? await this.readCTraceDocument(traceFileUri)
            : CTraceYamlDocument.create('CMSIS Debugger');

        const changed = this.addMissingProcessorTraceSetups(document, processors);

        if (!traceFileExists || changed) {
            await this.writeCTraceDocument(traceFileUri, document);
        }

        await this.loadFile(traceFileUri.fsPath);
    }

    private getGeneratedCBuildRunWorkspaceFolder(cbuildRunFileUri: vscode.Uri): vscode.WorkspaceFolder {
        const workspaceFolder = (vscode.workspace.workspaceFolders ?? []).find(folder => {
            const expectedDirectory = path.join(folder.uri.fsPath, 'out');
            return path.dirname(cbuildRunFileUri.fsPath) === expectedDirectory;
        });

        if (!workspaceFolder) {
            throw new Error(`Generated cbuild-run file is not in a workspace out folder: ${cbuildRunFileUri.fsPath}`);
        }

        return workspaceFolder;
    }

    private getProjectNameFromGeneratedCBuildRunFile(cbuildRunFileUri: vscode.Uri): string {
        const baseName = path.basename(cbuildRunFileUri.fsPath);
        const suffix = '.cbuild-run.yml';
        return baseName.endsWith(suffix) ? baseName.slice(0, -suffix.length) : path.parse(baseName).name;
    }

    private async readGeneratedCBuildRunProcessors(cbuildRunFileUri: vscode.Uri): Promise<GeneratedTraceProcessor[]> {
        const reader = new CbuildRunReader();
        await reader.parse(cbuildRunFileUri.fsPath);
        const processors = reader.getProcessors();
        this.validateGeneratedProcessors(processors);
        return processors.map(processor => ({
            core: processor.core,
            ...(processor.pname ? { pname: processor.pname } : {})
        }));
    }

    private validateGeneratedProcessors(processors: ProcessorType[]): void {
        if (processors.length <= 1) {
            return;
        }

        const missingPnameIndexes = processors.flatMap((processor, index) => processor.pname ? [] : [String(index + 1)]);

        if (missingPnameIndexes.length > 0) {
            throw new Error(
                'Invalid multi-core cbuild-run processor data: processor entries '
                + missingPnameIndexes.join(', ')
                + ' are missing pname.'
            );
        }
    }

    private async resolveGeneratedCTraceFileUri(workspaceFolderUri: vscode.Uri, projectName: string): Promise<vscode.Uri> {
        const cmsisDirectory = vscode.Uri.file(path.join(workspaceFolderUri.fsPath, '.cmsis'));
        const yamlFile = vscode.Uri.file(path.join(cmsisDirectory.fsPath, `${projectName}.ctrace.yaml`));
        const ymlFile = vscode.Uri.file(path.join(cmsisDirectory.fsPath, `${projectName}.ctrace.yml`));

        if (await this.fileExists(yamlFile)) {
            return yamlFile;
        }

        if (await this.fileExists(ymlFile)) {
            return ymlFile;
        }

        return yamlFile;
    }

    private async readCTraceDocument(traceFileUri: vscode.Uri): Promise<CTraceYamlDocument> {
        const contents = await vscode.workspace.fs.readFile(traceFileUri);
        return CTraceYamlDocument.parse(new TextDecoder().decode(contents), traceFileUri.fsPath);
    }

    private async writeCTraceDocument(traceFileUri: vscode.Uri, document: CTraceYamlDocument): Promise<void> {
        document.normalizeDocumentOrder();
        document.assignCTraceRefs();
        await this.ensureDirectoryExists(vscode.Uri.file(path.dirname(traceFileUri.fsPath)));
        await vscode.workspace.fs.writeFile(traceFileUri, new TextEncoder().encode(document.toString()));
    }

    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        return await this.statIfExists(uri) !== undefined;
    }

    private async ensureDirectoryExists(uri: vscode.Uri): Promise<void> {
        const stat = await this.statIfExists(uri);

        if (!stat) {
            await vscode.workspace.fs.createDirectory(uri);
            return;
        }

        if (!this.isDirectoryStat(stat)) {
            throw new Error(`${uri.fsPath} exists but is not a directory.`);
        }
    }

    private async statIfExists(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
        try {
            return await vscode.workspace.fs.stat(uri);
        } catch (error) {
            if (this.isFileNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }

    private isDirectoryStat(stat: vscode.FileStat): boolean {
        const nodeStat = stat as vscode.FileStat & { isDirectory?: () => boolean };
        return stat.type === vscode.FileType.Directory || nodeStat.isDirectory?.() === true;
    }

    private isFileNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const errorWithCode = error as { code?: unknown };
        return errorWithCode.code === 'ENOENT' || errorWithCode.code === 'FileNotFound';
    }

    private addMissingProcessorTraceSetups(document: CTraceYamlDocument, processors: GeneratedTraceProcessor[]): boolean {
        const existingProcessorKeys = new Set(document.yaml
            .getArray<CTraceProcessorTraceSetup>(['ctrace', 'setup'])
            .flatMap(setup => {
                const key = this.getProcessorTraceSetupKey(setup);
                return key ? [key] : [];
            }));
        let changed = false;

        for (const processor of processors) {
            const key = this.getGeneratedTraceProcessorKey(processor);

            if (key && existingProcessorKeys.has(key)) {
                continue;
            }

            document.yaml.append(['ctrace', 'setup'], this.createProcessorTraceSetup(processor));
            if (key) {
                existingProcessorKeys.add(key);
            }
            changed = true;
        }

        if (changed) {
            document.normalizeDocumentOrder();
            document.assignCTraceRefs();
        }

        return changed;
    }

    private getProcessorTraceSetupKey(setup: CTraceProcessorTraceSetup): string | undefined {
        if (setup.pname) {
            return `pname:${setup.pname}`;
        }

        return setup.core ? `core:${setup.core}` : undefined;
    }

    private getGeneratedTraceProcessorKey(processor: GeneratedTraceProcessor): string | undefined {
        if (processor.pname) {
            return `pname:${processor.pname}`;
        }

        return processor.core ? `core:${processor.core}` : undefined;
    }

    private createProcessorTraceSetup(processor: GeneratedTraceProcessor): CTraceProcessorTraceSetup {
        const setup: CTraceProcessorTraceSetup = {
            core: processor.core,
            ...(processor.pname ? { pname: processor.pname } : {})
        };
        const capabilities = TraceConfigurationTypes.TRACE_CAPABILITIES_BY_CORE.get(processor.core)
            ?? TraceConfigurationTypes.NO_TRACE_CAPABILITIES;

        if (!capabilities.supportsTrace) {
            return setup;
        }

        if (capabilities.timestamps) {
            setup.timestamps = {};
        }
        if (capabilities.timeSynchronization) {
            setup.timesync = null;
        }
        if (capabilities.dwtComparators > 0) {
            setup.data = [];
        }
        if (capabilities.exceptions) {
            setup.exceptions = null;
        }
        if (capabilities.eventCounters) {
            setup.events = [];
        }
        if (capabilities.instrumentationTrace) {
            setup.itm = { enable: '0x0' };
        }
        if (capabilities.instructionTrace) {
            setup.instructions = {};
        }
        if (capabilities.pcSampling) {
            setup.pcsampling = { period: 'off' };
        }
        if (capabilities.streamSynchronization) {
            setup.synchronization = { DWT: '256M' };
        }

        return setup;
    }

    private async setTraceGenerationWebviewEnabled(enabled: boolean): Promise<void> {
        await vscode.workspace
            .getConfiguration()
            .update(TraceConfigurationTypes.TRACE_GENERATION_VIEW_ENABLED_CONFIG, enabled, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * refreshFile reloads the currently selected file from disk. The method is
     * async because VS Code users may edit ctrace.yml directly in another editor
     * tab and then ask the webview to reflect the latest file contents.
     */
    public async refreshFile(): Promise<void> {
        if (!this.ctraceFile) {
            await this.loadInitialFile();
            return;
        }
        this.loading = true;
        this.notifyStateChanged();
        try {
            const document = await this.ctraceFile.load();
            document.assignCTraceRefs();
            await this.loadProcessorCapabilities();
            this.watchCurrentFile();
            this.dirty = false;
            this.errorMessage = undefined;
        } finally {
            this.loading = false;
            this.notifyStateChanged();
        }
    }

    /**
     * reloadCurrentFileIfChanged checks the file stamp tracked by the YAML file
     * layer and only reparses ctrace.yml when the on-disk file has changed.
     * This is the core guard that keeps ctrace.yml as the golden source: before
     * a webview command mutates the DOM, the provider gives direct file edits a
     * chance to replace the in-memory document first.
     */
    private async reloadCurrentFileIfChanged(): Promise<boolean> {
        const file = this.requireFile();
        const changed = await file.reloadIfChanged();
        if (changed && file.document) {
            await this.acceptDiskDocument(file.document);
        }
        return changed;
    }

    /**
     * requireFreshDocumentForEdit returns the current YAML DOM only when it is
     * still synchronized with disk. If ctrace.yml changed after the webview
     * rendered its rows, this method reloads and returns undefined so the stale
     * browser action is ignored instead of being applied to a different file
     * shape or overwriting a user's hand edit.
     */
    private async requireFreshDocumentForEdit(): Promise<NonNullable<CTraceYamlFile['document']> | undefined> {
        if (this.dirty) {
            return this.requireDocument();
        }
        const reloaded = await this.reloadCurrentFileIfChanged();
        return reloaded ? undefined : this.requireDocument();
    }

    /**
     * acceptDiskDocument normalizes a freshly loaded YAML document for display.
     * The ctrace references are rebuilt internally, processor limits are
     * recalculated from the latest project files, and the webview receives a new
     * state snapshot that is derived from ctrace.yml rather than from browser
     * state.
     */
    private async acceptDiskDocument(document: NonNullable<CTraceYamlFile['document']>): Promise<void> {
        if (this.dirty) {
            this.notifyStateChanged();
            return;
        }
        document.assignCTraceRefs();
        await this.loadProcessorCapabilities();
        this.dirty = false;
        this.errorMessage = undefined;
        this.notifyStateChanged();
    }

    /**
     * watchCurrentFile starts a file watcher for the selected ctrace.yml so
     * hand edits made in VS Code or another editor automatically flow back into
     * the webview. The callback is guarded by object identity so a delayed event
     * from an older file cannot update the view after the user opens a different
     * trace configuration.
     */
    private watchCurrentFile(): void {
        this.disposeCurrentFileWatcher();
        const watchedFile = this.ctraceFile;
        if (!watchedFile) {
            return;
        }
        this.ctraceFileWatcher = watchedFile.watch(document => {
            if (this.ctraceFile !== watchedFile) {
                return;
            }
            void this.acceptDiskDocument(document);
        }, error => {
            if (this.ctraceFile !== watchedFile) {
                return;
            }
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Failed to reload ctrace file after disk change: ${this.errorMessage}`);
            this.notifyStateChanged();
        });
    }

    /**
     * disposeCurrentFileWatcher releases the active file watcher whenever the
     * view closes or a different ctrace.yml is selected. Without this cleanup,
     * stale watchers could continue responding to old files and make it look as
     * though the webview, not the currently selected YAML file, owned the state.
     */
    private disposeCurrentFileWatcher(): void {
        this.ctraceFileWatcher?.dispose();
        this.ctraceFileWatcher = undefined;
    }

    /**
     * openFile validates and loads an explicitly selected ctrace file. The
     * provider owns the VS Code open dialog, but the model owns the actual file
     * transition so watcher cleanup, parser setup, and state flags stay in one
     * non-webview layer.
     */
    public async openFile(fileName: string): Promise<void> {
        if (!TraceConfigurationModel.isCTraceFileName(fileName)) {
            throw new Error('Please select ctrace.yml, ctrace.yaml, or a *.ctrace.yml file.');
        }
        this.loading = true;
        this.notifyStateChanged();
        try {
            await this.loadFile(fileName);
            this.errorMessage = undefined;
        } finally {
            this.loading = false;
            this.notifyStateChanged();
        }
    }

    /**
     * updateExpandedState remembers which rows the user expanded or collapsed.
     * This is kept host-side so a full state refresh after saving the YAML file
     * does not reset the user's navigation context.
     */
    public updateExpandedState(id: string, expanded: boolean): void {
        if (expanded) {
            this.collapsedRows.delete(id);
        } else {
            this.collapsedRows.add(id);
        }
        this.notifyStateChanged();
    }

    /**
     * updateValue writes a value from the webview into the in-memory YAML DOM.
     * The file is not persisted until the user clicks Save. Most controls write
     * directly to scalar nodes; the timestamps checkbox writes a small
     * enabled/disabled map because that row represents a trace subsystem rather
     * than a literal boolean scalar.
     */
    public async updateValue(pathToUpdate: (string | number)[], value: string | boolean | string[]): Promise<void> {
        const document = await this.requireFreshDocumentForEdit();
        if (!document) {
            return;
        }
        if (typeof value === 'string' && value.trim() === '' && this.rowBuilder.isOptionalScalarPath(pathToUpdate)) {
            this.deleteOptionalValue(document, pathToUpdate);
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isProcessorPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.delete([...pathToUpdate, 'disable']);
            } else {
                this.setProcessorDisable(document, pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isEventsPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length > 0) {
                document.yaml.set(pathToUpdate, value.map(event => ({ event })));
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isItmPrivilegedPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length === 0) {
                document.yaml.delete(pathToUpdate);
            } else if (this.hasNonEmptyScalarValue(document, [...pathToUpdate.slice(0, -1), 'enable'])) {
                document.yaml.set(pathToUpdate, this.rowBuilder.privilegedRangesToMask(value));
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if ((this.rowBuilder.isDwtDataAccessPath(pathToUpdate) || this.rowBuilder.isTraceConditionAccessPath(pathToUpdate)) && typeof value === 'string') {
            document.yaml.set(pathToUpdate, this.rowBuilder.accessLabelToValue(value));
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isTimestampsPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, {});
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isItmPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length > 0) {
                document.yaml.set([...pathToUpdate, 'enable'], this.rowBuilder.itmChannelsToMask(value));
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isPcSamplingPath(pathToUpdate) && typeof value === 'string') {
            const period = this.rowBuilder.normalizePcSamplingPeriod(value);
            document.yaml.set([...pathToUpdate, 'period'], period === 'off' ? 0 : Number(period));
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isStreamSyncDwtPeriodPath(pathToUpdate) && typeof value === 'string') {
            const streamSyncPath = this.rowBuilder.getStreamSyncPathForDwtPeriodPath(pathToUpdate);
            document.yaml.set(streamSyncPath, { DWT: value });
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isMatchValuePath(pathToUpdate)
            && typeof value === 'string'
            && !this.rowBuilder.canSetSharedDwtComparatorMatchValue(pathToUpdate)) {
            this.errorMessage = this.createSharedDwtComparatorLimitMessage(pathToUpdate);
            this.notifyStateChanged();
            return;
        }
        if (this.rowBuilder.isMatchSizePath(pathToUpdate)
            && typeof value === 'string'
            && !this.hasNonEmptyScalarValue(document, [...pathToUpdate.slice(0, -1), 'value'])) {
            this.notifyStateChanged();
            return;
        }
        if (this.rowBuilder.isExceptionsPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, null);
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isTimeSyncPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, null);
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        if (this.rowBuilder.isInstructionsPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, {});
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.acceptInMemoryEdit();
            return;
        }
        document.yaml.set(pathToUpdate, typeof value === 'string' ? this.rowBuilder.toYamlScalarValue(pathToUpdate, value) : value);
        await this.acceptInMemoryEdit();
    }

    /**
     * addItem appends a suitable placeholder object to a sequence selected in
     * the webview. Known ctrace sequences get helpful starter fields, while
     * unknown sequences receive a generic key/value object that users can edit
     * further in YAML if needed.
     */
    public async addItem(pathToUpdate: (string | number)[], addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>): Promise<void> {
        const document = await this.requireFreshDocumentForEdit();
        if (!document) {
            return;
        }
        if (!this.rowBuilder.canAddSharedDwtComparatorEntry(pathToUpdate)) {
            this.errorMessage = this.createSharedDwtComparatorLimitMessage(pathToUpdate);
            this.notifyStateChanged();
            return;
        }
        const newItemIndex = this.getNextSequenceIndex(document, pathToUpdate);
        document.yaml.append(pathToUpdate, this.createNewItem(addChildKind));
        this.collapsedRows.delete(this.pathToId(pathToUpdate));
        this.focusedRowId = this.pathToId([...pathToUpdate, newItemIndex]);
        await this.acceptInMemoryEdit();
    }

    /**
     * getNextSequenceIndex returns the path segment that append will assign to
     * the next child. Missing and bare-key sequence paths become index 0 when
     * the YAML DOM materializes them.
     */
    private getNextSequenceIndex(document: NonNullable<CTraceYamlFile['document']>, sequencePath: (string | number)[]): number {
        const sequence = document.yaml.getItem(sequencePath);
        return isYamlSequenceItem(sequence) ? sequence.getChildren().length : 0;
    }

    /**
     * createSharedDwtComparatorLimitMessage reports stale attempts that arrive
     * after the UI has already disabled controls for a full DWT comparator
     * pool.
     */
    private createSharedDwtComparatorLimitMessage(pathToUpdate: (string | number)[]): string {
        const usage = this.rowBuilder.getSharedDwtComparatorUsage(pathToUpdate);
        if (!usage) {
            return 'No DWT comparators are available for this processor.';
        }
        return `No DWT comparators are available for this processor. DWT Data Trace, Instruction Trace Start/Stop, Trace Halt, and Match Value fields already use ${usage.used} of ${usage.limit} shared comparator entries.`;
    }

    /**
     * removeItem deletes the selected YAML node in memory. It is only exposed
     * for sequence items because removing arbitrary map keys from a GUI can be
     * surprisingly destructive.
     */
    public async removeItem(pathToRemove: (string | number)[]): Promise<void> {
        const document = await this.requireFreshDocumentForEdit();
        if (!document) {
            return;
        }
        document.yaml.delete(pathToRemove);
        this.convertEmptySequenceToBareKey(document, pathToRemove.slice(0, -1));
        await this.acceptInMemoryEdit();
    }

    /**
     * deleteOptionalValue removes an optional scalar field that the user cleared
     * in the webview. If that leaves an optional object such as match empty, the
     * parent object is pruned too so ctrace.yml does not accumulate empty
     * optional blocks.
     */
    private deleteOptionalValue(document: NonNullable<CTraceYamlFile['document']>, pathToDelete: (string | number)[]): void {
        if (this.rowBuilder.isMatchValuePath(pathToDelete)) {
            document.yaml.delete(pathToDelete.slice(0, -1));
            return;
        }
        document.yaml.delete(pathToDelete);
        const parentPath = pathToDelete.slice(0, -1);
        const parent = document.yaml.getItem(parentPath);
        if (this.rowBuilder.shouldPruneEmptyOptionalParent(parentPath) && isYamlMapItem(parent) && parent.getChildren().length === 0) {
            document.yaml.delete(parentPath);
        }
    }

    /**
     * acceptInMemoryEdit refreshes derived state after a webview edit without
     * writing to disk. While dirty, the file watcher is paused so unsaved
     * in-memory edits stay authoritative until the user clicks Save or Refresh.
     */
    private async acceptInMemoryEdit(): Promise<void> {
        const document = this.requireDocument();
        document.normalizeDocumentOrder();
        document.assignCTraceRefs();
        await this.loadProcessorCapabilities();
        this.dirty = true;
        this.errorMessage = undefined;
        this.disposeCurrentFileWatcher();
        this.notifyStateChanged();
    }

    /**
     * convertEmptySequenceToBareKey keeps empty editable lists as YAML shorthand
     * such as "data:" rather than serializing them as "data: []".
     */
    private convertEmptySequenceToBareKey(document: NonNullable<CTraceYamlFile['document']>, sequencePath: (string | number)[]): void {
        if (!this.rowBuilder.shouldUseBareSequenceWhenEmpty(sequencePath)) {
            return;
        }
        const sequence = document.yaml.getItem(sequencePath);
        if (isYamlSequenceItem(sequence) && sequence.getChildren().length === 0) {
            document.yaml.set(sequencePath, null);
        }
    }

    /**
     * convertAllEmptyEditableSequencesToBareKeys normalizes files that already
     * contain empty lists such as "data: []" before Save serializes them.
     */
    private convertAllEmptyEditableSequencesToBareKeys(document: NonNullable<CTraceYamlFile['document']>): void {
        const visitNode = (node: YamlTreeItem, nodePath: (string | number)[]): void => {
            if (isYamlSequenceItem(node)) {
                if (node.getChildren().length === 0) {
                    this.convertEmptySequenceToBareKey(document, nodePath);
                    return;
                }
                node.getChildren().forEach((item, index) => {
                    visitNode(item, [...nodePath, index]);
                });
                return;
            }
            if (!isYamlMapItem(node)) {
                return;
            }
            node.getChildren().forEach(child => {
                const key = child.getTag();
                if (key) {
                    visitNode(child, [...nodePath, key]);
                }
            });
        };
        visitNode(document.yaml.rootItem, []);
    }

    /**
     * removeLegacyElfFileMetadata drops obsolete ctrace-owned ELF references.
     * cbuild-run.yml remains the source for build output metadata.
     */
    private removeLegacyElfFileMetadata(document: NonNullable<CTraceYamlFile['document']>): void {
        document.yaml.delete(['ctrace', 'ELF-files']);
    }

    /**
     * hasNonEmptyScalarValue checks whether a schema-required sibling already
     * exists before the model writes an optional child beneath the same parent.
     * This keeps optional objects sparse without creating invalid half-filled
     * YAML such as match blocks that only contain size.
     */
    private hasNonEmptyScalarValue(document: NonNullable<CTraceYamlFile['document']>, pathToCheck: (string | number)[]): boolean {
        const node = document.yaml.getItem(pathToCheck);
        if (!isYamlScalarItem(node)) {
            return false;
        }
        return yamlScalarToString(node).trim().length > 0;
    }

    /**
     * setProcessorDisable writes the processor-level disable marker and then
     * moves that YAML pair directly after pname. The DOM set call is still used
     * to create the key safely, while the follow-up item reorder keeps the file
     * readable for users who inspect or edit ctrace.yml by hand.
     */
    private setProcessorDisable(document: NonNullable<CTraceYamlFile['document']>, processorPath: (string | number)[]): void {
        document.yaml.set([...processorPath, 'disable'], null);
        const processorNode = document.yaml.getItem(processorPath);
        if (!isYamlMapItem(processorNode)) {
            return;
        }
        const disableItem = processorNode.getChild('disable');
        const disableIndex = processorNode.indexOfChild(disableItem);
        if (disableIndex < 0) {
            return;
        }
        if (!disableItem) {
            return;
        }
        processorNode.removeChild(disableItem);
        const pnameIndex = processorNode.indexOfChild(processorNode.getChild('pname'));
        processorNode.addChild(disableItem, false, pnameIndex >= 0 ? pnameIndex + 1 : 0);
    }

    /**
     * createNewItem maps webview add buttons to starter YAML objects. These
     * defaults are intentionally small so the UI helps users begin a trace entry
     * without inventing values that should come from the target/debug session.
     */
    private createNewItem(addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>): object {
        switch (addChildKind) {
            case 'data':
                return { location: '', access: 'W' };
            case 'start':
            case 'stop':
                return { location: '', access: 'X' };
            case 'condition':
                return { location: '' };
            case 'generic-map':
                return { name: '' };
            case 'generic-scalar':
            default:
                return { value: '' };
        }
    }

    /**
     * saveCurrentDocument refreshes internal ctrace references, persists the
     * YAML file, and posts the refreshed tree to the webview. The options let
     * callers choose whether to reload or abort if the file changed on disk
     * before writing.
     */
    public async saveCurrentDocument(options: { reloadBeforeSave?: boolean; skipWhenReloaded?: boolean; abortIfDiskChanged?: boolean } = {}): Promise<void> {
        const file = this.requireFile();
        if (options.reloadBeforeSave) {
            const reloaded = await this.reloadCurrentFileIfChanged();
            if (reloaded && options.skipWhenReloaded) {
                return;
            }
        }
        if (options.abortIfDiskChanged && await file.hasExternalFileChanged()) {
            await this.reloadCurrentFileIfChanged();
            return;
        }
        if (file.document) {
            this.removeLegacyElfFileMetadata(file.document);
            this.convertAllEmptyEditableSequencesToBareKeys(file.document);
            file.document.normalizeDocumentOrder();
            file.document.assignCTraceRefs();
        }
        await file.save();
        await this.loadProcessorCapabilities();
        this.watchCurrentFile();
        this.dirty = false;
        this.errorMessage = undefined;
        this.notifyStateChanged();
    }

    /**
     * requireFile gives mutation handlers a clear error if a webview message
     * arrives before a trace file has been loaded. This avoids optional-chaining
     * silently dropping a user edit.
     */
    private requireFile(): CTraceYamlFile {
        if (!this.ctraceFile) {
            throw new Error('No ctrace.yml file is loaded.');
        }
        return this.ctraceFile;
    }

    /**
     * requireDocument is the document counterpart to requireFile. It returns the
     * current parsed CTraceYamlDocument so callers can mutate the YAML DOM.
     */
    private requireDocument(): NonNullable<CTraceYamlFile['document']> {
        const document = this.requireFile().document;
        if (!document) {
            throw new Error('No ctrace.yml document is loaded.');
        }
        return document;
    }

    /**
     * reportError stores a failed webview action's error message in the model
     * state and emits a refresh. Keeping the error in the model means the
     * provider can stay stateless even when it is the layer that catches a
     * browser message failure.
     */
    public reportError(error: unknown, messagePrefix: string): void {
        this.errorMessage = this.errorToString(error);
        logger.error(`${messagePrefix}: ${this.errorMessage}`);
        this.notifyStateChanged();
    }

    /**
     * createState asks the row builder to project the current YAML DOM into webview state. The model
     * owns the source document and status flags, while the row builder owns how those details become
     * rows that the UI can render.
     */
    public createState(): TraceConfigurationState {
        const state = this.rowBuilder.createState();
        if (!this.focusedRowId) {
            return state;
        }
        const focusedState: TraceConfigurationState = {
            ...state,
            focusedRowId: this.focusedRowId
        };
        this.focusedRowId = undefined;
        return focusedState;
    }

    /**
     * notifyStateChanged tells the webview provider that createState now has a
     * new snapshot. The model does not know whether a webview is currently
     * visible; the provider decides whether there is somewhere to post it.
     */
    private notifyStateChanged(): void {
        this.onDidChange();
    }

    /**
     * errorToString converts unknown caught values into displayable text. VS
     * Code APIs and filesystem calls usually throw Error objects, but this
     * helper keeps message handling robust for any thrown value.
     */
    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    /**
     * pathToId creates row identifiers that match TraceConfigurationRowBuilder.
     */
    private pathToId(nodePath: (string | number)[]): string {
        return JSON.stringify(nodePath);
    }
}
