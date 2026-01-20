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
 * Coverage for StatementPrint.
 */

import { ScvdGuiTree } from '../../scvd-gui-tree';
import { StatementPrint } from '../../statement-engine/statement-print';
import { StatementOut } from '../../statement-engine/statement-out';
import { createExecutionContext, TestNode } from './helpers';

describe('StatementPrint coverage', () => {
    it('skips execution when condition is false', async () => {
        const node = new TestNode(undefined, { conditionResult: false, guiName: 'Print' });
        const stmt = new StatementPrint(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('creates print gui entries', async () => {
        const node = new TestNode(undefined, { guiName: 'Print', guiValue: 'Value' });
        const stmt = new StatementPrint(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = guiTree.children[0];
        expect(child.getGuiName()).toBe('Print');
        expect(child.getGuiValue()).toBe('Value');
        expect(child.isPrint).toBe(true);
    });

    it('executes child statements', async () => {
        const node = new TestNode(undefined, { guiName: 'Print', guiValue: 'Value' });
        const stmt = new StatementPrint(node, undefined);
        const childNode = new TestNode(node, { guiName: 'Child' });
        new StatementOut(childNode, stmt);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = guiTree.children[0];
        expect(child.children).toHaveLength(1);
        expect(child.children[0].getGuiName()).toBe('Child');
    });
});
