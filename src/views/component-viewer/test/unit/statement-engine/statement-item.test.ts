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
 * Unit test for StatementItem.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { StatementItem } from '../../../statement-engine/statement-item';
import { StatementOut } from '../../../statement-engine/statement-out';
import { StatementPrint } from '../../../statement-engine/statement-print';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

function getOnlyChild(tree: ScvdGuiTree): ScvdGuiTree {
    const child = tree.children[0];
    if (!child) {
        throw new Error('Expected child to exist');
    }
    return child;
}

describe('StatementItem', () => {
    it('skips execution when condition is false', async () => {
        const node = new TestNode(undefined, { conditionResult: false });
        const stmt = new StatementItem(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('creates GUI entries for named items', async () => {
        const node = new TestNode(undefined, { guiName: 'Item', guiValue: '42' });
        const stmt = new StatementItem(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        expect(child.getGuiName()).toBe('Item');
        expect(child.getGuiValue()).toBe('42');
    });

    it('uses print children when gui name is missing and keeps non-print children', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);

        const printNode = new TestNode(node, { guiName: 'PrintName', guiValue: 'PrintValue' });
        new StatementPrint(printNode, stmt);

        const outNode = new TestNode(node, { guiName: 'OutChild' });
        new StatementOut(outNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        expect(child.getGuiName()).toBe('PrintName');
        expect(child.getGuiValue()).toBe('PrintValue');
        expect(child.children.every(guiChild => !guiChild.isPrint)).toBe(true);
        expect(child.children.length).toBe(1);
    });

    it('detaches empty items without gui name', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('uses print-only children before detaching', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const printNode = new TestNode(node, { guiName: 'PrintName', guiValue: 'PrintValue' });
        new StatementPrint(printNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('checks non-print children before selecting a print entry', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const outNode = new TestNode(node, { guiName: 'OutChild' });
        new StatementOut(outNode, stmt);
        const printNode = new TestNode(node, { guiName: 'PrintName', guiValue: 'PrintValue' });
        new StatementPrint(printNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(1);
    });
});
