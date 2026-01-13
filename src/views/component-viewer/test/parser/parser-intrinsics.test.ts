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

import { parseExpression, EvalPointCall, Identifier } from '../../parser';

type IntrinsicFixture = {
    intrinsics: string[];
    pseudoMembers?: string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- static test fixture load
const fixture: IntrinsicFixture = require('../testfiles/cases.json');

describe('Parser intrinsics', () => {
    it('parses all intrinsic calls as EvalPointCall', () => {
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
        const members = fixture.pseudoMembers ?? [];
        for (const expr of members) {
            const pr = parseExpression(expr, false);
            expect(pr.diagnostics).toEqual([]);
            expect(pr.constValue).toBeUndefined();
            expect(pr.ast.kind).toBe('MemberAccess');
        }
    });
});
