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
 * Unit test for StatementRead.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdRead } from '../../../model/scvd-read';
import type { ScvdDebugTarget } from '../../../scvd-debug-target';
import { StatementRead } from '../../../statement-engine/statement-read';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';

function createRead(_debugTarget: Partial<ScvdDebugTarget>): ScvdRead {
    const read = new ScvdRead(undefined);
    read.name = 'value';
    read.symbol = 'sym';
    jest.spyOn(read, 'getTargetSize').mockReturnValue(4);
    jest.spyOn(read, 'getArraySize').mockResolvedValue(1);
    return read;
}

describe('StatementRead', () => {
    it('skips when mustRead is false', async () => {
        const read = new ScvdRead(undefined);
        read.mustRead = false;
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {});
        const spy = jest.spyOn(ctx.debugTarget, 'readMemory');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).not.toHaveBeenCalled();
    });

    it('ignores non-read items', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementRead(node, undefined);
        const ctx = createExecutionContext(node, {});
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('handles missing name', async () => {
        const read = new ScvdRead(undefined);
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles missing target size', async () => {
        const read = new ScvdRead(undefined);
        read.name = 'value';
        jest.spyOn(read, 'getTargetSize').mockReturnValue(undefined);
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('fails when symbol address is missing', async () => {
        const read = createRead({ findSymbolAddress: jest.fn().mockResolvedValue(undefined) });
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(undefined),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles non-numeric offset values', async () => {
        const read = createRead({ findSymbolAddress: jest.fn().mockResolvedValue(0x1000) });
        read.offset = 'offset';
        jest.spyOn(read.offset!, 'getValue').mockResolvedValue('bad');

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles numeric offsets from symbols', async () => {
        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        read.offset = 'offset';
        jest.spyOn(read.offset!, 'getValue').mockResolvedValue(4);

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x1004n, 4);
    });

    it('handles bigint symbol addresses', async () => {
        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x2000n),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x2000n),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x2000n, 4);
    });

    it('adds offsets to bigint base addresses', async () => {
        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x3000n),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        read.offset = 'offset';
        jest.spyOn(read.offset!, 'getValue').mockResolvedValue(4);

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x3000n),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x3004n, 4);
    });

    it('skips offset updates when BigInt conversion yields undefined', async () => {
        const originalBigInt = globalThis.BigInt;
        (globalThis as unknown as { BigInt: (value: number) => bigint | undefined }).BigInt = jest.fn(() => undefined);

        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x4000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        read.offset = 'offset';
        jest.spyOn(read.offset!, 'getValue').mockResolvedValue(4);

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x4000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        (globalThis as unknown as { BigInt: typeof BigInt }).BigInt = originalBigInt;

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x4000, 4);
    });

    it('handles bigint offsets without symbols', async () => {
        const read = new ScvdRead(undefined);
        read.name = 'value';
        jest.spyOn(read, 'getTargetSize').mockReturnValue(4);
        read.offset = 'offset';
        jest.spyOn(read.offset!, 'getValue').mockResolvedValue(8n);

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(8n, 4);
    });

    it('fails when base address is undefined', async () => {
        const read = new ScvdRead(undefined);
        read.name = 'value';
        jest.spyOn(read, 'getTargetSize').mockReturnValue(4);
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles read failures from target', async () => {
        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(undefined),
        });
        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(undefined),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('reads values and caches const reads', async () => {
        const read = createRead({
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        read.const = 1;

        const stmt = new StatementRead(read, undefined);
        const ctx = createExecutionContext(read, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledWith('value', 4, expect.any(Uint8Array), 0, 0x1000, 4);
        expect(read.mustRead).toBe(false);
    });
});
