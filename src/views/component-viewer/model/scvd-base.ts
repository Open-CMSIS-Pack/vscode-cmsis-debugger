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
 *
 * Minimal core for SCVD tree nodes: parent/child wiring and basic metadata.
 * Model-specific behaviour lives in ScvdNode.
 */

// add linter exception for Json
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

// add linter exception for CTor operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScvdCtor = abstract new (...args: any[]) => ScvdBase;

export abstract class ScvdBase {
    private static _idNext = 1;

    private _parent: ScvdBase | undefined;
    private _children: ScvdBase[] = [];
    private _nodeId: number = 0;

    private _tag: string | undefined;
    private _lineNo: string | undefined;
    private _name: string | undefined;
    private _info: string | undefined;

    private _isModified = false;
    private _valid = false;
    private _mustRead = true;

    constructor(parent: ScvdBase | undefined) {
        ScvdBase._idNext += 1;
        this._nodeId = ScvdBase._idNext;

        if (parent instanceof ScvdBase) {
            this._parent = parent;
            this._parent._children.push(this);
        }
    }

    public castToDerived<C extends AnyScvdCtor>(ctor: C): InstanceType<C> | undefined {
        return this instanceof ctor ? (this as InstanceType<C>) : undefined;
    }

    public isDerived<C extends AnyScvdCtor>(ctor: C): this is InstanceType<C> {
        return this instanceof ctor;
    }

    public get parent(): ScvdBase | undefined {
        return this._parent;
    }

    public get children(): ScvdBase[] {
        return this._children;
    }

    public get nodeId(): string {
        return `${this.classname}_${this._nodeId.toString()}`;
    }

    public get classname(): string {
        return this.constructor.name;
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

    public invalidate() {
        this._valid = false;
        this._mustRead = true;
    }

    public invalidateSubtree() {
        this.invalidate();
        this._children.forEach(child => child.invalidateSubtree());
    }

    public map<T>(callbackfn: (child: ScvdBase, index: number, array: ScvdBase[]) => T): T[] {
        return this._children.map(callbackfn);
    }

    public forEach(callbackfn: (child: ScvdBase, index: number, array: ScvdBase[]) => void): void {
        this._children.forEach(callbackfn);
    }

    public filter(predicate: (child: ScvdBase, index: number, array: ScvdBase[]) => boolean): ScvdBase[] {
        return this._children.filter(predicate);
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
