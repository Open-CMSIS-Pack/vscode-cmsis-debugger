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

import { Json } from './scvd-base';
import { ScvdNode } from './scvd-node';
import { getStringFromJson } from './scvd-utils';

const EVENT_COLORS = ['blue', 'red', 'green', 'black'] as const;
type EventColor = (typeof EVENT_COLORS)[number];
function isEventColor(v: string): v is EventColor {
    return EVENT_COLORS.includes(v as EventColor);
}

// https://arm-software.github.io/CMSIS-View/main/elem_component_viewer.html

export class ScvdEventState extends ScvdNode {
    private _plot: 'off' | 'line' | 'box' = 'off';
    private _color: EventColor = 'blue';
    private _unique: boolean = false;
    private _dormant: boolean = false;
    private _ssel: boolean = false;

    constructor(
        parent: ScvdNode | undefined,
    ) {
        super(parent);
    }

    public override get classname(): string {
        return 'ScvdEventState';
    }

    public override readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.plot = getStringFromJson(xml.plot);
        this.color = getStringFromJson(xml.color);
        this.unique = getStringFromJson(xml.unique);
        this.dormant = getStringFromJson(xml.dormant);
        this.ssel = getStringFromJson(xml.ssel);

        return super.readXml(xml);
    }

    public get plot(): 'off' | 'line' | 'box' {
        return this._plot;
    }

    public set plot(value: string | undefined) {
        if (value !== undefined && (value === 'off' || value === 'line' || value === 'box')) {
            this._plot = value;
        }
    }

    public get color(): EventColor {
        return this._color;
    }

    public set color(value: string | undefined) {
        if (value !== undefined && isEventColor(value)) {
            this._color = value;
        }
    }

    public get unique(): boolean {
        return this._unique;
    }

    public set unique(value: string | boolean | undefined) {
        if (value !== undefined) {
            this._unique = (value === 'true' || value === true);
        }
    }

    public get dormant(): boolean {
        return this._dormant;
    }

    public set dormant(value: string | boolean | undefined) {
        if (value !== undefined) {
            this._dormant = (value === 'true' || value === true);
        }
    }

    public get ssel(): boolean {
        return this._ssel;
    }

    public set ssel(value: string | boolean | undefined) {
        if (value !== undefined) {
            this._ssel = (value === 'true' || value === true);
        }
    }

}
