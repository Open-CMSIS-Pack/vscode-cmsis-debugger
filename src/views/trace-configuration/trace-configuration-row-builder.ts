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

import {
    createYamlMapItem,
    createYamlScalarItem,
    createYamlSequenceItem,
    isYamlMapItem,
    isYamlScalarItem,
    isYamlSequenceItem,
    YamlTreeItem,
    yamlScalarToString,
} from '../../generic';

import {
    TraceConfigurationRow,
    TraceConfigurationState,
} from './trace-configuration-protocol';
import * as TraceConfigurationTypes from './trace-configuration-types';
import { CTraceYamlFile } from './ctrace-yaml';

type TraceNodeEntry = { label: string; path: (string | number)[]; node: YamlTreeItem };

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
        const rows = document ? this.createRows(document.yaml.rootItem) : [];
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
    private createRows(root: YamlTreeItem | undefined): TraceConfigurationRow[] {
        if (!root) {
            return [];
        }
        const context: TraceConfigurationTypes.RowBuildContext = {
            rows: [],
            collapsedRows: this.collapsedRows
        };
        const ctraceRoot = this.getCTraceFile()?.document?.yaml.getItem(['ctrace']);
        if (ctraceRoot) {
            this.getChildEntries(ctraceRoot, ['ctrace']).forEach(child => {
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
     * the webview because the available processors are discovered elsewhere.
     */
    private appendNodeRows(
        context: TraceConfigurationTypes.RowBuildContext,
        node: YamlTreeItem,
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
        const childEntries = this.getChildEntries(node, nodePath);
        const hasChildren = childEntries.length > 0;
        if (this.shouldFlattenSetupNode(node, nodePath)) {
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
    private appendAdvancedSettingsRows(context: TraceConfigurationTypes.RowBuildContext, node: YamlTreeItem, nodePath: (string | number)[], depth: number): void {
        if (!this.isProcessorPath(nodePath) || !isYamlMapItem(node)) {
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
        node: YamlTreeItem,
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
        node: YamlTreeItem,
        nodePath: (string | number)[],
        label: string,
        depth: number,
        hasChildren: boolean,
        expanded: boolean
    ): TraceConfigurationRow {
        const kind = isYamlMapItem(node) ? 'map' : isYamlSequenceItem(node) || this.isBareSequenceNode(node, nodePath) ? 'sequence' : 'scalar';
        const scalarValue = isYamlScalarItem(node) ? this.scalarToString(node) : undefined;
        const valuePath = this.getRowValuePath(nodePath);
        const row: TraceConfigurationRow = {
            id: this.pathToId(nodePath),
            label: this.getRowLabel(node, label, nodePath),
            path: nodePath,
            ...(valuePath ? { valuePath } : {}),
            depth,
            kind,
            control: this.getControlKind(label, nodePath, scalarValue),
            value: this.getRowValue(node, nodePath, scalarValue),
            checked: this.getCheckedState(node, nodePath, scalarValue),
            options: this.getSelectOptions(label, nodePath),
            selectedOptions: this.getSelectedOptions(node, label, nodePath, scalarValue),
            controlDisabledReason: this.getControlDisabledReason(nodePath),
            hasChildren,
            expanded: this.hasInlineMultiSelect(nodePath) ? false : expanded,
            removable: typeof nodePath.at(-1) === 'number' && nodePath.at(-2) !== 'setup',
            addChildKind: this.getRowAddChildKind(node, nodePath),
            addChildDisabledReason: this.getRowAddChildDisabledReason(node, nodePath),
            description: this.describeNode(node, nodePath)
        };
        return row;
    }

    /**
     * getRowAddChildKind decides whether a sequence row should expose an add
     * button. It preserves the normal starter-object behavior; comparator
     * limits are represented separately so the webview can keep the button
     * visible in a disabled state.
     */
    private getRowAddChildKind(node: YamlTreeItem, nodePath: (string | number)[]): TraceConfigurationRow['addChildKind'] {
        if ((!isYamlSequenceItem(node) && !this.isBareSequenceNode(node, nodePath)) || nodePath.at(-1) === 'setup' || this.hasInlineMultiSelect(nodePath)) {
            return undefined;
        }
        return this.getAddChildKind(nodePath);
    }

    /**
     * getRowAddChildDisabledReason explains why an otherwise-addable row cannot
     * accept more entries. The processor name comes from the loaded trace
     * capability metadata, which is built from the active cbuild-run.yml pname
     * when that file is available.
     */
    private getRowAddChildDisabledReason(node: YamlTreeItem, nodePath: (string | number)[]): string | undefined {
        if (!this.getRowAddChildKind(node, nodePath)) {
            return undefined;
        }
        const usage = this.getSharedDwtComparatorUsage(nodePath);
        if (!usage || usage.used < usage.limit) {
            return undefined;
        }
        return `Maximum number of comparators has been reached for ${usage.pname}`;
    }

    /**
     * canAddSharedDwtComparatorEntry checks the processor-wide DWT comparator
     * pool used by DWT Data Trace, Instruction Trace Start/Stop, and Trace Halt
     * entries. Rows without processor capabilities are left editable so legacy
     * or top-level ctrace sections keep their existing behavior.
     */
    public canAddSharedDwtComparatorEntry(nodePath: (string | number)[]): boolean {
        const usage = this.getSharedDwtComparatorUsage(nodePath);
        return usage ? usage.used < usage.limit : true;
    }

    /**
     * getSharedDwtComparatorUsage returns current pool usage for one editable
     * comparator-backed sequence. Each list entry consumes one comparator in
     * the UI accounting model.
     */
    public getSharedDwtComparatorUsage(nodePath: (string | number)[]): { used: number; limit: number; pname: string } | undefined {
        if (!this.isSharedDwtComparatorSequencePath(nodePath)) {
            return undefined;
        }
        const capabilities = this.getTraceCapabilitiesForPath(nodePath);
        if (!capabilities) {
            return undefined;
        }
        return {
            used: this.countSharedDwtComparatorEntries(nodePath),
            limit: capabilities.dwtComparators,
            pname: capabilities.pname
        };
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
    private shouldFlattenSetupNode(node: YamlTreeItem, nodePath: (string | number)[]): boolean {
        if (isYamlSequenceItem(node) && nodePath.at(-1) === 'setup') {
            return true;
        }
        return false;
    }

    /**
     * getChildEntries extracts child rows from YAML maps and sequences. The
     * method skips implementation metadata such as ctrace-ref, created-by, and
     * pname because processor names are rendered in their parent row labels.
     */
    private getChildEntries(node: YamlTreeItem, nodePath = this.getNodePath(node)): TraceNodeEntry[] {
        if (isYamlMapItem(node)) {
            const entries: TraceNodeEntry[] = [];
            node.getChildren().forEach(child => {
                const label = child.getTag();
                if (!label || this.shouldHideNode(label, nodePath)) {
                    return;
                }
                entries.push({
                    label,
                    path: [...nodePath, label],
                    node: child
                });
            });
            this.appendSyntheticChildEntries(entries, nodePath);
            return this.sortDisplayEntries(entries, nodePath);
        }
        if (isYamlSequenceItem(node) && this.isEventsPath(nodePath)) {
            return [];
        }
        if (isYamlSequenceItem(node)) {
            return node.getChildren().map((item, index) => ({
                label: this.getSequenceItemLabel(item, index),
                path: [...nodePath, index],
                node: item
            }));
        }
        return this.getFilteredSyntheticChildEntries(nodePath);
    }

    /**
     * appendSyntheticChildEntries adds schema-defined optional fields that are
     * not currently present in ctrace.yml. These rows let users fill optional
     * settings from the webview, but because the nodes are synthetic nothing is
     * written until the user enters or selects a value.
     */
    private appendSyntheticChildEntries(entries: TraceNodeEntry[], parentPath: (string | number)[]): void {
        const existingLabels = new Set(entries.map(entry => entry.label));
        this.getFilteredSyntheticChildEntries(parentPath).forEach(entry => {
            if (existingLabels.has(entry.label)) {
                return;
            }
            entries.push(entry);
        });
    }

    /**
     * getFilteredSyntheticChildEntries applies the same hidden-node and
     * processor-capability checks to synthetic rows that real YAML children use.
     * Scalar null nodes such as a bare "timestamps:" can call this directly so
     * valid YAML shorthand still exposes the optional fields from the schema.
     */
    private getFilteredSyntheticChildEntries(parentPath: (string | number)[]): TraceNodeEntry[] {
        return this.getSyntheticChildEntries(parentPath)
            .filter(entry => !this.shouldHideNode(entry.label, parentPath) && this.shouldShowTraceNode(entry.label, entry.path));
    }

    /**
     * getSyntheticChildEntries mirrors the current ctrace JSON schema for the
     * parts edited by this webview. Required fields are only synthesized for new
     * sequence items where the add action creates the parent object; optional
     * fields remain absent from YAML until edited.
     */
    private getSyntheticChildEntries(parentPath: (string | number)[]): TraceNodeEntry[] {
        if (this.isProcessorPath(parentPath)) {
            return [
                this.createSyntheticMapEntry(parentPath, 'timestamps'),
                this.createSyntheticNullEntry(parentPath, 'exceptions'),
                this.createSyntheticSequenceEntry(parentPath, 'events'),
                this.createSyntheticMapEntry(parentPath, 'itm'),
                this.createSyntheticSequenceEntry(parentPath, 'data'),
                this.createSyntheticMapEntry(parentPath, 'instructions'),
                this.createSyntheticMapEntry(parentPath, 'pcsampling'),
                this.createSyntheticSequenceEntry(parentPath, 'tracehalt'),
            ];
        }
        if (this.isTimestampsPath(parentPath)) {
            return [
                this.createSyntheticScalarEntry(parentPath, 'clock'),
                this.createSyntheticScalarEntry(parentPath, 'itm-prescaler'),
            ];
        }
        if (this.isItmPath(parentPath)) {
            return [this.createSyntheticScalarEntry(parentPath, 'privileged')];
        }
        if (this.isDataTraceItemPath(parentPath)) {
            return [
                this.createSyntheticScalarEntry(parentPath, 'label'),
                this.createSyntheticScalarEntry(parentPath, 'access'),
                this.createSyntheticScalarEntry(parentPath, 'size'),
                this.createSyntheticScalarEntry(parentPath, 'output'),
                this.createSyntheticMapEntry(parentPath, 'match'),
            ];
        }
        if (this.isInstructionsPath(parentPath)) {
            return [
                this.createSyntheticSequenceEntry(parentPath, 'start'),
                this.createSyntheticSequenceEntry(parentPath, 'stop'),
            ];
        }
        if (this.isConditionItemPath(parentPath)) {
            return [
                this.createSyntheticScalarEntry(parentPath, 'access'),
                this.createSyntheticScalarEntry(parentPath, 'size'),
                this.createSyntheticMapEntry(parentPath, 'match'),
            ];
        }
        if (this.isMatchPath(parentPath)) {
            return [
                this.createSyntheticScalarEntry(parentPath, 'value'),
                this.createSyntheticScalarEntry(parentPath, 'size'),
            ];
        }
        return [];
    }

    /**
     * createSyntheticScalarEntry returns a blank scalar row for a schema field
     * that does not exist in YAML yet. Blank values are later interpreted by the
     * model as "delete/keep absent" for optional fields.
     */
    private createSyntheticScalarEntry(parentPath: (string | number)[], label: string): TraceNodeEntry {
        return {
            label,
            path: [...parentPath, label],
            node: createYamlScalarItem(label, '')
        };
    }

    /**
     * createSyntheticNullEntry returns a null scalar row for presence-only
     * schema fields such as exceptions. The row can render as an unchecked
     * checkbox while preserving the YAML convention of writing an empty key when
     * enabled.
     */
    private createSyntheticNullEntry(parentPath: (string | number)[], label: string): TraceNodeEntry {
        return {
            label,
            path: [...parentPath, label],
            node: createYamlScalarItem(label, null)
        };
    }

    /**
     * createSyntheticMapEntry returns an empty map row for optional object
     * fields. Child generation is path-based, so the row can still show its
     * schema children even though this map is not present in ctrace.yml yet.
     */
    private createSyntheticMapEntry(parentPath: (string | number)[], label: string): TraceNodeEntry {
        return {
            label,
            path: [...parentPath, label],
            node: createYamlMapItem(label)
        };
    }

    /**
     * createSyntheticSequenceEntry returns an empty sequence row for optional
     * list fields. The add button can append to the real YAML path and the DOM
     * layer will create the sequence only when the user adds an item.
     */
    private createSyntheticSequenceEntry(parentPath: (string | number)[], label: string): TraceNodeEntry {
        return {
            label,
            path: [...parentPath, label],
            node: createYamlSequenceItem(label)
        };
    }

    /**
     * getAdvancedSettingsEntries finds the real YAML nodes that should be shown
     * beneath the synthetic Advanced Settings row. Keeping these as real node
     * entries means the child controls still edit the original ctrace paths.
     */
    private getAdvancedSettingsEntries(node: YamlTreeItem, nodePath: (string | number)[]): TraceNodeEntry[] {
        const entries: TraceNodeEntry[] = [];
        const timesync = node.getChild('timesync');
        if (timesync && this.shouldShowTraceNode('timesync', [...nodePath, 'timesync'])) {
            entries.push({ label: 'timesync', path: [...nodePath, 'timesync'], node: timesync });
        } else if (this.shouldShowTraceNode('timesync', [...nodePath, 'timesync'])) {
            entries.push(this.createSyntheticNullEntry(nodePath, 'timesync'));
        }
        const synchronization = node.getChild('synchronization');
        if (synchronization && this.shouldShowTraceNode('synchronization', [...nodePath, 'synchronization'])) {
            entries.push({ label: 'synchronization', path: [...nodePath, 'synchronization'], node: synchronization });
        } else if (this.shouldShowTraceNode('synchronization', [...nodePath, 'synchronization'])) {
            entries.push(this.createSyntheticSequenceEntry(nodePath, 'synchronization'));
        }
        return entries;
    }

    /**
     * sortDisplayEntries applies small user-facing ordering tweaks without
     * changing the YAML file order. The main trace subsystem rows are grouped
     * in the order users are expected to review them, while all other entries
     * keep their original relative order after that leading group.
     */
    private sortDisplayEntries(entries: TraceNodeEntry[], parentPath: (string | number)[]): TraceNodeEntry[] {
        return entries
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => {
                const leftRank = this.getDisplayOrderRank(left.entry.label, parentPath);
                const rightRank = this.getDisplayOrderRank(right.entry.label, parentPath);
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
    private getDisplayOrderRank(label: string, parentPath: (string | number)[]): number {
        const fieldRank = this.getFieldDisplayOrderRank(label, parentPath);
        if (fieldRank !== undefined) {
            return fieldRank;
        }
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
            case 'tracehalt':
                return 70;
            default:
                return 100;
        }
    }

    /**
     * getFieldDisplayOrderRank keeps schema fields in a stable UI order even
     * when some fields are real YAML nodes and others are synthetic placeholders.
     */
    private getFieldDisplayOrderRank(label: string, parentPath: (string | number)[]): number | undefined {
        const rankForDataTrace = new Map([
            ['location', 10],
            ['label', 20],
            ['access', 30],
            ['size', 40],
            ['output', 50],
            ['match', 60],
            ['pc', 70],
            ['pname', 80],
        ]);
        const rankForCondition = new Map([
            ['location', 10],
            ['access', 20],
            ['size', 30],
            ['match', 40],
            ['pname', 50],
        ]);
        if (this.isDataTraceItemPath(parentPath)) {
            return rankForDataTrace.get(label);
        }
        if (this.isConditionItemPath(parentPath)) {
            return rankForCondition.get(label);
        }
        return undefined;
    }

    /**
     * getRowLabel chooses the final label for a row. Processor rows are derived
     * from their pname field, while all normal YAML keys go through the generic
     * display-label mapper.
     */
    private getRowLabel(node: YamlTreeItem, label: string, nodePath: (string | number)[]): string {
        if (this.isProcessorPath(nodePath) && isYamlMapItem(node)) {
            return `Processor:${this.mapScalarToString(node, 'pname') ?? 'Unknown'}`;
        }
        if (this.isPromotedLocationItemPath(nodePath)) {
            return 'Location';
        }
        return this.getDisplayLabel(label, nodePath);
    }

    /**
     * getRowValue returns the editable value shown in the Selection column.
     * Most scalar rows use their scalar text directly. Folded map controls such
     * as PC Sampling still expose a scalar child as the parent row's value.
     */
    private getRowValue(node: YamlTreeItem, nodePath: (string | number)[], scalarValue?: string): string | undefined {
        if (this.isPromotedLocationItemPath(nodePath)) {
            return isYamlMapItem(node) ? this.mapScalarToString(node, 'location') ?? '' : '';
        }
        if (this.isPcSamplingPath(nodePath)) {
            const period = isYamlMapItem(node) ? this.mapScalarToString(node, 'period') : scalarValue;
            return this.normalizePcSamplingPeriod(period && period.trim().length > 0 ? period : 'off');
        }
        if (this.isDwtDataAccessPath(nodePath)) {
            const accessValue = this.accessValueToLabel(scalarValue);
            return accessValue && accessValue.trim().length > 0 ? accessValue : 'Write';
        }
        if (this.isTraceConditionAccessPath(nodePath)) {
            const accessValue = this.accessValueToLabel(scalarValue);
            return accessValue && accessValue.trim().length > 0 ? accessValue : 'Execute';
        }
        return scalarValue;
    }

    /**
     * getRowValuePath lets promoted header controls edit a child scalar while
     * preserving the parent path for expansion and remove operations.
     */
    private getRowValuePath(nodePath: (string | number)[]): (string | number)[] | undefined {
        if (this.isPromotedLocationItemPath(nodePath)) {
            return [...nodePath, 'location'];
        }
        return undefined;
    }

    private getControlDisabledReason(nodePath: (string | number)[]): string | undefined {
        if (!this.isMatchSizePath(nodePath) || this.hasNonEmptyMatchValue(nodePath)) {
            return undefined;
        }
        return 'Size can\'t be set if no value is provided';
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
            return 'Time Synchronization';
        }
        if (label.toLowerCase() === 'synchronization' && this.isStreamSynchronizationPath(nodePath)) {
            return 'Stream Synchronization';
        }
        if (label.toLowerCase() === 'tracehalt') {
            return 'Trace Halt';
        }
        return this.toDisplayTitle(label);
    }

    /**
     * shouldHideNode centralizes user-facing filtering for YAML keys that are
     * still preserved in the file but should not clutter the trace editor. The
     * metadata keys are always hidden, top-level disable is hidden because the
     * setting is processor-specific, ITM enable is folded into its parent row's
     * channel checklist, and pname is folded into processor row labels.
     */
    private shouldHideNode(label: string, parentPath: (string | number)[]): boolean {
        if (label === 'ctrace-ref' || label === 'created-by' || label === 'generated-by') {
            return true;
        }
        if (label === 'ELF-files') {
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
        if (label === 'location' && this.isPromotedLocationItemPath(parentPath)) {
            return true;
        }
        if ((label === 'timesync' || label === 'synchronization') && this.isProcessorPath(parentPath)) {
            return true;
        }
        return label === 'pname';
    }

    /**
     * hasSingleCoreDescription inspects all pname scalars under ctrace and
     * returns true when they all point at the same core. That lets the webview
     * suppress repeated pname fields for the common single-core case while
     * keeping them visible when multiple cores are present.
     */
    private hasSingleCoreDescription(): boolean {
        const ctraceRoot = this.getCTraceFile()?.document?.yaml.getItem(['ctrace']);
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
     * ctrace sections such as data traces, events, and register values.
     */
    private collectCoreNames(node: YamlTreeItem, coreNames: Set<string>): void {
        if (isYamlMapItem(node)) {
            node.getChildren().forEach(child => {
                const label = child.getTag();
                if (label === 'pname' && isYamlScalarItem(child)) {
                    const coreName = this.scalarToString(child).trim();
                    if (coreName) {
                        coreNames.add(coreName);
                    }
                    return;
                }
                this.collectCoreNames(child, coreNames);
            });
            return;
        }
        if (isYamlSequenceItem(node)) {
            node.getChildren().forEach(item => this.collectCoreNames(item, coreNames));
        }
    }

    /**
     * getNodePath finds the path to a node by walking from the ctrace root each
     * time rows are serialized. This avoids storing mutable path side tables on
     * YAML nodes and keeps the serializer resilient after edits replace nodes.
     */
    private getNodePath(targetNode: YamlTreeItem): (string | number)[] {
        const root = this.getCTraceFile()?.document?.yaml.getItem(['ctrace']);
        const pathToTarget = root ? this.findNodePath(root, targetNode, ['ctrace']) : undefined;
        return pathToTarget ?? ['ctrace'];
    }

    /**
     * findNodePath recursively searches for a YAML node and returns its ctrace
     * path. Map children append their key and sequence children append their
     * numeric index, matching the paths accepted by YamlDomDocument.set/delete.
     */
    private findNodePath(currentNode: YamlTreeItem, targetNode: YamlTreeItem, currentPath: (string | number)[]): (string | number)[] | undefined {
        if (currentNode === targetNode) {
            return currentPath;
        }
        if (isYamlMapItem(currentNode)) {
            for (const child of currentNode.getChildren()) {
                const key = child.getTag();
                if (!key) {
                    continue;
                }
                const found = this.findNodePath(child, targetNode, [...currentPath, key]);
                if (found) {
                    return found;
                }
            }
        }
        if (isYamlSequenceItem(currentNode)) {
            for (let index = 0; index < currentNode.getChildren().length; index++) {
                const item = currentNode.childAtIndex(index);
                if (!item) {
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
     * scalarToString returns the original scalar spelling preserved by the
     * cmsis-common tree parser.
     */
    private scalarToString(node: YamlTreeItem): string {
        return yamlScalarToString(node);
    }

    /**
     * getSequenceItemLabel gives repeated YAML items a readable tree label. It
     * prefers common ctrace identity fields such as pname, location, event, and
     * file, then falls back to an item number. In single-core files it skips
     * pname so the core name is not shown as either a field or a grouping label.
     */
    private getSequenceItemLabel(node: YamlTreeItem, index: number): string {
        if (isYamlMapItem(node)) {
            const identityKeys = this.hasSingleCoreDescription()
                ? ['location', 'event', 'file']
                : ['pname', 'location', 'event', 'file'];
            const candidate = identityKeys
                .map(key => node.getChild(key))
                .find(value => value !== undefined);
            if (candidate) {
                return isYamlScalarItem(candidate) ? this.scalarToString(candidate) : String(candidate.toObject());
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
        if (this.shouldUseBareSequenceWhenEmpty(nodePath)) {
            return 'none';
        }
        if (this.isPromotedLocationItemPath(nodePath)) {
            return 'text';
        }
        if (this.isEventsPath(nodePath) || this.isItmPath(nodePath) || this.isItmPrivilegedPath(nodePath)) {
            return 'multi-select';
        }
        if (this.isPcSamplingPath(nodePath)) {
            return 'select';
        }
        if (this.isStreamSyncDwtPeriodPath(nodePath)) {
            return 'select';
        }
        if (this.isPresenceCheckboxPath(nodePath)) {
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
     * checkboxes use YAML-ish truthy strings, while processor rows invert the
     * hidden disable key: checked means trace is enabled, so disable is absent.
     */
    private getCheckedState(node: YamlTreeItem, nodePath: (string | number)[], scalarValue?: string): boolean {
        if (this.isProcessorPath(nodePath) && isYamlMapItem(node)) {
            return node.getChild('disable') === undefined;
        }
        if (this.isTimestampsPath(nodePath)) {
            return this.nodeExists(nodePath);
        }
        if (this.isExceptionsPath(nodePath)) {
            return this.nodeExists(nodePath);
        }
        if (this.isInstructionsPath(nodePath)) {
            return this.nodeExists(nodePath);
        }
        if (this.isTimeSyncPath(nodePath)) {
            return this.nodeExists(nodePath);
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
            return TraceConfigurationTypes.DATA_ACCESS_OPTIONS;
        }
        if (this.isTraceConditionAccessPath(nodePath)) {
            return TraceConfigurationTypes.CONDITION_ACCESS_OPTIONS;
        }
        if (this.isTimestampsPrescalerPath(nodePath)) {
            return ['1', '4', '16', '64'];
        }
        if (this.isDataOutputPath(nodePath)) {
            return TraceConfigurationTypes.DATA_OUTPUT_OPTIONS;
        }
        if (this.isMatchSizePath(nodePath)) {
            return TraceConfigurationTypes.MATCH_SIZE_OPTIONS;
        }
        switch (label.toLowerCase()) {
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
        node: YamlTreeItem,
        _label: string,
        nodePath: (string | number)[],
        scalarValue?: string
    ): string[] | undefined {
        if (this.isEventsPath(nodePath) && isYamlSequenceItem(node)) {
            return node.getChildren().flatMap(item => {
                if (!isYamlMapItem(item)) {
                    return [];
                }
                const event = item.getChild('event');
                return isYamlScalarItem(event) ? [this.scalarToString(event)] : [];
            });
        }
        if (this.isItmPath(nodePath) && isYamlMapItem(node)) {
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
            case 'tracehalt':
                return 'condition';
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

    private isPresenceCheckboxPath(nodePath: (string | number)[]): boolean {
        return [
            this.isProcessorPath(nodePath),
            this.isTimestampsPath(nodePath),
            this.isExceptionsPath(nodePath),
            this.isInstructionsPath(nodePath),
            this.isTimeSyncPath(nodePath)
        ].some(Boolean);
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
     * isTimestampsPrescalerPath identifies the optional ITM prescaler field
     * inside timestamps. The schema restricts it to 1, 4, 16, or 64, with a
     * blank UI value meaning the optional key should stay absent.
     */
    private isTimestampsPrescalerPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'itm-prescaler' && this.isTimestampsPath(nodePath.slice(0, -1));
    }

    /**
     * isTimestampsClockPath identifies the optional timestamp clock field,
     * which the schema stores as an integer frequency in Hertz.
     */
    private isTimestampsClockPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'clock' && this.isTimestampsPath(nodePath.slice(0, -1));
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
     * isOptionalScalarPath identifies schema fields that should not be written
     * when the webview sends an empty string. Required placeholders such as
     * location are intentionally excluded so newly added list items remain
     * visible until the user fills them.
     */
    public isOptionalScalarPath(nodePath: (string | number)[]): boolean {
        const key = nodePath.at(-1);
        const parentPath = nodePath.slice(0, -1);
        if (this.isOptionalStandaloneScalarPath(nodePath)) {
            return true;
        }
        if (this.isDataTraceItemPath(parentPath)) {
            return this.isDataTraceOptionalKey(key);
        }
        if (this.isConditionItemPath(parentPath)) {
            return this.isConditionOptionalKey(key);
        }
        if (this.isMatchPath(parentPath)) {
            return this.isMatchOptionalKey(key);
        }
        return false;
    }

    /**
     * toYamlScalarValue converts webview text/select values into the primitive
     * shape expected by the ctrace schema. Numeric schema fields become numbers
     * when the user entered a decimal value; hexadecimal match values are kept
     * as strings because the schema explicitly allows that spelling.
     */
    public toYamlScalarValue(nodePath: (string | number)[], value: string): string | number {
        const trimmed = value.trim();
        if (this.isIntegerScalarPath(nodePath) && /^\d+$/.test(trimmed)) {
            return Number(trimmed);
        }
        if (this.isDwtDataAccessPath(nodePath) || this.isTraceConditionAccessPath(nodePath)) {
            return this.accessLabelToValue(value);
        }
        return value;
    }

    /**
     * shouldPruneEmptyOptionalParent returns true for optional object parents
     * that should disappear when their last child is removed. Currently this is
     * used for match objects so clearing match.value and match.size does not
     * leave an empty optional match block in ctrace.yml.
     */
    public shouldPruneEmptyOptionalParent(nodePath: (string | number)[]): boolean {
        return this.isMatchPath(nodePath);
    }

    /**
     * isIntegerScalarPath lists schema scalar fields that should be serialized
     * as YAML numbers when entered as decimal text.
     */
    private isIntegerScalarPath(nodePath: (string | number)[]): boolean {
        const key = nodePath.at(-1);
        const parentPath = nodePath.slice(0, -1);
        return this.isTimestampsClockPath(nodePath)
            || this.isTimestampsPrescalerPath(nodePath)
            || this.isPcSamplingPath(nodePath)
            || this.isItmPrivilegedPath(nodePath)
            || (this.isTraceItemPath(parentPath) && key === 'size')
            || (this.isMatchPath(parentPath) && this.isMatchIntegerKey(key));
    }

    private isOptionalStandaloneScalarPath(nodePath: (string | number)[]): boolean {
        return [
            this.isTimestampsClockPath(nodePath),
            this.isTimestampsPrescalerPath(nodePath),
            this.isItmPrivilegedPath(nodePath)
        ].some(Boolean);
    }

    private isDataTraceOptionalKey(key: string | number | undefined): boolean {
        return key === 'label' || key === 'access' || key === 'size' || key === 'output';
    }

    private isConditionOptionalKey(key: string | number | undefined): boolean {
        return key === 'access' || key === 'size';
    }

    private isMatchOptionalKey(key: string | number | undefined): boolean {
        return key === 'value' || key === 'size';
    }

    private isMatchIntegerKey(key: string | number | undefined): boolean {
        return key === 'value' || key === 'size';
    }

    private isTraceItemPath(nodePath: (string | number)[]): boolean {
        return this.isDataTraceItemPath(nodePath) || this.isConditionItemPath(nodePath);
    }

    /**
     * nodeExists checks the actual YAML DOM rather than synthetic row nodes.
     * Presence-based ctrace sections such as timestamps, exceptions, timesync,
     * and instructions are enabled when their key exists, even if the value is
     * null or an empty map.
     */
    private nodeExists(nodePath: (string | number)[]): boolean {
        return this.getCTraceFile()?.document?.yaml.getItem(nodePath) !== undefined;
    }

    private hasNonEmptyMatchValue(matchSizePath: (string | number)[]): boolean {
        const value = this.getCTraceFile()?.document?.yaml.getString([...matchSizePath.slice(0, -1), 'value']);
        return value !== undefined && value.trim().length > 0;
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
        const processorNode = this.getCTraceFile()?.document?.yaml.getItem(['ctrace', 'setup', setupIndex]);
        return isYamlMapItem(processorNode) ? this.mapScalarToString(processorNode, 'pname') : undefined;
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
     * isDwtDataTracePath identifies the DWT Data Trace sequence. Each item uses
     * the same processor DWT comparator pool as instruction start/stop and
     * trace halt conditions.
     */
    private isDwtDataTracePath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'data';
    }

    /**
     * isTraceHaltPath identifies the Trace Halt condition sequence. Trace halt
     * conditions consume DWT comparators from the same processor-local pool as
     * data trace and instruction trace trigger conditions.
     */
    private isTraceHaltPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'tracehalt';
    }

    /**
     * isSharedDwtComparatorSequencePath identifies editable ctrace lists whose
     * entries consume one DWT comparator from the processor's shared pool.
     */
    private isSharedDwtComparatorSequencePath(nodePath: (string | number)[]): boolean {
        return this.isDwtDataTracePath(nodePath)
            || this.isInstructionTraceTriggerSequencePath(nodePath)
            || this.isTraceHaltPath(nodePath);
    }

    /**
     * countSharedDwtComparatorEntries totals DWT comparator consumers for the
     * setup item that owns the current row.
     */
    private countSharedDwtComparatorEntries(nodePath: (string | number)[]): number {
        const setupIndex = this.getSetupIndexForPath(nodePath);
        if (setupIndex === undefined) {
            return 0;
        }
        const processorPath = ['ctrace', 'setup', setupIndex];
        return [
            [...processorPath, 'data'],
            [...processorPath, 'instructions', 'start'],
            [...processorPath, 'instructions', 'stop'],
            [...processorPath, 'tracehalt'],
        ].reduce((total, path) => total + this.countSequenceItems(path), 0);
    }

    /**
     * countSequenceItems treats missing and bare-key shorthand sequences as
     * empty while counting all existing list entries as comparator consumers.
     */
    private countSequenceItems(nodePath: (string | number)[]): number {
        const node = this.getCTraceFile()?.document?.yaml.getItem(nodePath);
        return isYamlSequenceItem(node) ? node.getChildren().length : 0;
    }

    /**
     * isDataTraceItemPath identifies one object inside the data trace sequence.
     * The schema requires location and permits optional label/access/size/output
     * and match fields below this path.
     */
    private isDataTraceItemPath(nodePath: (string | number)[]): boolean {
        return typeof nodePath.at(-1) === 'number' && nodePath.at(-2) === 'data';
    }

    /**
     * isInstructionTraceTriggerItemPath identifies one object inside an
     * Instruction Trace Start or Stop sequence.
     */
    private isInstructionTraceTriggerItemPath(nodePath: (string | number)[]): boolean {
        return typeof nodePath.at(-1) === 'number'
            && (nodePath.at(-2) === 'start' || nodePath.at(-2) === 'stop')
            && nodePath.at(-3) === 'instructions';
    }

    /**
     * isInstructionTraceTriggerSequencePath identifies the Start and Stop
     * sequences that own Instruction Trace trigger items.
     */
    private isInstructionTraceTriggerSequencePath(nodePath: (string | number)[]): boolean {
        return (nodePath.at(-1) === 'start' || nodePath.at(-1) === 'stop')
            && nodePath.at(-2) === 'instructions';
    }

    /**
     * isPromotedLocationItemPath identifies sequence item rows whose required
     * location field is rendered directly in the item header instead of as a
     * duplicate child row.
     */
    private isPromotedLocationItemPath(nodePath: (string | number)[]): boolean {
        return this.isDataTraceItemPath(nodePath) || this.isConditionItemPath(nodePath);
    }

    /**
     * shouldUseBareSequenceWhenEmpty identifies editable sequences that should
     * serialize as a bare YAML key when their last item is removed.
     */
    public shouldUseBareSequenceWhenEmpty(nodePath: (string | number)[]): boolean {
        return this.isSharedDwtComparatorSequencePath(nodePath);
    }

    /**
     * isBareSequenceNode identifies null shorthand nodes that the UI should
     * treat as editable empty sequences.
     */
    private isBareSequenceNode(node: YamlTreeItem, nodePath: (string | number)[]): boolean {
        return this.shouldUseBareSequenceWhenEmpty(nodePath)
            && isYamlScalarItem(node)
            && node.getText() === undefined;
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
     * isDataOutputPath identifies the DWT data output mode field whose options
     * come directly from the ctrace schema.
     */
    private isDataOutputPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'output' && this.isDataTraceItemPath(nodePath.slice(0, -1));
    }

    /**
     * isConditionItemPath identifies one condition object in instructions
     * start/stop or tracehalt. Conditions share access, size, and match options
     * in the ctrace schema.
     */
    private isConditionItemPath(nodePath: (string | number)[]): boolean {
        if (typeof nodePath.at(-1) !== 'number') {
            return false;
        }
        return nodePath.at(-2) === 'tracehalt' || this.isInstructionTraceTriggerItemPath(nodePath);
    }

    /**
     * isTraceConditionAccessPath identifies access fields under condition
     * entries. Unlike DWT data access, conditions may use Execute.
     */
    public isTraceConditionAccessPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'access' && this.isConditionItemPath(nodePath.slice(0, -1));
    }

    /**
     * isMatchPath identifies optional match objects under data trace items or
     * condition items.
     */
    private isMatchPath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'match'
            && (this.isDataTraceItemPath(nodePath.slice(0, -1)) || this.isConditionItemPath(nodePath.slice(0, -1)));
    }

    /**
     * isMatchSizePath identifies the optional match comparison size field,
     * which the schema restricts to 1, 2, or 4.
     */
    public isMatchSizePath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'size' && this.isMatchPath(nodePath.slice(0, -1));
    }

    /**
     * isMatchValuePath identifies the required value field inside an optional
     * match object. The model uses this to remove the whole optional match block
     * when the required value is cleared, preventing invalid match maps that
     * contain only optional children.
     */
    public isMatchValuePath(nodePath: (string | number)[]): boolean {
        return nodePath.at(-1) === 'value' && this.isMatchPath(nodePath.slice(0, -1));
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
    private getStreamSyncDwtPeriod(node: YamlTreeItem): string {
        if (!isYamlSequenceItem(node)) {
            return 'off';
        }
        const dwtPeriod = node.getChildren().flatMap(item => {
            if (!isYamlMapItem(item)) {
                return [];
            }
            const dwt = item.getChild('DWT');
            if (isYamlScalarItem(dwt)) {
                return [this.scalarToString(dwt)];
            }
            const period = item.getChild('period');
            if (!isYamlScalarItem(period)) {
                return [];
            }
            const periodText = this.scalarToString(period);
            return periodText.startsWith('DWT\\') ? [periodText.replace(/^DWT\\/, '')] : [];
        }).at(0);
        return dwtPeriod ?? 'off';
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
    private mapScalarToString(map: YamlTreeItem, key: string): string | undefined {
        const value = map.getChild(key);
        return isYamlScalarItem(value) ? this.scalarToString(value) : undefined;
    }

    /**
     * describeNode currently returns no secondary metadata because the remaining
     * path and generated reference details are implementation internals rather
     * than user-facing trace configuration.
     */
    private describeNode(_node: YamlTreeItem, _nodePath: (string | number)[]): string | undefined {
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
