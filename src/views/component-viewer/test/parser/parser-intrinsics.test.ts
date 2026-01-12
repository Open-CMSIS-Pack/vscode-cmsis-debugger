import fs from 'fs';
import path from 'path';
import { parseExpression, EvalPointCall, Identifier } from '../../parser';

type IntrinsicFixture = {
    intrinsics: string[];
    pseudoMembers?: string[];
};

function loadFixture(): IntrinsicFixture {
    const file = path.join(__dirname, '..', 'testfiles', 'cases.json');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as { intrinsics: string[]; pseudoMembers: string[] };
    return { intrinsics: parsed.intrinsics, pseudoMembers: parsed.pseudoMembers };
}

describe('Parser intrinsics', () => {
    it('parses all intrinsic calls as EvalPointCall', () => {
        const fixture = loadFixture();
        for (const name of fixture.intrinsics) {
            const pr = parseExpression(`${name}(1, 2)`, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.isPrintf).toBe(false);
            expect(pr.constValue).toBeUndefined();
            expect(pr.ast.kind).toBe('EvalPointCall');
            const call = pr.ast as EvalPointCall;
            expect(call.intrinsic).toBe(name);
            expect(call.callee.kind).toBe('Identifier');
            expect((call.callee as Identifier).name).toBe(name);
        }
    });

    it('parses pseudo-member helpers (_count/_addr) as MemberAccess', () => {
        const fixture = loadFixture();
        const members = fixture.pseudoMembers ?? [];
        for (const expr of members) {
            const pr = parseExpression(expr, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.constValue).toBeUndefined();
            expect(pr.ast.kind).toBe('MemberAccess');
        }
    });
});
