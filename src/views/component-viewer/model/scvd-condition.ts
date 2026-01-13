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

import { ScvdBase } from './scvd-base';
import { ScvdExpression } from './scvd-expression';

export class ScvdCondition extends ScvdBase {
    private _expression: ScvdExpression | undefined;
    private _cachedResult: boolean | undefined;

    constructor(
        parent: ScvdBase | undefined,
        expression?: string
    ) {
        super(parent);
        if(expression !== undefined) {
            this._expression = new ScvdExpression(this, expression, 'expression');
        }
    }

    public get expression(): ScvdExpression | undefined {
        return this._expression;
    }

    public set expression(value: string) {
        if( this._expression === undefined) {
            this._expression = new ScvdExpression(this, value, 'expression');
            return;
        }
        this._expression.expression = value;
    }

    public async getResult(): Promise<boolean> {
        if(!this._expression) {
            this._cachedResult = true;
            return true;
        }
        const value = await this._expression.getValue();
        const result = value ? true : false;
        this._cachedResult = result;
        return result;
    }

    public getCachedResult(): boolean | undefined {
        return this._cachedResult;
    }


}
