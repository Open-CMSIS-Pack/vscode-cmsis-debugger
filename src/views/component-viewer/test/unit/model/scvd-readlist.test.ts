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
 * Unit test for ScvdReadList.
 */

import { ScvdExpression } from '../../../model/scvd-expression';
import { ScvdReadList } from '../../../model/scvd-readlist';
import { ScvdNode } from '../../../model/scvd-node';
import { Json } from '../../../model/scvd-base';
import { ResolveSymbolCb, ResolveType } from '../../../resolver';
import { applyExecutionContext, createExecutionContext } from '../helpers/statement-engine-helpers';

const makeType = (overrides?: Partial<{ size: number; vsize: number; isPointer: boolean }>) => ({
    getTypeSize: () => overrides?.size ?? 4,
    getVirtualSize: () => overrides?.vsize ?? 8,
    getIsPointer: () => overrides?.isPointer ?? false
});

describe('ScvdReadList', () => {
    it('returns false when XML is undefined', () => {
        const readlist = new ScvdReadList(undefined);
        expect(readlist.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads attributes from XML', () => {
        const readlist = new ScvdReadList(undefined);
        const xml = {
            count: '2',
            next: 'next',
            init: '1',
            based: '1'
        };

        expect(readlist.readXml(xml)).toBe(true);
        expect(readlist.count).toBeInstanceOf(ScvdExpression);
        expect(readlist.next).toBe('next');
        expect(readlist.init).toBe(1);
        expect(readlist.based).toBe(1);
    });

    it('computes target, virtual sizes, and pointer behavior', async () => {
        const readlist = new ScvdReadList(undefined);
        (readlist as unknown as { _type?: unknown })._type = makeType({ size: 6, vsize: 10, isPointer: false });

        await expect(readlist.getTargetSize()).resolves.toBe(6);
        await expect(readlist.getVirtualSize()).resolves.toBe(10);
        expect(readlist.getIsPointer()).toBe(false);

        readlist.based = 1;
        await expect(readlist.getTargetSize()).resolves.toBe(4);
        expect(readlist.getIsPointer()).toBe(true);
    });

    it('keeps target size as element size', async () => {
        const readlist = new ScvdReadList(undefined);
        applyExecutionContext(readlist, createExecutionContext(readlist));
        readlist.size = '3';
        readlist.size?.configure();
        (readlist as unknown as { _type?: { getTypeSize: () => number } })._type = {
            getTypeSize: () => 2
        };
        await expect(readlist.getTargetSize()).resolves.toBe(2);
        await expect(readlist.getArraySize()).resolves.toBe(3);
    });

    it('falls back to base target size when no type is defined', async () => {
        const readlist = new ScvdReadList(undefined);
        await expect(readlist.getTargetSize()).resolves.toBeUndefined();
    });

    it('treats pointers only when based is true', () => {
        const readlist = new ScvdReadList(undefined);
        (readlist as unknown as { _type?: unknown })._type = makeType({ isPointer: true });

        expect(readlist.getIsPointer()).toBe(false);
        readlist.based = 1;
        expect(readlist.getIsPointer()).toBe(true);
    });

    it('treats missing types as non-pointers and ignores undefined setters', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.count = '1';
        readlist.init = '1';
        readlist.based = '1';

        readlist.count = undefined;
        readlist.init = undefined;
        readlist.based = undefined;

        expect(readlist.getIsPointer()).toBe(true);
        expect(readlist.count).toBeInstanceOf(ScvdExpression);
        expect(readlist.init).toBe(1);
        expect(readlist.based).toBe(1);

        const readlistNoType = new ScvdReadList(undefined);
        expect(readlistNoType.getIsPointer()).toBe(false);
    });

    it('handles counts including min/max clamps', async () => {
        const readlist = new ScvdReadList(undefined);
        readlist.count = 'count';

        const expr = readlist.count as ScvdExpression;
        const valueSpy = jest.spyOn(expr, 'getValue');

        valueSpy.mockResolvedValueOnce(undefined);
        await expect(readlist.getCount()).resolves.toBeUndefined();

        valueSpy.mockResolvedValueOnce(NaN);
        await expect(readlist.getCount()).resolves.toBeUndefined();

        valueSpy.mockResolvedValueOnce(0);
        await expect(readlist.getCount()).resolves.toBe(ScvdReadList.READ_SIZE_MIN);

        valueSpy.mockResolvedValueOnce(ScvdReadList.READ_SIZE_MAX + 1);
        await expect(readlist.getCount()).resolves.toBe(ScvdReadList.READ_SIZE_MAX);

        valueSpy.mockResolvedValueOnce(5);
        await expect(readlist.getCount()).resolves.toBe(5);

        valueSpy.mockRestore();
    });

    it('returns undefined when no count expression is defined', async () => {
        const readlist = new ScvdReadList(undefined);
        await expect(readlist.getCount()).resolves.toBeUndefined();
    });

    it('exposes next and init getters', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.next = 'next';
        readlist.init = '1';

        expect(readlist.getNext()).toBe('next');
        expect(readlist.getInit()).toBe(1);
    });

    it('logs when next member is missing during resolve', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.next = 'field';

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const resolveFunc = jest.fn<ReturnType<ResolveSymbolCb>, Parameters<ResolveSymbolCb>>((name, resolveType) => {
            if (resolveType === ResolveType.localType) {
                return { name } as unknown as ScvdNode;
            }
            return undefined;
        });

        expect(readlist.resolveAndLink(resolveFunc)).toBe(false);
        expect(errorSpy).toHaveBeenCalledTimes(1);

        errorSpy.mockRestore();
    });

    it('does not log when next member resolves', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.next = 'field';

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const resolveFunc = jest.fn<ReturnType<ResolveSymbolCb>, Parameters<ResolveSymbolCb>>((name, resolveType, scvdObject) => {
            if (resolveType === ResolveType.localType) {
                return { name } as unknown as ScvdNode;
            }
            if (resolveType === ResolveType.localMember && scvdObject) {
                return { name } as unknown as ScvdNode;
            }
            return undefined;
        });

        expect(readlist.resolveAndLink(resolveFunc)).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    it('skips resolve checks when next is undefined', () => {
        const readlist = new ScvdReadList(undefined);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const resolveFunc = jest.fn<ReturnType<ResolveSymbolCb>, Parameters<ResolveSymbolCb>>(() => undefined);

        expect(readlist.resolveAndLink(resolveFunc)).toBe(false);
        expect(resolveFunc).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    it('skips logging when no typedef is resolved', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.next = 'field';

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const resolveFunc = jest.fn<ReturnType<ResolveSymbolCb>, Parameters<ResolveSymbolCb>>(() => undefined);

        expect(readlist.resolveAndLink(resolveFunc)).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    it('returns true from applyInit regardless of init value', () => {
        const readlist = new ScvdReadList(undefined);
        readlist.init = '1';
        expect(readlist.applyInit()).toBe(true);

        readlist.init = '0';
        expect(readlist.applyInit()).toBe(true);
    });
});
