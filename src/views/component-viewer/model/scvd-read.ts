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

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html

import { NumberType, NumberTypeInput } from './number-type';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdEndian } from './scvd-endian';
import { ScvdExpression } from './scvd-expression';
import { ScvdCondition } from './scvd-condition';
import { ScvdSymbol } from './scvd-symbol';
import { ScvdDataType } from './scvd-data-type';
import { getStringFromJson } from './scvd-utils';

export class ScvdRead extends ScvdNode {
    private _type: ScvdDataType | undefined;
    private _size: ScvdExpression | undefined;
    private _symbol: ScvdSymbol | undefined;
    private _offset: ScvdExpression | undefined;
    private _const: boolean = false; // Variables with attribute const set to "1" are constants that are read only once after debugger start. Default value is 0.
    private _cond: ScvdCondition | undefined;
    private _endian: ScvdEndian | undefined;
    static readonly ARRAY_SIZE_MIN = 1;
    static readonly ARRAY_SIZE_MAX = 512;

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.type = getStringFromJson(xml.type);
        this.symbol = getStringFromJson(xml.symbol);
        this.offset = getStringFromJson(xml.offset);
        this.const = getStringFromJson(xml.const);
        this.cond = getStringFromJson(xml.cond);
        this.size = getStringFromJson(xml.size);
        this.endian = getStringFromJson(xml.endian);

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

    public set symbol(name: string | undefined) {
        if (this._symbol === undefined && name !== undefined) {
            this._symbol = new ScvdSymbol(this, name);
            return;
        }
    }

    public get symbol(): ScvdSymbol | undefined {
        return this._symbol;
    }

    public set offset(value: string | undefined) {
        if (value !== undefined) {
            this._offset = new ScvdExpression(this, value, 'offset');
            return;
        }
    }

    public get offset(): ScvdExpression | undefined {
        return this._offset;
    }

    public set const(value: NumberTypeInput | undefined) {
        if (value !== undefined) {
            this._const = new NumberType(value).value ? true : false;
        }
    }

    public get const(): boolean {
        return this._const;
    }

    public set cond(value: string | undefined) {
        if (value !== undefined) {
            this._cond = new ScvdCondition(this, value);
            return;
        }
    }

    public get cond(): ScvdCondition | undefined {
        return this._cond;
    }

    public override async getConditionResult(): Promise<boolean> {
        if (this._cond) {
            return await this._cond.getResult();
        }
        return super.getConditionResult();
    }

    public get size(): ScvdExpression | undefined {
        return this._size;
    }

    public override getTargetSize(): number | undefined {
        return this.type?.getTypeSize();
    }

    public override getVirtualSize(): number | undefined {
        return this.type?.getVirtualSize();
    }
    public override async getArraySize(): Promise<number | undefined> {
        const v = await this.size?.getValue();
        if (typeof v === 'bigint') {
            return Number(v);
        }
        if (typeof v === 'number') {
            return v;
        }
        return undefined;
    }

    public override getIsPointer(): boolean {
        return this.type?.getIsPointer() ?? false;
    }


    public set size(value: string | undefined) {
        if (value !== undefined) {
            this._size = new ScvdExpression(this, value, 'size');
            return;
        }
    }

    public get endian(): ScvdEndian | undefined {
        return this._endian;
    }
    public set endian(value: string | undefined) {
        if (value !== undefined) {
            if ( this._endian === undefined) {
                this._endian = new ScvdEndian(this, value);
                return;
            }
            this._endian.endian = value;
        }
    }

    public override getMember(property: string): ScvdNode | undefined {
        return this.type?.getMember(property);
    }

    public override getValueType(): string | undefined {
        return this.type?.getValueType();
    }

}
