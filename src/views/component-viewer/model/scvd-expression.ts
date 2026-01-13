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

// https://arm-software.github.io/CMSIS-View/main/scvd_expression.html


import { parseExpression, ParseResult } from '../parser';
import {  evaluateParseResult, EvaluateResult } from '../evaluator';

import { ScvdBase } from './scvd-base';
import { ExecutionContext } from '../scvd-eval-context';


export class ScvdExpression extends ScvdBase {
    private _expression: string | undefined;
    private _result: EvaluateResult;
    private _scvdVarName: string | undefined;
    private _expressionAst: ParseResult | undefined;
    private _isPrintExpression: boolean = false;
    private _rangeMin: number | undefined;
    private _rangeMax: number | undefined;
    private _executionContext: ExecutionContext | undefined;

    constructor(
        parent: ScvdBase | undefined,
        expression: string | undefined,
        scvdVarName: string,
        isPrintExpression?: boolean,
    ) {
        super(parent);
        this.expression = expression;
        this.scvdVarName = scvdVarName;
        this.tag = scvdVarName;
        this._isPrintExpression = isPrintExpression ?? false;
    }

    public invalidate() {
        this._result = undefined;
        super.invalidate();
    }

    public get expressionAst(): ParseResult | undefined {
        return this._expressionAst;
    }
    public set expressionAst(ast: ParseResult | undefined) {
        this._expressionAst = ast;
    }

    public get isPrintExpression(): boolean {
        return this._isPrintExpression;
    }

    public get expression(): string | undefined {
        return this._expression;
    }
    public set expression(expression: string | undefined) {
        if (expression == undefined) {
            return;
        }

        this._expression = expression;
        this._expressionAst = undefined;
        this._result = undefined;
    }

    public async evaluateExpression(): Promise<EvaluateResult> {
        if (this.expressionAst === undefined || this._executionContext === undefined) {
            return undefined;
        }
        const result = await evaluateParseResult(this.expressionAst, this._executionContext.evalContext /*, this*/); // pass 'this' for local variable resolution
        return result;
    }

    public get result(): EvaluateResult {
        return this._result;
    }

    private async evaluateValue(): Promise<EvaluateResult> {
        await this.evaluate();
        return this._result;
    }

    public async getValue(): Promise<number | bigint | undefined> {
        const val = await this.evaluateValue();
        if (val == undefined || (typeof val !== 'number' && typeof val !== 'bigint')) {
            return undefined;
        }
        if (typeof val === 'bigint') {
            return val;
        }
        const min = this._rangeMin;
        if (min !== undefined && val < min) {
            return min;
        }
        const max = this._rangeMax;
        if (max !== undefined && val > max) {
            return max;
        }
        return val;
    }

    public async evaluateOnly() {
        await this.evaluate();
    }

    public async setValue(val: number): Promise<number | undefined> {
        if (typeof this._result === 'number') {
            this.resetExpression();
            this._result = val;
        } else {
            this.expression = val.toString();
            await this.configure();
        }
        return val;
    }

    public get scvdVarName(): string | undefined {
        return this._scvdVarName;
    }
    public set scvdVarName(value: string | undefined) {
        this._scvdVarName = value;
    }

    public setMinMax(min: number | undefined, max: number | undefined) {
        this._rangeMin = min;
        this._rangeMax = max;
    }

    public getMinMax(): { min: number | undefined; max: number | undefined } | undefined {
        return { min: this._rangeMin, max: this._rangeMax };
    }

    public async getResultBoolean(): Promise<boolean> {
        const value = await this.evaluateValue();
        return typeof value === 'number' && value > 0;
    }

    public async evaluate(): Promise<void> {
        if (this.expressionAst === undefined) {
            return;
        }

        if (this.expressionAst.constValue === undefined) {   // not a constant expression
            const result = await this.evaluateExpression();
            if (result !== undefined) {
                this._result = result;
            }
        } else {    // constant expression
            const constVal = this.expressionAst.constValue;
            if (typeof constVal === 'boolean') {
                this._result = constVal ? 1 : 0;
            } else {
                this._result = constVal;
            }
        }
    }

    private resetExpression() {
        this._expression = undefined;
        this._expressionAst = undefined;
        this._result = undefined;
    }

    private parseExpression(): boolean {
        const expression = this.expression;
        if (expression === undefined) {
            this.expressionAst = undefined;
            return false;
        }

        if (this.expressionAst === undefined) {  // if already parsed by dependency, skip parsing
            const expressionAst = parseExpression(expression, this.isPrintExpression);
            if (expressionAst !== undefined && expressionAst.diagnostics.length === 0) {
                this.expressionAst = expressionAst;
            }
        }

        return true;
    }

    public configure(): boolean {
        this.parseExpression();
        return super.configure();
    }

    public setExecutionContext(_executionContext: ExecutionContext) {
        this._executionContext = _executionContext;
    }

    public validate(prevResult: boolean): boolean {
        const expression = this.expression;
        if (expression === undefined) {
            console.error(this.getLineInfoStr(), 'Expression is empty.');
            return super.validate(false);
        }

        const expressionAst = this.expressionAst;
        if (expressionAst === undefined) {
            console.error(this.getLineInfoStr(), 'Expression AST is undefined for expression: ', expression);
            return super.validate(false);
        }
        if (expressionAst.diagnostics.length > 0) {
            console.error(this.getLineInfoStr(), 'Expression AST has diagnostics for expression: ', expression, '\nDiagnostics: ', expressionAst.diagnostics);
            return super.validate(false);
        }

        return super.validate(prevResult && true);
    }

    public getResultString(): string | undefined {
        if (this._result !== undefined) {
            if (typeof this._result === 'number') {
                return this._result.toString();
            } else if (typeof this._result === 'string') {
                return this._result;
            }
        }
        return undefined;
    }
}
