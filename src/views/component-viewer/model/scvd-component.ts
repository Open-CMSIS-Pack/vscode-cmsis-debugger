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

// https://arm-software.github.io/CMSIS-View/main/elem_events.html

import { NumberType, NumberTypeInput } from './number-type';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdEventState } from './scvd-event-state';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';

export class ScvdComponent extends ScvdNode {
    private _brief: string | undefined;
    private _no: number | undefined;
    private _prefix: string | undefined; // hyperlink
    private _state: ScvdEventState[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdComponent';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.brief = getStringFromJson(xml.brief);
        this.no = getStringFromJson(xml.no);
        this.prefix = getStringFromJson(xml.prefix);

        const states = getArrayFromJson<Json>(xml.state);
        states?.forEach( (v: Json) => {
            const newState = this.addState();
            newState.readXml(v);
        });

        return super.readXml(xml);
    }

    public set brief(value: string | undefined) {
        this._brief = value;
    }

    public get brief(): string | undefined {
        return this._brief;
    }

    public set no(value: NumberTypeInput | undefined) {
        if ( value === undefined) {
            return;
        }
        this._no = new NumberType(value).value;
    }

    public get no(): number | undefined {
        return this._no;
    }

    public set prefix(value: string | undefined) {
        this._prefix = value;
    }

    public get prefix(): string | undefined {
        return this._prefix;
    }

    public get state(): ScvdEventState[] {
        return this._state;
    }
    public addState(): ScvdEventState {
        const newState = new ScvdEventState(this);
        this._state.push(newState);
        return newState;
    }

}
