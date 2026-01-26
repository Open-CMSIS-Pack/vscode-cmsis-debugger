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

        expect(ctx.debugTarget.readMemory).toHaveBeenNthCalledWith(1, 0x1000, 4);
        expect(ctx.debugTarget.readMemory).toHaveBeenNthCalledWith(2, 0x1004n, 4);
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

        expect(ctx.memoryHost.getVariable('list')).toBeDefined();
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
        expect(ctx.memoryHost.getVariable('list')).toBeDefined();
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
});
