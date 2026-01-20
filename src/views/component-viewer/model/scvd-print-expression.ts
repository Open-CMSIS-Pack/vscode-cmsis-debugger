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

import { ScvdNode } from './scvd-node';
import { ScvdExpression } from './scvd-expression';

// https://arm-software.github.io/CMSIS-View/main/scvd_expression.html



export class ScvdPrintExpression extends ScvdExpression {

    constructor(
        parent: ScvdNode | undefined,
        expression: string | undefined,
        scvdVarName: string,
    ) {
        super(parent, expression, scvdVarName, true);
        this.expression = expression;
    }

    public override configure(): boolean {
        return super.configure();
    }

    public override validate(prevResult: boolean): boolean {
        return super.validate(prevResult && true);
    }

    public override async getGuiName(): Promise<string | undefined> {
        return super.getGuiName();
    }

    public override async getGuiValue(): Promise<string | undefined> {
        return super.getGuiValue();
    }
}
