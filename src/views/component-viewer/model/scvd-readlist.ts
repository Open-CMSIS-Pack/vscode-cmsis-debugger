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

// https://arm-software.github.io/CMSIS-View/main/elem_readlist.html

import { NumberType, NumberTypeInput } from './number-type';
import { ScvdExpression } from './scvd-expression';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdRead } from './scvd-read';
import { getStringFromJson } from './scvd-utils';
import { componentViewerLogger } from '../../../logger';
import { ResolveSymbolCb, ResolveType } from '../resolver';


// readlist defines a list of variables or arrays. The first instance of <readlist name="var"> will define 'var',
// the following use of <readlist name="var"> will use the definition.

export class ScvdReadList extends ScvdRead {
    private _count: ScvdExpression | undefined; // default is 1
    private _next: string | undefined;  // member name for the .next pointer
    private _init: number = 0; // When init="1" previous read items in the list are discarded. Default value is 0.
    private _based: number = 0; // When based="1" the attribute symbol and attribute offset specifies a pointer (or pointer array). Default value is 0.

    static readonly READ_SIZE_MIN = 1;
    static readonly READ_SIZE_MAX = 1024;

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdReadList';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.count = getStringFromJson(xml.count);
        this.next = getStringFromJson(xml.next);
        this.init = getStringFromJson(xml.init);
        this.based = getStringFromJson(xml.based);

        return super.readXml(xml);
    }


    public set count(value: string | undefined) {
        if (value !== undefined) {
            this._count = new ScvdExpression(this, value, 'count');
        }
    }
    public get count(): ScvdExpression | undefined {
        return this._count;
    }

    public set next(name: string | undefined) {
        this._next = name;
    }
    public get next(): string | undefined {
        return this._next;
    }

    public set init(value: NumberTypeInput | undefined) {
        if (value !== undefined) {
            this._init = new NumberType(value).value;
        }
    }
    public get init(): number {
        return this._init;
    }

    public set based(value: NumberTypeInput | undefined) {
        if (value !== undefined) {
            this._based = new NumberType(value).value;
        }
    }
    public get based(): number {
        return this._based;
    }

    public override async getTargetSize(): Promise<number | undefined> {
        if (this.based === 1) {
            return 4;
        }
        const typeSize = this.type?.getTypeSize();
        if (typeSize !== undefined) {
            return typeSize;
        }
        return super.getTargetSize();
    }

    // A readlist is considered a pointer if based="1"
    public override getIsPointer(): boolean {
        return this.based === 1;
    }

    public override resolveAndLink(resolveFunc: ResolveSymbolCb): boolean {
        if (this._next !== undefined) {
            // Ensure the referenced member exists; log if missing
            const typedef = resolveFunc(this._next, ResolveType.localType);
            const member = typedef ? resolveFunc(this._next, ResolveType.localMember, typedef) : undefined;
            if (member === undefined && typedef) {
                componentViewerLogger.error(`Line: ${this.getLineNoStr()}: Resolving readlist .next: could not find member '${this._next}' in typedef '${typedef.name}'`);
            }
        }
        return super.resolveAndLink(resolveFunc);
    }

    public override applyInit(): boolean {
        if (this.init === 1) {
            // Discard previous read objects
            return true;
        }

        return true;
    }

    public async getCount(): Promise<number | undefined> {
        if (this._count === undefined) {
            return undefined;
        }
        const v = await this._count.getValue();
        const num = v !== undefined ? Number(v) : undefined;
        if (num === undefined || Number.isNaN(num)) {
            return undefined;
        }
        if (num < ScvdReadList.READ_SIZE_MIN) {
            return ScvdReadList.READ_SIZE_MIN;
        }
        if (num > ScvdReadList.READ_SIZE_MAX) {
            return ScvdReadList.READ_SIZE_MAX;
        }
        return num;
    }

    public getNext(): string | undefined {
        return this._next;
    }

    public getInit(): number {
        return this._init;
    }

}
