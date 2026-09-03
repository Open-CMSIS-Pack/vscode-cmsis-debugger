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

import { Disposable, NodeTextFileAdapter, TextFileAdapter, YamlDomFile } from '../../desktop/yaml-file';
import {
    isYamlMapItem,
    isYamlSequenceItem,
    isYamlScalarItem,
    yamlScalarToString,
    YamlDiagnostic,
    YamlDomDocument,
    YamlPath,
    YamlTreeItem,
} from '../../desktop/yaml-dom';

const CTRACE_ROOT = 'ctrace';
const CTRACE_PATH = [CTRACE_ROOT] as const;
const DATA_TRACE_PATH = [CTRACE_ROOT, 'data'] as const;
const REGISTER_VALUES_PATH = [CTRACE_ROOT, 'register-values'] as const;
const CTRACE_ROOT_ORDER = [
    'generated-by',
    'created-by',
    'setup',
    'timestamps',
    'timesync',
    'data',
    'exceptions',
    'events',
    'itm',
    'instructions',
    'pcsampling',
    'synchronization',
    'tracehalt',
    'register-values'
] as const;
const PROCESSOR_SETUP_ORDER = [
    'pname',
    'core',
    'disable',
    'timestamps',
    'timesync',
    'data',
    'exceptions',
    'events',
    'itm',
    'instructions',
    'pcsampling',
    'synchronization',
    'tracehalt'
] as const;
const TIMESTAMPS_ORDER = ['clock', 'itm-prescaler'] as const;
const DATA_TRACE_ORDER = ['location', 'label', 'access', 'size', 'output', 'match', 'pc', 'pname'] as const;
const MATCH_ORDER = ['value', 'size'] as const;
const EVENT_TRACE_ORDER = ['event', 'pname'] as const;
const ITM_ORDER = ['enable', 'privileged', 'privilege', 'pname'] as const;
const INSTRUCTIONS_ORDER = ['start', 'stop'] as const;
const CONDITION_ORDER = ['location', 'access', 'size', 'match', 'pname'] as const;
const PCSAMPLING_ORDER = ['period'] as const;
const SYNCHRONIZATION_ORDER = ['DWT'] as const;
const REGISTER_VALUES_ORDER = ['pname'] as const;

export type CTraceScalar = string | number | boolean | null;
export type CTraceLocation = string | number;
export type CTraceUnsignedValue = string | number;
export type CTraceTimestampPrescaler = 1 | 4 | 16 | 64 | '1' | '4' | '16' | '64';
export type CTraceDataAccess = 'W' | 'R' | 'RW';
export type CTraceConditionAccess = 'X' | 'R' | 'W' | 'RW';
export type CTraceDataOutput = 'value' | 'offset' | 'PC' | 'match' | 'PC+value' | 'offset+value' | 'PC+offset';
export type CTraceMatchSize = 1 | 2 | 4 | '1' | '2' | '4';
export type CTraceSynchronizationPeriod = 'off' | '16M' | '64M' | '256M';

export interface CTraceRegisterBlock {
    [registerName: string]: CTraceScalar | CTraceRegisterBlock;
}

export type CTraceRegisterValue = CTraceScalar | CTraceRegisterBlock | undefined;

export interface CTraceRoot {
    ctrace?: CTraceConfiguration;
}

export interface CTraceConfiguration {
    'ctrace-ref'?: string;
    'generated-by'?: string;
    'created-by'?: string;
    setup?: CTraceProcessorTraceSetup[];
    instructions?: CTraceInstructions;
    timestamps?: CTraceTimestamps | null;
    data?: CTraceDataTrace[];
    exceptions?: null | CTraceExceptionTrace[];
    events?: CTraceEventTrace[];
    itm?: CTraceItmTrace | CTraceItmTrace[];
    pcsampling?: CTracePcSampling;
    synchronization?: CTraceSynchronization;
    tracehalt?: CTraceCondition[];
    'register-values'?: CTraceRegisterValues[];
}

export interface CTraceProcessorTraceSetup {
    'ctrace-ref'?: string;
    pname?: string;
    core?: string;
    disable?: null;
    timestamps?: CTraceTimestamps | null;
    timesync?: null;
    data?: CTraceDataTrace[];
    exceptions?: null;
    events?: CTraceEventTrace[];
    itm?: CTraceItmTrace;
    instructions?: CTraceInstructions | null;
    pcsampling?: CTracePcSampling;
    synchronization?: CTraceSynchronization;
    tracehalt?: CTraceCondition[];
}

export interface CTraceTimestamps {
    'ctrace-ref'?: string;
    clock?: number | string;
    'itm-prescaler'?: CTraceTimestampPrescaler;
}

export interface CTraceInstructions {
    'ctrace-ref'?: string;
    start?: CTraceCondition[];
    stop?: CTraceCondition[];
}

export interface CTraceDataTrace {
    'ctrace-ref'?: string;
    location: CTraceLocation;
    label?: string;
    access?: CTraceDataAccess;
    size?: number | string;
    output?: CTraceDataOutput;
    match?: CTraceMatch;
    pc?: boolean | 'yes' | 'no' | string;
    pname?: string;
}

export interface CTraceCondition {
    'ctrace-ref'?: string;
    location: CTraceLocation;
    access?: CTraceConditionAccess;
    size?: number | string;
    match?: CTraceMatch;
    pname?: string;
}

export type CTraceLocationTrigger = CTraceCondition;

export interface CTraceMatch {
    'ctrace-ref'?: string;
    value: CTraceUnsignedValue;
    size?: CTraceMatchSize;
}

export interface CTraceExceptionTrace {
    'ctrace-ref'?: string;
    pname?: string;
}

export interface CTraceEventTrace {
    'ctrace-ref'?: string;
    event: string;
    pname?: string;
}

export interface CTraceItmTrace {
    'ctrace-ref'?: string;
    pname?: string;
    enable?: number | string;
    privileged?: number | string;
    privilege?: number | string;
}

export interface CTracePcSampling {
    'ctrace-ref'?: string;
    period?: number | string;
}

export interface CTraceSynchronization {
    'ctrace-ref'?: string;
    DWT: CTraceSynchronizationPeriod;
}

export interface CTraceRegisterValues {
    'ctrace-ref'?: string;
    pname?: string;
    [registerGroup: string]: CTraceRegisterValue;
}

type DataTraceMatcher = (entry: CTraceDataTrace) => boolean;
type RegisterValuesMatcher = (entry: CTraceRegisterValues) => boolean;

function mapScalarToString(map: YamlTreeItem, key: string): string | undefined {
    const value = map.getChild(key);
    return isYamlScalarItem(value) ? yamlScalarToString(value) : undefined;
}

function joinReference(prefix: string | undefined, suffix: string): string {
    return prefix ? `${prefix}/${suffix}` : suffix;
}

export class CTraceYamlDocument {
    private readonly ctraceRefs = new Map<string, string>();
    private useProcessorReferencePrefix = false;

    constructor(private readonly yamlDomDocument: YamlDomDocument) {}

    public static parse(text: string, fileName?: string): CTraceYamlDocument {
        return new CTraceYamlDocument(YamlDomDocument.parse(text, fileName));
    }

    public static create(createdBy?: string): CTraceYamlDocument {
        const document = YamlDomDocument.create(CTRACE_ROOT);
        const ctrace = new CTraceYamlDocument(document);
        if (createdBy) {
            ctrace.setCreatedBy(createdBy);
        }
        return ctrace;
    }

    public get yaml(): YamlDomDocument {
        return this.yamlDomDocument;
    }

    public get diagnostics(): YamlDiagnostic[] {
        return this.yamlDomDocument.diagnostics;
    }

    public get hasErrors(): boolean {
        return this.yamlDomDocument.hasErrors;
    }

    public get configuration(): CTraceConfiguration | undefined {
        return this.yamlDomDocument.getValue<CTraceConfiguration>(CTRACE_PATH);
    }

    public ensureConfiguration(): void {
        this.yamlDomDocument.ensureMap(CTRACE_PATH);
    }

    public getCreatedBy(): string | undefined {
        return this.yamlDomDocument.getString([CTRACE_ROOT, 'created-by']);
    }

    public setCreatedBy(createdBy: string): void {
        this.yamlDomDocument.set([CTRACE_ROOT, 'created-by'], createdBy);
        this.normalizeDocumentOrder();
    }

    public getDataTrace(): CTraceDataTrace[] {
        return this.yamlDomDocument.getArray<CTraceDataTrace>(DATA_TRACE_PATH);
    }

    public setDataTrace(entries: CTraceDataTrace[]): void {
        this.setOrDeleteSequence(DATA_TRACE_PATH, entries);
        this.normalizeDocumentOrder();
    }

    public upsertDataTrace(entry: CTraceDataTrace, matcher?: DataTraceMatcher): void {
        const index = this.findDataTraceIndex(entry, matcher);
        if (index >= 0) {
            this.yamlDomDocument.set([...DATA_TRACE_PATH, index], entry);
            this.normalizeDocumentOrder();
            return;
        }
        this.yamlDomDocument.append(DATA_TRACE_PATH, entry);
        this.normalizeDocumentOrder();
    }

    public removeDataTrace(location: string, pname?: string): boolean {
        const index = this.getDataTrace().findIndex(entry =>
            entry.location === location && (pname === undefined || entry.pname === pname));
        if (index < 0) {
            return false;
        }
        return this.yamlDomDocument.delete([...DATA_TRACE_PATH, index]);
    }

    public getRegisterValues(): CTraceRegisterValues[] {
        return this.yamlDomDocument.getArray<CTraceRegisterValues>(REGISTER_VALUES_PATH);
    }

    public getRegisterValuesForPname(pname?: string): CTraceRegisterValues | undefined {
        return this.getRegisterValues().find(entry =>
            pname === undefined ? !entry.pname : entry.pname === pname);
    }

    public setRegisterValues(entries: CTraceRegisterValues[]): void {
        this.setOrDeleteSequence(REGISTER_VALUES_PATH, entries);
        this.normalizeDocumentOrder();
    }

    public upsertRegisterValues(entry: CTraceRegisterValues, matcher?: RegisterValuesMatcher): void {
        const effectiveMatcher = matcher ?? (candidate =>
            candidate.pname === entry.pname || (!candidate.pname && !entry.pname));
        const index = this.getRegisterValues().findIndex(effectiveMatcher);
        if (index >= 0) {
            this.yamlDomDocument.set([...REGISTER_VALUES_PATH, index], entry);
            this.normalizeDocumentOrder();
            return;
        }
        this.yamlDomDocument.append(REGISTER_VALUES_PATH, entry);
        this.normalizeDocumentOrder();
    }

    /**
     * normalizeDocumentOrder keeps emitted ctrace.yml maps aligned with the
     * public file-structure tables while preserving unknown keys after known
     * keys in their original relative order.
     */
    public normalizeDocumentOrder(): void {
        const root = this.yamlDomDocument.getItem(CTRACE_PATH);
        if (isYamlMapItem(root)) {
            this.normalizeMapOrder(root, [...CTRACE_PATH]);
        }
    }

    public assignCTraceRefs(): void {
        this.ctraceRefs.clear();
        this.useProcessorReferencePrefix = false;
        const root = this.yamlDomDocument.getItem(CTRACE_PATH);
        if (!isYamlMapItem(root)) {
            return;
        }
        const setup = root.getChild('setup');
        this.useProcessorReferencePrefix = isYamlSequenceItem(setup) && setup.getChildren().length > 1;
        this.setInternalCTraceRef(CTRACE_PATH, CTRACE_ROOT);
        this.assignMapChildReferences(root, CTRACE_PATH);
    }

    public getCTraceRef(path: YamlPath): string | undefined {
        return this.ctraceRefs.get(this.pathToReferenceKey(path));
    }

    public toObject(): CTraceRoot {
        return this.yamlDomDocument.toJS<CTraceRoot>();
    }

    public toString(): string {
        return this.yamlDomDocument.toString();
    }

    private findDataTraceIndex(entry: CTraceDataTrace, matcher?: DataTraceMatcher): number {
        const effectiveMatcher = matcher ?? (candidate =>
            candidate.location === entry.location && candidate.pname === entry.pname);
        return this.getDataTrace().findIndex(effectiveMatcher);
    }

    private assignMapChildReferences(
        map: YamlTreeItem,
        currentPath: YamlPath,
        currentReference?: string,
        currentSection?: string,
        sectionParentReference?: string
    ): void {
        [...map.getChildren()].forEach(child => {
            const key = child.getTag();
            if (key === 'ctrace-ref') {
                map.removeChild(child);
                return;
            }
            if (!key) {
                return;
            }
            const childPath = [...currentPath, key];
            const childReference = joinReference(currentReference, key);
            this.setInternalCTraceRef(childPath, childReference);
            if (isYamlSequenceItem(child)) {
                this.assignSequenceReferences(
                    child,
                    childPath,
                    key,
                    currentReference,
                    currentSection,
                    sectionParentReference
                );
                return;
            }
            if (isYamlMapItem(child)) {
                this.assignMapChildReferences(child, childPath, childReference, key, currentReference);
            }
        });
    }

    private assignSequenceReferences(
        sequence: YamlTreeItem,
        sequencePath: YamlPath,
        key: string,
        currentReference?: string,
        currentSection?: string,
        sectionParentReference?: string
    ): void {
        sequence.getChildren().forEach((item, index) => {
            const reference = this.createSequenceItemReference(
                item,
                key,
                index,
                currentReference,
                currentSection,
                sectionParentReference
            );
            const itemPath = [...sequencePath, index];
            this.setInternalCTraceRef(itemPath, reference);
            if (!isYamlMapItem(item)) {
                return;
            }
            const childReference = key === 'setup' && !this.useProcessorReferencePrefix ? undefined : reference;
            this.assignMapChildReferences(item, itemPath, childReference);
        });
    }

    private createSequenceItemReference(
        item: YamlTreeItem,
        key: string,
        index: number,
        currentReference?: string,
        currentSection?: string,
        sectionParentReference?: string
    ): string {
        if (key === 'setup') {
            return mapScalarToString(item, 'pname') || `setup#${index}`;
        }
        if (currentSection === 'instructions') {
            return joinReference(sectionParentReference, `${currentSection}:${key}#${index}`);
        }
        const reference = `${key}#${index}`;
        return joinReference(currentReference, reference);
    }

    private setInternalCTraceRef(path: YamlPath, reference: string): void {
        this.ctraceRefs.set(this.pathToReferenceKey(path), reference);
    }

    private pathToReferenceKey(path: YamlPath): string {
        return JSON.stringify([...path]);
    }

    private setOrDeleteSequence<T>(path: YamlPath, entries: T[]): void {
        if (entries.length === 0) {
            this.yamlDomDocument.delete(path);
            return;
        }
        this.yamlDomDocument.set(path, entries);
    }

    private normalizeMapOrder(map: YamlTreeItem, path: (string | number)[]): void {
        const order = this.getDocumentOrderForMap(path);
        if (order) {
            this.reorderMapChildren(map, order);
        }
        map.getChildren().forEach(child => {
            const tag = child.getTag();
            if (!tag) {
                return;
            }
            this.normalizeChildOrder(child, [...path, tag]);
        });
    }

    private normalizeSequenceOrder(sequence: YamlTreeItem, path: (string | number)[]): void {
        sequence.getChildren().forEach((item, index) => {
            this.normalizeChildOrder(item, [...path, index]);
        });
    }

    private normalizeChildOrder(child: YamlTreeItem, path: (string | number)[]): void {
        if (isYamlMapItem(child)) {
            this.normalizeMapOrder(child, path);
            return;
        }
        if (isYamlSequenceItem(child)) {
            this.normalizeSequenceOrder(child, path);
        }
    }

    private reorderMapChildren(map: YamlTreeItem, preferredOrder: readonly string[]): void {
        const rankByTag = new Map(preferredOrder.map((tag, index) => [tag, index]));
        const orderedChildren = map.getChildren()
            .map((child, index) => ({ child, index, rank: rankByTag.get(child.getTag() ?? '') }))
            .sort((left, right) => {
                if (left.rank === undefined && right.rank === undefined) {
                    return left.index - right.index;
                }
                if (left.rank === undefined) {
                    return 1;
                }
                if (right.rank === undefined) {
                    return -1;
                }
                return left.rank === right.rank ? left.index - right.index : left.rank - right.rank;
            });
        if (orderedChildren.every((entry, index) => entry.index === index)) {
            return;
        }
        orderedChildren.forEach(entry => map.removeChild(entry.child));
        orderedChildren.forEach(entry => map.addChild(entry.child));
    }

    private getDocumentOrderForMap(path: (string | number)[]): readonly string[] | undefined {
        if (this.isCTraceRootPath(path)) {
            return CTRACE_ROOT_ORDER;
        }
        if (this.isProcessorSetupPath(path)) {
            return PROCESSOR_SETUP_ORDER;
        }
        if (this.isTimestampsPath(path)) {
            return TIMESTAMPS_ORDER;
        }
        if (this.isDataTraceItemPath(path)) {
            return DATA_TRACE_ORDER;
        }
        if (this.isMatchPath(path)) {
            return MATCH_ORDER;
        }
        if (this.isEventTraceItemPath(path)) {
            return EVENT_TRACE_ORDER;
        }
        if (this.isItmPath(path)) {
            return ITM_ORDER;
        }
        if (this.isInstructionsPath(path)) {
            return INSTRUCTIONS_ORDER;
        }
        if (this.isConditionItemPath(path)) {
            return CONDITION_ORDER;
        }
        if (this.isPcSamplingPath(path)) {
            return PCSAMPLING_ORDER;
        }
        if (this.isSynchronizationPath(path)) {
            return SYNCHRONIZATION_ORDER;
        }
        if (this.isRegisterValuesItemPath(path)) {
            return REGISTER_VALUES_ORDER;
        }
        return undefined;
    }

    private isCTraceRootPath(path: (string | number)[]): boolean {
        return path.length === 1 && path[0] === CTRACE_ROOT;
    }

    private isProcessorSetupPath(path: (string | number)[]): boolean {
        return path.at(-2) === 'setup' && typeof path.at(-1) === 'number';
    }

    private isTimestampsPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'timestamps';
    }

    private isDataTraceItemPath(path: (string | number)[]): boolean {
        return path.at(-2) === 'data' && typeof path.at(-1) === 'number';
    }

    private isMatchPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'match' && (this.isDataTraceItemPath(path.slice(0, -1)) || this.isConditionItemPath(path.slice(0, -1)));
    }

    private isEventTraceItemPath(path: (string | number)[]): boolean {
        return path.at(-2) === 'events' && typeof path.at(-1) === 'number';
    }

    private isItmPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'itm';
    }

    private isInstructionsPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'instructions';
    }

    private isConditionItemPath(path: (string | number)[]): boolean {
        if (typeof path.at(-1) !== 'number') {
            return false;
        }
        return path.at(-2) === 'tracehalt'
            || ((path.at(-2) === 'start' || path.at(-2) === 'stop') && path.at(-3) === 'instructions');
    }

    private isPcSamplingPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'pcsampling';
    }

    private isSynchronizationPath(path: (string | number)[]): boolean {
        return path.at(-1) === 'synchronization'
            || (path.at(-2) === 'synchronization' && typeof path.at(-1) === 'number');
    }

    private isRegisterValuesItemPath(path: (string | number)[]): boolean {
        return path.at(-2) === 'register-values' && typeof path.at(-1) === 'number';
    }
}

export class CTraceYamlFile {
    private currentDocument: CTraceYamlDocument | undefined;
    private readonly yamlFile: YamlDomFile;

    constructor(
        public fileName: string = '',
        fileAdapter: TextFileAdapter = new NodeTextFileAdapter()
    ) {
        this.yamlFile = new YamlDomFile(fileName, fileAdapter);
    }

    public get document(): CTraceYamlDocument | undefined {
        return this.currentDocument;
    }

    public set document(document: CTraceYamlDocument | undefined) {
        this.currentDocument = document;
        this.yamlFile.document = document?.yaml;
    }

    public async load(fileName = this.fileName): Promise<CTraceYamlDocument> {
        this.fileName = fileName;
        const document = await this.yamlFile.load(fileName);
        this.currentDocument = new CTraceYamlDocument(document);
        return this.currentDocument;
    }

    public async save(fileName = this.fileName): Promise<void> {
        this.fileName = fileName;
        this.yamlFile.fileName = fileName;
        this.yamlFile.document = this.currentDocument?.yaml;
        await this.yamlFile.save(fileName);
    }

    public async hasExternalFileChanged(): Promise<boolean> {
        return this.yamlFile.hasExternalFileChanged();
    }

    public async reloadIfChanged(): Promise<boolean> {
        const changed = await this.yamlFile.reloadIfChanged();
        if (changed && this.yamlFile.document) {
            this.currentDocument = new CTraceYamlDocument(this.yamlFile.document);
        }
        return changed;
    }

    public watch(
        onDidReload: (document: CTraceYamlDocument) => void,
        onError: (error: unknown) => void = () => {}
    ): Disposable {
        return this.yamlFile.watch(document => {
            this.currentDocument = new CTraceYamlDocument(document);
            onDidReload(this.currentDocument);
        }, onError);
    }
}
