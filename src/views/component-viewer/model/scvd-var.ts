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

// https://arm-software.github.io/CMSIS-View/main/elem_var.html

import { ScvdDataType } from './scvd-data-type';
import { ScvdEnum } from './scvd-enum';
import { ScvdExpression } from './scvd-expression';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';

export class ScvdVar extends ScvdNode {
    private _value: ScvdExpression | undefined;
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
        return 'ScvdVar';
    }

    public override configure(): boolean {
        this._size?.configure();
        return super.configure();
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.value = getStringFromJson(xml.value);
        this.type = getStringFromJson(xml.type);
        this.size = getStringFromJson(xml.size);

        const enums = getArrayFromJson<Json>(xml.enum);
        enums?.forEach(enumItem => {
            const newEnum = this.addEnum();
            newEnum.readXml(enumItem);
        });

        return super.readXml(xml);
    }

    public get value(): ScvdExpression | undefined {
        return this._value;
    }
    public set value(value: string | undefined) {
        if (value !== undefined) {
            this._value = new ScvdExpression(this, value, 'value');
        }
    }

    public get size(): ScvdExpression | undefined {
        return this._size;
    }

    public set size(value: ScvdExpression | string | undefined) {
        if (value !== undefined) {
            if (value instanceof ScvdExpression) {
                this._size = value;
            } else {
                this._size = new ScvdExpression(this, value, 'size');
            }
        }
    }

    public override async getValue(): Promise<number | bigint | undefined> {
        if (this._value === undefined) {
            return undefined;
        }
        const val = await this._value.getValue();
        if (typeof val === 'number' || typeof val === 'bigint') {
            return val;
        }
        return undefined;
    }

    public get type(): ScvdDataType | undefined {
        return this._type;
    }
    public set type(value: string | undefined) {
        if (value !== undefined) {
            if ( this._type === undefined) {
                this._type = new ScvdDataType(this, value);
                return;
            }
            this._type.type = value;
        }
    }

    public override getTypeSize(): number | undefined {
        return this.type?.getTypeSize();
    }

    public override async getVirtualSize(): Promise<number | undefined> {
        return this.getTargetSize();
    }

    // element size in bytes; array length is provided by getArraySize()
    public override async getTargetSize(): Promise<number | undefined> {
        if (this.getIsPointer()) {
            return 4;
        }
        const typeSize = this.getTypeSize();
        if (typeSize !== undefined) {
            return typeSize;
        }
        return 1;
    }

    public override async getArraySize(): Promise<number | undefined> {
        const sizeExpr = this.size;
        if (sizeExpr === undefined) {
            return 1;
        }
        const sizeValue = await sizeExpr.getValue();
        let count = typeof sizeValue === 'bigint' ? Number(sizeValue)
            : (typeof sizeValue === 'number' ? sizeValue : undefined);
        if (count === undefined || !Number.isFinite(count) || count < 1 || count > 1024) {
            console.error(this.getLineInfoStr(), `'${this.name ?? 'var'}': invalid size specified (1...1024)`);
            if (count !== undefined && count > 1024) {
                return 1024;
            }
            return 1;
        }
        return count;
    }

    public override getIsPointer(): boolean {
        return this.type?.getIsPointer() ?? false;
    }

    public get offset(): ScvdExpression | undefined {
        return this._offset;
    }

    public set offset(value: string | undefined) {
        if (value !== undefined) {
            this._offset = new ScvdExpression(this, value, 'offset');
        }
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


    // search a member (member, var) in typedef
    public override getMember(_property: string): ScvdNode | undefined {
        const type = this._type;
        if (type !== undefined) {
            const typeObj = type.getMember(_property);
            return typeObj;
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

    public override getValueType(): string | undefined {
        return this.type?.getValueType();
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

}
