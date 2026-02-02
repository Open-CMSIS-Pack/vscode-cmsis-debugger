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

import { ScvdNode } from './scvd-node';
import { ScvdPrintExpression } from './scvd-print-expression';

export class ScvdValueOutput extends ScvdNode {
    private _expression: ScvdPrintExpression | undefined;
    private _scvdVarName: string = 'valueOutput';

    constructor(
        parent: ScvdNode | undefined,
        expression: string,
        scvdVarName: string,
    ) {
        super(parent);
        this._expression = new ScvdPrintExpression(this, expression, scvdVarName);
        this._scvdVarName = scvdVarName;
    }

    public override get classname(): string {
        return 'ScvdValueOutput';
    }

    public get expression(): ScvdPrintExpression | undefined {
        return this._expression;
    }

    public set expression(value: string) {
        if ( this._expression === undefined) {
            this._expression = new ScvdPrintExpression(this, value, this._scvdVarName);
            return;
        }
        this._expression.expression = value;
    }

    public override async getGuiName(): Promise<string | undefined> {
        const expression = this.expression;
        if (expression === undefined) {
            return undefined;
        }
        return expression.getResultString();
    }

    public override async getGuiValue(): Promise<string | undefined> {
        const expression = this.expression;
        if (expression === undefined) {
            return undefined;
        }
        return expression.getResultString();
    }
}
