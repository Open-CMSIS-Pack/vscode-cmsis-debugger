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

import * as YAML from 'yaml';
import * as vscode from 'vscode';

import { CTraceYamlFile, Disposable } from '../../generic';
import { logger } from '../../logger';
import {
    TraceConfigurationRow,
    TraceConfigurationState,
} from './trace-configuration-protocol';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';
import { TraceConfigurationRowBuilder } from './trace-configuration-row-builder';
import * as TraceConfigurationTypes from './trace-configuration-types';

/**
 * TraceConfigurationModel owns the ctrace.yml document lifecycle and file mutations for the trace
 * configuration webview. It deliberately delegates processor capability lookup and row projection to
 * smaller helper classes so this file stays focused on reading, writing, watching, and saving YAML.
 */
export class TraceConfigurationModel {
    private ctraceFile: CTraceYamlFile | undefined;
    private ctraceFileWatcher: Disposable | undefined;
    private loading = false;
    private dirty = false;
    private errorMessage: string | undefined;
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
        this.disposeCurrentFileWatcher();
    }

    /**
     * loadInitialFile finds the best ctrace.yml candidate and loads it as soon
     * as the webview appears. The active editor is preferred because it is the
     * clearest user intent; otherwise the workspace is searched for trace YAML
     * files and the first result is used.
     */
    public async loadInitialFile(): Promise<void> {
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
        const nextFile = new CTraceYamlFile(fileName);
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
     * updateValue writes a value from the webview into the YAML DOM and
     * immediately saves the file. Most controls write directly to scalar nodes;
     * the timestamps checkbox writes a small enabled/disabled map because that
     * row represents a trace subsystem rather than a literal boolean scalar.
     */
    public async updateValue(pathToUpdate: (string | number)[], value: string | boolean | string[]): Promise<void> {
        const document = await this.requireFreshDocumentForEdit();
        if (!document) {
            return;
        }
        if (typeof value === 'string' && value.trim() === '' && this.rowBuilder.isOptionalScalarPath(pathToUpdate)) {
            this.deleteOptionalValue(document, pathToUpdate);
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isProcessorPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.delete([...pathToUpdate, 'disable']);
            } else {
                this.setProcessorDisable(document, pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isEventsPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length > 0) {
                document.yaml.set(pathToUpdate, value.map(event => ({ event })));
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isItmPrivilegedPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length === 0) {
                document.yaml.delete(pathToUpdate);
            } else if (this.hasNonEmptyScalarValue(document, [...pathToUpdate.slice(0, -1), 'enable'])) {
                document.yaml.set(pathToUpdate, this.rowBuilder.privilegedRangesToMask(value));
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if ((this.rowBuilder.isDwtDataAccessPath(pathToUpdate) || this.rowBuilder.isTraceConditionAccessPath(pathToUpdate)) && typeof value === 'string') {
            document.yaml.set(pathToUpdate, this.rowBuilder.accessLabelToValue(value));
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isTimestampsPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, {});
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isItmPath(pathToUpdate) && Array.isArray(value)) {
            if (value.length > 0) {
                document.yaml.set([...pathToUpdate, 'enable'], this.rowBuilder.itmChannelsToMask(value));
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isPcSamplingPath(pathToUpdate) && typeof value === 'string') {
            const period = this.rowBuilder.normalizePcSamplingPeriod(value);
            document.yaml.set([...pathToUpdate, 'period'], period === 'off' ? 0 : Number(period));
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isStreamSyncDwtPeriodPath(pathToUpdate) && typeof value === 'string') {
            const streamSyncPath = pathToUpdate.slice(0, -1);
            document.yaml.set(streamSyncPath, [{ DWT: value }]);
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
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
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isTimeSyncPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, null);
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        if (this.rowBuilder.isInstructionsPath(pathToUpdate) && typeof value === 'boolean') {
            if (value) {
                document.yaml.set(pathToUpdate, {});
            } else {
                document.yaml.delete(pathToUpdate);
            }
            await this.saveCurrentDocument({ abortIfDiskChanged: true });
            return;
        }
        document.yaml.set(pathToUpdate, typeof value === 'string' ? this.rowBuilder.toYamlScalarValue(pathToUpdate, value) : value);
        await this.saveCurrentDocument({ abortIfDiskChanged: true });
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
        document.yaml.append(pathToUpdate, this.createNewItem(addChildKind));
        await this.saveCurrentDocument({ abortIfDiskChanged: true });
    }

    /**
     * removeItem deletes the selected YAML node and saves the file. It is only
     * exposed for sequence items because removing arbitrary map keys from a GUI
     * can be surprisingly destructive.
     */
    public async removeItem(pathToRemove: (string | number)[]): Promise<void> {
        const document = await this.requireFreshDocumentForEdit();
        if (!document) {
            return;
        }
        document.yaml.delete(pathToRemove);
        await this.saveCurrentDocument({ abortIfDiskChanged: true });
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
        const parent = document.yaml.getNode(parentPath);
        if (this.rowBuilder.shouldPruneEmptyOptionalParent(parentPath) && YAML.isMap(parent) && parent.items.length === 0) {
            document.yaml.delete(parentPath);
        }
    }

    /**
     * hasNonEmptyScalarValue checks whether a schema-required sibling already
     * exists before the model writes an optional child beneath the same parent.
     * This keeps optional objects sparse without creating invalid half-filled
     * YAML such as match blocks that only contain size.
     */
    private hasNonEmptyScalarValue(document: NonNullable<CTraceYamlFile['document']>, pathToCheck: (string | number)[]): boolean {
        const node = document.yaml.getNode(pathToCheck);
        if (!YAML.isScalar(node) || node.value === undefined || node.value === null) {
            return false;
        }
        return String(node.value).trim().length > 0;
    }

    /**
     * setProcessorDisable writes the processor-level disable marker and then
     * moves that YAML pair directly after pname. The DOM set call is still used
     * to create the key safely, while the follow-up item reorder keeps the file
     * readable for users who inspect or edit ctrace.yml by hand.
     */
    private setProcessorDisable(document: NonNullable<CTraceYamlFile['document']>, processorPath: (string | number)[]): void {
        document.yaml.set([...processorPath, 'disable'], null);
        const processorNode = document.yaml.getNode(processorPath);
        if (!YAML.isMap(processorNode)) {
            return;
        }
        const disableIndex = this.findMapPairIndex(processorNode, 'disable');
        if (disableIndex < 0) {
            return;
        }
        const [disablePair] = processorNode.items.splice(disableIndex, 1);
        if (!disablePair) {
            return;
        }
        const pnameIndex = this.findMapPairIndex(processorNode, 'pname');
        processorNode.items.splice(pnameIndex >= 0 ? pnameIndex + 1 : 0, 0, disablePair);
    }

    /**
     * findMapPairIndex locates one key in a YAML map without converting the
     * whole map to JavaScript. Staying on the YAML node layer preserves comments,
     * scalar spelling, and pair ordering while we make a tiny readability edit.
     */
    private findMapPairIndex(map: YAML.YAMLMap, key: string): number {
        return map.items.findIndex(pair => this.mapKeyToString(pair.key) === key);
    }

    /**
     * mapKeyToString extracts a string key from a YAML pair. ctrace keys should
     * be plain scalar strings, but the fallback keeps the ordering helper
     * defensive around unusual hand-authored YAML.
     */
    private mapKeyToString(key: unknown): string | undefined {
        if (YAML.isScalar(key)) {
            return key.value === undefined || key.value === null ? undefined : String(key.value);
        }
        return key?.toString();
    }

    /**
     * createNewItem maps webview add buttons to starter YAML objects. These
     * defaults are intentionally small so the UI helps users begin a trace entry
     * without inventing values that should come from the target/debug session.
     */
    private createNewItem(addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>): object {
        switch (addChildKind) {
            case 'data':
                return { location: '' };
            case 'condition':
            case 'start':
            case 'stop':
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
     * callers protect ctrace.yml as the source of truth: toolbar saves reload
     * first and skip writing if disk changed, while edit saves abort if a file
     * change lands in the small window between the pre-edit reload check and the
     * final filesystem write.
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
        file.document?.assignCTraceRefs();
        await file.save();
        await this.loadProcessorCapabilities();
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
        return this.rowBuilder.createState();
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
}
