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
 * Unit test for StatementBase.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { StatementBase } from '../../../statement-engine/statement-base';
import { TestNode, createExecutionContext } from '../helpers/statement-engine-helpers';

class TestStatement extends StatementBase {
    public executed = false;

    public createGuiChild(guiTree: ScvdGuiTree, guiName?: string): ScvdGuiTree {
        return this.getOrCreateGuiChild(guiTree, guiName);
    }

    protected override async onExecute(): Promise<void> {
        this.executed = true;
    }
}

describe('StatementBase', () => {
    it('sorts children by line with stable ordering', () => {
        const rootNode = new TestNode(undefined);
        const root = new TestStatement(rootNode, undefined);

        const childA = new TestNode(rootNode);
        childA.lineNo = '2';
        const childB = new TestNode(rootNode);
        childB.lineNo = '1';
        const childC = new TestNode(rootNode);
        childC.lineNo = '1';

        const stmtA = new TestStatement(childA, root);
        const stmtB = new TestStatement(childB, root);
        const stmtC = new TestStatement(childC, root);

        root.sortChildren();

        expect(root.children).toEqual([stmtB, stmtC, stmtA]);
    });

    it('handles NaN line numbers as zero', () => {
        const node = new TestNode(undefined);
        node.lineNo = 'not-a-number';
        const stmt = new TestStatement(node, undefined);

        expect(stmt.line).toBe(0);
    });

    it('exposes parent statements', () => {
        const rootNode = new TestNode(undefined);
        const root = new TestStatement(rootNode, undefined);
        const childNode = new TestNode(undefined);
        const child = new TestStatement(childNode, root);

        expect(child.parent).toBe(root);
    });

    it('handles undefined children safely', () => {
        const node = new TestNode(undefined);
        const stmt = new TestStatement(node, undefined);

        const result = stmt.addChild(undefined as unknown as TestStatement);

        expect(result).toBeUndefined();
        expect(stmt.children).toHaveLength(0);
    });

    it('creates GUI children with fallback names', () => {
        const node = new TestNode(undefined);
        node.lineNo = '3';
        const stmt = new TestStatement(node, undefined);
        const guiTree = new ScvdGuiTree(undefined);

        const child = stmt.createGuiChild(guiTree, undefined);

        expect(guiTree.children).toContain(child);
        expect(child.getGuiId()).toBe('L3:TestStatement');
    });

    it('executes statements when condition passes', async () => {
        const node = new TestNode(undefined, { conditionResult: true });
        const stmt = new TestStatement(node, undefined);
        const childNode = new TestNode(undefined, { conditionResult: true });
        const child = new TestStatement(childNode, stmt);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(stmt.executed).toBe(true);
        expect(child.executed).toBe(true);
    });

    it('skips execution when condition is false', async () => {
        const node = new TestNode(undefined, { conditionResult: false });
        const stmt = new TestStatement(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(stmt.executed).toBe(false);
    });
});
