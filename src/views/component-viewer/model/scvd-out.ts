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

import { ScvdDataType } from './scvd-data-type';
import { ScvdExpression } from './scvd-expression';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdCondition } from './scvd-condition';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';
import { ScvdItem } from './scvd-item';
import { ScvdListOut } from './scvd-list-out';

export class ScvdOut extends ScvdNode {
    private _value: ScvdExpression | undefined; // name._value — expression that evaluates to the value of the output.
    private _type: ScvdDataType | undefined;
    private _cond: ScvdCondition | undefined;
    private _item: ScvdItem[] = [];
    private _listOut: ScvdListOut[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.value = getStringFromJson(xml.value);
        this.type = getStringFromJson(xml.type);
        this.cond = getStringFromJson(xml.cond);

        const item = getArrayFromJson(xml.item);
        item?.forEach((it: Json) => {
            const newItem = this.addItem();
            newItem.readXml(it);
        });

        const list = getArrayFromJson(xml.list);
        list?.forEach((it: Json) => {
            const newList = this.addList();
            newList.readXml(it);
        });

        return super.readXml(xml);
    }

    public set value(value: string | undefined) {
        if (value !== undefined) {
            this._value = new ScvdExpression(this, value, 'value');
        }
    }
    public get value(): ScvdExpression | undefined {
        return this._value;
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
    public get type(): ScvdDataType | undefined {
        return this._type;
    }

    public get cond(): ScvdCondition | undefined {
        return this._cond;
    }
    public set cond(value: string | undefined) {
        if (value !== undefined) {
            this._cond = new ScvdCondition(this, value);
            return;
        }
    }

    public override async getConditionResult(): Promise<boolean> {
        if (this._cond) {
            return await this._cond.getResult();
        }
        return super.getConditionResult();
    }

    public get item(): ScvdItem[] {
        return this._item;
    }
    public addItem(): ScvdItem {
        const newItem = new ScvdItem(this);
        this._item.push(newItem);
        return newItem;
    }

    public get list(): ScvdListOut[] {
        return this._listOut;
    }
    public addList(): ScvdListOut {
        const list = new ScvdListOut(this);
        this._listOut.push(list);
        return list;
    }

    public override getValueType(): string | undefined {
        return this.type?.getValueType();
    }

    // public getGuiChildren(): ScvdGuiInterface[] | undefined {
    //     const guiItems = this.item
    //         .filter(x => x.getGuiConditionResult())    // filter
    //         .sort(this.sortByLine);                 // sort in-place, returned
    //     return guiItems && guiItems.length > 0 ? guiItems : undefined;
    // }

    // public hasGuiChildren(): boolean {
    //     return this.item.length > 0 || this.list.length > 0;
    // }

}
