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

import { componentViewerLogger } from '../../../logger';
import { ResolveSymbolCb } from '../resolver';
import { ExecutionContext } from '../scvd-eval-context';
import { getLineNumberFromJson, getStringField } from './scvd-utils';
import { Json, ScvdBase } from './scvd-base';
import { ScvdNodeSymbolCache } from './scvd-node-cache';

/**
 * Model-aware node that carries symbol resolution, execution context hooks and
 * size/value helpers. Keeps ScvdBase focused on tree wiring.
 */
export abstract class ScvdNode extends ScvdBase {
    private _symbolsCache = new ScvdNodeSymbolCache();

    public override get parent(): ScvdNode | undefined {
        return super.parent as ScvdNode | undefined;
    }

    public override get children(): ScvdNode[] {
        return super.children as ScvdNode[];
    }

    constructor(parent: ScvdBase | undefined) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdNode';
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            this.tag = 'XML undefined';
            return false;
        }
        this.lineNo = getLineNumberFromJson(xml);
        const tag = getStringField(xml, '#Name') ?? getStringField(xml, '#name');
        if (tag === undefined) {
            if (Array.isArray(xml)) {
                const first = xml[0] as Json | undefined;
                const subTag = getStringField(first, '#Name') ?? getStringField(first, '#name') ?? getStringField(first, 'tag');
                if (subTag !== undefined) {
                    this.tag = subTag + '[]';
                } else {
                    this.tag = 'Array[]';
                }
            } else if (this.tag === undefined) {
                this.tag = 'unknown-tag';
            }
        } else {
            this.tag = tag;
        }
        this.name = getStringField(xml, 'name');
        this.info = getStringField(xml, 'info');

        return true;
    }

    public override addToSymbolContext(name: string | undefined, symbol: ScvdNode): void {
        this.parent?.addToSymbolContext(name, symbol);
    }

    // search for symbol in parent chain
    public override getSymbol(name: string): ScvdNode | undefined {
        return this.parent?.getSymbol(name);
    }

    // search a member (member, var) in typedef
    public getMember(_property: string): ScvdNode | undefined {
        return undefined;
    }

    public getElementRef(): ScvdNode | undefined {
        return undefined;
    }

    public setExecutionContext(_executionContext: ExecutionContext) {
    }

    // default condition always true
    public getConditionResult(): Promise<boolean> {
        return Promise.resolve(true);
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

    // expanded values
    public async getValue(): Promise<string | number | bigint | Uint8Array | undefined> {
        return undefined;   // TOIMPL: change to undefined to indicate no value
    }

    public async setValue(val: number | string): Promise<number | string | undefined> {
        return val;
    }

    public writeAt(byteOffset: number, widthBits: number, value: number | string): number | string | undefined {
        componentViewerLogger.error(`WriteAt not implemented: item=${this.classname}: ${this.getDisplayLabel()}, offset=${byteOffset}, width=${widthBits}, value=${value}`);
        return undefined;
    }

    public readAt(byteOffset: number, widthBits: number): number | string | undefined {
        componentViewerLogger.error(`ReadAt not implemented: item=${this.classname}: ${this.getDisplayLabel()}, offset=${byteOffset}, width=${widthBits}`);
        return undefined;
    }

    public async getTargetSize(): Promise<number | undefined> {
        componentViewerLogger.error(`GetTargetSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public getTypeSize(): number | undefined {
        componentViewerLogger.error(`GetTypeSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public async getVirtualSize(): Promise<number | undefined> {
        componentViewerLogger.error(`GetVirtualSize not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }
    public getIsPointer(): boolean {
        componentViewerLogger.error(`GetIsPointer not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return false;
    }
    public async getArraySize(): Promise<number | undefined> {
        return Promise.resolve(undefined); // default
    }

    // member’s byte offset
    public async getMemberOffset(): Promise<number | undefined> {
        componentViewerLogger.error(`GetMemberOffset not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    public getElementBitWidth(): number | undefined {
        componentViewerLogger.error(`GetElementBitWidth not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    public getValueType(): string | undefined {
        componentViewerLogger.error(`GetValueType not implemented: item=${this.classname}: ${this.getDisplayLabel()}`);
        return undefined;
    }

    // base implementation assumes not a pointer ref
    public isPointerRef(): boolean {
        return false;
    }

    // ------------  GUI Interface Begin ------------
    public getGuiName(): Promise<string | undefined> {
        return Promise.resolve(this.name);
    }

    public async getGuiValue(): Promise<string | undefined> {
        const val = await this.getValue();
        if (val !== undefined) {
            if (typeof val === 'number' || typeof val === 'bigint') {
                return val.toString();
            } else if (typeof val === 'string') {
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

    protected symbolsCache(key: string, value: ScvdNode | undefined): ScvdNode | undefined {
        const cached = this._symbolsCache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        if (value !== undefined) {
            this._symbolsCache.set(key, value);
            return value;
        }
        return undefined;
    }

    protected clearSymbolsCache(): void {
        this._symbolsCache.clear();
    }

    protected clearSymbolCachesRecursive(): void {
        this.clearSymbolsCache();
        this.children.forEach(child => child.clearSymbolCachesRecursive());
    }
}
