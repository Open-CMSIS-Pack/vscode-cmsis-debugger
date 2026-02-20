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
 * Unit test for StatementItem.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { StatementItem } from '../../../statement-engine/statement-item';
import { StatementList } from '../../../statement-engine/statement-list';
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

    it('keeps empty items without gui name', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        // When no property is specified, it should be displayed with empty string (matching C++ behavior)
        expect(child.getGuiName()).toBe('');
        expect(child.getGuiValue()).toBe('');
    });

    it('keeps print-only items and uses the print name/value', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const printNode = new TestNode(node, { guiName: 'PrintName', guiValue: 'PrintValue' });
        new StatementPrint(printNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        expect(child.getGuiName()).toBe('PrintName');
        expect(child.getGuiValue()).toBe('PrintValue');
    });

    it('detaches when all print children are suppressed', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        const printNode = new TestNode(node, { guiName: 'Hidden', guiValue: 'Hidden' });
        printNode.conditionResult = false;
        new StatementPrint(printNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('executes non-print children when no print children exist', async () => {
        const node = new TestNode(undefined, { guiName: 'Parent' });
        const stmt = new StatementItem(node, undefined);
        const outNode = new TestNode(node, { guiName: 'Child' });
        const outStmt = new StatementOut(outNode, stmt);
        const execSpy = jest.spyOn(outStmt, 'executeStatement');

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(execSpy).toHaveBeenCalled();
        execSpy.mockRestore();
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

    it('handles undefined print name/value by using empty strings', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);
        // Create a print node that returns undefined for name and value
        const printNode = new TestNode(node);
        printNode.guiName = undefined;
        printNode.guiValue = undefined;
        new StatementPrint(printNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        // Undefined should be converted to empty string (matching C++ AddProperty("", value) behavior)
        expect(child.getGuiName()).toBe('');
        expect(child.getGuiValue()).toBe('');
    });

    it('displays item with value but no property name', async () => {
        const node = new TestNode(undefined, { guiValue: 'SomeValue' });
        const stmt = new StatementItem(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        // No property name (undefined) should become empty string, value should be preserved
        expect(child.getGuiName()).toBe('');
        expect(child.getGuiValue()).toBe('SomeValue');
    });

    it('skips item when all multiple print children are suppressed', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);

        // Add multiple print children, all suppressed
        const printNode1 = new TestNode(node, { guiName: 'Print1', guiValue: 'Value1' });
        printNode1.conditionResult = false;
        new StatementPrint(printNode1, stmt);

        const printNode2 = new TestNode(node, { guiName: 'Print2', guiValue: 'Value2' });
        printNode2.conditionResult = false;
        new StatementPrint(printNode2, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        // Item should be completely skipped when no print matches
        expect(guiTree.children).toHaveLength(0);
    });

    it('uses first matching print when multiple prints exist', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementItem(node, undefined);

        // First print is suppressed
        const printNode1 = new TestNode(node, { guiName: 'Print1', guiValue: 'Value1' });
        printNode1.conditionResult = false;
        new StatementPrint(printNode1, stmt);

        // Second print should match
        const printNode2 = new TestNode(node, { guiName: 'Print2', guiValue: 'Value2' });
        new StatementPrint(printNode2, stmt);

        // Third print should not be evaluated
        const printNode3 = new TestNode(node, { guiName: 'Print3', guiValue: 'Value3' });
        new StatementPrint(printNode3, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        const child = getOnlyChild(guiTree);
        // Should use second print (first matching one)
        expect(child.getGuiName()).toBe('Print2');
        expect(child.getGuiValue()).toBe('Value2');
    });

    it('hides items with no value that contain only empty lists', async () => {
        // This tests the FileSystem.scvd scenario:
        // <item property="Drives">
        //   <list name="i" start="0" limit="Vol_EFS._count">  <!-- _count = 0, so no iterations -->
        //     <item property="Drive ...">
        //   </list>
        // </item>
        // Expected: "Drives" item should NOT appear when list is empty
        const node = new TestNode(undefined, { guiName: 'Drives' }); // Has name, no value
        const stmt = new StatementItem(node, undefined);

        // Add a list child that produces no GUI children (simulates empty list)
        const listNode = new TestNode(node);
        new StatementList(listNode, stmt);

        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        // Item should be detached because it has no value and no GUI children
        expect(guiTree.children).toHaveLength(0);
    });
});
