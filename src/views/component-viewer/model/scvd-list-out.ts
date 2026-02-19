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
import { ScvdItem } from './scvd-item';
import { ScvdList } from './scvd-list';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';

export class ScvdListOut extends ScvdList {
    private _item: ScvdItem[] = [];
    private _listOut: ScvdListOut[] = []; // Array of child lists

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdListOut';
    }

    // class is derived from ScvdList, but we do not want all properties of ScvdList to be settable from XML
    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.start = getStringFromJson(xml.start);
        this.limit = getStringFromJson(xml.limit);
        this.while = getStringFromJson(xml.while);
        this.cond = getStringFromJson(xml.cond);


        const items = getArrayFromJson<Json>(xml.item);
        items?.forEach(item => {
            const itemObj = this.addItem();
            itemObj.readXml(item);
        });

        const lists = getArrayFromJson<Json>(xml.list);
        lists?.forEach(list => {
            const listItem = this.addList();
            listItem.readXml(list);
        });

        return super.readXml(xml);
    }

    public get item(): ScvdItem[] {
        return this._item;
    }

    public addItem(): ScvdItem {
        const item = new ScvdItem(this);
        this._item.push(item);
        return item;
    }

    public get listOut(): ScvdListOut[] {
        return this._listOut;
    }
    public addListOut(): ScvdListOut {
        const newItem = new ScvdListOut(this);
        this._listOut.push(newItem);
        return newItem;
    }

    public override getGuiName(): Promise<string | undefined> {
        return Promise.resolve(undefined);
    }
}
