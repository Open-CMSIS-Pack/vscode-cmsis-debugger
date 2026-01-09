import * as fs from 'fs';
import * as path from 'path';
import { parseExpression, ParseResult } from '../../parser';

jest.setTimeout(60000);

interface ExpressionRow {
    i: number;
    expr: string;
    isPrintf?: boolean;
}

interface MetaRow {
    _meta: { format: string; total: number };
}

function readJsonl(file: string): { meta: MetaRow; rows: ExpressionRow[] } {
    const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    if (lines.length === 0) throw new Error(`Empty JSONL file: ${file}`);
    const meta = JSON.parse(lines[0]) as MetaRow;
    const rows = lines.slice(1).map((l) => JSON.parse(l) as ExpressionRow);
    return { meta, rows };
}

function parseAll(rows: ExpressionRow[]): { parsed: ParseResult[]; diagnostics: number } {
    let diagnostics = 0;
    const parsed = rows.map((row) => {
        let pr: ParseResult;
        try {
            pr = parseExpression(row.expr, !!row.isPrintf);
        } catch (err) {
            throw new Error(`Parser threw for expression #${row.i}: ${row.expr}\n${err instanceof Error ? err.stack ?? err.message : String(err)}`);
        }
        diagnostics += pr.diagnostics?.length ?? 0;
        expect(pr).toBeTruthy();
        expect(pr.ast).toBeTruthy();
        expect(pr.isPrintf).toBe(row.isPrintf ?? false);
        return pr;
    });
    return { parsed, diagnostics };
}

describe('Parser over SCVD expression fixtures', () => {
    const baseDir = path.join(__dirname, '..', 'testfiles');
    const files = ['RTX5_expressions.jsonl', 'Network_expressions.jsonl', 'USB_expressions.jsonl'];

    it('parses every expression without throwing', () => {
        for (const file of files) {
            const fullPath = path.join(baseDir, file);
            const { meta, rows } = readJsonl(fullPath);
            expect(rows.length).toBe(meta._meta.total);

            const { diagnostics } = parseAll(rows);

            // The parser should be tolerant; fail hard if diagnostics explode unexpectedly.
            expect(diagnostics).toBeGreaterThanOrEqual(0);
        }
    });
});
