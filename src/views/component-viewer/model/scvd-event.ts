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

import { ResolveSymbolCb } from '../resolver';
import { NumberType, NumberTypeInput } from './number-type';
import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { ScvdEventId } from './scvd-event-id';
import { ScvdEventLevel } from './scvd-event-level';
import { ScvdEventState } from './scvd-event-state';
import { ScvdEventTracking } from './scvd-event-tracking';
import { ScvdExpression } from './scvd-expression';
import { ScvdPrint } from './scvd-print';
import { getArrayFromJson, getStringFromJson } from './scvd-utils';
import { ScvdValueOutput } from './scvd-value-output';

export class ScvdEvent extends ScvdNode {
    private _id: ScvdEventId | undefined;
    private _level: ScvdEventLevel | undefined;
    private _property: ScvdValueOutput | undefined;
    private _value: ScvdValueOutput | undefined;
    private _doc: string | undefined;
    private _handle: number | undefined;
    private _hname: ScvdExpression | undefined;
    private _stateName : string | undefined; // name of referenced state
    private _state: ScvdEventState | undefined; // reference
    private _tracking: ScvdEventTracking | undefined;
    private _print: ScvdPrint[] = [];

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.id = getStringFromJson(xml.id);
        this.level = getStringFromJson(xml.level);
        this.property = getStringFromJson(xml.property);
        this.value = getStringFromJson(xml.value);
        this.doc = getStringFromJson(xml.doc);
        this.handle = getStringFromJson(xml.handle);
        this.hname = getStringFromJson(xml.hname);
        this.stateName = getStringFromJson(xml.state);
        this.tracking = getStringFromJson(xml.tracking);

        const print = getArrayFromJson<Json>(xml.print);
        print?.forEach( (v: Json) => {
            const printItem = this.addPrint();
            printItem.readXml(v);
        });

        return super.readXml(xml);
    }

    public override resolveAndLink(_resolveFunc: ResolveSymbolCb): boolean {
        // TOIMPL: this._state = this.findReference(ScvdEventState, this._state?.name);
        return false;
    }

    public get id(): ScvdEventId | undefined {
        return this._id;
    }
    public set id(value: string | undefined) {
        if ( value !== undefined ) {
            this._id = new ScvdEventId(this, value);
        }
    }

    public get level(): ScvdEventLevel | undefined {
        return this._level;
    }
    public set level(value: string | undefined) {
        if ( value !== undefined ) {
            if ( this._level === undefined ) {
                this._level = new ScvdEventLevel(this, value);
                return;
            }
            this._level.level = value;
        }
    }

    public get property(): ScvdValueOutput | undefined {
        return this._property;
    }
    public set property(value: string | undefined) {
        if ( value !== undefined ) {
            if ( this._property === undefined ) {
                this._property = new ScvdValueOutput(this, value, 'property');
                return;
            }
            this._property.expression = value;
        }
    }

    public get value(): ScvdValueOutput | undefined {
        return this._value;
    }
    public set value(value: string | undefined) {
        if ( value !== undefined ) {
            this._value = new ScvdValueOutput(this, value, 'value');
        }
    }

    public get doc(): string | undefined {
        return this._doc;
    }
    public set doc(value: string | undefined) {
        this._doc = value;
    }

    public get handle(): number | undefined {
        return this._handle;
    }
    public set handle(value: NumberTypeInput | undefined) {
        if ( value !== undefined ) {
            this._handle = new NumberType(value).value;
        }
    }

    public get hname(): ScvdExpression | undefined {
        return this._hname;
    }
    public set hname(value: string | undefined) {
        if ( value !== undefined ) {
            this._hname = new ScvdExpression(this, value, 'hname');
        }
    }

    public get state(): ScvdEventState | undefined {
        return this._state;
    }

    // TOIMPL, resolve and link
    public set state(value: ScvdEventState | undefined) {
        this._state = value;
    }

    public get tracking(): ScvdEventTracking | undefined {
        return this._tracking;
    }
    public set tracking(value: string | undefined) {
        if ( value !== undefined ) {
            if ( this._tracking === undefined ) {
                this._tracking = new ScvdEventTracking(this, value);
                return;
            }
            this._tracking.mode = value;
        }
    }

    public get print(): ScvdPrint[] {
        return this._print;
    }

    public addPrint(): ScvdPrint {
        const item = new ScvdPrint(this);
        this._print.push(item);
        return item;
    }

    public get stateName(): string | undefined {
        return this._stateName;
    }
    public set stateName(value: string | undefined) {
        this._stateName = value;
    }



}
