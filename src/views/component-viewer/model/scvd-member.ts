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

// https://arm-software.github.io/CMSIS-View/main/elem_member.html

import { NumberType, NumberTypeInput } from './number-type';
import { ScvdDataType } from './scvd-data-type';
import { ScvdEnum } from './scvd-enum';
import { ScvdExpression } from './scvd-expression';
import { Json, ScvdBase } from './scvd-base';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';

// Offset to base address in [Bytes]. Use the uVision debug dialog Symbols to find the offset. You can use Expressions.
// For imported members, the offset is recalculated. Refer to the description of attribute import in typedef.
export class ScvdMember extends ScvdBase {
    private _type: ScvdDataType | undefined;
    private _offset: ScvdExpression | undefined;
    private _size: number | undefined;
    private _enum: ScvdEnum[] = [];

    constructor(
        parent: ScvdBase | undefined,
    ) {
        super(parent);
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.type = getStringFromJson(xml.type);
        this.offset = getStringFromJson(xml.offset);
        this.size = getStringFromJson(xml.size);

        const enums = getArrayFromJson(xml.enum);
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
        if(value !== undefined) {
            this._offset = new ScvdExpression(this, value, 'offset');
        }
    }

    public get size(): number | undefined {
        return this._size;
    }

    public set size(value: NumberTypeInput | undefined) {
        if(value !== undefined) {
            this._size = new NumberType(value).value;
        }
    }

    public getTypeSize(): number | undefined {
        return this._type?.getTypeSize();
    }

    public getVirtualSize(): number | undefined {
        return this.getTargetSize();
    }

    public getIsPointer(): boolean {
        return this.type?.getIsPointer() ?? false;
    }

    // if size is set, this is the size in byte to be read from target
    public getTargetSize(): number | undefined {
        const isPointer = this.getIsPointer();
        if(isPointer) {
            return 4;   // pointer size
        }
        return this.size ?? this.getTypeSize();
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
    public getMember(_property: string): ScvdBase | undefined {
        const type = this._type;
        if(type !== undefined) {
            const typeObj = type.getMember(_property);
            return typeObj;
        }
        return undefined;
    }

    // member’s byte offset
    public async getMemberOffset(): Promise<number | undefined> {
        const offsetExpr = this._offset;
        if (offsetExpr !== undefined) {
            const offsetValue = await offsetExpr.getValue();
            if (typeof offsetValue === 'number') {
                return offsetValue;
            }
        }
        return 0;   // TODO: default?
    }

    public isPointerRef(): boolean {
        const type = this._type?.type;
        if(type !== undefined) {
            return type.isPointer;
        }
        return false;
    }

    public getValueType(): string | undefined {
        return this.type?.getValueType();
    }
}
