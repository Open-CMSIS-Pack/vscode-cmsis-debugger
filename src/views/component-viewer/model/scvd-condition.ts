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

import { componentViewerLogger } from '../../../logger';
import { ScvdNode } from './scvd-node';
import { ScvdExpression } from './scvd-expression';
import { ExecutionContext } from '../scvd-eval-context';

export class ScvdCondition extends ScvdNode {
    private _expression: ScvdExpression | undefined;

    constructor(
        parent: ScvdNode | undefined,
        expression?: string
    ) {
        super(parent);
        if (expression !== undefined) {
            this._expression = new ScvdExpression(this, expression, 'expression');
        }
    }

    public override get classname(): string {
        return 'ScvdCondition';
    }

    public get expression(): ScvdExpression | undefined {
        return this._expression;
    }

    public set expression(value: string) {
        if ( this._expression === undefined) {
            this._expression = new ScvdExpression(this, value, 'expression');
            return;
        }
        this._expression.expression = value;
    }

    public async getResult(): Promise<boolean> {
        if (!this._expression) {
            return true;
        }
        try {
            const value = await this._expression.getValue();
            // Treat numeric zero as false; everything else (including bigint) as true.
            return value === undefined ? false : value !== 0 && value !== 0n;
        } catch (err) {
            componentViewerLogger.error(this.getLineInfoStr(), 'Failed to evaluate condition expression', err);
            return false;
        }
    }

    public override setExecutionContext(executionContext: ExecutionContext): void {
        super.setExecutionContext(executionContext);
        this._expression?.setExecutionContext(executionContext);
    }

}
