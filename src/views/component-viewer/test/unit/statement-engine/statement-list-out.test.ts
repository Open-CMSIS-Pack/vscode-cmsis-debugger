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
 * Unit test for StatementListOut.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdListOut } from '../../../model/scvd-list-out';
import { ScvdVar } from '../../../model/scvd-var';
import { ScvdNode } from '../../../model/scvd-node';
import { StatementBase } from '../../../statement-engine/statement-base';
import { StatementListOut } from '../../../statement-engine/statement-list-out';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

class BaseContainer extends ScvdNode {
    private symbols = new Map<string, ScvdNode>();

    public addSymbol(name: string, node: ScvdNode): void {
        this.symbols.set(name, node);
    }

    public override getSymbol(name: string): ScvdNode | undefined {
        return this.symbols.get(name);
    }
}

class CountingStatement extends StatementBase {
    public executed = 0;

    protected override async onExecute(): Promise<void> {
        this.executed += 1;
    }
}

describe('StatementListOut', () => {
    it('skips when condition is false', async () => {
        const list = new ScvdListOut(undefined);
        jest.spyOn(list, 'getConditionResult').mockResolvedValue(false);
        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(list);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(0);
    });

    it('logs when cast fails', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementListOut(node, undefined);
        const ctx = createExecutionContext(node);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a name', async () => {
        const list = new ScvdListOut(undefined);
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(list);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a start expression', async () => {
        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(list);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a start value', async () => {
        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(undefined);
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(list);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a base container', async () => {
        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(list);
        (ctx.evalContext.container as { base: ScvdNode | undefined }).base = undefined;
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a loop variable in the base container', async () => {
        const base = new BaseContainer(undefined);
        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires target size for the loop variable', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(undefined);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('rejects simultaneous limit and while expressions', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.limit = 'limit';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(0);
        jest.spyOn(list.limit!, 'getValue').mockResolvedValue(1);
        jest.spyOn(list.while!, 'getValue').mockResolvedValue(1);

        const stmt = new StatementListOut(list, undefined);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('breaks out when while start value is zero', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(0);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(0);
    });

    it('executes while loops and updates loop values', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        jest.spyOn(list.while!, 'getValue').mockResolvedValueOnce(1).mockResolvedValueOnce(0);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(1);
    });

    it('breaks when while expression resolves to zero', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        jest.spyOn(list.while!, 'getValue').mockResolvedValue(0);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(0);
    });

    it('breaks when while expression is undefined', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        jest.spyOn(list.while!, 'getValue').mockResolvedValue(undefined);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(0);
    });

    it('handles undefined while updates after executing children', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.while = 'while';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(1);
        jest.spyOn(list.while!, 'getValue').mockResolvedValueOnce(1).mockResolvedValueOnce(undefined);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(1);
    });

    it('handles undefined limit values', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.limit = 'limit';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(0);
        jest.spyOn(list.limit!, 'getValue').mockResolvedValue(undefined);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(0);
    });

    it('executes limit loops and increments', async () => {
        const base = new BaseContainer(undefined);
        const variable = new ScvdVar(base);
        variable.name = 'loop';
        jest.spyOn(variable, 'getTargetSize').mockResolvedValue(4);
        base.addSymbol('loop', variable);

        const list = new ScvdListOut(undefined);
        list.name = 'loop';
        list.start = 'start';
        list.limit = 'limit';
        jest.spyOn(list.start!, 'getValue').mockResolvedValue(0);
        jest.spyOn(list.limit!, 'getValue').mockResolvedValue(2);

        const stmt = new StatementListOut(list, undefined);
        const child = new CountingStatement(new TestNode(undefined), stmt);
        const ctx = createExecutionContext(base);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(child.executed).toBe(2);
    });
});
