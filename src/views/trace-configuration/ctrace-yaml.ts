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

import { Disposable, NodeTextFileAdapter, TextFileAdapter, YamlDomFile } from '../../generic/yaml-file';
import { YamlDiagnostic, YamlDomDocument, YamlPath } from '../../generic/yaml-dom';
import * as YAML from 'yaml';

const CTRACE_ROOT = 'ctrace';
const CTRACE_PATH = [CTRACE_ROOT] as const;
const DATA_TRACE_PATH = [CTRACE_ROOT, 'data'] as const;
const REGISTER_VALUES_PATH = [CTRACE_ROOT, 'register-values'] as const;

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
    synchronization?: CTraceSynchronization[];
    tracehalt?: CTraceCondition[];
    'register-values'?: CTraceRegisterValues[];
}

export interface CTraceProcessorTraceSetup {
    'ctrace-ref'?: string;
    pname?: string;
    disable?: null;
    timestamps?: CTraceTimestamps | null;
    timesync?: null;
    data?: CTraceDataTrace[];
    exceptions?: null;
    events?: CTraceEventTrace[];
    itm?: CTraceItmTrace;
    instructions?: CTraceInstructions | null;
    pcsampling?: CTracePcSampling;
    synchronization?: CTraceSynchronization[];
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

function mapKeyToString(key: unknown): string | undefined {
    if (YAML.isScalar(key)) {
        return key.value === undefined || key.value === null ? undefined : String(key.value);
    }
    return key?.toString();
}

function mapScalarToString(map: YAML.YAMLMap, key: string): string | undefined {
    const value = map.get(key);
    return value === undefined || value === null ? undefined : String(value);
}

function joinReference(prefix: string | undefined, suffix: string): string {
    return prefix ? `${prefix}/${suffix}` : suffix;
}

export class CTraceYamlDocument {
    private readonly ctraceRefs = new Map<string, string>();

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
    }

    public getDataTrace(): CTraceDataTrace[] {
        return this.yamlDomDocument.getArray<CTraceDataTrace>(DATA_TRACE_PATH);
    }

    public setDataTrace(entries: CTraceDataTrace[]): void {
        this.setOrDeleteSequence(DATA_TRACE_PATH, entries);
    }

    public upsertDataTrace(entry: CTraceDataTrace, matcher?: DataTraceMatcher): void {
        const index = this.findDataTraceIndex(entry, matcher);
        if (index >= 0) {
            this.yamlDomDocument.set([...DATA_TRACE_PATH, index], entry);
            return;
        }
        this.yamlDomDocument.append(DATA_TRACE_PATH, entry);
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
    }

    public upsertRegisterValues(entry: CTraceRegisterValues, matcher?: RegisterValuesMatcher): void {
        const effectiveMatcher = matcher ?? (candidate =>
            candidate.pname === entry.pname || (!candidate.pname && !entry.pname));
        const index = this.getRegisterValues().findIndex(effectiveMatcher);
        if (index >= 0) {
            this.yamlDomDocument.set([...REGISTER_VALUES_PATH, index], entry);
            return;
        }
        this.yamlDomDocument.append(REGISTER_VALUES_PATH, entry);
    }

    public assignCTraceRefs(): void {
        this.ctraceRefs.clear();
        const root = this.yamlDomDocument.getNode(CTRACE_PATH);
        if (!YAML.isMap(root)) {
            return;
        }
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
        map: YAML.YAMLMap,
        currentPath: YamlPath,
        currentReference?: string,
        currentSection?: string
    ): void {
        [...map.items].forEach(pair => {
            const key = mapKeyToString(pair.key);
            if (key === 'ctrace-ref') {
                map.delete(key);
                return;
            }
            if (!key || !YAML.isNode(pair.value)) {
                return;
            }
            if (YAML.isSeq(pair.value)) {
                this.assignSequenceReferences(pair.value, [...currentPath, key], key, currentReference, currentSection);
                return;
            }
            if (YAML.isMap(pair.value)) {
                const childReference = joinReference(currentReference, key);
                this.setInternalCTraceRef([...currentPath, key], childReference);
                this.assignMapChildReferences(pair.value, [...currentPath, key], childReference, key);
            }
        });
    }

    private assignSequenceReferences(
        sequence: YAML.YAMLSeq,
        sequencePath: YamlPath,
        key: string,
        currentReference?: string,
        currentSection?: string
    ): void {
        sequence.items.forEach((item, index) => {
            if (!YAML.isMap(item)) {
                return;
            }
            const reference = this.createSequenceItemReference(item, key, index, currentReference, currentSection);
            const itemPath = [...sequencePath, index];
            this.setInternalCTraceRef(itemPath, reference);
            this.assignMapChildReferences(item, itemPath, reference);
        });
    }

    private createSequenceItemReference(
        item: YAML.YAMLMap,
        key: string,
        index: number,
        currentReference?: string,
        currentSection?: string
    ): string {
        if (key === 'setup') {
            return mapScalarToString(item, 'pname') || `setup#${index}`;
        }
        if (currentSection === 'instructions') {
            return `${currentSection}:${key}#${index}`;
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
