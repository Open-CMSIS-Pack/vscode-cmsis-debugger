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

import { isYamlMapItem, isYamlScalarItem, isYamlSequenceItem, YamlTreeItem, yamlScalarToString } from '../../desktop/yaml-dom';
import { logger } from '../../logger';
import { CTRACE_FILE_GLOB, TRACE_CONFIGURATION_SHOW_CTRACE_REFS_SETTING } from '../../manifest';
import { CTraceYamlFile } from './ctrace-yaml';
import {
    GeneratedCBuildRunFileChangeEvent,
    TraceConfigurationFileWatcher
} from './trace-configuration-file-watcher';
import {
    SWO_UART_TRACE_OFF_MESSAGE,
    TraceConfigurationGeneratedCTraceFileManager
} from './trace-configuration-generated-ctrace-file-manager';
import {
    TraceConfigurationRow,
    TraceConfigurationState,
} from './trace-configuration-protocol';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';
import { TraceConfigurationRowBuilder } from './trace-configuration-row-builder';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

const WORKSPACE_SEARCH_EXCLUDE_GLOB = '**/{node_modules,dist,coverage}/**';
const BUILD_REQUIRED_MESSAGE = 'Build/Rebuild csolution project to enable trace configuration';

/**
 * TraceConfigurationModel owns the ctrace.yml document lifecycle and file mutations for the trace
 * configuration webview. It deliberately delegates processor capability lookup and row projection to
 * smaller helper classes so this file stays focused on orchestrating file lifecycle, edits, and state.
 */
export class TraceConfigurationModel {
    private ctraceFile: CTraceYamlFile | undefined;
    private readonly fileWatcher: TraceConfigurationFileWatcher;
    private readonly generatedCTraceFileManager: TraceConfigurationGeneratedCTraceFileManager;
    public readonly onDidChangeGeneratedCBuildRunFile: vscode.Event<GeneratedCBuildRunFileChangeEvent>;
    private loading = false;
    private dirty = false;
    private errorMessage: string | undefined;
    private emptyMessage: string | undefined;
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
        rowBuilder?: TraceConfigurationRowBuilder,
        generatedCTraceFileManager?: TraceConfigurationGeneratedCTraceFileManager
    ) {
        this.generatedCTraceFileManager = generatedCTraceFileManager ?? new TraceConfigurationGeneratedCTraceFileManager();
        this.processorCapabilities = processorCapabilities ?? new TraceConfigurationProcessorCapabilities(() => this.ctraceFile);
        this.rowBuilder = rowBuilder ?? new TraceConfigurationRowBuilder(
            () => this.ctraceFile,
            () => this.loading,
            () => this.dirty,
            () => this.errorMessage,
            this.collapsedRows,
            this.processorCapabilities.capabilities,
            () => vscode.workspace.getConfiguration().get<boolean>(TRACE_CONFIGURATION_SHOW_CTRACE_REFS_SETTING, false)
        );
        this.fileWatcher = new TraceConfigurationFileWatcher({
            getCurrentFile: () => this.ctraceFile,
            onCurrentFileReloaded: document => this.acceptDiskDocument(document),
            onCurrentFileReloadFailed: error => this.reportCurrentFileReloadError(error),
            onGeneratedCBuildRunFileChanged: event => this.refreshProcessorCapabilitiesFromGeneratedCBuildRunFile(event)
        });
        this.onDidChangeGeneratedCBuildRunFile = this.fileWatcher.onDidChangeGeneratedCBuildRunFile;
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
        this.fileWatcher.dispose();
    }

    /**
     * watchForGeneratedCBuildRunFiles installs the cbuild index watcher before
     * CMSIS Solution activation starts. This prevents generated-file events
     * emitted during companion-extension startup from being missed.
     */
    public watchForGeneratedCBuildRunFiles(): void {
        this.fileWatcher.watchGeneratedCBuildRunFiles();
    }

    /**
     * refreshProcessorCapabilitiesFromGeneratedCBuildRunFile delegates generated
     * ctrace.yml creation to the generated-file manager. It loads generated
     * trace files and replaces file-backed state with guidance when tracing is off.
     */
    private async refreshProcessorCapabilitiesFromGeneratedCBuildRunFile(event: GeneratedCBuildRunFileChangeEvent): Promise<void> {
        try {
            const result = await this.generatedCTraceFileManager.processGeneratedCBuildRunFileChange(event);
            switch (result.status) {
                case 'generated':
                    await this.loadFile(result.uri.fsPath);
                    break;
                case 'trace-off':
                    this.clearCurrentFile();
                    this.emptyMessage = SWO_UART_TRACE_OFF_MESSAGE;
                    break;
                case 'deleted':
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
     * loadInitialFile handles CMSIS Solution activation by asking it for the
     * active cbuild-run file. A valid existing file enters the generated trace
     * flow immediately. Otherwise, an index watcher waits for the first build
     * while any existing .cmsis/*.ctrace.yml file remains available to edit.
     */
    public async loadInitialFile(): Promise<void> {
        this.watchForGeneratedCBuildRunFiles();
        this.loading = true;
        this.errorMessage = undefined;
        this.emptyMessage = undefined;
        this.notifyStateChanged();
        try {
            if (await this.fileWatcher.processActiveCBuildRunFile()) {
                return;
            }
            const candidate = await this.findInitialCTraceFile();
            if (candidate) {
                await this.loadFile(candidate.fsPath);
                return;
            }

            this.clearCurrentFile();
            this.emptyMessage = BUILD_REQUIRED_MESSAGE;
        } catch (error) {
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Failed to load ctrace file: ${this.errorMessage}`);
        } finally {
            this.loading = false;
            this.notifyStateChanged();
        }
    }

    /**
     * findInitialCTraceFile searches workspace .cmsis folders for supported
     * *.ctrace.yml files. It deliberately ignores the active editor so unrelated
     * trace files outside the generated configuration folder are not selected.
     */
    private async findInitialCTraceFile(): Promise<vscode.Uri | undefined> {
        const files = await vscode.workspace.findFiles(CTRACE_FILE_GLOB, WORKSPACE_SEARCH_EXCLUDE_GLOB, 10);
        return files.at(0);
    }

    /**
     * clearCurrentFile resets file-backed state before startup falls back to
     * generated project discovery or the build-required empty state.
     */
    private clearCurrentFile(): void {
        this.fileWatcher.disposeCurrentFileWatcher();
        this.ctraceFile = undefined;
        this.processorCapabilities.clear();
        this.dirty = false;
    }

    /**
     * isCTraceFileName centralizes explicit-open filename validation so only
     * target-specific files that follow the supported *.ctrace.yml format are
     * accepted.
     */
    public static isCTraceFileName(fileName: string): boolean {
        const baseName = path.basename(fileName).toLowerCase();
        return baseName.endsWith('.ctrace.yml')
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
        this.fileWatcher.disposeCurrentFileWatcher();
        this.ctraceFile = nextFile;
        document.assignCTraceRefs();
        await this.loadProcessorCapabilities();
        this.fileWatcher.watchCurrentFile();
        this.dirty = false;
        this.emptyMessage = undefined;
    }

    /**
     * loadProcessorCapabilities delegates processor lookup to the capability mapper whenever the
     * active ctrace file changes. Keeping this wrapper here makes the file lifecycle code read like a
     * single sequence: load YAML, refresh capabilities, then notify the UI.
     */
    private async loadProcessorCapabilities(): Promise<void> {
        await this.processorCapabilities.load();
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
            this.fileWatcher.watchCurrentFile();
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
     * reportCurrentFileReloadError records and logs a ctrace.yml reload failure
     * reported by the file watcher so the next state snapshot can show the
     * problem in the webview.
     */
    private reportCurrentFileReloadError(error: unknown): void {
        this.errorMessage = this.errorToString(error);
        logger.error(`Trace Configuration: Failed to reload ctrace file after disk change: ${this.errorMessage}`);
        this.notifyStateChanged();
    }

    /**
     * openFile validates and loads an explicitly selected ctrace file. The
     * provider owns the VS Code open dialog, but the model owns the actual file
     * transition so watcher cleanup, parser setup, and state flags stay in one
     * non-webview layer.
     */
    public async openFile(fileName: string): Promise<void> {
        if (!TraceConfigurationModel.isCTraceFileName(fileName)) {
            throw new Error('Please select a *.ctrace.yml, or *.ctrace.yaml file.');
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
        this.fileWatcher.disposeCurrentFileWatcher();
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
        this.fileWatcher.watchCurrentFile();
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
        const rowBuilderState = this.rowBuilder.createState();
        const state: TraceConfigurationState = this.emptyMessage
            ? { ...rowBuilderState, emptyMessage: this.emptyMessage }
            : rowBuilderState;
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
