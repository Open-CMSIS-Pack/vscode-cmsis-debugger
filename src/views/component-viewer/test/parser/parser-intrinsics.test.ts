import fs from 'fs';
import path from 'path';
import { parseExpression } from '../../parser';
import { EvalPointCall, Identifier } from '../../parser';

type IntrinsicFixture = {
    intrinsics: string[];
    pseudoMembers?: string[];
};

function loadFixture(): IntrinsicFixture {
    const file = path.join(__dirname, '..', 'testfiles', 'parser-intrinsics.json');
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as IntrinsicFixture;
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
