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

// https://arm-software.github.io/CMSIS-View/main/elem_member.html

import { componentViewerLogger } from '../../../logger';
import { ScvdDataType } from './scvd-data-type';
import { ScvdEnum } from './scvd-enum';
import { ScvdExpression } from './scvd-expression';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';

// Offset to base address in [Bytes]. Use the uVision debug dialog Symbols to find the offset. You can use Expressions.
// For imported members, the offset is recalculated. Refer to the description of attribute import in typedef.
export class ScvdMember extends ScvdNode {
    private _type: ScvdDataType | undefined;
    private _offset: ScvdExpression | undefined;
    private _size: ScvdExpression | undefined;
    private _enum: ScvdEnum[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdMember';
    }

    public override configure(): boolean {
        this._size?.configure();
        return super.configure();
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.type = getStringFromJson(xml.type);
        this.offset = getStringFromJson(xml.offset);
        this.size = getStringFromJson(xml.size);

        const enums = getArrayFromJson<Json>(xml.enum);
        enums?.forEach(enumItem => {
            const newEnum = this.addEnum();
            newEnum.readXml(enumItem);
        });

        return super.readXml(xml);
    }

    public get type(): ScvdDataType | undefined {
        return this._type;
    }

    public set type(value: string | undefined) {
        if (value !== undefined) {
            this._type = new ScvdDataType(this, value);
        }
    }

    public get offset(): ScvdExpression | undefined {
        return this._offset;
    }

    public set offset(value: string | undefined) {
        if (value !== undefined) {
            this._offset = new ScvdExpression(this, value, 'offset');
        }
    }

    public get size(): ScvdExpression | undefined {
        return this._size;
    }

    public set size(value: string | undefined) {
        if (value !== undefined) {
            this._size = new ScvdExpression(this, value, 'size');
        }
    }

    public override getIsPointer(): boolean {
        return this.type?.getIsPointer() ?? false;
    }

    public override getTypeSize(): number | undefined {
        return this._type?.getTypeSize();
    }

    public override async getVirtualSize(): Promise<number | undefined> {
        return this.getTargetSize();
    }

    public override async getArraySize(): Promise<number | undefined> {
        const sizeExpr = this.size;
        if (sizeExpr === undefined) {
            return 1;
        }
        const sizeValue = await sizeExpr.getValue();
        const numericValue = typeof sizeValue === 'bigint' ? Number(sizeValue)
            : (typeof sizeValue === 'number' ? sizeValue : undefined);
        if (numericValue !== undefined && !Number.isNaN(numericValue)) {
            if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 65536) {
                componentViewerLogger.error(this.getLineInfoStr(), `'${this.name ?? 'member'}': invalid size specified`);
                return 1;
            }
            return numericValue;
        }
        componentViewerLogger.error(this.getLineInfoStr(), `'${this.name ?? 'member'}': invalid size specified`);
        return 1;
    }

    public override async getTargetSize(): Promise<number | undefined> {
        if (this.getIsPointer()) {
            return 4;
        }
        const typeSize = this.getTypeSize();
        if (typeSize === undefined) {
            return undefined;
        }
        return typeSize;
    }

    public addEnum(): ScvdEnum {
        const lastEnum = this._enum[this._enum.length - 1];
        const enumItem = new ScvdEnum(this, lastEnum);
        this._enum.push(enumItem);
        return enumItem;
    }
    public get enum(): ScvdEnum[] {
        return this._enum;
    }

    public async getEnum(value: number): Promise<ScvdEnum | undefined> {
        for (const item of this._enum) {
            const enumVal = await item.value?.getValue();
            if (typeof enumVal === 'number' && enumVal === value) {
                return item;
            }
        }
        return undefined;
    }

    // search a member (member, var) in typedef
    public override getMember(_property: string): ScvdNode | undefined {
        const cached = this.symbolsCache(_property, undefined);
        if (cached !== undefined) {
            return cached;
        }
        const type = this._type;
        if (type !== undefined) {
            const typeObj = type.getMember(_property);
            return this.symbolsCache(_property, typeObj);
        }
        return undefined;
    }

    public override getElementRef(): ScvdNode | undefined {
        const typeObj = this._type;
        if (typeObj !== undefined) {
            return typeObj;
        }
        return undefined;
    }

    // member’s byte offset
    public override async getMemberOffset(): Promise<number | undefined> {
        const offsetExpr = this._offset;
        if (offsetExpr !== undefined) {
            const offsetValue = await offsetExpr.getValue();
            if (typeof offsetValue === 'number') {
                return offsetValue;
            }
        }
        return 0;   // TOIMPL: default?
    }

    public override isPointerRef(): boolean {
        const type = this._type?.type;
        if (type !== undefined) {
            return type.isPointer;
        }
        return false;
    }

    public override getValueType(): string | undefined {
        return this.type?.getValueType();
    }
}
