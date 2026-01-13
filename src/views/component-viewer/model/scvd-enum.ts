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

// https://arm-software.github.io/CMSIS-View/main/elem_member.html#elem_enum

import { ScvdExpression } from './scvd-expression';
import { Json, ScvdBase } from './scvd-base';
import { getStringFromJson } from './scvd-utils';

export class ScvdEnum extends ScvdBase {
    private _value: ScvdExpression;

    constructor(
        parent: ScvdBase | undefined,
        lastEnum: ScvdEnum | undefined,
    ) {
        super(parent);
        const lastValue = lastEnum?.value;
        const valStr = lastValue ? `(${lastValue.expression}) + 1` : '0';
        this._value = new ScvdExpression(this, valStr, 'value');
    }

    public readXml(xml: Json): boolean {
        if (xml === undefined ) {
            return super.readXml(xml);
        }

        this.value = getStringFromJson(xml.value);
        this.value.readXml(xml.value);

        return super.readXml(xml);
    }

    public get value(): ScvdExpression {
        return this._value;
    }
    public set value(value: string | undefined) {
        if (value !== undefined) {
            this._value = new ScvdExpression(this, value, 'value');
        }
    }


}
