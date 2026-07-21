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

import * as path from 'node:path';
import * as YAML from 'yaml';
import * as vscode from 'vscode';
import { CTraceYamlFile } from '../../generic';
import { logger } from '../../logger';
import {
    TraceConfigurationRow,
    TraceConfigurationState,
    TraceHostToWebviewMessage,
    TraceWebviewToHostMessage
} from './trace-configuration-protocol';

const VIEW_ID = 'cmsis-debugger.traceConfiguration';
const CTRACE_FILE_GLOB = '{**/ctrace.yml,**/ctrace.yaml,**/*.ctrace.yml,**/*.ctrace.yaml}';
const EVENT_COUNTER_OPTIONS = ['CYCCNT', 'CPICNT', 'EXCCNT', 'SLEEPCNT', 'LSUCNT', 'FOLDCNT', 'PMU'];
const PRIVILEGED_RANGE_OPTIONS = ['0-7', '8-15', '16-23', '24-31'];
const STREAM_SYNC_PERIOD_OPTIONS = ['off', '16M', '64M', '256M'];
const PC_SAMPLING_PERIOD_OPTIONS = [
    'off',
    '64',
    '128',
    '192',
    '256',
    '320',
    '384',
    '448',
    '512',
    '576',
    '640',
    '704',
    '768',
    '832',
    '896',
    '960',
    '1024',
    '2048',
    '3072',
    '4096',
    '5120',
    '6144',
    '7168',
    '8192',
    '9216',
    '10240',
    '11264',
    '12288',
    '13312',
    '14336',
    '15360',
    '16384',
];

interface RowBuildContext {
    rows: TraceConfigurationRow[];
    collapsedRows: Set<string>;
}

/**
 * The TraceConfigurationWebviewProvider owns the VS Code sidebar webview for
 * editing ctrace.yml files. It keeps all file-system and YAML mutation work on
 * the extension-host side, while the browser sandbox only renders controls and
 * reports user actions via postMessage.
 */
export class TraceConfigurationWebviewProvider implements vscode.WebviewViewProvider {
    private webviewView: vscode.WebviewView | undefined;
    private ctraceFile: CTraceYamlFile | undefined;
    private loading = false;
    private dirty = false;
    private errorMessage: string | undefined;
    private readonly collapsedRows = new Set<string>();

    /**
     * The constructor stores the extension URI so resolveWebviewView can later
     * turn built files under dist/webviews into webview-safe URIs. VS Code
     * webviews cannot load arbitrary extension file paths directly; every local
     * asset must go through webview.asWebviewUri.
     */
    public constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * activate registers this object as the provider for the contributed view.
     * Keeping registration in a dedicated method mirrors the rest of the
     * extension and makes desktop activation responsible only for composing
     * feature objects.
     */
    public activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(VIEW_ID, this)
        );
    }

    /**
     * resolveWebviewView is called by VS Code when the sidebar view is first
     * opened. The method configures CSP-safe HTML, installs message handlers,
     * cleans up state on dispose, and starts the initial asynchronous file load.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.buildShell(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message: TraceWebviewToHostMessage) => {
            void this.handleMessage(message);
        });
        webviewView.onDidDispose(() => {
            this.webviewView = undefined;
        });
        void this.loadInitialFile();
    }

    /**
     * loadInitialFile finds the best ctrace.yml candidate and loads it as soon
     * as the webview appears. The active editor is preferred because it is the
     * clearest user intent; otherwise the workspace is searched for trace YAML
     * files and the first result is used.
     */
    private async loadInitialFile(): Promise<void> {
        this.loading = true;
        this.errorMessage = undefined;
        this.postState();
        try {
            const candidate = await this.findInitialCTraceFile();
            if (!candidate) {
                this.ctraceFile = undefined;
                this.errorMessage = undefined;
                return;
            }
            await this.loadFile(candidate.fsPath);
        } catch (error) {
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Failed to load ctrace file: ${this.errorMessage}`);
        } finally {
            this.loading = false;
            this.postState();
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
        if (activeFile && this.isCTraceFileName(activeFile.fsPath)) {
            return activeFile;
        }
        const files = await vscode.workspace.findFiles(CTRACE_FILE_GLOB, '**/{node_modules,dist,coverage}/**', 10);
        return files.find(file => this.isCTraceFileName(file.fsPath));
    }

    /**
     * isCTraceFileName centralizes filename recognition so active-editor,
     * workspace-search, and open-dialog paths all use the same rule. The rule is
     * intentionally broad enough to accept ctrace.yml, ctrace.yaml, and
     * target-specific names such as board.ctrace.yml.
     */
    private isCTraceFileName(fileName: string): boolean {
        const baseName = path.basename(fileName).toLowerCase();
        return baseName === 'ctrace.yml'
            || baseName === 'ctrace.yaml'
            || baseName.endsWith('.ctrace.yml')
            || baseName.endsWith('.ctrace.yaml');
    }

    /**
     * loadFile creates the CTraceYamlFile wrapper and parses the supplied file.
     * It also assigns ctrace-ref fields immediately so the webview and future
     * generated trace data can rely on a reference existing for each map node.
     */
    private async loadFile(fileName: string): Promise<void> {
        this.ctraceFile = new CTraceYamlFile(fileName);
        const document = await this.ctraceFile.load(fileName);
        document.assignCTraceRefs();
        this.dirty = false;
    }

    /**
     * handleMessage is the single async dispatcher for browser-to-extension
     * actions. Each case delegates to a narrow method so file operations can be
     * awaited and any thrown errors can be displayed in the webview state.
     */
    private async handleMessage(message: TraceWebviewToHostMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.postState();
                    break;
                case 'refresh':
                    await this.refreshFile();
                    break;
                case 'save':
                    await this.saveCurrentDocument();
                    break;
                case 'openFile':
                    await this.promptAndOpenFile();
                    break;
                case 'toggle':
                    this.updateExpandedState(message.id, message.expanded);
                    break;
                case 'updateValue':
                    await this.updateValue(message.path, message.value);
                    break;
                case 'addItem':
                    await this.addItem(message.path, message.addChildKind);
                    break;
                case 'removeItem':
                    await this.removeItem(message.path);
                    break;
            }
        } catch (error) {
            this.errorMessage = this.errorToString(error);
            logger.error(`Trace Configuration: Webview action failed: ${this.errorMessage}`);
            this.postState();
        }
    }

    /**
     * refreshFile reloads the currently selected file from disk. The method is
     * async because VS Code users may edit ctrace.yml directly in another editor
     * tab and then ask the webview to reflect the latest file contents.
     */
    private async refreshFile(): Promise<void> {
        if (!this.ctraceFile) {
            await this.loadInitialFile();
            return;
        }
        this.loading = true;
        this.postState();
        try {
            const document = await this.ctraceFile.load();
            document.assignCTraceRefs();
            this.dirty = false;
            this.errorMessage = undefined;
        } finally {
            this.loading = false;
            this.postState();
        }
    }

    /**
     * promptAndOpenFile lets the user manually pick a ctrace file when automatic
     * discovery found nothing or chose the wrong file. The selected URI is then
     * loaded through the same path as automatic discovery.
     */
    private async promptAndOpenFile(): Promise<void> {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'CMSIS Trace YAML': ['yml', 'yaml']
            },
            title: 'Open CMSIS Trace Configuration'
        });
        const file = selected?.at(0);
        if (!file) {
            return;
        }
        if (!this.isCTraceFileName(file.fsPath)) {
            throw new Error('Please select ctrace.yml, ctrace.yaml, or a *.ctrace.yml file.');
        }
        this.loading = true;
        this.postState();
        try {
            await this.loadFile(file.fsPath);
            this.errorMessage = undefined;
        } finally {
            this.loading = false;
            this.postState();
        }
    }

    /**
     * updateExpandedState remembers which rows the user expanded or collapsed.
     * This is kept host-side so a full state refresh after saving the YAML file
     * does not reset the user's navigation context.
     */
    private updateExpandedState(id: string, expanded: boolean): void {
        if (expanded) {
            this.collapsedRows.delete(id);
        } else {
            this.collapsedRows.add(id);
        }
        this.postState();
    }

    /**
     * updateValue writes a value from the webview into the YAML DOM and
     * immediately saves the file. Most controls write directly to scalar nodes;
     * the timestamps checkbox writes a small enabled/disabled map because that
     * row represents a trace subsystem rather than a literal boolean scalar.
     */
    private async updateValue(pathToUpdate: (string | number)[], value: string | boolean | string[]): Promise<void> {
        const document = this.requireDocument();
        if (this.isProcessorPath(pathToUpdate) && typeof value === 'boolean') {
            document.yaml.set([...pathToUpdate, 'disable'], !value);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isEventsPath(pathToUpdate) && Array.isArray(value)) {
            document.yaml.set(pathToUpdate, value.map(event => ({ event })));
            await this.saveCurrentDocument();
            return;
        }
        if (this.isItmPrivilegedPath(pathToUpdate) && Array.isArray(value)) {
            document.yaml.set(pathToUpdate, this.privilegedRangesToMask(value));
            await this.saveCurrentDocument();
            return;
        }
        if (this.isDwtDataAccessPath(pathToUpdate) && typeof value === 'string') {
            document.yaml.set(pathToUpdate, this.accessLabelToValue(value));
            await this.saveCurrentDocument();
            return;
        }
        if (this.isTimestampsPath(pathToUpdate) && typeof value === 'boolean') {
            document.yaml.set(pathToUpdate, value ? { 'itm-prescaler': '16' } : null);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isItmPath(pathToUpdate) && typeof value === 'string') {
            document.yaml.set([...pathToUpdate, 'enable'], value);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isPcSamplingPath(pathToUpdate) && typeof value === 'string') {
            document.yaml.set([...pathToUpdate, 'period'], this.normalizePcSamplingPeriod(value));
            await this.saveCurrentDocument();
            return;
        }
        if (this.isStreamSyncDwtPeriodPath(pathToUpdate) && typeof value === 'string') {
            const streamSyncPath = pathToUpdate.slice(0, -1);
            document.yaml.set(streamSyncPath, value === 'off' ? [] : [{ period: `DWT\\${value}` }]);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isExceptionsPath(pathToUpdate) && typeof value === 'boolean') {
            document.yaml.set(pathToUpdate, value ? {} : null);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isTimeSyncPath(pathToUpdate) && typeof value === 'boolean') {
            document.yaml.set(pathToUpdate, value ? {} : null);
            await this.saveCurrentDocument();
            return;
        }
        if (this.isInstructionsPath(pathToUpdate) && typeof value === 'boolean') {
            document.yaml.set(pathToUpdate, value ? {} : null);
            await this.saveCurrentDocument();
            return;
        }
        document.yaml.set(pathToUpdate, value);
        await this.saveCurrentDocument();
    }

    /**
     * addItem appends a suitable placeholder object to a sequence selected in
     * the webview. Known ctrace sequences get helpful starter fields, while
     * unknown sequences receive a generic key/value object that users can edit
     * further in YAML if needed.
     */
    private async addItem(pathToUpdate: (string | number)[], addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>): Promise<void> {
        const document = this.requireDocument();
        document.yaml.append(pathToUpdate, this.createNewItem(addChildKind));
        await this.saveCurrentDocument();
    }

    /**
     * removeItem deletes the selected YAML node and saves the file. It is only
     * exposed for sequence items because removing arbitrary map keys from a GUI
     * can be surprisingly destructive.
     */
    private async removeItem(pathToRemove: (string | number)[]): Promise<void> {
        const document = this.requireDocument();
        document.yaml.delete(pathToRemove);
        await this.saveCurrentDocument();
    }

    /**
     * createNewItem maps webview add buttons to starter YAML objects. These
     * defaults are intentionally small so the UI helps users begin a trace entry
     * without inventing values that should come from the target/debug session.
     */
    private createNewItem(addChildKind: NonNullable<TraceConfigurationRow['addChildKind']>): object {
        switch (addChildKind) {
            case 'data':
                return { location: '', access: 'rw' };
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
     * saveCurrentDocument assigns fresh ctrace-ref values, persists the YAML
     * file, and posts the refreshed tree to the webview. The function is async
     * because writes go through the filesystem-backed CTraceYamlFile abstraction.
     */
    private async saveCurrentDocument(): Promise<void> {
        const file = this.requireFile();
        file.document?.assignCTraceRefs();
        await file.save();
        this.dirty = false;
        this.errorMessage = undefined;
        this.postState();
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
     * postState serializes the current host state and sends it to the webview.
     * The browser side is intentionally stateless with respect to file contents:
     * every host update replaces the rendered rows.
     */
    private postState(): void {
        if (!this.webviewView) {
            return;
        }
        const message: TraceHostToWebviewMessage = {
            type: 'update',
            state: this.createState()
        };
        void this.webviewView.webview.postMessage(message);
    }

    /**
     * createState builds the DTO consumed by the webview. It contains display
     * rows, loading/error flags, and the selected file name, but it never exposes
     * raw YAML node objects to the browser sandbox.
     */
    private createState(): TraceConfigurationState {
        const document = this.ctraceFile?.document;
        const rows = document ? this.createRows(document.yaml.document.contents) : [];
        const emptyMessage = document
            ? rows.length === 0 ? 'The selected YAML file has no ctrace configuration.' : undefined
            : 'Open a ctrace.yml file to edit trace configuration.';
        return {
            fileName: this.ctraceFile?.fileName,
            rows,
            loading: this.loading,
            dirty: this.dirty,
            emptyMessage,
            errorMessage: this.errorMessage
        };
    }

    /**
     * createRows starts YAML node serialization at the user-facing trace
     * configuration level. The top-level ctrace key is only the file wrapper, so
     * this method hides it and emits its children as top-level rows instead.
     * The returned rows are already flattened according to expansion state so
     * the webview can render a simple table body instead of traversing YAML
     * itself.
     */
    private createRows(root: YAML.Node | null | undefined): TraceConfigurationRow[] {
        if (!root) {
            return [];
        }
        const context: RowBuildContext = {
            rows: [],
            collapsedRows: this.collapsedRows
        };
        const ctraceRoot = this.ctraceFile?.document?.yaml.getNode(['ctrace']);
        if (ctraceRoot) {
            this.getChildEntries(ctraceRoot).forEach(child => {
                this.appendNodeRows(context, child.node, child.path, child.label, 0);
            });
            return context.rows;
        }
        this.appendNodeRows(context, root, [], 'YAML', 0, true);
        return context.rows;
    }

    /**
     * appendNodeRows turns a YAML node into one or more table rows. It emits the
     * current row first and then, when expanded, recursively emits child rows for
     * maps and sequences. setup is treated as a purely structural YAML level in
     * the webview because the available processors are discovered elsewhere, and
     * instruction trigger items are flattened so their Location field appears as
     * an editable Label/Selection row instead of being used as a row title.
     */
    private appendNodeRows(
        context: RowBuildContext,
        node: YAML.Node,
        nodePath: (string | number)[],
        label: string,
        depth: number,
        forceExpanded = false
    ): void {
        if (this.isStreamSynchronizationPath(nodePath)) {
            this.appendStreamSynchronizationRows(context, node, nodePath, label, depth, forceExpanded);
            return;
        }
        const id = this.pathToId(nodePath);
        const childEntries = this.getChildEntries(node);
        const hasChildren = childEntries.length > 0;
        if (this.shouldFlattenSetupNode(node, nodePath) || this.shouldFlattenInstructionTriggerItem(node, nodePath)) {
            childEntries.forEach(child => {
                this.appendNodeRows(context, child.node, child.path, child.label, depth);
            });
            return;
        }
        const expanded = forceExpanded || !context.collapsedRows.has(id);
        context.rows.push(this.createRow(node, nodePath, label, depth, hasChildren, expanded));
        if (!hasChildren || !expanded) {
            return;
        }
        childEntries.forEach(child => {
            this.appendNodeRows(context, child.node, child.path, child.label, depth + 1);
        });
        this.appendAdvancedSettingsRows(context, node, nodePath, depth + 1);
    }

    /**
     * appendAdvancedSettingsRows creates a synthetic parent row that groups the
     * timing-related advanced options. The row is not written to YAML; it simply
     * gives Time Syncronization and Stream Syncronization a clearer home in the
     * webview tree.
     */
    private appendAdvancedSettingsRows(context: RowBuildContext, node: YAML.Node, nodePath: (string | number)[], depth: number): void {
        if (!this.isProcessorPath(nodePath) || !YAML.isMap(node)) {
            return;
        }
        const childEntries = this.getAdvancedSettingsEntries(node, nodePath);
        if (childEntries.length === 0) {
            return;
        }
        const advancedPath = [...nodePath, 'advanced-settings'];
        const expanded = !context.collapsedRows.has(this.pathToId(advancedPath));
        context.rows.push({
            id: this.pathToId(advancedPath),
            label: 'Advanced Settings',
            path: advancedPath,
            depth,
            kind: 'map',
            control: 'none',
            hasChildren: true,
            expanded,
            removable: false,
        });
        if (!expanded) {
            return;
        }
        childEntries.forEach(child => {
            this.appendNodeRows(context, child.node, child.path, child.label, depth + 1);
        });
    }

    /**
     * appendStreamSynchronizationRows renders the synchronization sequence as a
     * user-facing Stream Syncronization group with one DWT period child. ETM
     * entries remain unsupported in the UI because they are being removed from
     * the current spec, but the YAML structure is still translated cleanly when
     * the DWT dropdown changes.
     */
    private appendStreamSynchronizationRows(
        context: RowBuildContext,
        node: YAML.Node,
        nodePath: (string | number)[],
        label: string,
        depth: number,
        forceExpanded = false
    ): void {
        const id = this.pathToId(nodePath);
        const expanded = forceExpanded || !context.collapsedRows.has(id);
        context.rows.push({
            ...this.createRow(node, nodePath, label, depth, true, expanded),
            addChildKind: undefined,
            control: 'none',
        });
        if (!expanded) {
            return;
        }
        const dwtPeriodPath = [...nodePath, 'dwt-sync-period'];
        context.rows.push({
            id: this.pathToId(dwtPeriodPath),
            label: 'DWT Sync Period (cycles)',
            path: dwtPeriodPath,
            depth: depth + 1,
            kind: 'scalar',
            control: 'select',
            value: this.getStreamSyncDwtPeriod(node),
            options: STREAM_SYNC_PERIOD_OPTIONS,
            hasChildren: false,
            expanded: false,
            removable: false,
        });
    }

    /**
     * createRow maps YAML node metadata to a webview row with a control type.
     * Scalars become editable controls, sequences get add buttons, and maps are
     * rendered as expandable groups that mirror the mockup's tree-table style.
     */
    private createRow(
        node: YAML.Node,
        nodePath: (string | number)[],
        label: string,
        depth: number,
        hasChildren: boolean,
        expanded: boolean
    ): TraceConfigurationRow {
        const kind = YAML.isMap(node) ? 'map' : YAML.isSeq(node) ? 'sequence' : 'scalar';
        const scalarValue = YAML.isScalar(node) ? this.scalarToString(node) : undefined;
        const row: TraceConfigurationRow = {
            id: this.pathToId(nodePath),
            label: this.getRowLabel(node, label, nodePath),
            path: nodePath,
            depth,
            kind,
            control: this.getControlKind(label, nodePath, scalarValue),
            value: this.getRowValue(node, nodePath, scalarValue),
            checked: this.getCheckedState(node, nodePath, scalarValue),
            options: this.getSelectOptions(label, nodePath),
            selectedOptions: this.getSelectedOptions(node, label, nodePath, scalarValue),
            hasChildren,
            expanded: this.hasInlineMultiSelect(nodePath) ? false : expanded,
            removable: typeof nodePath.at(-1) === 'number' && nodePath.at(-2) !== 'setup',
            addChildKind: YAML.isSeq(node) && nodePath.at(-1) !== 'setup' && !this.hasInlineMultiSelect(nodePath)
                ? this.getAddChildKind(nodePath)
                : undefined,
            description: this.describeNode(node, nodePath)
        };
        return row;
    }

    /**
     * shouldFlattenSetupNode detects YAML levels that exist only to organize
     * settings by core. The setup sequence itself is always hidden so users
     * cannot add processors from this view; each setup item remains visible as
     * a Processor:<pname> group that owns the processor trace configuration.
     */
    private shouldFlattenSetupNode(node: YAML.Node, nodePath: (string | number)[]): boolean {
        if (YAML.isSeq(node) && nodePath.at(-1) === 'setup') {
            return true;
        }
        return false;
    }

    /**
     * shouldFlattenInstructionTriggerItem detects sequence items under
     * Instruction Trace start/stop lists. Those YAML maps are storage wrappers
     * around editable trigger fields, so the webview promotes Location and
     * Access directly under Start/Stop instead of showing the location value as
     * the item's label.
     */
    private shouldFlattenInstructionTriggerItem(node: YAML.Node, nodePath: (string | number)[]): boolean {
        return YAML.isMap(node)
            && typeof nodePath.at(-1) === 'number'
            && (nodePath.at(-2) === 'start' || nodePath.at(-2) === 'stop')
            && nodePath.at(-3) === 'instructions';
    }

    /**
     * getChildEntries extracts child rows from YAML maps and sequences. The
     * method skips implementation metadata such as ctrace-ref and created-by,
     * and it also hides pname when the file only describes one processor core
     * because that value would not help the user distinguish between entries.
     */
    private getChildEntries(node: YAML.Node): { label: string; path: (string | number)[]; node: YAML.Node }[] {
        if (YAML.isMap(node)) {
            const entries: { label: string; path: (string | number)[]; node: YAML.Node }[] = [];
            node.items.forEach(pair => {
                const label = this.keyToString(pair.key);
                if (!label || this.shouldHideNode(label, this.getNodePath(node)) || !YAML.isNode(pair.value)) {
                    return;
                }
                entries.push({
                    label,
                    path: [...this.getNodePath(node), label],
                    node: pair.value
                });
            });
            return this.sortDisplayEntries(entries);
        }
        if (YAML.isSeq(node) && this.isEventsPath(this.getNodePath(node))) {
            return [];
        }
        if (YAML.isSeq(node)) {
            return node.items.flatMap((item, index) => YAML.isNode(item) ? [{
                label: this.getSequenceItemLabel(item, index),
                path: [...this.getNodePath(node), index],
                node: item
            }] : []);
        }
        return [];
    }

    /**
     * getAdvancedSettingsEntries finds the real YAML nodes that should be shown
     * beneath the synthetic Advanced Settings row. Keeping these as real node
     * entries means the child controls still edit the original ctrace paths.
     */
    private getAdvancedSettingsEntries(node: YAML.YAMLMap, nodePath: (string | number)[]): { label: string; path: (string | number)[]; node: YAML.Node }[] {
        const entries: { label: string; path: (string | number)[]; node: YAML.Node }[] = [];
        const timesync = node.get('timesync', true);
        if (YAML.isNode(timesync)) {
            entries.push({ label: 'timesync', path: [...nodePath, 'timesync'], node: timesync });
        }
        const synchronization = node.get('synchronization', true);
        if (YAML.isNode(synchronization)) {
            entries.push({ label: 'synchronization', path: [...nodePath, 'synchronization'], node: synchronization });
        }
        return entries;
    }

    /**
     * sortDisplayEntries applies small user-facing ordering tweaks without
     * changing the YAML file order. The main trace subsystem rows are grouped
     * in the order users are expected to review them, while all other entries
     * keep their original relative order after that leading group.
     */
    private sortDisplayEntries(entries: { label: string; path: (string | number)[]; node: YAML.Node }[]): { label: string; path: (string | number)[]; node: YAML.Node }[] {
        return entries
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => {
                const leftRank = this.getDisplayOrderRank(left.entry.label);
                const rightRank = this.getDisplayOrderRank(right.entry.label);
                return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
            })
            .map(item => item.entry);
    }

    /**
     * getDisplayOrderRank returns ordering weights for trace sections whose
     * display order should differ from YAML order. Lower numbers appear earlier
     * in the webview table, and the default rank leaves unlisted rows after the
     * primary trace subsystem group.
     */
    private getDisplayOrderRank(label: string): number {
        switch (label) {
            case 'disable':
                return 5;
            case 'timestamps':
                return 10;
            case 'exceptions':
                return 20;
            case 'events':
                return 30;
            case 'itm':
                return 40;
            case 'data':
                return 50;
            case 'instructions':
                return 60;
            default:
                return 100;
        }
    }

    /**
     * getRowLabel chooses the final label for a row. Processor rows are derived
     * from their pname field, while all normal YAML keys go through the generic
     * display-label mapper.
     */
    private getRowLabel(node: YAML.Node, label: string, nodePath: (string | number)[]): string {
        if (this.isProcessorPath(nodePath) && YAML.isMap(node)) {
            return `Processor:${this.mapScalarToString(node, 'pname') ?? 'Unknown'}`;
        }
        return this.getDisplayLabel(label, nodePath);
    }

    /**
     * getRowValue returns the editable value shown in the Selection column.
     * Most scalar rows use their scalar text directly; Instrumentation Trace is
     * a folded map row whose visible textbox edits its hidden enable child.
     */
    private getRowValue(node: YAML.Node, nodePath: (string | number)[], scalarValue?: string): string | undefined {
        if (this.isItmPath(nodePath) && YAML.isMap(node)) {
            return this.mapScalarToString(node, 'enable') ?? '';
        }
        if (this.isPcSamplingPath(nodePath) && YAML.isMap(node)) {
            return this.normalizePcSamplingPeriod(this.mapScalarToString(node, 'period') ?? 'off');
        }
        if (this.isDwtDataAccessPath(nodePath)) {
            return this.accessValueToLabel(scalarValue);
        }
        return scalarValue;
    }

    /**
     * getDisplayLabel converts YAML-oriented key names into user-facing labels.
     * The underlying path is left untouched so edits still target the original
     * ctrace file structure.
     */
    private getDisplayLabel(label: string, nodePath: (string | number)[]): string {
        if (label.toLowerCase() === 'itm' && this.isItmPath(nodePath)) {
            return 'Instrumentation Trace';
        }
        if (label.toLowerCase() === 'instructions' && this.isInstructionsPath(nodePath)) {
            return 'Instruction Trace';
        }
        if (label.toLowerCase() === 'data' && nodePath.at(-1) === 'data') {
            return 'DWT Data Trace';
        }
        if (label.toLowerCase() === 'events' && this.isEventsPath(nodePath)) {
            return 'Event Counters';
        }
        if (label.toLowerCase() === 'pcsampling' && this.isPcSamplingPath(nodePath)) {
            return 'PC Sampling';
        }
        if (label.toLowerCase() === 'timesync' && this.isTimeSyncPath(nodePath)) {
            return 'Time Syncronization';
        }
        if (label.toLowerCase() === 'synchronization' && this.isStreamSynchronizationPath(nodePath)) {
            return 'Stream Syncronization';
        }
        return this.toDisplayTitle(label);
    }

    /**
     * shouldHideNode centralizes user-facing filtering for YAML keys that are
     * still preserved in the file but should not clutter the trace editor. The
     * metadata keys are always hidden, ITM enable is folded into its parent row,
     * and pname is only hidden when there is no multi-core distinction for the
     * user to make.
     */
    private shouldHideNode(label: string, parentPath: (string | number)[]): boolean {
        if (label === 'ctrace-ref' || label === 'created-by') {
            return true;
        }
        if (label === 'disable' && this.isProcessorPath(parentPath)) {
            return true;
        }
        if (label === 'enable' && this.isItmPath(parentPath)) {
            return true;
        }
        if (label === 'period' && this.isPcSamplingPath(parentPath)) {
            return true;
        }
        if ((label === 'timesync' || label === 'synchronization') && this.isProcessorPath(parentPath)) {
            return true;
        }
        return label === 'pname' && this.hasSingleCoreDescription();
    }

    /**
     * hasSingleCoreDescription inspects all pname scalars under ctrace and
     * returns true when they all point at the same core. That lets the webview
     * suppress repeated pname fields for the common single-core case while
     * keeping them visible when multiple cores are present.
     */
    private hasSingleCoreDescription(): boolean {
        const ctraceRoot = this.ctraceFile?.document?.yaml.getNode(['ctrace']);
        if (!ctraceRoot) {
            return false;
        }
        const coreNames = new Set<string>();
        this.collectCoreNames(ctraceRoot, coreNames);
        return coreNames.size === 1;
    }

    /**
     * collectCoreNames recursively walks the YAML tree looking for pname scalar
     * values. It accepts maps and sequences because pname may appear in several
     * ctrace sections such as data traces, events, ELF files, and register
     * values.
     */
    private collectCoreNames(node: YAML.Node, coreNames: Set<string>): void {
        if (YAML.isMap(node)) {
            node.items.forEach(pair => {
                const label = this.keyToString(pair.key);
                if (label === 'pname' && YAML.isScalar(pair.value)) {
                    const coreName = this.scalarToString(pair.value).trim();
                    if (coreName) {
                        coreNames.add(coreName);
                    }
                    return;
                }
                if (YAML.isNode(pair.value)) {
                    this.collectCoreNames(pair.value, coreNames);
                }
            });
            return;
        }
        if (YAML.isSeq(node)) {
            node.items.forEach(item => {
                if (YAML.isNode(item)) {
                    this.collectCoreNames(item, coreNames);
                }
            });
        }
    }

    /**
     * getNodePath finds the path to a node by walking from the ctrace root each
     * time rows are serialized. This avoids storing mutable path side tables on
     * YAML nodes and keeps the serializer resilient after edits replace nodes.
     */
    private getNodePath(targetNode: YAML.Node): (string | number)[] {
        const root = this.ctraceFile?.document?.yaml.getNode(['ctrace']);
        const pathToTarget = root ? this.findNodePath(root, targetNode, ['ctrace']) : undefined;
        return pathToTarget ?? ['ctrace'];
    }

    /**
     * findNodePath recursively searches for a YAML node and returns its ctrace
     * path. Map children append their key and sequence children append their
     * numeric index, matching the paths accepted by YamlDomDocument.set/delete.
     */
    private findNodePath(currentNode: YAML.Node, targetNode: YAML.Node, currentPath: (string | number)[]): (string | number)[] | undefined {
        if (currentNode === targetNode) {
            return currentPath;
        }
        if (YAML.isMap(currentNode)) {
            for (const pair of currentNode.items) {
                const key = this.keyToString(pair.key);
                if (!key || !YAML.isNode(pair.value)) {
                    continue;
                }
                const found = this.findNodePath(pair.value, targetNode, [...currentPath, key]);
                if (found) {
                    return found;
                }
            }
        }
        if (YAML.isSeq(currentNode)) {
            for (let index = 0; index < currentNode.items.length; index++) {
                const item = currentNode.items.at(index);
                if (!YAML.isNode(item)) {
                    continue;
                }
                const found = this.findNodePath(item, targetNode, [...currentPath, index]);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    }

    /**
     * keyToString converts a YAML map key into a display/path string. ctrace
     * keys should be scalar strings, but the fallback keeps the UI functional if
     * a hand-edited file contains a more unusual YAML key.
     */
    private keyToString(key: unknown): string | undefined {
        if (YAML.isScalar(key)) {
            return key.value === undefined || key.value === null ? undefined : String(key.value);
        }
        return key?.toString();
    }

    /**
     * scalarToString converts YAML scalar nodes into editable strings. It uses
     * the original source text when available so values such as 0xFFFFFFFF keep
     * the user's preferred spelling in the webview.
     */
    private scalarToString(node: YAML.Scalar): string {
        if (node.value === undefined || node.value === null) {
            return '';
        }
        return node.source ?? String(node.value);
    }

    /**
     * getSequenceItemLabel gives repeated YAML items a readable tree label. It
     * prefers common ctrace identity fields such as pname, location, event, and
     * file, then falls back to an item number. In single-core files it skips
     * pname so the core name is not shown as either a field or a grouping label.
     */
    private getSequenceItemLabel(node: YAML.Node, index: number): string {
        if (YAML.isMap(node)) {
            const identityKeys = this.hasSingleCoreDescription()
                ? ['location', 'event', 'file']
                : ['pname', 'location', 'event', 'file'];
            const candidate = identityKeys
                .map(key => node.get(key))
                .find(value => value !== undefined && value !== null);
            if (candidate !== undefined && candidate !== null) {
                return String(candidate);
            }
        }
        return `Item ${index + 1}`;
    }

    /**
     * getControlKind chooses a control based on key names and scalar values. The
     * mapping intentionally covers common ctrace fields while still rendering
     * unknown scalars as text inputs so every existing file remains editable.
     */
    private getControlKind(label: string, nodePath: (string | number)[], scalarValue?: string): TraceConfigurationRow['control'] {
        if (this.isEventsPath(nodePath) || this.isItmPrivilegedPath(nodePath)) {
            return 'multi-select';
        }
        if (this.isItmPath(nodePath)) {
            return 'text';
        }
        if (this.isPcSamplingPath(nodePath)) {
            return 'select';
        }
        if (this.isStreamSyncDwtPeriodPath(nodePath)) {
            return 'select';
        }
        if (this.isProcessorPath(nodePath) || this.isTimestampsPath(nodePath) || this.isExceptionsPath(nodePath) || this.isInstructionsPath(nodePath) || this.isTimeSyncPath(nodePath)) {
            return 'checkbox';
        }
        if (scalarValue === undefined) {
            return 'none';
        }
        const normalized = label.toLowerCase();
        if (normalized === 'enabled' || normalized === 'disable' || scalarValue === 'true' || scalarValue === 'false') {
            return 'checkbox';
        }
        if (this.getSelectOptions(label, nodePath)) {
            return 'select';
        }
        return 'text';
    }

    /**
     * getCheckedState gives checkbox controls their initial state. Scalar
     * checkboxes use YAML-ish truthy strings, while the timestamps subsystem is
     * checked when the YAML node is a populated map and unchecked when the file
     * has the empty/null form used to disable that subsystem.
     */
    private getCheckedState(node: YAML.Node, nodePath: (string | number)[], scalarValue?: string): boolean {
        if (this.isProcessorPath(nodePath) && YAML.isMap(node)) {
            return !this.isTruthyValue(this.mapScalarToString(node, 'disable'));
        }
        if (this.isTimestampsPath(nodePath)) {
            return YAML.isMap(node) && node.items.some(pair => this.keyToString(pair.key) !== 'ctrace-ref');
        }
        if (this.isExceptionsPath(nodePath)) {
            return YAML.isMap(node) || this.isTruthyValue(scalarValue);
        }
        if (this.isInstructionsPath(nodePath)) {
            return YAML.isMap(node) && node.items.some(pair => this.keyToString(pair.key) !== 'ctrace-ref');
        }
        if (this.isTimeSyncPath(nodePath)) {
            return YAML.isMap(node) || this.isTruthyValue(scalarValue);
        }
        return this.isTruthyValue(scalarValue);
    }

    /**
     * getSelectOptions provides dropdown values for fields with small known
     * ctrace vocabularies. Other scalar fields are left as text to avoid
     * constraining values the toolbox may support in newer schemas.
     */
    private getSelectOptions(label: string, nodePath: (string | number)[]): string[] | undefined {
        if (this.isEventsPath(nodePath)) {
            return EVENT_COUNTER_OPTIONS;
        }
        if (this.isItmPrivilegedPath(nodePath)) {
            return PRIVILEGED_RANGE_OPTIONS;
        }
        if (this.isPcSamplingPath(nodePath)) {
            return PC_SAMPLING_PERIOD_OPTIONS;
        }
        if (this.isStreamSyncDwtPeriodPath(nodePath)) {
            return STREAM_SYNC_PERIOD_OPTIONS;
        }
        if (this.isDwtDataAccessPath(nodePath)) {
            return ['Read', 'Write', 'Read Write', 'Execute'];
        }
        if (label === 'itm-prescaler' && nodePath.at(-2) === 'timestamps') {
            return ['1', '4', '16', '64'];
        }
        switch (label.toLowerCase()) {
            case 'access':
                return ['read', 'write', 'rw', 'readwrite'];
            case 'output':
                return ['value', 'address', 'PC', 'match', 'PC+value', 'address+value', 'PC+address'];
            case 'pc':
                return ['yes', 'no'];
            default:
                return undefined;
        }
    }

    /**
     * getSelectedOptions extracts the checked values for multi-select controls.
     * Event counters are stored as a YAML sequence of event maps, while ITM
     * privileged ranges are stored as a bit mask, so the serializer translates
     * both shapes into the option labels rendered by the webview checklist.
     */
    private getSelectedOptions(
        node: YAML.Node,
        _label: string,
        nodePath: (string | number)[],
        scalarValue?: string
    ): string[] | undefined {
        if (this.isEventsPath(nodePath) && YAML.isSeq(node)) {
            return node.items.flatMap(item => {
                if (!YAML.isMap(item)) {
                    return [];
                }
                const event = item.get('event');
                return event === undefined || event === null ? [] : [String(event)];
            });
        }
        if (this.isItmPrivilegedPath(nodePath)) {
            return this.privilegedMaskToRanges(scalarValue);
        }
        return undefined;
    }

    /**
     * getAddChildKind maps sequence paths to the placeholder object inserted by
     * addItem. Known sections receive ctrace-specific starters, while generic
     * sequences still get an add affordance for convenience.
     */
    private getAddChildKind(nodePath: (string | number)[]): TraceConfigurationRow['addChildKind'] {
        const section = String(nodePath.at(-1) ?? '');
        switch (section) {
            case 'data':
                return 'data';
            case 'start':
                return 'start';
            case 'stop':
                return 'stop';
            default:
                return 'generic-map';
        }
    }

    /**
     * isTruthyValue normalizes YAML-ish boolean values for checkbox rendering.
     * ctrace examples sometimes use yes/no strings, so those are recognized in
     * addition to JavaScript-style true/false strings.
     */
    private isTruthyValue(value?: string): boolean {
        return value === 'true' || value === 'yes' || value === '1' || value === 'on';
    }

    /**
     * isTimestampsPath identifies the map node that enables or disables the
     * timestamp subsystem. The path check is suffix-based because setup may be
     * flattened visually while the underlying YAML path still includes the core
     * grouping levels.
     */
    private isTimestampsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'timestamps';
    }

    /**
     * isProcessorPath identifies a setup sequence item. In the user-facing tree
     * this row is shown as Processor:<pname> and its checkbox edits the hidden
     * disable field for that processor.
     */
    private isProcessorPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-2) === 'setup' && typeof nodePath.at(-1) === 'number';
    }

    /**
     * hasInlineMultiSelect identifies rows whose child YAML should be edited
     * through a single checklist control instead of being expanded into visible
     * child rows.
     */
    private hasInlineMultiSelect(nodePath: (string | number)[]): boolean {
        return this.isEventsPath(nodePath);
    }

    /**
     * isItmPath identifies the ITM map so the webview can show it as the more
     * descriptive Instrumentation Trace row and fold the child enable value into
     * that parent row's checkbox.
     */
    private isItmPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'itm';
    }

    /**
     * isItmPrivilegedPath identifies the ITM privilege mask scalar. The UI
     * presents that mask as four checkable ranges so users do not need to edit
     * a numeric bit field directly.
     */
    private isItmPrivilegedPath(nodePath: (string | number)[]): boolean {
        return (nodePath.at(-1) === 'privileged' || nodePath.at(-1) === 'privilege')
            && this.isItmPath(nodePath.slice(0, -1));
    }

    /**
     * isEventsPath identifies the ctrace event counter sequence. The sequence
     * is rendered as one multi-select checklist because users choose counters
     * from a fixed vocabulary rather than editing individual event objects.
     */
    private isEventsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'events';
    }

    /**
     * isInstructionsPath identifies the instruction trace map. The webview
     * renames it to Instruction Trace and represents the map's presence as an
     * enable/disable checkbox.
     */
    private isInstructionsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'instructions';
    }

    /**
     * isPcSamplingPath identifies the PC sampling map. Its period child is
     * folded into the parent row so the user chooses the sampling period from a
     * single dropdown instead of expanding a one-field subtree.
     */
    private isPcSamplingPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'pcsampling';
    }

    /**
     * isTimeSyncPath identifies the Time Syncronization node that is grouped
     * under Advanced Settings and rendered as a boolean checkbox.
     */
    private isTimeSyncPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'timesync';
    }

    /**
     * isStreamSynchronizationPath identifies the stream synchronization
     * sequence. The webview renders it as a parent row with one folded DWT sync
     * period child and no add button.
     */
    private isStreamSynchronizationPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'synchronization';
    }

    /**
     * isStreamSyncDwtPeriodPath identifies the synthetic child row used to edit
     * the real synchronization sequence's DWT period value.
     */
    private isStreamSyncDwtPeriodPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'dwt-sync-period' && this.isStreamSynchronizationPath(nodePath.slice(0, -1));
    }

    /**
     * isDwtDataAccessPath identifies access fields below DWT Data Trace items.
     * Those values get a smaller user-facing vocabulary than other trace access
     * fields.
     */
    private isDwtDataAccessPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'access'
            && typeof nodePath.at(-2) === 'number'
            && nodePath.at(-3) === 'data';
    }

    /**
     * isExceptionsPath identifies the exceptions configuration node, whose
     * presence or truthy scalar value is represented as a simple enable/disable
     * checkbox in the Selection column.
     */
    private isExceptionsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'exceptions';
    }

    /**
     * getStreamSyncDwtPeriod extracts the DWT synchronization period from the
     * real YAML sequence. ETM entries are ignored because the current UI only
     * exposes the DWT period supported by the revised trace spec.
     */
    private getStreamSyncDwtPeriod(node: YAML.Node): string {
        if (!YAML.isSeq(node)) {
            return 'off';
        }
        const dwtPeriod = node.items.flatMap(item => {
            if (!YAML.isMap(item)) {
                return [];
            }
            const period = item.get('period');
            return period === undefined || period === null ? [] : [String(period)];
        }).find(period => period.startsWith('DWT\\'));
        return dwtPeriod?.replace(/^DWT\\/, '') ?? 'off';
    }

    /**
     * normalizePcSamplingPeriod converts older expression-style values such as
     * 64*2 or 1024*16 into the numeric strings shown by the dropdown. Values
     * that are already numeric, off, or otherwise unknown are returned unchanged
     * so hand-authored future schema values are not destroyed by display code.
     */
    private normalizePcSamplingPeriod(value: string): string {
        const trimmed = value.trim();
        if (trimmed === 'off') {
            return trimmed;
        }
        const expression = trimmed.match(/^(\d+)\s*\*\s*(\d+)$/);
        if (!expression) {
            return trimmed;
        }
        const base = Number(expression[1]);
        const multiplier = Number(expression[2]);
        if (!Number.isFinite(base) || !Number.isFinite(multiplier)) {
            return trimmed;
        }
        return String(base * multiplier);
    }

    /**
     * accessValueToLabel turns compact ctrace access values into the labels
     * shown for DWT Data Trace access controls.
     */
    private accessValueToLabel(value?: string): string | undefined {
        switch (value?.toLowerCase()) {
            case 'r':
            case 'read':
                return 'Read';
            case 'w':
            case 'write':
                return 'Write';
            case 'rw':
            case 'readwrite':
            case 'read write':
                return 'Read Write';
            case 'x':
            case 'execute':
                return 'Execute';
            default:
                return value;
        }
    }

    /**
     * accessLabelToValue converts the DWT Data Trace access dropdown labels
     * back to compact ctrace values.
     */
    private accessLabelToValue(value: string): string {
        switch (value) {
            case 'Read':
                return 'R';
            case 'Write':
                return 'W';
            case 'Read Write':
                return 'RW';
            case 'Execute':
                return 'X';
            default:
                return value;
        }
    }

    /**
     * toDisplayTitle turns YAML key spelling into readable label text. It
     * capitalizes word starts after separators and preserves common trace
     * acronyms that users expect to see in uppercase.
     */
    private toDisplayTitle(label: string): string {
        const acronyms = new Map([
            ['dwt', 'DWT'],
            ['elf', 'ELF'],
            ['itm', 'ITM'],
            ['pc', 'PC'],
            ['pmu', 'PMU'],
        ]);
        return label
            .split(/[-_\s]+/)
            .filter(word => word.length > 0)
            .map(word => acronyms.get(word.toLowerCase()) ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(' ');
    }

    /**
     * privilegedMaskToRanges converts the stored ITM privilege bit mask into
     * the four user-facing port ranges. A range is checked when any bit in that
     * range is set, which keeps the control useful even for hand-edited masks.
     */
    private privilegedMaskToRanges(value?: string): string[] {
        const mask = this.parseNumericMask(value);
        return PRIVILEGED_RANGE_OPTIONS.filter(option => {
            const [startText, endText] = option.split('-');
            const start = Number(startText);
            const end = Number(endText);
            const rangeMask = this.createBitRangeMask(start, end);
            return (mask & rangeMask) !== 0;
        });
    }

    /**
     * privilegedRangesToMask converts checked ITM privilege ranges back into
     * the hexadecimal mask format already used by ctrace examples.
     */
    private privilegedRangesToMask(ranges: string[]): string {
        const mask = ranges.reduce((currentMask, range) => {
            const [startText, endText] = range.split('-');
            return (currentMask | this.createBitRangeMask(Number(startText), Number(endText))) >>> 0;
        }, 0);
        return `0x${mask.toString(16).padStart(8, '0')}`;
    }

    /**
     * createBitRangeMask returns a 32-bit mask with every bit between start and
     * end set. The >>> 0 coercion keeps JavaScript's signed bitwise operations
     * usable for the top 24-31 range.
     */
    private createBitRangeMask(start: number, end: number): number {
        let mask = 0;
        for (let bit = start; bit <= end; bit++) {
            mask = (mask | (1 << bit)) >>> 0;
        }
        return mask >>> 0;
    }

    /**
     * parseNumericMask accepts decimal or hexadecimal scalar spellings from the
     * YAML file and returns an unsigned 32-bit number for range extraction.
     */
    private parseNumericMask(value?: string): number {
        if (!value) {
            return 0;
        }
        const trimmed = value.trim();
        const parsed = trimmed.toLowerCase().startsWith('0x')
            ? Number.parseInt(trimmed.slice(2), 16)
            : Number.parseInt(trimmed, 10);
        return Number.isFinite(parsed) ? parsed >>> 0 : 0;
    }

    /**
     * mapScalarToString reads a named scalar child from a YAML map and returns
     * the original source text when available. It is used for folded controls
     * such as ITM enable, where the editable value is represented by the parent
     * row rather than by its own visible child row.
     */
    private mapScalarToString(map: YAML.YAMLMap, key: string): string | undefined {
        const value = map.get(key, true);
        if (!YAML.isScalar(value)) {
            return undefined;
        }
        return this.scalarToString(value);
    }

    /**
     * describeNode currently returns no secondary metadata because the remaining
     * path and generated reference details are implementation internals rather
     * than user-facing trace configuration.
     */
    private describeNode(_node: YAML.Node, _nodePath: (string | number)[]): string | undefined {
        return undefined;
    }

    /**
     * pathToId creates stable row identifiers from YAML paths. JSON encoding
     * preserves the difference between map keys and sequence indexes, which is
     * important for expansion state and edit messages.
     */
    private pathToId(nodePath: (string | number)[]): string {
        return JSON.stringify(nodePath);
    }

    /**
     * buildShell returns the static webview HTML that loads the compiled CSS and
     * JavaScript bundle. It also sets a restrictive Content Security Policy so
     * the webview can run only extension-provided scripts and styles.
     */
    private buildShell(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'webviews', 'trace-configuration.js'
        ));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'webviews', 'trace-configuration.css'
        ));
        const codiconCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'
        ));
        const cspSource = webview.cspSource ?? '';
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource}; font-src ${cspSource};">
<link rel="stylesheet" href="${codiconCssUri}">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="root"></div>
<script src="${scriptUri}"></script>
</body>
</html>`;
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
