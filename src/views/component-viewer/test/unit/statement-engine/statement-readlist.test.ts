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
 * Unit test for StatementReadList.
 */

import { ScvdGuiTree } from '../../../scvd-gui-tree';
import { ScvdReadList } from '../../../model/scvd-readlist';
import type { ScvdDebugTarget } from '../../../scvd-debug-target';
import { StatementReadList } from '../../../statement-engine/statement-readList';
import { createExecutionContext, TestNode } from '../helpers/statement-engine-helpers';
import type { ScvdNode } from '../../../model/scvd-node';
import type { RefContainer } from '../../../parser-evaluator/model-host';
import { ScvdExpression } from '../../../model/scvd-expression';

class ExposedStatementReadList extends StatementReadList {
    public async run(executionContext: Parameters<StatementReadList['executeStatement']>[0], guiTree: ScvdGuiTree): Promise<void> {
        return this.onExecute(executionContext, guiTree);
    }
    protected override async shouldExecute(): Promise<boolean> {
        return true;
    }
}

function createReadList(): ScvdReadList {
    const readList = new ScvdReadList(undefined);
    readList.name = 'list';
    readList.symbol = 'sym';
    if (readList.symbol) {
        readList.symbol.name = 'sym';
    }
    jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
    jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
    jest.spyOn(readList, 'getIsPointer').mockReturnValue(false);
    jest.spyOn(readList, 'getCount').mockResolvedValue(1);
    return readList;
}

function createContext(readList: ScvdReadList, debugTarget: Partial<ScvdDebugTarget>) {
    return createExecutionContext(readList, debugTarget);
}

function createMemberNode(targetSize: number | undefined, memberOffset: number | undefined): ScvdNode {
    const node = new TestNode(undefined);
    jest.spyOn(node, 'getTargetSize').mockResolvedValue(targetSize);
    jest.spyOn(node, 'getMemberOffset').mockResolvedValue(memberOffset);
    return node;
}

function makeRef(name: string, widthBytes: number, offsetBytes = 0): RefContainer {
    const ref = new TestNode(undefined);
    ref.name = name;
    return {
        base: ref,
        anchor: ref,
        current: ref,
        offsetBytes,
        widthBytes,
        valueType: undefined,
    };
}

describe('StatementReadList', () => {
    it('skips when mustRead is false', async () => {
        const readList = createReadList();
        readList.mustRead = false;
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(guiTree.children).toHaveLength(0);
    });

    it('logs when cast fails', async () => {
        const node = new TestNode(undefined);
        const stmt = new StatementReadList(node, undefined);
        const ctx = createExecutionContext(node, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires a name', async () => {
        const readList = new ScvdReadList(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles init clear when configured', async () => {
        const readList = createReadList();
        readList.init = 1;
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'clearVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledWith('list');
    });

    it('requires target size', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('fails when symbol address is missing', async () => {
        const readList = createReadList();
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(undefined),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('rejects non-numeric offsets', async () => {
        const readList = createReadList();
        readList.offset = 'offset';
        jest.spyOn(readList.offset!, 'getValue').mockResolvedValue('bad');
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('supports numeric offsets on symbol addresses', async () => {
        const readList = createReadList();
        readList.offset = 'offset';
        jest.spyOn(readList.offset!, 'getValue').mockResolvedValue(4);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x1004n, 4);
    });

    it('supports numeric offsets on bigint symbol addresses', async () => {
        const readList = createReadList();
        readList.offset = 'offset';
        jest.spyOn(readList.offset!, 'getValue').mockResolvedValue(8);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x2000n),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x2008n, 4);
    });

    it('iterates pointer arrays and advances by stride', async () => {
        const readList = createReadList();
        readList.based = 1;
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(2),
            readMemory: jest.fn()
                .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]))
                .mockResolvedValueOnce(new Uint8Array([5, 6, 7, 8])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x1000n, 8);
    });

    it('supports bigint offsets without symbols', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.offset = 'offset';
        jest.spyOn(readList.offset!, 'getValue').mockResolvedValue(12n);
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(12n, 4);
    });

    it('fails when base address is undefined', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires type when next is defined', async () => {
        const readList = createReadList();
        readList.next = 'next';
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('requires next member size/offset', async () => {
        const readList = createReadList();
        readList.next = 'next';
        const member = createMemberNode(undefined, undefined);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined; getDisplayLabel: () => string } })._type = {
            getMember: () => member,
            getDisplayLabel: () => 'Type',
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('rejects next member sizes larger than 4', async () => {
        const readList = createReadList();
        readList.next = 'next';
        const member = createMemberNode(8, 0);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => member,
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles target read failures', async () => {
        const readList = createReadList();
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(undefined),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('reads a single item when count and next are undefined', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('uses pointer sizes when marked as pointer', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(ctx.debugTarget.readMemory).toHaveBeenCalledWith(0x1000, 4);
    });

    it('uses pointer stride when count is defined', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.symbol = 'sym';
        if (readList.symbol) {
            readList.symbol.name = 'sym';
        }
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(3),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('advances by stride when count is defined and next is missing', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.symbol = 'sym';
        if (readList.symbol) {
            readList.symbol.name = 'sym';
        }
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(false);
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(3),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('advances by stride with bigint base addresses', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.symbol = 'sym';
        if (readList.symbol) {
            readList.symbol.name = 'sym';
        }
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(false);
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000n),
            getNumArrayElements: jest.fn().mockResolvedValue(3),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('warns when exceeding maximum array size', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getCount').mockResolvedValue(3);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('breaks when next member is missing', async () => {
        const readList = createReadList();
        readList.next = 'next';
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => undefined,
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const spy = jest.spyOn(ctx.memoryHost, 'setVariable');
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails when next pointer data is incomplete', async () => {
        const readList = createReadList();
        readList.next = 'next';
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(2);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(2);
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const member = createMemberNode(4, 0);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => member,
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2])),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('handles NULL next pointers', async () => {
        const readList = createReadList();
        readList.next = 'next';
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const member = createMemberNode(4, 0);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => member,
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0, 0, 0, 0])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(await ctx.memoryHost.readRaw(makeRef('list', 4, 0), 4)).toBeDefined();
    });

    it('detects linked list loops', async () => {
        const readList = createReadList();
        readList.next = 'next';
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const member = createMemberNode(4, 0);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => member,
        };
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0x00, 0x10, 0x00, 0x00])),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('honors read size maximum', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const originalMax = (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX;
        (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX = 1;
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX = originalMax;
        expect(await ctx.memoryHost.readRaw(makeRef('list', 4, 0), 4)).toBeDefined();
    });

    it('marks const readlists as initialized', async () => {
        const readList = createReadList();
        readList.const = 1;
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const guiTree = new ScvdGuiTree(undefined);

        await stmt.executeStatement(ctx, guiTree);

        expect(readList.mustRead).toBe(false);
    });

    it('logs when symbol address is missing and skips invalid addresses', async () => {
        const readList = createReadList();
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(undefined),
        });
        const guiTree = new ScvdGuiTree(undefined);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, guiTree);
        expect(spy).toHaveBeenCalled();

        spy.mockClear();
        const ctxInvalid = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0),
        });
        await stmt.executeStatement(ctxInvalid, guiTree);
        expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('offset evaluated to undefined'));
        spy.mockRestore();
    });

    it('handles pointer batch reads and invalid pointers', async () => {
        const readList = createReadList();
        readList.based = 1;
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(1);
        const stmt = new StatementReadList(readList, undefined);

        const ctxInvalidPtr = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0, 0, 0, 0])),
        });
        await stmt.executeStatement(ctxInvalidPtr, new ScvdGuiTree(undefined));

        const ctxBatch = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0x00, 0x20, 0x00, 0x00])),
            readMemoryBatch: jest.fn().mockResolvedValue(new Map([
                [`${readList.getLineNoStr()}:StatementReadList:list:ptr:0`, new Uint8Array([1, 2, 3, 4])]
            ])),
        });
        const spy = jest.spyOn(ctxBatch.memoryHost, 'setVariable');
        await stmt.executeStatement(ctxBatch, new ScvdGuiTree(undefined));
        expect(spy).toHaveBeenCalled();
    });

    it('handles pointer list loop data and count limits', async () => {
        const readList = createReadList();
        readList.based = 1;
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(undefined);

        const stmt = new StatementReadList(readList, undefined);
        const ctxInvalidPtr = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0, 0, 0, 0])),
        });
        await stmt.executeStatement(ctxInvalidPtr, new ScvdGuiTree(undefined));

        const ctxMissingItem = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn()
                .mockResolvedValueOnce(new Uint8Array([0x00, 0x20, 0x00, 0x00]))
                .mockResolvedValueOnce(undefined),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await stmt.executeStatement(ctxMissingItem, new ScvdGuiTree(undefined));
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();

        const ctxStoreItem = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn()
                .mockResolvedValueOnce(new Uint8Array([0x00, 0x20, 0x00, 0x00]))
                .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4])),
        });
        await stmt.executeStatement(ctxStoreItem, new ScvdGuiTree(undefined));
    });

    it('breaks when count is reached for non-batch reads', async () => {
        const readList = createReadList();
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(false);
        jest.spyOn(readList, 'getCount').mockResolvedValue(1);
        readList.next = 'next';
        const member = createMemberNode(4, 0);
        (readList as unknown as { _type?: { getMember: () => ScvdNode | undefined } })._type = {
            getMember: () => member,
        };

        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));
    });

    it('skips error logging when resolveReadList is called with logErrors=false', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const callResolveReadList = async (
            stmt: StatementReadList,
            readList: ScvdReadList,
            ctx: Parameters<StatementReadList['executeStatement']>[0],
            options?: { includeMaxArraySize?: boolean; count?: number }
        ) => (stmt as unknown as {
            resolveReadList: (item: ScvdReadList, ctx: Parameters<StatementReadList['executeStatement']>[0], logErrors: boolean, options?: { includeMaxArraySize?: boolean; count?: number }) => Promise<unknown>;
        }).resolveReadList(readList, ctx, false, options);

        const missingName = new ScvdReadList(undefined);
        const stmtMissingName = new StatementReadList(missingName, undefined);
        await callResolveReadList(stmtMissingName, missingName, createContext(missingName, {}));

        const missingSize = new ScvdReadList(undefined);
        missingSize.name = 'list';
        jest.spyOn(missingSize, 'getTargetSize').mockResolvedValue(undefined);
        const stmtMissingSize = new StatementReadList(missingSize, undefined);
        await callResolveReadList(stmtMissingSize, missingSize, createContext(missingSize, {}));

        const missingSymbol = createReadList();
        const stmtMissingSymbol = new StatementReadList(missingSymbol, undefined);
        await callResolveReadList(stmtMissingSymbol, missingSymbol, createContext(missingSymbol, {
            findSymbolAddress: jest.fn().mockResolvedValue(undefined),
        }));

        const badOffset = createReadList();
        badOffset.offset = 'offset';
        jest.spyOn(badOffset.offset!, 'getValue').mockResolvedValue('bad');
        const stmtBadOffset = new StatementReadList(badOffset, undefined);
        await callResolveReadList(stmtBadOffset, badOffset, createContext(badOffset, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
        }));

        const noBase = createReadList();
        noBase.symbol = undefined;
        const stmtNoBase = new StatementReadList(noBase, undefined);
        await callResolveReadList(stmtNoBase, noBase, createContext(noBase, {}));

        const countOne = createReadList();
        const stmtCountOne = new StatementReadList(countOne, undefined);
        const getNumArrayElements = jest.fn().mockResolvedValue(5);
        await callResolveReadList(stmtCountOne, countOne, createContext(countOne, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements,
        }), { includeMaxArraySize: true, count: 1 });
        expect(getNumArrayElements).not.toHaveBeenCalled();

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('passes const flags for batch and loop readlist paths', async () => {
        const batchList = createReadList();
        batchList.const = 1;
        batchList.based = 1;
        jest.spyOn(batchList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(batchList, 'getCount').mockResolvedValue(1);
        const batchStmt = new StatementReadList(batchList, undefined);
        const batchCtx = createContext(batchList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([0x00, 0x20, 0x00, 0x00])),
            readMemoryBatch: jest.fn().mockResolvedValue(new Map([
                [`${batchList.getLineNoStr()}:StatementReadList:list:ptr:0`, new Uint8Array([1, 2, 3, 4])]
            ])),
        });
        const batchSpy = jest.spyOn(batchCtx.memoryHost, 'setVariable');
        await batchStmt.executeStatement(batchCtx, new ScvdGuiTree(undefined));
        expect(batchSpy.mock.calls.some((call) => call[6] === true)).toBe(true);

        const loopList = createReadList();
        loopList.const = 1;
        jest.spyOn(loopList, 'getIsPointer').mockReturnValue(false);
        jest.spyOn(loopList, 'getCount').mockResolvedValue(undefined);
        const loopStmt = new StatementReadList(loopList, undefined);
        const loopCtx = createContext(loopList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        });
        const loopSpy = jest.spyOn(loopCtx.memoryHost, 'setVariable');
        await loopStmt.executeStatement(loopCtx, new ScvdGuiTree(undefined));
        expect(loopSpy.mock.calls.some((call) => call[6] === true)).toBe(true);
    });

    it('advances pointer arrays using stride when no next member is defined', async () => {
        const readList = createReadList();
        readList.based = 1;
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const readMemory = jest.fn(async (addr: number | bigint) => {
            if (addr === 0x1000) {
                return new Uint8Array([0x00, 0x20, 0x00, 0x00]);
            }
            if (addr === 0x2000) {
                return new Uint8Array([1, 2, 3, 4]);
            }
            if (addr === 0x1004) {
                return new Uint8Array([0, 0, 0, 0]);
            }
            return undefined;
        });
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory,
        });

        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));

        expect(readMemory).toHaveBeenCalledWith(0x1004n, 4);
    });

    it('skips mustRead inside onExecute', async () => {
        const readList = createReadList();
        readList.mustRead = false;
        const stmt = new ExposedStatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        await stmt.run(ctx, new ScvdGuiTree(undefined));
    });

    it('logs when base address is still undefined after resolving offset', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.offset = 'off';
        jest.spyOn(readList.offset as ScvdExpression, 'getValue').mockResolvedValue(undefined);
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('offset evaluated to undefined'));
        errorSpy.mockRestore();
    });

    it('stores batch array items using numeric target addresses', async () => {
        const readList = createReadList();
        (readList.getIsPointer as jest.Mock).mockReturnValue(false);
        (readList.getCount as jest.Mock).mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000n),
            getNumArrayElements: jest.fn().mockResolvedValue(2),
            readMemory: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
        });
        const setSpy = jest.spyOn(ctx.memoryHost, 'setVariable');

        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));

        expect(setSpy).toHaveBeenCalled();
        const addrArg = setSpy.mock.calls[0]?.[4];
        expect(typeof addrArg).toBe('number');
    });

    it('logs when resolveReadList sees no base address', async () => {
        const readList = new ScvdReadList(undefined);
        readList.name = 'list';
        readList.offset = 'off';
        jest.spyOn(readList.offset as ScvdExpression, 'getValue').mockResolvedValue(undefined);
        jest.spyOn(readList, 'getTargetSize').mockResolvedValue(4);
        jest.spyOn(readList, 'getVirtualSize').mockResolvedValue(4);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await (stmt as unknown as {
            resolveReadList: (item: ScvdReadList, ctx: Parameters<StatementReadList['executeStatement']>[0], logErrors: boolean) => Promise<unknown>;
        }).resolveReadList(readList, ctx, true);

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('offset evaluated to undefined'));
        errorSpy.mockRestore();
    });

    it('stores pointer array items in looped reads', async () => {
        const readList = createReadList();
        readList.const = 1;
        readList.based = 1;
        jest.spyOn(readList, 'getIsPointer').mockReturnValue(true);
        jest.spyOn(readList, 'getCount').mockResolvedValue(1);
        const stmt = new StatementReadList(readList, undefined);
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            readMemory: jest.fn()
                .mockResolvedValueOnce(new Uint8Array([0x00, 0x20, 0x00, 0x00]))
                .mockResolvedValueOnce(new Uint8Array([9, 9, 9, 9])),
        });
        const setSpy = jest.spyOn(ctx.memoryHost, 'setVariable');

        const originalMax = (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX;
        (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX = 0;
        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));
        (ScvdReadList as unknown as { READ_SIZE_MAX: number }).READ_SIZE_MAX = originalMax;

        expect(setSpy).toHaveBeenCalled();
    });

    it('advances non-pointer arrays via stride when batch reads are disabled', async () => {
        const readList = createReadList();
        (readList.getIsPointer as jest.Mock).mockReturnValue(false);
        (readList.getCount as jest.Mock).mockResolvedValue(2);
        const stmt = new StatementReadList(readList, undefined);
        const readMemory = jest.fn(async (addr: number | bigint) => {
            if (addr === 0x1000 || addr === 0x1000n) {
                return new Uint8Array([1, 2, 3, 4]);
            }
            if (addr === 0x1004 || addr === 0x1004n) {
                return new Uint8Array([5, 6, 7, 8]);
            }
            return undefined;
        });
        const ctx = createContext(readList, {
            findSymbolAddress: jest.fn().mockResolvedValue(0x1000),
            getNumArrayElements: jest.fn().mockResolvedValue(1),
            readMemory,
        });
        await stmt.executeStatement(ctx, new ScvdGuiTree(undefined));

        expect(readMemory).toHaveBeenCalledWith(0x1004n, 4);
    });
});
