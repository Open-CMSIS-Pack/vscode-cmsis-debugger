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

import { ResolveSymbolCb, ResolveType } from '../resolver';
import { ScvdNode } from './scvd-node';
import { ScvdTypedef } from './scvd-typedef';

// https://arm-software.github.io/CMSIS-View/main/data_type.html#scalar_data_type

// The following scalar data types are supported and can be used in read, typedef, and var elements.
// read and var also support arrays based on scalar data types.
const ScvdScalarDataTypeMap: Record<string, [number, string]> = {
    'uint8_t': [8, 'unsigned char'],
    'int8_t': [8, 'signed char'],
    'uint16_t': [16, 'unsigned short'],
    'int16_t': [16, 'signed short'],
    'uint32_t': [32, 'unsigned int'],
    'int32_t': [32, 'signed int'],
    'uint64_t': [64, 'unsigned long long'],
    'int64_t': [64, 'signed long long'],
    'float': [32, 'single precision floating number'],
    'double': [64, 'double precision floating number'],
};

export class ScvdDataType extends ScvdNode {
    private _type: ScvdScalarDataType | ScvdComplexDataType | undefined;

    constructor(
        parent: ScvdNode | undefined,
        type: string | undefined
    ) {
        super(parent);
        this.type = type;
    }

    public override get classname(): string {
        return 'ScvdDataType';
    }

    public get type(): ScvdScalarDataType | ScvdComplexDataType | undefined {
        return this._type;
    }

    public set type(type: string | undefined) {
        if (typeof type === 'string') {
            const typeStr = type.replace(/\*/g, '').trim();
            Object.keys(ScvdScalarDataTypeMap).forEach(element => { // test, then create object
                if (element === typeStr) {
                    this._type = new ScvdScalarDataType(this, type);
                }
            });
            if ( this._type === undefined) { // not a scalar type, create complex type
                this._type = new ScvdComplexDataType(this, type);
            }
        }
    }

    public override getMember(property: string): ScvdNode | undefined {
        return this._type?.getMember(property);
    }

    public override getTypeSize(): number | undefined {
        const size = this._type?.getTypeSize();
        return size;
    }

    public override getIsPointer(): boolean {
        return this._type?.getIsPointer() ?? false;
    }

    public override getVirtualSize(): number | undefined {
        return this._type?.getVirtualSize();
    }

    public override getValueType(): string | undefined {
        const isPointer = this.getIsPointer();
        if (isPointer) {
            return 'uint32_t';
        }

        const type = this._type;
        if (type !== undefined) {
            const scalarType = type.castToDerived(ScvdScalarDataType);
            const typeStr = scalarType?.type;
            if (typeStr !== undefined) {
                return typeStr;
            }
        }
        return undefined;
    }
}


export class ScvdScalarDataType extends ScvdNode {
    private _type: string | undefined;
    private _isPointer: boolean = false;

    constructor(
        parent: ScvdNode | undefined,
        type: string | undefined
    ) {
        super(parent);
        if (typeof type === 'string') {
            const isPointer = type.indexOf('*') === 0;
            if (isPointer) {
                this.isPointer = true;
            }

            const typeStr = type.replace(/\*/g, '').trim();
            Object.keys(ScvdScalarDataTypeMap).forEach(element => {
                if (element === typeStr) {
                    this._type = element;
                }
            });
        }
    }

    public override get classname(): string {
        return 'ScvdScalarDataType';
    }

    public get isPointer(): boolean {
        return this._isPointer;
    }
    private set isPointer(value: boolean) {
        this._isPointer = value;
    }


    public override getTypeSize(): number | undefined {
        const info = this.type && ScvdScalarDataTypeMap[this.type];
        const value = info ? info[0]: undefined;
        return value ? value / 8 : undefined;
    }

    public override getIsPointer(): boolean {
        return this.isPointer;
    }

    public override getVirtualSize(): number | undefined {
        return this.getTypeSize();
    }

    public get type(): string | undefined {
        return this._type;
    }



}

export class ScvdComplexDataType extends ScvdNode{
    private _typeName: string | undefined;
    private _type: ScvdTypedef | undefined;
    private _isPointer: boolean = false;

    constructor(
        parent: ScvdNode | undefined,
        typeName: string | undefined
    ) {
        super(parent);
        this.typeName = typeName;
    }

    public override get classname(): string {
        return 'ScvdComplexDataType';
    }

    private set typeName(value: string | undefined) {
        this._typeName = value;
    }

    public get typeName(): string | undefined {
        return this._typeName;
    }

    public get isPointer(): boolean {
        return this._isPointer;
    }
    private set isPointer(value: boolean) {
        this._isPointer = value;
    }

    public override getTypeSize(): number | undefined {
        const sizeInBytes = this._type?.getTypeSize();
        if (sizeInBytes !== undefined) {
            return sizeInBytes;
        }
        return undefined;
    }

    public override getIsPointer(): boolean {
        return this.isPointer;
    }

    public override getVirtualSize(): number | undefined {
        return this._type?.getVirtualSize();
    }

    public override resolveAndLink(resolveFunc: ResolveSymbolCb): boolean {
        const typeName = this.typeName?.replace(/\*/g, '').trim();
        if (typeName === undefined) {
            return false;
        }
        const isPointer = (this.typeName?.indexOf('*') === 0);
        if (isPointer) {
            this.isPointer = true;
        }

        const item = resolveFunc(typeName, ResolveType.localType);
        if (item === undefined || !(item instanceof ScvdTypedef)) {
            console.error('Failed to resolve complex data type:', typeName);
            return false;
        }
        this._type = item;
        return true;
    }

    public override getMember(property: string): ScvdNode | undefined {
        return this._type?.getMember(property);
    }




}
