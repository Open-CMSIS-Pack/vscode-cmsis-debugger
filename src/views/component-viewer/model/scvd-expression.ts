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


import { ParseResult } from '../parser-evaluator/parser';
import { EvaluateResult } from '../parser-evaluator/evaluator';
import { ScvdNode } from './scvd-node';

export class ScvdExpression extends ScvdNode {
    private _expression: string | undefined;
    private _scvdVarName: string | undefined;
    private _expressionAst: ParseResult | undefined;
    private _isPrintExpression: boolean = false;

    constructor(
        parent: ScvdNode | undefined,
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

    public override get classname(): string {
        return 'ScvdExpression';
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
        this._expression = expression;
        this._expressionAst = undefined;
    }

    private async evaluateExpression(): Promise<EvaluateResult> {
        if (this.expressionAst === undefined || this._executionContext === undefined) {
            console.error(this.getLineInfoStr(), 'Expression evaluation missing AST or execution context');
            return undefined;
        }
        return this._executionContext.evaluator.evaluateParseResult(this.expressionAst, this._executionContext.evalContext);
    }

    public override getValue(): Promise<EvaluateResult> {
        return this.evaluate();
    }

    public get scvdVarName(): string | undefined {
        return this._scvdVarName;
    }
    public set scvdVarName(value: string | undefined) {
        this._scvdVarName = value;
    }

    public async evaluate(): Promise<EvaluateResult> {
        if (this.expressionAst === undefined) {
            return undefined;
        }
        if (this.expressionAst.constValue === undefined) {   // not a constant expression
            const result = await this.evaluateExpression();
            return result;
        } else {    // constant expression
            const constVal = this.expressionAst.constValue;
            if (typeof constVal === 'boolean') {
                return constVal ? 1 : 0;
            }
            return constVal;
        }
    }

    private parseExpression(): boolean {
        const expression = this.expression;
        if (expression === undefined) {
            this.expressionAst = undefined;
            return false;
        }

        if (this.expressionAst === undefined) {  // if already parsed by dependency, skip parsing
            const parser = this._executionContext?.parser;
            if (!parser) {
                console.error(this.getLineInfoStr(), 'Expression parsing missing execution context or parser');
                return false;
            }
            const expressionAst = parser.parseExpression(expression, this.isPrintExpression);
            if (expressionAst !== undefined && expressionAst.diagnostics.length === 0) {
                this.expressionAst = expressionAst;
            }
        }

        return true;
    }

    public override configure(): boolean {
        this.parseExpression();
        return super.configure();
    }

    public override validate(prevResult: boolean): boolean {
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

    public async getResultString(): Promise<string | undefined> {
        const value = await this.evaluate();
        if (typeof value === 'number') {
            return value.toString();
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return undefined;
    }
}
