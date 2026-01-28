/**
 * Copyright 2025-2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Minimal core for SCVD tree nodes: parent/child wiring and basic metadata.
 * Model-specific behaviour lives in ScvdNode.
 */

export type Json = Record<string, unknown>;

// Constructor type used for runtime instanceof checks; kept loose to cover differing ctor shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScvdConstructor<T extends ScvdBase> = abstract new (...args: any[]) => T;

export abstract class ScvdBase {
    private _parent: ScvdBase | undefined;
    private _children: ScvdBase[] = [];

    private _tag: string | undefined;
    private _lineNo: string | undefined;
    private _name: string | undefined;
    private _info: string | undefined;

    private _isModified = false;
    private _valid = false;
    private _mustRead = true;

    constructor(parent: ScvdBase | undefined) {
        if (parent instanceof ScvdBase) {
            this._parent = parent;
            this._parent._children.push(this);
        }
    }

    public castToDerived<T extends ScvdBase>(ctor: ScvdConstructor<T>): T | undefined {
        return this instanceof ctor ? (this as T) : undefined;
    }

    public get parent(): ScvdBase | undefined {
        return this._parent;
    }

    public get children(): ScvdBase[] {
        return this._children;
    }

    public get classname(): string {
        return 'ScvdBase';
    }

    public set tag(value: string | undefined) {
        this._tag = value;
    }
    public get tag(): string | undefined {
        return this._tag ?? 'Internal Object';
    }

    public get lineNo(): string | undefined {
        return this._lineNo;
    }
    public set lineNo(value: string | undefined) {
        if (value !== undefined) {
            this._lineNo = value;
        }
    }

    public set name(name: string | undefined) {
        this._name = name;
    }
    public get name(): string | undefined {
        return this._name;
    }

    public set info(text: string | undefined) {
        this._info = text;
    }
    public get info(): string | undefined {
        return this._info;
    }

    public get isModified(): boolean {
        return this._isModified;
    }
    public set isModified(value: boolean) {
        this._isModified = value;
    }

    public get valid(): boolean {
        return this._valid;
    }
    public set valid(value: boolean) {
        this._valid = value;
    }

    public get mustRead(): boolean {
        return this._mustRead;
    }
    public set mustRead(value: boolean) {
        this._mustRead = value;
    }

    public map<TChild extends ScvdBase, R>(this: { children: TChild[] }, callbackfn: (child: TChild, index: number, array: TChild[]) => R): R[] {
        return this.children.map(callbackfn);
    }

    public forEach<TChild extends ScvdBase>(this: { children: TChild[] }, callbackfn: (child: TChild, index: number, array: TChild[]) => void): void {
        this.children.forEach(callbackfn);
    }

    public filter<TChild extends ScvdBase>(this: { children: TChild[] }, predicate: (child: TChild, index: number, array: TChild[]) => boolean): TChild[] {
        return this.children.filter(predicate);
    }

    // Symbol-context helpers – default no-op so derived classes can walk parents safely.
    public addToSymbolContext(_name: string | undefined, _symbol: ScvdBase): void {
        this.parent?.addToSymbolContext(_name, _symbol);
    }

    public getSymbol(_name: string): ScvdBase | undefined {
        return this.parent?.getSymbol(_name);
    }

    public hasChildren(): boolean {
        return this._children.length > 0;
    }

    public configure(): boolean {
        return true;
    }

    public validate(prevResult: boolean): boolean {
        this.valid = prevResult;
        return prevResult;
    }

    public reset(): boolean {
        return true;
    }

    private getLineNoInfo(item: ScvdBase | undefined): string | undefined {
        if (item === undefined) {
            return undefined;
        }
        const lineNo = item.lineNo;
        if (lineNo === undefined) {
            return this.getLineNoInfo(item.parent);
        }
        return lineNo;
    }

    public getLineInfoStr(): string {
        let lineInfo = '[';
        const lineNo = this.getLineNoInfo(this);
        if (lineNo !== undefined) {
            lineInfo += `Line: ${lineNo} `;
        }
        if (this.tag !== undefined) {
            lineInfo += `Tag: ${this.tag} `;
        }
        lineInfo += ']';
        return lineInfo;
    }

    public getLineNoStr(): string {
        const lineNo = this.getLineNoInfo(this);
        return lineNo !== undefined ? lineNo : '';
    }

    protected sortByLine<T extends ScvdBase>(a: T, b: T): number {
        const aLineNum = Number(a.lineNo);
        const bLineNum = Number(b.lineNo);
        const aLine = Number.isNaN(aLineNum) ? -1 : aLineNum;
        const bLine = Number.isNaN(bLineNum) ? -1 : bLineNum;
        return aLine - bLine;
    }

    public getDisplayLabel(): string {
        const displayName = this.name ?? this.info;
        if (displayName && displayName.length > 0) {
            return displayName;
        }
        if (this.tag) {
            return `${this.tag} (line ${this.getLineNoStr()})`;
        }
        return `${this.classname} (line ${this.getLineNoStr()})`;
    }
}
