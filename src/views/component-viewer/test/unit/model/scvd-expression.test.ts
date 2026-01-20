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
 *
 * Unit test for ScvdExpression.
 */

import { ParseResult } from '../../../parser-evaluator/parser';
import { EvaluateResult } from '../../../parser-evaluator/evaluator';
import { ExecutionContext } from '../../../scvd-eval-context';

jest.mock('../../../parser-evaluator/parser', () => ({
    parseExpression: jest.fn()
}));

jest.mock('../../../parser-evaluator/evaluator', () => ({
    evaluateParseResult: jest.fn()
}));

import { parseExpression } from '../../../parser-evaluator/parser';
import { evaluateParseResult } from '../../../parser-evaluator/evaluator';
import { ScvdExpression } from '../../../model/scvd-expression';

describe('ScvdExpression', () => {
    const makeAst = (overrides: Partial<ParseResult>): ParseResult => ({
        ast: {} as ParseResult['ast'],
        diagnostics: [],
        externalSymbols: [],
        isPrintf: false,
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('parses expressions and evaluates constant branches', async () => {
        const expr = new ScvdExpression(undefined, '1', 'value');
        const ast = makeAst({ constValue: 7 });
        (parseExpression as jest.Mock).mockReturnValue(ast);

        expect(expr.configure()).toBe(true);
        expect(expr.expressionAst).toBe(ast);
        await expect(expr.evaluate()).resolves.toBe(7);

        expr.expressionAst = makeAst({ constValue: true });
        await expect(expr.evaluate()).resolves.toBe(1);

        expr.expressionAst = makeAst({ constValue: false });
        await expect(expr.evaluate()).resolves.toBe(0);
    });

    it('reads and updates the scvd variable name', () => {
        const expr = new ScvdExpression(undefined, '1', 'value');
        expect(expr.scvdVarName).toBe('value');
        expr.scvdVarName = 'next';
        expect(expr.scvdVarName).toBe('next');
    });

    it('evaluates non-constant expressions using execution context', async () => {
        const expr = new ScvdExpression(undefined, 'X', 'value');
        const ast = makeAst({ constValue: undefined });
        expr.expressionAst = ast;
        (evaluateParseResult as jest.Mock).mockResolvedValue(42 as EvaluateResult);

        const ctx = { evalContext: {} } as ExecutionContext;
        expr.setExecutionContext(ctx);
        await expect(expr.getValue()).resolves.toBe(42);
    });

    it('handles missing AST or context during evaluation', async () => {
        const expr = new ScvdExpression(undefined, 'X', 'value');
        expr.expressionAst = makeAst({ constValue: undefined });
        await expect(expr.evaluate()).resolves.toBeUndefined();

        expr.setExecutionContext({ evalContext: {} } as ExecutionContext);
        expr.expressionAst = undefined;
        await expect(expr.evaluate()).resolves.toBeUndefined();
    });

    it('returns stringified results for numbers, bigints, and strings', async () => {
        const expr = new ScvdExpression(undefined, 'X', 'value');
        expr.expressionAst = makeAst({ constValue: 5 });
        await expect(expr.getResultString()).resolves.toBe('5');

        expr.expressionAst = makeAst({ constValue: 'str' });
        await expect(expr.getResultString()).resolves.toBe('str');

        expr.expressionAst = makeAst({ constValue: undefined });
        expr.setExecutionContext({ evalContext: {} } as ExecutionContext);
        (evaluateParseResult as jest.Mock)
            .mockResolvedValueOnce(5n as EvaluateResult)
            .mockResolvedValueOnce({} as EvaluateResult);
        await expect(expr.getResultString()).resolves.toBe('5');

        expr.expressionAst = makeAst({ constValue: undefined });
        await expect(expr.getResultString()).resolves.toBeUndefined();
    });

    it('parses expressions and validates diagnostics', () => {
        const expr = new ScvdExpression(undefined, undefined, 'value');
        expect(expr.configure()).toBe(true);
        expect(expr.validate(true)).toBe(false);

        expr.expression = '1';
        expr.expressionAst = undefined;
        expect(expr.validate(true)).toBe(false);

        expr.expressionAst = makeAst({
            diagnostics: [{ type: 'error', message: 'error', start: 0, end: 1 }]
        });
        expect(expr.validate(true)).toBe(false);

        expr.expressionAst = makeAst({});
        expect(expr.validate(true)).toBe(true);
    });

    it('skips parsing when an AST already exists', () => {
        const expr = new ScvdExpression(undefined, '1', 'value');
        const ast = makeAst({ constValue: 1 });
        expr.expressionAst = ast;
        expect(expr.configure()).toBe(true);
        expect(expr.expressionAst).toBe(ast);
    });

    it('does not set AST when parse diagnostics exist', () => {
        const expr = new ScvdExpression(undefined, '1', 'value');
        const ast = makeAst({
            diagnostics: [{ type: 'error', message: 'err', start: 0, end: 1 }]
        });
        (parseExpression as jest.Mock).mockReturnValue(ast);
        expect(expr.configure()).toBe(true);
        expect(expr.expressionAst).toBeUndefined();
    });
});
