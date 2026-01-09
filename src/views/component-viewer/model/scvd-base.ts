/**
 * Copyright 2025 Arm Limited
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

import { ResolveSymbolCb } from '../resolver';
import { ExecutionContext } from '../scvd-eval-context';
import { getLineNumberFromJson, getStringFromJson } from './scvd-utils';

// add linter exception for Json
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

let g_idNext: number = 1;

// add linter exception for CTor operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScvdCtor = abstract new (...args: any[]) => ScvdBase;

export abstract class ScvdBase {
    private _parent: ScvdBase | undefined;
    private _children: ScvdBase[] = [];
    private _nodeId: number = 0;

    private _tag: string | undefined;
    private _lineNo: string | undefined;

    private _name: string | undefined;
    private _info: string | undefined;

    private _isModified: boolean = false;
    private _valid: boolean = false;
    private _mustRead: boolean = true;  // linked to const (read once)

    static _executionContext: ExecutionContext | undefined;
    private _symbolsCache: Map<string, ScvdBase> | undefined;

    constructor(
        parent: ScvdBase | undefined,
    ) {
        g_idNext += 1;
        this._nodeId = g_idNext;

        if (parent instanceof ScvdBase) {
            this._parent = parent;
        }
        this._parent?._children.push(this);
    }

    castToDerived<C extends AnyScvdCtor>(ctor: C): InstanceType<C> | undefined {
        return this instanceof ctor ? (this as InstanceType<C>) : undefined;
    }

    isDerived<C extends AnyScvdCtor>(ctor: C): this is InstanceType<C> {
        return this instanceof ctor;
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            this.tag = 'XML undefined';
            return false;
        }
        this.lineNo = getLineNumberFromJson(xml);
        const tag = getStringFromJson(xml['#Name'] ?? xml['#name']);
        if(tag === undefined) {
            if(Array.isArray(xml)) {
                const subTag = getStringFromJson(xml[0]?.['#Name'] ?? xml[0]?.['#name'] ?? xml[0]?.tag);
                if(subTag !== undefined) {
                    this.tag = subTag + '[]';
                } else {
                    this.tag = 'Array[]';
                }
            } else {
                if(this.tag === undefined ) {
                    this.tag = 'unknown-tag';
                }
            }
        } else {
            this.tag = tag;
        }
        this.name = getStringFromJson(xml.name);
        this.info = getStringFromJson(xml.info);

        return true;
    }

    protected symbolsCache(key: string, value: ScvdBase | undefined): ScvdBase | undefined {
        return this._symbolsCache?.get(key) ?? (value !== undefined ? ((this._symbolsCache ??= new Map()).set(key, value), value) : undefined);
    }

    protected clearSymbolsCache(): void {
        this._symbolsCache = undefined; // let GC reclaim the Map
    }

    public addToSymbolContext(name: string | undefined, symbol: ScvdBase): void {
        this.parent?.addToSymbolContext(name, symbol);
    }

    // search for symbol in parent chain
    public getSymbol(name: string): ScvdBase | undefined {
        return this.parent?.getSymbol(name);
    }

    // search a member (member, var) in typedef
    public getMember(_property: string): ScvdBase | undefined {
        return undefined;
    }

    public getElementRef(): ScvdBase | undefined {
        return undefined;
    }

    public setExecutionContext(_executionContext: ExecutionContext) {
    }

    // default condition always true
    public async getConditionResult(): Promise<boolean> {
        return true;
    }

    public set tag(value: string | undefined) {
        this._tag = value;
    }
    public get tag(): string | undefined {
        if(this._tag === undefined) {
            return 'Internal Object';
        }

        return this._tag;
    }

    public get lineNo(): string | undefined {
        return this._lineNo;
    }
    public set lineNo(value: string | undefined) {
        if(value !== undefined) {
            this._lineNo = value;
        }
    }


    public get children(): ScvdBase[] {
        return this._children;
    }

    get nodeId(): string {
        return this.classname + '_' + this._nodeId.toString();
    }

    get classname(): string {
        return this.constructor.name;
    }

    public set valid(value: boolean) {
        this._valid = value;
    }

    public get valid(): boolean {
        return this._valid;
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
        this._children.forEach( (child: ScvdBase) => {
            child.invalidateSubtree();
        });
    }

    /**
     * Applies the provided callback function to each child and returns an array of results.
     * @param callbackfn Function that produces an element of the new array, taking a child and its index.
     * @returns Array of mapped results.
     */
    public map<T>(_callbackfn: (child: ScvdBase, index: number, array: ScvdBase[]) => T): T[] {
        return this._children.map(_callbackfn);
    }

    /**
     * Executes a provided function once for each child.
     * @param callbackfn Function to execute for each child.
     */
    public forEach(callbackfn: (child: ScvdBase, index: number, array: ScvdBase[]) => void): void {
        this._children.forEach(callbackfn);
    }

    /**
     * Returns a new array with all children that pass the test implemented by the provided function.
     * @param predicate Function to test each child. Return true to keep the child, false otherwise.
     */
    public filter(predicate: (child: ScvdBase, index: number, array: ScvdBase[]) => boolean): ScvdBase[] {
        return this._children.filter(predicate);
    }

    public hasChildren(): boolean {
        return this._children.length > 0;
    }

    // Member function available to all ScvdItems and derived classes
    public resolveAndLink(_resolveFunc: ResolveSymbolCb): boolean {
        // Default implementation does nothing, can be overridden by subclasses
        return false;
    }

    public applyInit(): boolean {
        // Default implementation does nothing, can be overridden by subclasses
        return true;
    }

    public get parent(): ScvdBase | undefined {
        return this._parent;
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

    // Workers
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

    // expanded values
    public async getValue(): Promise<string | number | undefined> {
        return undefined;   // TODO: change to undefined to indicate no value
    }

    public async setValue(val: number | string): Promise<number | string | undefined> {
        return val;
    }

    private getLineNoInfo(item: ScvdBase | undefined): string | undefined {
        if(item === undefined) {
            return undefined;
        }
        const lineNo = item.lineNo;
        if(lineNo === undefined) {
            return this.getLineNoInfo(item.parent);
        }
        return lineNo;
    }

    public getLineInfoStr(): string {
        let lineInfo = '[';
        const lineNo = this.getLineNoInfo(this);
        if(lineNo !== undefined) {
            lineInfo += `Line: ${lineNo} `;
        }
        if(this.tag !== undefined) {
            lineInfo += `Tag: ${this.tag} `;
        }
        lineInfo += ']';
        return lineInfo;
    }

    public getLineNoStr(): string {
        const lineNo = this.getLineNoInfo(this);
        return lineNo !== undefined ? lineNo : '';
    }

    protected sortByLine(a: ScvdBase, b: ScvdBase): number {
        const aLineNum = Number(a.lineNo);
        const bLineNum = Number(b.lineNo);
        const aLine = Number.isNaN(aLineNum) ? -1 : aLineNum;
        const bLine = Number.isNaN(bLineNum) ? -1 : bLineNum;
        return aLine - bLine;
    }

    public writeAt(byteOffset: number, widthBits: number, value: number | string): number | string | undefined {
        console.error(`WriteAt not implemented: item=${this.classname}: ${this.getDisplayLabel()}, offset=${byteOffset}, width=${widthBits}, value=${value}`);
        return undefined;
    }

    public readAt(byteOffset: number, widthBits: number): number | string | undefined {
        console.error(`ReadAt not implemented: item=${this.classname}: ${this.getDisplayLabel()}, offset=${byteOffset}, width=${widthBits}`);
        return undefined;
    }

    public getTargetSize(): number | undefined {
        console.error(`GetTargetSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public getTypeSize(): number | undefined {
        console.error(`GetTypeSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public getVirtualSize(): number | undefined {
        console.error(`GetVirtualSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public getIsPointer(): boolean {
        console.error(`GetIsPointer not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return false;
    }
    public async getArraySize(): Promise<number | undefined> {
        return Promise.resolve(undefined); // default
    }

    // member’s byte offset
    public async getMemberOffset(): Promise<number | undefined> {
        console.error(`GetMemberOffset not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    public getElementBitWidth(): number | undefined {
        console.error(`GetElementBitWidth not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    public getValueType(): string | undefined {
        console.error(`GetValueType not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    // base implementation assumes not a pointer ref
    public isPointerRef(): boolean {
        return false;
    }

    // ------------  GUI Interface Begin ------------
    public async getGuiName(): Promise<string | undefined> {
        return this.name;
    }

    public async getGuiValue(): Promise<string | undefined> {
        const val = await this.getValue();
        if (val !== undefined) {
            if(typeof val === 'number') {
                return val.toString();
            } else if(typeof val === 'string') {
                return val;
            }
        }
        return undefined;
    }

    public getGuiConditionResult(): boolean {
        return true;    // use getConditionResult() later
    }

    public getGuiLineInfo(): string {
        return this.getLineInfoStr();
    }

    // ------------  GUI Interface End ------------


    public getDisplayLabel(): string {
        const displayName = this.name ?? this.info;
        if(displayName && displayName.length > 0) {
            return displayName;
        }
        if(this.tag) {
            return `${this.tag} (line ${this.getLineNoStr()})`;
        }
        return `${this.classname} (line ${this.getLineNoStr()})`;
    }

}
