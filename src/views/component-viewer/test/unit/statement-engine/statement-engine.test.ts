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
 * Unit test for StatementEngine.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { StatementEngine } from '../../../statement-engine/statement-engine';
import { StatementBreak } from '../../../statement-engine/statement-break';
import { StatementCalc } from '../../../statement-engine/statement-calc';
import { StatementItem } from '../../../statement-engine/statement-item';
import { StatementList } from '../../../statement-engine/statement-list';
import { StatementListOut } from '../../../statement-engine/statement-list-out';
import { StatementObject } from '../../../statement-engine/statement-object';
import { StatementOut } from '../../../statement-engine/statement-out';
import { StatementPrint } from '../../../statement-engine/statement-print';
import { StatementRead } from '../../../statement-engine/statement-read';
import { StatementReadList } from '../../../statement-engine/statement-readList';
import { StatementVar } from '../../../statement-engine/statement-var';
import { ScvdCalc } from '../../../model/scvd-calc';
import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { ScvdItem } from '../../../model/scvd-item';
import { ScvdList } from '../../../model/scvd-list';
import { ScvdListOut } from '../../../model/scvd-list-out';
import { ScvdNode } from '../../../model/scvd-node';
import { ScvdObject, ScvdObjects } from '../../../model/scvd-object';
import { ScvdOut } from '../../../model/scvd-out';
import { ScvdPrint } from '../../../model/scvd-print';
import { ScvdRead } from '../../../model/scvd-read';
import { ScvdReadList } from '../../../model/scvd-readlist';
import { ScvdVar } from '../../../model/scvd-var';
import { ScvdBreak, ScvdBreaks } from '../../../model/scvd-break';
import { StatementBase } from '../../../statement-engine/statement-base';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

class FakeStatement extends StatementBase {
    public calls = 0;
    protected override async onExecute(): Promise<void> {
        this.calls += 1;
    }
}

type StatementCtor = new (item: ScvdNode, parent: StatementBase | undefined) => StatementBase;

describe('StatementEngine', () => {
    it('exposes model and execution context', () => {
        const model = new ScvdComponentViewer(undefined);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.model).toBe(model);
        expect(engine.executionContext).toBe(ctx);
    });

    it('builds statement types for known nodes', () => {
        const model = new ScvdComponentViewer(undefined);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        const entries: Array<[ScvdNode, StatementCtor]> = [
            [new ScvdObject(undefined), StatementObject],
            [new ScvdVar(undefined), StatementVar],
            [new ScvdCalc(undefined), StatementCalc],
            [new ScvdReadList(undefined), StatementReadList],
            [new ScvdRead(undefined), StatementRead],
            [new ScvdList(undefined), StatementList],
            [new ScvdListOut(undefined), StatementListOut],
            [new ScvdOut(undefined), StatementOut],
            [new ScvdItem(undefined), StatementItem],
            [new ScvdPrint(undefined), StatementPrint],
            [new ScvdBreak(undefined), StatementBreak],
        ];

        for (const [node, ctor] of entries) {
            const stmt = engine.addChildrenFromScvd(node, undefined);
            expect(stmt).toBeInstanceOf(ctor);
        }
    });

    it('returns undefined for unknown statement types', () => {
        const model = new ScvdComponentViewer(undefined);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);
        const unknown = new TestNode(undefined);

        const stmt = engine.addChildrenFromScvd(unknown, undefined);

        expect(stmt).toBeUndefined();
    });

    it('returns false when there are no objects', () => {
        const model = new ScvdComponentViewer(undefined);
        (model as unknown as { _objects: ScvdObjects })._objects = new ScvdObjects(model);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(false);
    });

    it('returns false when the first object is undefined', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        (objects as unknown as { _objects: Array<ScvdObject | undefined> })._objects = [undefined];
        (model as unknown as { _objects: ScvdObjects })._objects = objects;
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(false);
    });

    it('skips statement tree setup when no statement is built', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        (objects as unknown as { _objects: Array<ScvdObject | TestNode> })._objects = [new TestNode(undefined)];
        (model as unknown as { _objects: ScvdObjects })._objects = objects;
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(true);
        expect(engine.statementTree).toBeUndefined();
    });

    it('initializes without break entries', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        const object = objects.addObject();
        object.lineNo = '1';
        (model as unknown as { _objects: ScvdObjects })._objects = objects;
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(true);
        expect(engine.statementTree).toBeDefined();
    });

    it('initializes and inserts breakpoints', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        const object = objects.addObject();
        object.lineNo = '1';
        const varA = object.addVar();
        varA.lineNo = '1';
        const varB = object.addVar();
        varB.lineNo = '5';
        (model as unknown as { _objects: ScvdObjects })._objects = objects;

        const breaks = new ScvdBreaks(model);
        const breakA = breaks.addBreak();
        breakA.lineNo = '3';
        const breakB = breaks.addBreak();
        breakB.lineNo = '3';
        (model as unknown as { _breaks: ScvdBreaks })._breaks = breaks;

        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(true);
        expect(engine.statementTree).toBeDefined();

        const tree = engine.statementTree as StatementBase;
        const breakNodes = tree.children.filter(child => child.scvdItem.constructor?.name === 'ScvdBreak');
        expect(breakNodes.length).toBe(1);
    });

    it('inserts breaks using nested spans', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        const object = objects.addObject();
        object.lineNo = '1';
        const list = object.addList();
        list.lineNo = '2';
        const item = list.addVar();
        item.lineNo = '5';
        (model as unknown as { _objects: ScvdObjects })._objects = objects;

        const breaks = new ScvdBreaks(model);
        const breakItem = breaks.addBreak();
        breakItem.lineNo = '4';
        (model as unknown as { _breaks: ScvdBreaks })._breaks = breaks;

        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(true);

        const tree = engine.statementTree as StatementBase;
        const listStmt = tree.children.find(child => child.scvdItem.constructor?.name === 'ScvdList') as StatementBase | undefined;
        expect(listStmt?.children.some(child => child.scvdItem.constructor?.name === 'ScvdBreak')).toBe(true);
    });

    it('handles break span checks with descending line numbers', () => {
        const model = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(model);
        const object = objects.addObject();
        object.lineNo = '10';
        const list = object.addList();
        list.lineNo = '5';
        const varItem = list.addVar();
        varItem.lineNo = '4';
        (model as unknown as { _objects: ScvdObjects })._objects = objects;

        const breaks = new ScvdBreaks(model);
        const breakItem = breaks.addBreak();
        breakItem.lineNo = '7';
        (model as unknown as { _breaks: ScvdBreaks })._breaks = breaks;

        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);

        expect(engine.initialize()).toBe(true);
        expect(engine.statementTree).toBeDefined();
    });

    it('executes all statements and clears memory', async () => {
        const model = new ScvdComponentViewer(undefined);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);
        const rootNode = new TestNode(undefined);
        const stmt = new FakeStatement(rootNode, undefined);
        (engine as unknown as { _statementTree: StatementBase })._statementTree = stmt;

        const clearSpy = jest.spyOn(ctx.memoryHost, 'clearNonConst');
        const guiTree = new ScvdGuiTree(undefined);

        await engine.executeAll(guiTree);

        expect(clearSpy).toHaveBeenCalled();
        expect(stmt.calls).toBe(1);
    });

    it('executes without a statement tree', async () => {
        const model = new ScvdComponentViewer(undefined);
        const ctx = createExecutionContext(model);
        const engine = new StatementEngine(model, ctx);
        const clearSpy = jest.spyOn(ctx.memoryHost, 'clearNonConst');
        const guiTree = new ScvdGuiTree(undefined);

        await engine.executeAll(guiTree);

        expect(clearSpy).toHaveBeenCalled();
    });
});
