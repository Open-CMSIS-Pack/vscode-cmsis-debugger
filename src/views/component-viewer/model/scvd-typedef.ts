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

// https://arm-software.github.io/CMSIS-View/main/elem_typedefs.html

import { componentViewerLogger } from '../../../logger';
import { ScvdExpression } from './scvd-expression';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdMember } from './scvd-member';
import { ScvdSymbol } from './scvd-symbol';
import { ScvdVar } from './scvd-var';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';
import { ScvdTypedefFieldCache } from './scvd-typedef-cache';

// Container
export class ScvdTypedefs extends ScvdNode {
    private _typedef: ScvdTypedef[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdTypedefs';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }
        const typedefs = getArrayFromJson<Json>(xml.typedef);
        typedefs?.forEach( (v: Json) => {
            const varItem = this.addTypedef();
            varItem.readXml(v);
        });

        return super.readXml(xml);
    }

    public get typedef(): ScvdTypedef[] {
        return this._typedef;
    }

    public addTypedef(): ScvdTypedef {
        const typedefItem = new ScvdTypedef(this);
        this._typedef.push(typedefItem);
        return typedefItem;
    }

    public async calculateTypedefs(): Promise<void> {
        const typedefs = this.typedef;
        if (typedefs === undefined || typedefs.length === 0) {
            return;
        }

        for (const typedef of typedefs) {
            await typedef.calculateTypedef();
        }
    }

}

/*
    Member-import (Attribute import="symbol-name" from SCVD xml):
    Name of a symbol in the user application which is loaded into the debugger.
    The underlaying data type of this symbol is used to
    recalculate the value of the attribute size of this typedef element.
    For member elements with no explicit attribute offset, the offset value of
    matching member is set. If the member is not part of the symbol in the user
    application the attribute offset value is set to -1.
    __Offset_of can be used to check this value.

    Currently this is not supported due to MS-DAP restrictions.
*/

export class ScvdTypedef extends ScvdNode {
    private _size: ScvdExpression | undefined;  // size is optional and recalculated if import is set
    private _import: ScvdSymbol | undefined;
    private _member: ScvdMember[] = [];     // target system variable
    private _var: ScvdVar[] = [];       // local SCVD variable
    private _fieldByNameCache = new ScvdTypedefFieldCache();
    private _virtualSize: number | undefined;
    private _targetSize: number | undefined;

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdTypedef';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.size = getStringFromJson(xml.size);
        this.import = getStringFromJson(xml.import);

        const members = getArrayFromJson<Json>(xml.member);
        members?.forEach( (v: Json) => {
            const memberItem = this.addMember();
            memberItem.readXml(v);
        });
        this._member.sort(this.sortByLine);

        const vars = getArrayFromJson<Json>(xml.var);
        vars?.forEach( (v: Json) => {
            const varItem = this.addVar();
            varItem.readXml(v);
        });

        this._var.sort(this.sortByLine);

        return super.readXml(xml);
    }

    public override getTypeSize(): number | undefined {
        return this.targetSize;
    }

    // 1. Get the virtual size including vars
    // 2. If not set, return the size expression value
    public override async getVirtualSize(): Promise<number | undefined> {
        const virtualSize = this.virtualSize;    // calculated size including vars
        if (virtualSize !== undefined) {
            return virtualSize;
        }
        return this.getTypeSize();
    }

    public override getIsPointer(): boolean {
        return false;
    }

    public override async getTargetSize(): Promise<number | undefined> {
        if (this.targetSize !== undefined) {
            return this.targetSize;
        }
        const sizeValue = await this.size?.getValue();
        let numericSize: number | undefined;
        if (typeof sizeValue === 'bigint') {
            numericSize = Number(sizeValue);
        } else if (typeof sizeValue === 'number') {
            numericSize = sizeValue;
        }
        if (numericSize === undefined || Number.isNaN(numericSize)) {
            return undefined;
        }
        return numericSize;
    }


    private get targetSize(): number | undefined {
        return this._targetSize;
    }
    private set targetSize(value: number | undefined) {
        this._targetSize = value;
    }

    public get size(): ScvdExpression | undefined {
        return this._size;
    }
    public set size(value: string | undefined) {
        if (value !== undefined) {
            this._size = new ScvdExpression(this, value, 'size');
        }
    }

    public get virtualSize(): number | undefined {
        return this._virtualSize;
    }
    public set virtualSize(value: number | undefined) {
        this._virtualSize = value;
    }

    public set import(value: string | undefined) {
        if (value !== undefined) {
            if ( this._import === undefined) {
                this._import = new ScvdSymbol(this, value);
                return;
            }
            this._import.name = value;
        }
    }
    public get import(): ScvdSymbol | undefined {
        return this._import;
    }

    public addMember(): ScvdMember {
        const memberItem = new ScvdMember(this);
        this._member.push(memberItem);
        return memberItem;
    }
    public get member(): ScvdMember[] {
        return this._member;
    }

    public addVar(): ScvdVar {
        const varItem = new ScvdVar(this);
        this._var.push(varItem);
        return varItem;
    }
    public get var(): ScvdVar[] {
        return this._var;
    }

    public override getMember(property: string): ScvdNode | undefined {
        const cached = this._fieldByNameCache.get(property);
        if (cached) {
            return this.symbolsCache(property, cached);
        }
        const found = this._member.find((member) => member.name === property)
            ?? this._var.find((variable) => variable.name === property);
        if (found?.name !== undefined) {
            this._fieldByNameCache.set(found.name, found);
        }
        return this.symbolsCache(property, found);
    }

    private rebuildFieldCaches(): void {
        this._fieldByNameCache.rebuild(this._member, this._var);
    }

    public async calculateTypedef() {
        if (this.import !== undefined) {
            await this.import.fetchSymbolInformation();
        }

        await this.calculateOffsets();
        this.rebuildFieldCaches();
    }

    public async calculateOffsets() { // move to after starting debug session
        let currentNextOffset = 0;
        for (const member of this._member) {
            const memberOffset = member.offset;
            if (memberOffset !== undefined) {   // ---- offset expression is set ----
                const offsetVal = await memberOffset.getValue();
                if (offsetVal !== undefined) {   // TOIMPL: on error?!
                    const numOffset = Number(offsetVal);
                    if (numOffset > currentNextOffset) {
                        currentNextOffset = numOffset;  // store offset
                    }
                }
            } else {    // ---- offset expression is not set ----
                if (this.import !== undefined) { // import from Debugger
                    const offset = this.import.getOffset(member.name);
                    if (offset !== undefined) {
                        member.offset = offset.toString();
                    }
                } else {
                    member.offset = currentNextOffset.toString();  // set current offset
                    componentViewerLogger.error(`ScvdTypedef.calculateOffsets: no offset defined for member: ${member.name} in typedef: ${this.getDisplayLabel()}`);
                }
                member.offset?.configure();
            }

            const memberSize = await member.getTargetSize();
            const memberCount = await member.getArraySize();
            if (memberSize !== undefined) {   // TOIMPL: on error?!
                currentNextOffset += memberSize * (memberCount ?? 1);
            }
        }

        const sizeVal = this.size ? await this.size.getValue() : undefined;
        const size = sizeVal !== undefined ? Number(sizeVal) : undefined;
        if (size !== undefined) {    // if size is defined, use it
            this.targetSize = size;

            if (currentNextOffset > size) {
                componentViewerLogger.error(`ScvdTypedef.calculateOffsets: typedef size (${size}) smaller than members size (${currentNextOffset}) for ${this.getDisplayLabel()}`);
            } else if (currentNextOffset < size) {   // adjust to typedef size if padding is included
                currentNextOffset = size;
            }
        } else {
            this.targetSize = currentNextOffset;
        }

        for (const varItem of this.var) {
            const elementSize = (await varItem.getTargetSize()) ?? 4; // default size 4 bytes
            const arraySize = await varItem.getArraySize();
            const varSize = elementSize * (arraySize ?? 1);
            varItem.offset = currentNextOffset.toString();  // set current offset
            varItem.offset?.configure();
            currentNextOffset += varSize;
        }
        this.virtualSize = currentNextOffset;
    }
}
