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
 * Unit test for StatementCalc.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdCalc } from '../../../model/scvd-calc';
import { StatementCalc } from '../../../statement-engine/statement-calc';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

describe('StatementCalc', () => {
    it('logs when cast to calc fails', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementCalc(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('evaluates calc expressions', async () => {
        const calc = new ScvdCalc(undefined);
        const exprA = { evaluate: jest.fn().mockResolvedValue(1) };
        const exprB = { evaluate: jest.fn().mockResolvedValue(2) };
        (calc as unknown as { _expression: Array<{ evaluate: () => Promise<number> }> })._expression = [
            exprA,
            exprB,
        ];

        const stmt = new StatementCalc(calc, undefined);
        const ctx = createExecutionContext(calc);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(exprA.evaluate).toHaveBeenCalled();
        expect(exprB.evaluate).toHaveBeenCalled();
    });
});
