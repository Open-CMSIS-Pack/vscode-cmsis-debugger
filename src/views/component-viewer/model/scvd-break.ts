/**
 * Copyright 2026 Arm Limited
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
import { getArrayFromJson } from './scvd-utils';

export class ScvdBreaks extends ScvdNode {
    private _break: ScvdBreak[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }
        const breaks = getArrayFromJson(xml.break);
        breaks?.forEach( (v: Json) => {
            const varItem = this.addBreak();
            varItem.readXml(v);
        });

        return super.readXml(xml);
    }

    public get breaks(): ScvdBreak[] {
        return this._break;
    }

    public addBreak(): ScvdBreak {
        const breakItem = new ScvdBreak(this);
        this._break.push(breakItem);
        return breakItem;
    }

    public async calculateBreaks(): Promise<void> {
        const breaks = this.breaks;
        if (breaks === undefined || breaks.length === 0) {
            return;
        }

        for (const breakItem of breaks) {
            await breakItem.calculateBreak();
        }
    }

}


export class ScvdBreak extends ScvdNode {

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.break();
        return super.readXml(xml);
    }

    private break(): void {
    }

    public async calculateBreak() {
    }
}
