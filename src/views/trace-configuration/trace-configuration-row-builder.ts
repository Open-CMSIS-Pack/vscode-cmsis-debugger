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

import * as YAML from 'yaml';

import { CTraceYamlFile } from '../../generic';
import {
    TraceConfigurationRow,
    TraceConfigurationState,
} from './trace-configuration-protocol';
import * as TraceConfigurationTypes from './trace-configuration-types';

/**
 * TraceConfigurationRowBuilder is responsible for projecting the ctrace YAML DOM into the
 * serializable row state consumed by the webview. It deliberately does not read from disk or
 * write to disk; callers provide the current in-memory YAML file and any external state it needs.
 */
export class TraceConfigurationRowBuilder {
    /**
     * The constructor receives lightweight accessors instead of owning the mutable model state.
     * That keeps this class focused on row/state creation while still letting it always render
     * the freshest file, loading status, dirty flag, error message, collapsed rows, and processor
     * capability map owned by the model layer.
     */
    public constructor(
        private readonly getCTraceFile: () => CTraceYamlFile | undefined,
        private readonly getLoading: () => boolean,
        private readonly getDirty: () => boolean,
        private readonly getErrorMessage: () => string | undefined,
        private readonly collapsedRows: Set<string>,
        private readonly processorCapabilities: ReadonlyMap<string, TraceConfigurationTypes.ProcessorTraceCapabilities>
    ) {}

    /**
     * createState builds the DTO consumed by the webview. It contains display
     * rows, loading/error flags, and the selected file name, but it never exposes
     * raw YAML node objects to the browser sandbox.
     */
    public createState(): TraceConfigurationState {
        const document = this.getCTraceFile()?.document;
        const rows = document ? this.createRows(document.yaml.document.contents) : [];
        const emptyMessage = document
            ? rows.length === 0 ? 'No trace-capable processor configuration is available for this ctrace file.' : undefined
            : 'Open a ctrace.yml file to edit trace configuration.';
        return {
            fileName: this.getCTraceFile()?.fileName,
            rows,
            loading: this.getLoading(),
            dirty: this.getDirty(),
            emptyMessage,
            errorMessage: this.getErrorMessage()
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
        const context: TraceConfigurationTypes.RowBuildContext = {
            rows: [],
            collapsedRows: this.collapsedRows
        };
        const ctraceRoot = this.getCTraceFile()?.document?.yaml.getNode(['ctrace']);
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
        context: TraceConfigurationTypes.RowBuildContext,
        node: YAML.Node,
        nodePath: (string | number)[],
        label: string,
        depth: number,
        forceExpanded = false
    ): void {
        if (!this.shouldShowTraceNode(label, nodePath)) {
            return;
        }
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
    private appendAdvancedSettingsRows(context: TraceConfigurationTypes.RowBuildContext, node: YAML.Node, nodePath: (string | number)[], depth: number): void {
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
        context: TraceConfigurationTypes.RowBuildContext,
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
            options: TraceConfigurationTypes.STREAM_SYNC_PERIOD_OPTIONS,
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
            addChildKind: this.getRowAddChildKind(node, nodePath),
            description: this.describeNode(node, nodePath)
        };
        return row;
    }

    /**
     * getRowAddChildKind decides whether a sequence row should expose an add
     * button. It preserves the normal starter-object behavior, but suppresses
     * DWT Data Trace additions when the selected processor has already consumed
     * all available DWT comparator channels.
     */
    private getRowAddChildKind(node: YAML.Node, nodePath: (string | number)[]): TraceConfigurationRow['addChildKind'] {
        if (!YAML.isSeq(node) || nodePath.at(-1) === 'setup' || this.hasInlineMultiSelect(nodePath)) {
            return undefined;
        }
        if (this.isDwtDataTracePath(nodePath)) {
            const capabilities = this.getTraceCapabilitiesForPath(nodePath);
            if (capabilities && node.items.length >= capabilities.dwtComparators) {
                return undefined;
            }
        }
        return this.getAddChildKind(nodePath);
    }

    /**
     * shouldShowTraceNode applies processor capability filtering to YAML rows.
     * Unsupported processors and unsupported trace feature groups are not sent
     * to the webview, which prevents users from configuring hardware that the
     * selected core cannot provide.
     */
    private shouldShowTraceNode(label: string, nodePath: (string | number)[]): boolean {
        const capabilities = this.getTraceCapabilitiesForPath(nodePath);
        if (!capabilities) {
            return true;
        }
        if (this.isProcessorPath(nodePath)) {
            return capabilities.supportsTrace;
        }
        switch (label) {
            case 'timestamps':
                return capabilities.timestamps;
            case 'exceptions':
                return capabilities.exceptions;
            case 'events':
                return capabilities.eventCounters;
            case 'itm':
                return capabilities.instrumentationTrace;
            case 'data':
                return capabilities.dwtComparators > 0;
            case 'instructions':
                return capabilities.instructionTrace;
            case 'pcsampling':
                return capabilities.pcSampling;
            case 'timesync':
                return capabilities.timeSynchronization;
            case 'synchronization':
                return capabilities.streamSynchronization;
            default:
                return true;
        }
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
        if (YAML.isNode(timesync) && this.shouldShowTraceNode('timesync', [...nodePath, 'timesync'])) {
            entries.push({ label: 'timesync', path: [...nodePath, 'timesync'], node: timesync });
        }
        const synchronization = node.get('synchronization', true);
        if (YAML.isNode(synchronization) && this.shouldShowTraceNode('synchronization', [...nodePath, 'synchronization'])) {
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
     * Most scalar rows use their scalar text directly. Folded map controls such
     * as PC Sampling still expose a scalar child as the parent row's value.
     */
    private getRowValue(node: YAML.Node, nodePath: (string | number)[], scalarValue?: string): string | undefined {
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
     * metadata keys are always hidden, top-level disable is hidden because the
     * setting is processor-specific, ITM enable is folded into its parent row's
     * channel checklist, and pname is only hidden when there is no multi-core
     * distinction for the user to make.
     */
    private shouldHideNode(label: string, parentPath: (string | number)[]): boolean {
        if (label === 'ctrace-ref' || label === 'created-by') {
            return true;
        }
        if (label === 'disable' && parentPath.length === 1 && parentPath[0] === 'ctrace') {
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
        const ctraceRoot = this.getCTraceFile()?.document?.yaml.getNode(['ctrace']);
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
        const root = this.getCTraceFile()?.document?.yaml.getNode(['ctrace']);
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
        if (this.isEventsPath(nodePath) || this.isItmPath(nodePath) || this.isItmPrivilegedPath(nodePath)) {
            return 'multi-select';
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
     * checkboxes use YAML-ish truthy strings, while processor disable is
     * presence-based: if the hidden disable key exists under the processor,
     * trace is disabled for that processor.
     */
    private getCheckedState(node: YAML.Node, nodePath: (string | number)[], scalarValue?: string): boolean {
        if (this.isProcessorPath(nodePath) && YAML.isMap(node)) {
            return node.get('disable', true) !== undefined;
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
            const capabilities = this.getTraceCapabilitiesForPath(nodePath);
            return capabilities?.pmuEvents ? TraceConfigurationTypes.EVENT_COUNTER_OPTIONS : TraceConfigurationTypes.EVENT_COUNTER_OPTIONS.filter(option => option !== 'PMU');
        }
        if (this.isItmPath(nodePath)) {
            return TraceConfigurationTypes.ITM_CHANNEL_OPTIONS;
        }
        if (this.isItmPrivilegedPath(nodePath)) {
            return TraceConfigurationTypes.PRIVILEGED_RANGE_OPTIONS;
        }
        if (this.isPcSamplingPath(nodePath)) {
            return TraceConfigurationTypes.PC_SAMPLING_PERIOD_OPTIONS;
        }
        if (this.isStreamSyncDwtPeriodPath(nodePath)) {
            return TraceConfigurationTypes.STREAM_SYNC_PERIOD_OPTIONS;
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
     * Event counters are stored as a YAML sequence of event maps. ITM enable is
     * stored as one bit per channel, while ITM privileged is stored as one bit
     * per eight-channel block, so the serializer translates both mask shapes
     * into the option labels rendered by the webview checklist.
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
        if (this.isItmPath(nodePath) && YAML.isMap(node)) {
            return this.itmEnableMaskToChannels(this.mapScalarToString(node, 'enable'));
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
    public isTimestampsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'timestamps';
    }

    /**
     * isProcessorPath identifies a setup sequence item. In the user-facing tree
     * this row is shown as Processor:<pname> and its checkbox edits the hidden
     * presence-based disable field for that processor.
     */
    public isProcessorPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-2) === 'setup' && typeof nodePath.at(-1) === 'number';
    }

    /**
     * getTraceCapabilitiesForPath resolves a row path to the processor that
     * owns it, then returns that processor's loaded or inferred trace
     * capabilities.
     */
    private getTraceCapabilitiesForPath(nodePath: (string | number)[]): TraceConfigurationTypes.ProcessorTraceCapabilities | undefined {
        const pname = this.getProcessorNameForPath(nodePath);
        return pname ? this.processorCapabilities.get(pname) : undefined;
    }

    /**
     * getProcessorNameForPath finds the setup item that owns a row and returns
     * its pname. Rows outside setup are intentionally left without capabilities
     * because they may represent legacy top-level ctrace sections.
     */
    private getProcessorNameForPath(nodePath: (string | number)[]): string | undefined {
        const setupIndex = this.getSetupIndexForPath(nodePath);
        if (setupIndex === undefined) {
            return undefined;
        }
        const processorNode = this.getCTraceFile()?.document?.yaml.getNode(['ctrace', 'setup', setupIndex]);
        return YAML.isMap(processorNode) ? this.mapScalarToString(processorNode, 'pname') : undefined;
    }

    /**
     * getSetupIndexForPath scans a YAML path for the ctrace setup sequence
     * segment and returns the numeric item index that follows it.
     */
    private getSetupIndexForPath(nodePath: (string | number)[]): number | undefined {
        const setupIndex = nodePath.findIndex((segment, index) =>
            segment === 'setup' && typeof nodePath.at(index + 1) === 'number');
        if (setupIndex < 0) {
            return undefined;
        }
        const processorIndex = nodePath.at(setupIndex + 1);
        return typeof processorIndex === 'number' ? processorIndex : undefined;
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
     * that parent row's channel checklist.
     */
    public isItmPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'itm';
    }

    /**
     * isItmPrivilegedPath identifies the ITM privilege mask scalar. The UI
     * presents that mask as four checkable ranges so users do not need to edit
     * a numeric bit field directly.
     */
    public isItmPrivilegedPath(nodePath: (string | number)[]): boolean {
        return (nodePath.at(-1) === 'privileged' || nodePath.at(-1) === 'privilege')
            && this.isItmPath(nodePath.slice(0, -1));
    }

    /**
     * isEventsPath identifies the ctrace event counter sequence. The sequence
     * is rendered as one multi-select checklist because users choose counters
     * from a fixed vocabulary rather than editing individual event objects.
     */
    public isEventsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'events';
    }

    /**
     * isInstructionsPath identifies the instruction trace map. The webview
     * renames it to Instruction Trace and represents the map's presence as an
     * enable/disable checkbox.
     */
    public isInstructionsPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'instructions';
    }

    /**
     * isPcSamplingPath identifies the PC sampling map. Its period child is
     * folded into the parent row so the user chooses the sampling period from a
     * single dropdown instead of expanding a one-field subtree.
     */
    public isPcSamplingPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'pcsampling';
    }

    /**
     * isDwtDataTracePath identifies the DWT Data Trace sequence. It is used for
     * processor-specific DWT comparator limits, such as hiding the add button
     * after four channels on Cortex-M3-class cores.
     */
    private isDwtDataTracePath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'data';
    }

    /**
     * isTimeSyncPath identifies the Time Syncronization node that is grouped
     * under Advanced Settings and rendered as a boolean checkbox.
     */
    public isTimeSyncPath(nodePath: (string | number)[]): boolean {
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
    public isStreamSyncDwtPeriodPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'dwt-sync-period' && this.isStreamSynchronizationPath(nodePath.slice(0, -1));
    }

    /**
     * isDwtDataAccessPath identifies access fields below DWT Data Trace items.
     * Those values get a smaller user-facing vocabulary than other trace access
     * fields.
     */
    public isDwtDataAccessPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'access'
            && typeof nodePath.at(-2) === 'number'
            && nodePath.at(-3) === 'data';
    }

    /**
     * isExceptionsPath identifies the exceptions configuration node, whose
     * presence or truthy scalar value is represented as a simple enable/disable
     * checkbox in the Selection column.
     */
    public isExceptionsPath(nodePath: (string | number)[]): boolean {
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
    public normalizePcSamplingPeriod(value: string): string {
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
    public accessLabelToValue(value: string): string {
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
     * itmEnableMaskToChannels converts the stored ITM enable mask into
     * individual channel labels. The ctrace documentation defines each bit in
     * enable as one ITM channel, so bit 0 maps to channel 0 and bit 31 maps to
     * channel 31.
     */
    private itmEnableMaskToChannels(value?: string): string[] {
        const mask = this.parseNumericMask(value);
        return TraceConfigurationTypes.ITM_CHANNEL_OPTIONS.filter(option => {
            const channel = Number(option);
            return (mask & this.createBitMask(channel)) !== 0;
        });
    }

    /**
     * itmChannelsToMask converts checked ITM channel labels back into the
     * hexadecimal enable mask expected by ctrace.yml. Each selected channel sets
     * exactly the bit with the same number.
     */
    public itmChannelsToMask(channels: string[]): string {
        const mask = channels.reduce((currentMask, channel) => {
            return (currentMask | this.createBitMask(Number(channel))) >>> 0;
        }, 0);
        return `0x${mask.toString(16).padStart(8, '0')}`;
    }

    /**
     * privilegedMaskToRanges converts the stored ITM privilege bit mask into
     * the four user-facing port ranges. The ctrace documentation defines each
     * bit in privileged as one block of eight channels, so 0x2 maps to channels
     * 8-15 instead of to channel bit 1 directly.
     */
    private privilegedMaskToRanges(value?: string): string[] {
        const mask = this.parseNumericMask(value);
        return TraceConfigurationTypes.PRIVILEGED_RANGE_OPTIONS.filter(option => {
            const block = this.privilegedRangeToBlockIndex(option);
            return block !== undefined && (mask & this.createBitMask(block)) !== 0;
        });
    }

    /**
     * privilegedRangesToMask converts checked ITM privilege ranges back into
     * the compact hexadecimal mask used by ctrace.yml. Each selected range sets
     * one bit for the corresponding eight-channel block.
     */
    public privilegedRangesToMask(ranges: string[]): string {
        const mask = ranges.reduce((currentMask, range) => {
            const block = this.privilegedRangeToBlockIndex(range);
            return block === undefined ? currentMask : (currentMask | this.createBitMask(block)) >>> 0;
        }, 0);
        return `0x${mask.toString(16)}`;
    }

    /**
     * privilegedRangeToBlockIndex maps a user-facing channel range to the
     * privilege bit that controls that block. For example, 8-15 returns 1, so
     * selecting it writes value 0x2.
     */
    private privilegedRangeToBlockIndex(range: string): number | undefined {
        const [startText, endText] = range.split('-');
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isInteger(start) || !Number.isInteger(end) || end - start !== 7 || start % 8 !== 0) {
            return undefined;
        }
        return start / 8;
    }

    /**
     * createBitMask returns a 32-bit mask with a single bit set. The >>> 0
     * coercion keeps JavaScript's signed bitwise operations usable for ITM
     * channel 31.
     */
    private createBitMask(bit: number): number {
        if (!Number.isInteger(bit) || bit < 0 || bit > 31) {
            return 0;
        }
        return (1 << bit) >>> 0;
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
     * such as ITM enable, where the channel checklist is represented by the
     * parent row rather than by its own visible child row.
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

}
