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
 * Unit test for StatementVar.
 */

import { componentViewerLogger } from '../../../../../logger';
import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdVar } from '../../../model/scvd-var';
import { StatementVar } from '../../../statement-engine/statement-var';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

describe('StatementVar', () => {
    it('writes variables into memory host', async () => {
        const item = new ScvdVar(undefined);
        item.name = 'varA';
        jest.spyOn(item, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(item, 'getValue').mockResolvedValue(123);

        const stmt = new StatementVar(item, undefined);
        const ctx = createExecutionContext(item);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledWith('varA', 4, 123, -1, 0);
    });

    it('defaults array count to 1 when undefined', async () => {
        const item = new ScvdVar(undefined);
        item.name = 'varB';
        jest.spyOn(item, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(item, 'getArraySize').mockResolvedValue(undefined);
        jest.spyOn(item, 'getValue').mockResolvedValue(456);

        const stmt = new StatementVar(item, undefined);
        const ctx = createExecutionContext(item);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledWith('varB', 4, 456, -1, 0);
    });

    it('skips when required values are missing', async () => {
        const item = new ScvdVar(undefined);
        jest.spyOn(item, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(item, 'getValue').mockResolvedValue(123);

        const stmt = new StatementVar(item, undefined);
        const ctx = createExecutionContext(item);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).not.toHaveBeenCalled();
    });

    it('skips when target size is undefined', async () => {
        const item = new ScvdVar(undefined);
        item.name = 'varMissingSize';
        jest.spyOn(item, 'getTargetSize').mockResolvedValue(undefined);
        jest.spyOn(item, 'getValue').mockResolvedValue(123);

        const stmt = new StatementVar(item, undefined);
        const ctx = createExecutionContext(item);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => undefined);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('defaults undefined values to zero', async () => {
        const item = new ScvdVar(undefined);
        item.name = 'varZero';
        jest.spyOn(item, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(item, 'getValue').mockResolvedValue(undefined);

        const stmt = new StatementVar(item, undefined);
        const ctx = createExecutionContext(item);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledWith('varZero', 4, 0, -1, 0);
    });

    it('ignores non-var items', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementVar(node, undefined);
        const ctx = createExecutionContext(node);
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).not.toHaveBeenCalled();
    });
});
