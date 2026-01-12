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

// https://arm-software.github.io/CMSIS-View/main/elem_var.html

import { ScvdDataType } from './scvd-data-type';
import { ScvdExpression } from './scvd-expression';
import { Json, ScvdBase } from './scvd-base';
import { getStringFromJson } from './scvd-utils';
import { NumberType, NumberTypeInput } from './number-type';

export class ScvdVar extends ScvdBase {
    private _value: ScvdExpression | undefined;
    private _type: ScvdDataType | undefined;
    private _offset: ScvdExpression | undefined;
    private _size: number | undefined;


    constructor(
        parent: ScvdBase | undefined,
    ) {
        super(parent);
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.value = getStringFromJson(xml.value);
        this.type = getStringFromJson(xml.type);
        this.size = getStringFromJson(xml.size);

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

    public get size(): number | undefined {
        return this._size;
    }

    public set size(value: NumberTypeInput | undefined) {
        if(value !== undefined) {
            this._size = new NumberType(value).value;
        }
    }

    public async getValue(): Promise<number | undefined> {
        if (this._value === undefined) {
            return undefined;
        }
        const val = await this._value.getValue();
        if (typeof val === 'number') {
            return val;
        }
        return undefined;
    }

    public async setValue(val: number): Promise<number | undefined> {
        if (this._value === undefined) {
            return undefined;
        }
        const valExpr = this._value;
        if( valExpr === undefined) {
            return undefined;
        }
        await valExpr.setValue(val);
        return val;
    }

    public get type(): ScvdDataType | undefined {
        return this._type;
    }
    public set type(value: string | undefined) {
        if (value !== undefined) {
            if( this._type === undefined) {
                this._type = new ScvdDataType(this, value);
                return;
            }
            this._type.type = value;
        }
    }

    public getTypeSize(): number | undefined {
        return this.type?.getTypeSize();
    }

    public getVirtualSize(): number | undefined {
        return this.getTargetSize();
    }

    // TOIMPL: total size in bytes or type size?
    public getTargetSize(): number | undefined {
        const typeSize = this.getTypeSize();
        const elements = this.size ?? 1;
        if( typeSize !== undefined) {
            return typeSize * elements;
        }
        return elements;
    }

    public getIsPointer(): boolean {
        return this.type?.getIsPointer() ?? false;
    }

    public get offset(): ScvdExpression | undefined {
        return this._offset;
    }

    public set offset(value: string | undefined) {
        if(value !== undefined) {
            this._offset = new ScvdExpression(this, value, 'offset');
        }
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
        return 0;   // TOIMPL: default?
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

    public getElementRef(): ScvdBase | undefined {
        const typeObj = this._type;
        if(typeObj !== undefined) {
            return typeObj;
        }
        return undefined;
    }

    public getValueType(): string | undefined {
        return this.type?.getValueType();
    }

}
