import * as fs from 'fs';
import * as path from 'path';
import { BinaryExpression, Identifier, NumberLiteral, parseExpression } from '../../parser';

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

function loadCases(): ParserCasesFile {
    const file = path.join(__dirname, '..', 'testfiles', 'cases.json');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as ParserCasesFile;
    return data;
}

describe('Parser constant folding', () => {
    const { constCases, nonConstCases } = loadCases();

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
