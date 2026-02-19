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

import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdPrint } from './scvd-print';
import { ScvdValueOutput } from './scvd-value-output';
import { ScvdCondition } from './scvd-condition';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';
import { ScvdListOut } from './scvd-list-out';

export class ScvdItem extends ScvdNode {
    private _property: ScvdValueOutput | undefined;
    private _value: ScvdValueOutput | undefined;
    private _cond: ScvdCondition | undefined;
    private _bold: ScvdCondition | undefined;
    private _alert: ScvdCondition | undefined;
    private _item: ScvdItem[] = []; // Array of child items
    private _listOut: ScvdListOut[] = []; // Array of child lists
    private _print: ScvdPrint[] = []; // Array of child prints

    constructor(
        parent: ScvdNode | undefined,
        cond?: string,
        bold?: string,
        alert?: string,
    ) {
        super(parent);
        if (cond !== undefined) {
            this._cond = new ScvdCondition(this, cond);
        }
        if (bold !== undefined) {
            this._bold = new ScvdCondition(this, bold);
        }
        if (alert !== undefined) {
            this._alert = new ScvdCondition(this, alert);
        }
    }

    public override get classname(): string {
        return 'ScvdItem';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.property = getStringFromJson(xml.property);
        this.value = getStringFromJson(xml.value);
        this.cond = getStringFromJson(xml.cond);
        this.bold = getStringFromJson(xml.bold);
        this.alert = getStringFromJson(xml.alert);

        const item = getArrayFromJson<Json>(xml.item);
        item?.forEach( (v: Json) => {
            const newItem = this.addItem();
            newItem.readXml(v);
        });

        const listOut = getArrayFromJson<Json>(xml.list);
        listOut?.forEach( (v: Json) => {
            const newListOut = this.addListOut();
            newListOut.readXml(v);
        });

        const print = getArrayFromJson<Json>(xml.print);
        print?.forEach( (v: Json) => {
            const printItem = this.addPrint();
            printItem.readXml(v);
        });

        return super.readXml(xml);
    }

    public set property(value: string | undefined) {
        if (value !== undefined) {
            this._property = new ScvdValueOutput(this, value, 'property');
            return;
        }
    }
    public get property(): ScvdValueOutput | undefined {
        return this._property;
    }

    public get value(): ScvdValueOutput | undefined {
        return this._value;
    }
    public set value(value: string | undefined) {
        if (value !== undefined) {
            this._value = new ScvdValueOutput(this, value, 'value');
            return;
        }
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

    public override getConditionResult(): Promise<boolean> {
        if (this._cond) {
            return this._cond.getResult();
        }
        return super.getConditionResult();
    }

    public get bold(): ScvdCondition | undefined {
        return this._bold;
    }

    public set bold(value: string | undefined) {
        if (value !== undefined) {
            this._bold = new ScvdCondition(this, value);
            return;
        }
    }

    public get alert(): ScvdCondition | undefined {
        return this._alert;
    }

    public set alert(value: string | undefined) {
        if (value !== undefined) {
            this._alert = new ScvdCondition(this, value);
            return;
        }
    }

    public get listOut(): ScvdListOut[] {
        return this._listOut;
    }
    public addListOut(): ScvdListOut {
        const newItem = new ScvdListOut(this);
        this._listOut.push(newItem);
        return newItem;
    }

    public get item(): ScvdItem[] {
        return this._item;
    }

    public addItem(): ScvdItem {
        const newItem = new ScvdItem(this);
        this._item.push(newItem);
        return newItem;
    }

    public get print(): ScvdPrint[] {
        return this._print;
    }
    public addPrint(): ScvdPrint {
        const item = new ScvdPrint(this);
        this._print.push(item);
        return item;
    }

    public override getGuiName(): Promise<string | undefined> {
        if (this.property === undefined) {
            return Promise.resolve(undefined);
        }
        return this.property.getGuiValue();
    }

    public hasGuiChildren(): boolean {
        return this.item.length > 0 || this.listOut.length > 0 || this.print.length > 0;
    }

    public override getGuiValue(): Promise<string | undefined> {
        if (this.value === undefined) {
            return Promise.resolve(undefined);
        }
        return this.value.getGuiValue();
    }


}
