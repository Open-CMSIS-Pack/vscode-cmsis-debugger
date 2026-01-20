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
 * Coverage for StatementOut.
 */

import { ScvdGuiTree } from '../../scvd-gui-tree';
import { StatementOut } from '../../statement-engine/statement-out';
import { StatementPrint } from '../../statement-engine/statement-print';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

describe('StatementOut coverage', () => {
    it('skips execution when condition is false', async () => {
        const node = new TestNode(undefined, { conditionResult: false, guiName: 'Out' });
        const stmt = new StatementOut(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('sets gui name and executes children', async () => {
        const node = new TestNode(undefined, { guiName: 'Out' });
        const stmt = new StatementOut(node, undefined);
        const childNode = new TestNode(node, { guiName: 'PrintChild', guiValue: 'Value' });
        new StatementPrint(childNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const outGui = guiTree.children[0];
        expect(outGui.getGuiName()).toBe('Out');
        expect(outGui.children).toHaveLength(1);
        expect(outGui.children[0].getGuiName()).toBe('PrintChild');
    });
});
