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

import { Disposable, NodeTextFileAdapter, TextFileAdapter, YamlDomFile } from './yaml-file';
import { YamlDiagnostic, YamlDomDocument, YamlPath } from './yaml-dom';
import * as YAML from 'yaml';

const CTRACE_ROOT = 'ctrace';
const CTRACE_PATH = [CTRACE_ROOT] as const;
const DATA_TRACE_PATH = [CTRACE_ROOT, 'data'] as const;
const ELF_FILES_PATH = [CTRACE_ROOT, 'ELF-files'] as const;
const REGISTER_VALUES_PATH = [CTRACE_ROOT, 'register-values'] as const;

export type CTraceScalar = string | number | boolean | null;

export interface CTraceRegisterBlock {
    [registerName: string]: CTraceScalar | CTraceRegisterBlock;
}

export interface CTraceRoot {
    ctrace?: CTraceConfiguration;
}

export interface CTraceConfiguration {
    'ctrace-ref'?: string;
    'created-by'?: string;
    instructions?: CTraceInstructions;
    timestamp?: unknown;
    data?: CTraceDataTrace[];
    exceptions?: CTraceExceptionTrace[];
    events?: CTraceEventTrace[];
    itm?: CTraceItmTrace[];
    'ELF-files'?: CTraceElfFile[];
    'register-values'?: CTraceRegisterValues[];
    [key: string]: unknown;
}

export interface CTraceLocationTrigger {
    'ctrace-ref'?: string;
    location: string;
    value?: CTraceScalar;
    pname?: string;
    [key: string]: unknown;
}

export interface CTraceInstructions {
    'ctrace-ref'?: string;
    start?: CTraceLocationTrigger[];
    stop?: CTraceLocationTrigger[];
    [key: string]: unknown;
}

export interface CTraceDataTrace {
    'ctrace-ref'?: string;
    location: string;
    access?: 'read' | 'write' | 'rw' | 'r' | 'w' | string;
    size?: number | string;
    pc?: boolean | 'yes' | 'no' | string;
    pname?: string;
    [key: string]: unknown;
}

export interface CTraceExceptionTrace {
    'ctrace-ref'?: string;
    pname?: string;
    [key: string]: unknown;
}

export interface CTraceEventTrace {
    'ctrace-ref'?: string;
    event: string;
    pname?: string;
    [key: string]: unknown;
}

export interface CTraceItmTrace {
    'ctrace-ref'?: string;
    pname?: string;
    enable?: number | string;
    privilege?: number | string;
    [key: string]: unknown;
}

export interface CTraceElfFile {
    'ctrace-ref'?: string;
    file: string;
    pname?: string;
    [key: string]: unknown;
}

export interface CTraceRegisterValues {
    'ctrace-ref'?: string;
    pname?: string;
    [registerGroup: string]: unknown;
}

type DataTraceMatcher = (entry: CTraceDataTrace) => boolean;
type ElfFileMatcher = (entry: CTraceElfFile) => boolean;
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

    public getElfFiles(): CTraceElfFile[] {
        return this.yamlDomDocument.getArray<CTraceElfFile>(ELF_FILES_PATH);
    }

    public setElfFiles(entries: CTraceElfFile[]): void {
        this.setOrDeleteSequence(ELF_FILES_PATH, entries);
    }

    public upsertElfFile(entry: CTraceElfFile, matcher?: ElfFileMatcher): void {
        const effectiveMatcher = matcher ?? (candidate =>
            candidate.pname === entry.pname || (!candidate.pname && !entry.pname));
        const index = this.getElfFiles().findIndex(effectiveMatcher);
        if (index >= 0) {
            this.yamlDomDocument.set([...ELF_FILES_PATH, index], entry);
            return;
        }
        this.yamlDomDocument.append(ELF_FILES_PATH, entry);
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

    public replaceGeneratedValues(elfFiles: CTraceElfFile[], registerValues: CTraceRegisterValues[]): void {
        this.setElfFiles(elfFiles);
        this.setRegisterValues(registerValues);
    }

    public clearGeneratedValues(): void {
        this.yamlDomDocument.delete(ELF_FILES_PATH);
        this.yamlDomDocument.delete(REGISTER_VALUES_PATH);
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
