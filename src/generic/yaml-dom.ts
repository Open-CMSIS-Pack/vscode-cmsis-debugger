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

import { CTreeItem, ETreeItemKind, ITreeItem } from '@open-cmsis-pack/cmsis-common/tree-item';
import { CTreeItemBuilder } from '@open-cmsis-pack/cmsis-common/tree-item-builder';
import { CTreeItemYamlParser } from '@open-cmsis-pack/cmsis-common/tree-item-yaml-parser';

export type YamlPathSegment = string | number;
export type YamlPath = readonly YamlPathSegment[];
export type YamlTreeItem = ITreeItem<CTreeItem>;
export type YamlMapItem = YamlTreeItem & { getKind(): ETreeItemKind.Map };
export type YamlSequenceItem = YamlTreeItem & { getKind(): ETreeItemKind.Sequence };
export type YamlScalarItem = YamlTreeItem & { getKind(): ETreeItemKind.Scalar };

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

const SCALAR_TYPE_BY_STYLE: Record<YamlScalarStyle, string> = {
    plain: 'PLAIN',
    'single-quoted': 'QUOTE_SINGLE',
    'double-quoted': 'QUOTE_DOUBLE',
    'block-folded': 'BLOCK_FOLDED',
    'block-literal': 'BLOCK_LITERAL'
};

export function isYamlMapItem(item: YamlTreeItem | undefined): item is YamlMapItem {
    return item?.getKind() === ETreeItemKind.Map;
}

export function isYamlSequenceItem(item: YamlTreeItem | undefined): item is YamlSequenceItem {
    return item?.getKind() === ETreeItemKind.Sequence;
}

export function isYamlScalarItem(item: YamlTreeItem | undefined): item is YamlScalarItem {
    return item?.getKind() === ETreeItemKind.Scalar;
}

export function yamlScalarToString(item: YamlTreeItem): string {
    return item.getText() ?? '';
}

export function createYamlScalarItem(tag = '', value?: string | number | boolean | null): YamlTreeItem {
    const item = new CTreeItem(tag);
    item.fromObject(value ?? null);
    return item;
}

export function createYamlMapItem(tag = ''): YamlTreeItem {
    const item = new CTreeItem(tag);
    item.setKind(ETreeItemKind.Map);
    return item;
}

export function createYamlSequenceItem(tag = ''): YamlTreeItem {
    const item = new CTreeItem(tag);
    item.setKind(ETreeItemKind.Sequence);
    return item;
}

function createParser(fileName?: string): CTreeItemYamlParser {
    return new CTreeItemYamlParser(new CTreeItemBuilder(fileName));
}

function createRootItem(): YamlTreeItem {
    return createYamlMapItem('');
}

function toDiagnostic(message: string, line: number, column: number, fileName?: string): YamlDiagnostic {
    const diagnostic: YamlDiagnostic = { message, line, column };
    if (fileName) {
        diagnostic.fileName = fileName;
    }
    return diagnostic;
}

function parseDiagnostics(parser: CTreeItemYamlParser, fileName?: string): YamlDiagnostic[] {
    return (parser.yamlDocument?.errors ?? []).map(error => {
        const linePosition = error.linePos?.[0];
        return toDiagnostic(
            error.message,
            linePosition?.line ?? 0,
            linePosition?.col ?? 0,
            fileName
        );
    });
}

function isEmptyRoot(item: YamlTreeItem): boolean {
    return item.getKind() === ETreeItemKind.Undefined
        && item.getChildren().length === 0
        && item.getText() === undefined;
}

function kindForValue(value: unknown): ETreeItemKind {
    if (Array.isArray(value)) {
        return ETreeItemKind.Sequence;
    }
    if (typeof value === 'object' && value !== null) {
        return ETreeItemKind.Map;
    }
    return ETreeItemKind.Scalar;
}

function kindForPathSegment(nextSegment: YamlPathSegment | undefined): ETreeItemKind {
    return typeof nextSegment === 'number' ? ETreeItemKind.Sequence : ETreeItemKind.Map;
}

function getCommentsProperty(item: YamlTreeItem): YamlComments | undefined {
    const comments = item.getProperty('comments');
    if (!comments || typeof comments !== 'object') {
        return undefined;
    }
    return comments as YamlComments;
}

export class YamlDomDocument {
    private readonly parser: CTreeItemYamlParser;

    private constructor(
        private root: YamlTreeItem,
        public readonly diagnostics: YamlDiagnostic[] = [],
        parser?: CTreeItemYamlParser
    ) {
        this.parser = parser ?? createParser();
    }

    public static parse(text: string, fileName?: string): YamlDomDocument {
        const parser = createParser(fileName);
        const root = parser.parse(text);
        return new YamlDomDocument(root, parseDiagnostics(parser, fileName), parser);
    }

    public static create(rootKey?: string): YamlDomDocument {
        const dom = new YamlDomDocument(createRootItem());
        if (rootKey) {
            dom.ensureMap([rootKey]);
        }
        return dom;
    }

    public get rootItem(): YamlTreeItem {
        return this.root;
    }

    public get hasErrors(): boolean {
        return this.diagnostics.length > 0;
    }

    public getItem(path: YamlPath = []): YamlTreeItem | undefined {
        let current: YamlTreeItem | undefined = this.root;
        for (const segment of path) {
            if (!current) {
                return undefined;
            }
            current = typeof segment === 'number'
                ? current.childAtIndex(segment)
                : current.getChild(segment);
        }
        return current && !isEmptyRoot(current) ? current : undefined;
    }

    public getKind(path: YamlPath = []): YamlNodeKind {
        const item = this.getItem(path);
        if (!item) {
            return 'missing';
        }
        switch (item.getKind()) {
            case ETreeItemKind.Map:
                return 'map';
            case ETreeItemKind.Sequence:
                return 'sequence';
            case ETreeItemKind.Scalar:
                return 'scalar';
            case ETreeItemKind.Undefined:
            default:
                return 'document';
        }
    }

    public getValue<T = unknown>(path: YamlPath = []): T | undefined {
        const item = this.getItem(path);
        return item ? item.toObject() as T : undefined;
    }

    public getScalarSource(path: YamlPath): string | undefined {
        const item = this.getItem(path);
        return isYamlScalarItem(item) ? yamlScalarToString(item) : undefined;
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
        const item = this.getItem(path);
        return item ? getCommentsProperty(item) : undefined;
    }

    public setComments(path: YamlPath, comments: YamlComments): void {
        this.getItem(path)?.setProperty('comments', comments);
    }

    public set(path: YamlPath, value: unknown, options: YamlSetOptions = {}): void {
        const item = this.ensureItem(path, kindForValue(value));
        item.fromObject(value ?? null);
        if (isYamlScalarItem(item) && options.scalarStyle) {
            item.scalarType = SCALAR_TYPE_BY_STYLE[options.scalarStyle];
        }
    }

    public delete(path: YamlPath): boolean {
        if (path.length === 0) {
            this.root = new CTreeItem('');
            return true;
        }
        const parentPath = path.slice(0, -1);
        const segment = path.at(-1);
        const parent = this.getItem(parentPath);
        if (!parent || segment === undefined) {
            return false;
        }
        const child = typeof segment === 'number'
            ? parent.childAtIndex(segment)
            : parent.getChild(segment);
        if (!child) {
            return false;
        }
        parent.removeChild(child);
        return true;
    }

    public ensureMap(path: YamlPath): YamlTreeItem {
        return this.ensureItem(path, ETreeItemKind.Map);
    }

    public ensureSequence(path: YamlPath): YamlTreeItem {
        return this.ensureItem(path, ETreeItemKind.Sequence);
    }

    public append(path: YamlPath, value: unknown, options: YamlSetOptions = {}): void {
        const sequence = this.ensureSequence(path);
        const child = sequence.createChild('-');
        child.fromObject(value ?? null);
        if (isYamlScalarItem(child) && options.scalarStyle) {
            child.scalarType = SCALAR_TYPE_BY_STYLE[options.scalarStyle];
        }
    }

    public toJS<T = unknown>(): T {
        return this.root.toObject() as T;
    }

    public toString(): string {
        return this.parser.toString(this.root);
    }

    private ensureItem(path: YamlPath, itemKind: ETreeItemKind): YamlTreeItem {
        if (path.length === 0) {
            this.setItemKind(this.root, itemKind);
            return this.root;
        }
        let current = this.root;
        this.setItemKind(current, kindForPathSegment(path.at(0)));
        path.forEach((segment, index) => {
            const nextKind = index === path.length - 1
                ? itemKind
                : kindForPathSegment(path.at(index + 1));
            current = typeof segment === 'number'
                ? this.ensureSequenceChild(current, segment, nextKind)
                : this.ensureMapChild(current, segment, nextKind);
        });
        return current;
    }

    private ensureMapChild(parent: YamlTreeItem, tag: string, kind: ETreeItemKind): YamlTreeItem {
        this.setItemKind(parent, ETreeItemKind.Map);
        const child = parent.getChild(tag) ?? parent.createChild(tag);
        this.setItemKind(child, kind);
        return child;
    }

    private ensureSequenceChild(parent: YamlTreeItem, index: number, kind: ETreeItemKind): YamlTreeItem {
        this.setItemKind(parent, ETreeItemKind.Sequence);
        for (let childIndex = parent.getChildren().length; childIndex <= index; childIndex++) {
            parent.createChild('-').fromObject(null);
        }
        const child = parent.childAtIndex(index);
        if (!child) {
            throw new Error(`Unable to create YAML sequence item at index ${index}.`);
        }
        this.setItemKind(child, kind);
        return child;
    }

    private setItemKind(item: YamlTreeItem, kind: ETreeItemKind): void {
        if (item.getKind() !== kind) {
            item.setText(undefined);
            item.removeChildrenNotInTags([]);
        }
        item.setKind(kind);
    }
}
