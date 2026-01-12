import * as fs from 'fs';
import * as path from 'path';
import { BinaryExpression, Identifier, NumberLiteral, parseExpression } from '../../parser';

interface Case { expr: string; expected: number | boolean | string; }
interface NonConstCase {
    expr: string;
    symbols?: string[];
    foldedTo?: { left: string; right: number };
}

function loadCases(): Case[] {
    const file = path.join(__dirname, '..', 'testfiles', 'parser-const-eval-cases.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as Case[];
    return data;
}

function loadNonConstCases(): NonConstCase[] {
    const file = path.join(__dirname, '..', 'testfiles', 'parser-nonconst-eval-cases.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as NonConstCase[];
    return data;
}

describe('Parser constant folding', () => {
    const cases = loadCases();

    it('produces constValue for folded expressions', () => {
        for (const { expr, expected } of cases) {
            const pr = parseExpression(expr, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.constValue).toBe(expected);
        }
    });

    it('keeps constValue undefined for expressions with symbols', () => {
        const nonConstCases = loadNonConstCases();
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
