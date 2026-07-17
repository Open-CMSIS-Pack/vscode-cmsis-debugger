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

import * as YAML from 'yaml';

export type YamlPathSegment = string | number;
export type YamlPath = readonly YamlPathSegment[];

export type YamlNodeKind = 'document' | 'map' | 'sequence' | 'scalar' | 'missing';

export type YamlScalarStyle = 'plain' | 'single-quoted' | 'double-quoted' | 'block-folded' | 'block-literal';

export interface YamlDiagnostic {
    message: string;
    line: number;
    column: number;
    fileName?: string;
}

export interface YamlComments {
    comment?: string | null;
    commentBefore?: string | null;
    spaceBefore?: boolean | null;
}

export interface YamlSetOptions {
    scalarStyle?: YamlScalarStyle;
}

const YAML_STRINGIFY_OPTIONS = {
    defaultKeyType: 'PLAIN' as const,
    defaultStringType: 'PLAIN' as const,
    nullStr: ''
};

const SCALAR_TYPE_BY_STYLE: Record<YamlScalarStyle, YAML.Scalar.Type> = {
    plain: 'PLAIN',
    'single-quoted': 'QUOTE_SINGLE',
    'double-quoted': 'QUOTE_DOUBLE',
    'block-folded': 'BLOCK_FOLDED',
    'block-literal': 'BLOCK_LITERAL'
};

function createPlainScalarSchema(): YAML.Schema {
    const schema = new YAML.Schema({ schema: 'core' }).clone();
    schema.tags = schema.tags.map(tag => {
        const suffix = tag.tag.split(':').pop();
        switch (suffix) {
            case 'bool':
            case 'int':
            case 'float':
                return {
                    ...tag,
                    test: /^$a/
                } as YAML.ScalarTag;
            default:
                return tag;
        }
    });
    return schema;
}

const PLAIN_SCALAR_SCHEMA = createPlainScalarSchema();

function toPath(path: YamlPath): (string | number)[] {
    return [...path];
}

function scalarSource(node: YAML.Scalar): string | undefined {
    if (node.value === null || node.value === undefined) {
        return undefined;
    }
    if (node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE') {
        return String(node.value);
    }
    return node.source ?? String(node.value);
}

function normalizeScalarSources(node: YAML.Node | null | undefined): void {
    if (!node) {
        return;
    }
    if (YAML.isScalar(node)) {
        if (node.source !== undefined && node.value !== null && typeof node.value !== 'string') {
            node.value = node.source;
        }
        return;
    }
    if (YAML.isSeq(node)) {
        node.items.forEach(item => {
            if (YAML.isNode(item)) {
                normalizeScalarSources(item);
            }
        });
        return;
    }
    if (YAML.isMap(node)) {
        node.items.forEach(pair => {
            if (YAML.isNode(pair.key)) {
                normalizeScalarSources(pair.key);
            }
            if (YAML.isNode(pair.value)) {
                normalizeScalarSources(pair.value);
            }
        });
    }
}

function nodeToJS(node: YAML.Node | undefined): unknown {
    if (!node) {
        return undefined;
    }
    if (YAML.isScalar(node)) {
        return node.value ?? undefined;
    }
    if (YAML.isSeq(node)) {
        return node.items.map(item => YAML.isNode(item) ? nodeToJS(item) : undefined);
    }
    if (YAML.isMap(node)) {
        const object = Object.create(null) as Record<string, unknown>;
        node.items.forEach(pair => {
            const key = YAML.isScalar(pair.key) ? scalarSource(pair.key) : pair.key?.toString();
            if (key !== undefined && YAML.isNode(pair.value)) {
                Object.defineProperty(object, key, {
                    value: nodeToJS(pair.value),
                    enumerable: true,
                    configurable: true,
                    writable: true
                });
            }
        });
        return object;
    }
    return undefined;
}

function getComments(node: YAML.Node | YAML.Document | undefined): YamlComments | undefined {
    if (!node) {
        return undefined;
    }
    const comments: YamlComments = {};
    if (node.comment !== undefined) {
        comments.comment = node.comment;
    }
    if (node.commentBefore !== undefined) {
        comments.commentBefore = node.commentBefore;
    }
    if (YAML.isNode(node) && node.spaceBefore !== undefined) {
        comments.spaceBefore = node.spaceBefore;
    }
    return Object.keys(comments).length ? comments : undefined;
}

function setComments(node: YAML.Node | YAML.Document, comments: YamlComments | undefined): void {
    if (!comments) {
        return;
    }
    if (comments.comment !== undefined) {
        node.comment = comments.comment;
    }
    if (comments.commentBefore !== undefined) {
        node.commentBefore = comments.commentBefore;
    }
    if (YAML.isNode(node) && comments.spaceBefore !== undefined && comments.spaceBefore !== null) {
        node.spaceBefore = comments.spaceBefore;
    }
}

export class YamlDomDocument {
    private readonly plainScalarSchema = PLAIN_SCALAR_SCHEMA;

    private constructor(
        private readonly yamlDocument: YAML.Document,
        public readonly diagnostics: YamlDiagnostic[] = []
    ) {
        this.yamlDocument.schema = this.plainScalarSchema;
    }

    public static parse(text: string, fileName?: string): YamlDomDocument {
        const document = YAML.parseDocument(text);
        normalizeScalarSources(document.contents);
        const diagnostics = document.errors.map(error => {
            const linePosition = error.linePos?.[0];
            const diagnostic: YamlDiagnostic = {
                message: error.message,
                line: linePosition?.line ?? 0,
                column: linePosition?.col ?? 0
            };
            if (fileName) {
                diagnostic.fileName = fileName;
            }
            return diagnostic;
        });
        return new YamlDomDocument(document, diagnostics);
    }

    public static create(rootKey?: string): YamlDomDocument {
        const document = new YAML.Document(YAML_STRINGIFY_OPTIONS);
        document.contents = new YAML.YAMLMap();
        const dom = new YamlDomDocument(document);
        if (rootKey) {
            dom.ensureMap([rootKey]);
        }
        return dom;
    }

    public get document(): YAML.Document {
        return this.yamlDocument;
    }

    public get hasErrors(): boolean {
        return this.diagnostics.length > 0;
    }

    public getNode(path: YamlPath = []): YAML.Node | undefined {
        if (path.length === 0) {
            return this.yamlDocument.contents ?? undefined;
        }
        const node = this.yamlDocument.getIn(toPath(path), true);
        return YAML.isNode(node) ? node : undefined;
    }

    public getKind(path: YamlPath = []): YamlNodeKind {
        if (path.length === 0 && this.yamlDocument.contents === null) {
            return 'missing';
        }
        if (path.length === 0 && this.yamlDocument.contents === undefined) {
            return 'missing';
        }
        const node = this.getNode(path);
        if (!node) {
            return 'missing';
        }
        if (YAML.isMap(node)) {
            return 'map';
        }
        if (YAML.isSeq(node)) {
            return 'sequence';
        }
        if (YAML.isScalar(node)) {
            return 'scalar';
        }
        return 'document';
    }

    public getValue<T = unknown>(path: YamlPath = []): T | undefined {
        const value = path.length === 0 ? nodeToJS(this.yamlDocument.contents ?? undefined) : nodeToJS(this.getNode(path));
        return value as T | undefined;
    }

    public getScalarSource(path: YamlPath): string | undefined {
        const node = this.getNode(path);
        return YAML.isScalar(node) ? scalarSource(node) : undefined;
    }

    public getString(path: YamlPath): string | undefined {
        const source = this.getScalarSource(path);
        if (source !== undefined) {
            return source;
        }
        const value = this.getValue(path);
        return value === undefined || value === null ? undefined : String(value);
    }

    public getArray<T = unknown>(path: YamlPath): T[] {
        const value = this.getValue(path);
        return Array.isArray(value) ? value as T[] : [];
    }

    public getComments(path: YamlPath = []): YamlComments | undefined {
        if (path.length === 0) {
            return getComments(this.yamlDocument);
        }
        return getComments(this.getNode(path));
    }

    public setComments(path: YamlPath, comments: YamlComments): void {
        if (path.length === 0) {
            setComments(this.yamlDocument, comments);
            return;
        }
        const node = this.getNode(path);
        if (node) {
            setComments(node, comments);
        }
    }

    public set(path: YamlPath, value: unknown, options: YamlSetOptions = {}): void {
        if (path.length === 0) {
            const node = this.createNode(value, options);
            this.yamlDocument.contents = node;
            return;
        }
        this.ensureParentFor(path);
        this.yamlDocument.setIn(toPath(path), this.createNode(value, options));
    }

    public delete(path: YamlPath): boolean {
        if (path.length === 0) {
            this.yamlDocument.contents = null;
            return true;
        }
        return this.yamlDocument.deleteIn(toPath(path));
    }

    public ensureMap(path: YamlPath): YAML.YAMLMap {
        const existing = this.getNode(path);
        if (YAML.isMap(existing)) {
            return existing;
        }
        const map = new YAML.YAMLMap();
        if (path.length === 0) {
            this.yamlDocument.contents = map;
            return map;
        }
        this.ensureParentFor(path);
        this.yamlDocument.setIn(toPath(path), map);
        return map;
    }

    public ensureSequence(path: YamlPath): YAML.YAMLSeq {
        const existing = this.getNode(path);
        if (YAML.isSeq(existing)) {
            return existing;
        }
        const sequence = new YAML.YAMLSeq();
        if (path.length === 0) {
            this.yamlDocument.contents = sequence;
            return sequence;
        }
        this.ensureParentFor(path);
        this.yamlDocument.setIn(toPath(path), sequence);
        return sequence;
    }

    public append(path: YamlPath, value: unknown, options: YamlSetOptions = {}): void {
        const sequence = this.ensureSequence(path);
        sequence.add(this.createNode(value, options));
    }

    public toJS<T = unknown>(): T {
        return this.yamlDocument.toJS() as T;
    }

    public toString(): string {
        this.yamlDocument.schema = this.plainScalarSchema;
        return this.yamlDocument.toString(YAML_STRINGIFY_OPTIONS);
    }

    private ensureParentFor(path: YamlPath): void {
        let currentPath: YamlPathSegment[] = [];
        for (let index = 0; index < path.length - 1; index++) {
            const segment = path.at(index);
            const nextSegment = path.at(index + 1);
            if (segment === undefined || nextSegment === undefined) {
                return;
            }
            currentPath = [...currentPath, segment];
            const node = this.getNode(currentPath);
            if (typeof nextSegment === 'number') {
                if (!YAML.isSeq(node)) {
                    this.ensureSequence(currentPath);
                }
            } else if (!YAML.isMap(node)) {
                this.ensureMap(currentPath);
            }
        }
    }

    private createNode(value: unknown, options: YamlSetOptions): YAML.Node {
        const node = this.yamlDocument.createNode(value) as YAML.Node;
        if (YAML.isScalar(node) && options.scalarStyle) {
            node.type = SCALAR_TYPE_BY_STYLE[options.scalarStyle];
        }
        return node;
    }
}
