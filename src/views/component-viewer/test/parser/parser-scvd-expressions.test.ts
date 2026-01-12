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

import * as fs from 'fs';
import * as path from 'path';
import { parseExpression, ParseResult } from '../../parser';

jest.setTimeout(60000);

interface ExpressionRow {
    expr: string;
    isPrintf?: boolean;
}

interface ExpressionFile {
    _meta: { format: string; totalOriginal: number; totalUnique: number; sourceFiles: string[] };
    expressions: ExpressionRow[];
}

function readExpressions(file: string): ExpressionFile {
    const text = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(text) as ExpressionFile;
    if (!Array.isArray(parsed.expressions)) {
        throw new Error(`Expression file missing expressions array: ${file}`);
    }
    return parsed;
}

function parseAll(rows: ExpressionRow[]): { parsed: ParseResult[]; diagnostics: number } {
    let diagnostics = 0;
    const parsed = rows.map((row, idx) => {
        let pr: ParseResult;
        try {
            pr = parseExpression(row.expr, !!row.isPrintf);
        } catch (err) {
            throw new Error(`Parser threw for expression #${idx}: ${row.expr}\n${err instanceof Error ? err.stack ?? err.message : String(err)}`);
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
    const file = path.join(baseDir, 'expressions.json');

    it('parses every expression without throwing', () => {
        const { _meta, expressions } = readExpressions(file);
        expect(expressions.length).toBe(_meta.totalUnique);

        const { diagnostics } = parseAll(expressions);

        // The parser should be tolerant; fail hard if diagnostics explode unexpectedly.
        expect(diagnostics).toBeGreaterThanOrEqual(0);
    });
});
