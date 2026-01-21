/**
 * Copyright 2026 Arm Limited
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

// generated with AI

/**
 * Integration test for ParserConstEval.
 */

import { BinaryExpression, Identifier, NumberLiteral, parseExpression } from '../../../../parser-evaluator/parser';

interface Case { expr: string; expected: number | boolean | string; }
interface NonConstCase {
    expr: string;
    symbols?: string[];
    foldedTo?: { left: string; right: number };
}

interface ParserCasesFile {
    constCases: Case[];
    nonConstCases: NonConstCase[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- static test fixture load
const cases: ParserCasesFile = require('../../testfiles/cases.json');

describe('Parser constant folding', () => {
    const { constCases, nonConstCases } = cases;

    it('produces constValue for folded expressions', () => {
        for (const { expr, expected } of constCases) {
            const pr = parseExpression(expr, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.constValue).toBe(expected);
        }
    });

    it('keeps constValue undefined for expressions with symbols', () => {
        for (const { expr, symbols } of nonConstCases) {
            const pr = parseExpression(expr, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.constValue).toBeUndefined();
            if (symbols && symbols.length) {
                for (const sym of symbols) {
                    expect(pr.externalSymbols).toContain(sym);
                }
            }
            const expected = (nonConstCases.find(c => c.expr === expr) as NonConstCase).foldedTo;
            if (expected) {
                expect(pr.ast.kind).toBe('BinaryExpression');
                const ast = pr.ast as BinaryExpression;
                expect(ast.operator).toBe('+');
                expect(ast.left.kind).toBe('Identifier');
                expect((ast.left as Identifier).name).toBe(expected.left);
                expect(ast.right.kind).toBe('NumberLiteral');
                expect((ast.right as NumberLiteral).value).toBe(expected.right);
            }
        }
    });
});
