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
 * Integration test for ScvdDebugTarget.
 */

import { componentViewerLogger } from '../../../../logger';
import { ScvdDebugTarget, gdbNameFor, __test__ } from '../../scvd-debug-target';
import { TargetReadCache } from '../../target-read-cache';
import type { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../../../debug-session';

type AccessMock = {
    setActiveSession: jest.Mock;
    evaluateSymbolAddress: jest.Mock;
    evaluateSymbolName: jest.Mock;
    evaluateSymbolContext: jest.Mock;
    evaluateNumberOfArrayElements: jest.Mock;
    evaluateSymbolSize: jest.Mock;
    evaluateMemory: jest.Mock;
    evaluateRegisterValue: jest.Mock;
};

let accessMock: AccessMock;
jest.mock('../../component-viewer-target-access', () => ({
    ComponentViewerTargetAccess: jest.fn(() => accessMock),
}));
jest.mock('../../stats-config', () => {
    const { PerfStats } = jest.requireActual('../../perf-stats');
    const { TargetReadStats, TargetReadTiming } = jest.requireActual('../../target-read-stats');
    const perf = new PerfStats();
    perf.setBackendEnabled(true);
    return {
        perf,
        targetReadStats: new TargetReadStats(),
        targetReadTimingStats: new TargetReadTiming(),
    };
});

const session = { session: { id: 'sess-1' } } as unknown as GDBTargetDebugSession;

describe('scvd-debug-target', () => {
    beforeEach(() => {
        accessMock = {
            setActiveSession: jest.fn(),
            evaluateSymbolAddress: jest.fn(),
            evaluateSymbolName: jest.fn(),
            evaluateSymbolContext: jest.fn(),
            evaluateNumberOfArrayElements: jest.fn(),
            evaluateSymbolSize: jest.fn(),
            evaluateMemory: jest.fn(),
            evaluateRegisterValue: jest.fn(),
        };
        jest.clearAllMocks();
    });

    it('normalizes register names and maps to gdb names', () => {
        expect(gdbNameFor(' r0 ')).toBe('r0');
        expect(gdbNameFor('MSP_s')).toBe('msp_s');
        expect(gdbNameFor('unknown')).toBeUndefined();
    });

    it('resolves symbol info when session is active', async () => {
        accessMock.evaluateSymbolAddress.mockResolvedValue('0x100');
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        await expect(target.getSymbolInfo('foo')).resolves.toEqual({ name: 'foo', address: 0x100 });

        accessMock.evaluateSymbolAddress.mockResolvedValue('zzz');
        const spy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        target.init(session, tracker);
        await expect(target.getSymbolInfo('foo')).resolves.toBeUndefined();
        spy.mockRestore();
    });

    it('returns undefined for missing session or symbol', async () => {
        const target = new ScvdDebugTarget();
        await expect(target.getSymbolInfo(undefined as unknown as string)).resolves.toBeUndefined();
        await expect(target.getSymbolInfo('foo')).resolves.toBeUndefined();
        await expect(target.findSymbolNameAtAddress(0x200)).resolves.toBeUndefined();
        await expect(target.findSymbolContextAtAddress(0x200n)).resolves.toBeUndefined();
        await expect(target.getNumArrayElements('arr')).resolves.toBeUndefined();
        await expect(target.getNumArrayElements(undefined as unknown as string)).resolves.toBeUndefined();
        await expect(target.getTargetIsRunning()).resolves.toBe(false);
        await expect(target.getSymbolSize('sym')).resolves.toBeUndefined();
        await expect(target.readMemory(0, 4)).resolves.toBeUndefined();
    });

    it('finds symbol name and context, handling errors', async () => {
        accessMock.evaluateSymbolName.mockResolvedValue('main');
        accessMock.evaluateSymbolContext.mockResolvedValue('file.c:10');
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        await expect(target.findSymbolNameAtAddress(0x200)).resolves.toBe('main');
        await expect(target.findSymbolContextAtAddress(0x200)).resolves.toBe('file.c:10');

        const spy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        accessMock.evaluateSymbolName.mockRejectedValue(new Error('fail'));
        await expect(target.findSymbolNameAtAddress(0x200)).resolves.toBeUndefined();
        accessMock.evaluateSymbolContext.mockRejectedValue(new Error('fail'));
        await expect(target.findSymbolContextAtAddress(0x200)).resolves.toBeUndefined();
        spy.mockRestore();
    });

    it('handles array length and running state tracking', async () => {
        type TrackerWithCallbacks = {
            onContinued: (cb: (event: { session: GDBTargetDebugSession }) => void) => void;
            onStopped: (cb: (event: { session: GDBTargetDebugSession }) => void) => void;
            _continued?: (event: { session: GDBTargetDebugSession }) => void;
            _stopped?: (event: { session: GDBTargetDebugSession }) => void;
        };
        const tracker: TrackerWithCallbacks = {
            onContinued: (cb) => { tracker._continued = cb; },
            onStopped: (cb) => { tracker._stopped = cb; },
        };

        const target = new ScvdDebugTarget();
        target.init(session, tracker as unknown as GDBTargetDebugTracker);

        expect(await target.getNumArrayElements('sym')).toBeUndefined();
        accessMock.evaluateNumberOfArrayElements.mockResolvedValue(7);
        await expect(target.getNumArrayElements('sym')).resolves.toBe(7);

        expect(await target.getTargetIsRunning()).toBe(false);
        await tracker._continued?.({ session });
        expect(await target.getTargetIsRunning()).toBe(true);
        await tracker._stopped?.({ session });
        expect(await target.getTargetIsRunning()).toBe(false);

        // Mismatched session id should be ignored
        await tracker._continued?.({ session: { session: { id: 'other' } } as unknown as GDBTargetDebugSession });
        expect(await target.getTargetIsRunning()).toBe(false);
        await tracker._stopped?.({ session: { session: { id: 'other' } } as unknown as GDBTargetDebugSession });
        expect(await target.getTargetIsRunning()).toBe(false);
    });

    it('finds symbol address and size', async () => {
        accessMock.evaluateSymbolAddress.mockResolvedValue('0x200');
        accessMock.evaluateSymbolSize.mockResolvedValue(16);
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        await expect(target.findSymbolAddress('foo')).resolves.toBe(0x200);
        await expect(target.getSymbolSize('foo')).resolves.toBe(16);

        accessMock.evaluateSymbolSize.mockResolvedValue(-1);
        target.init(session, tracker);
        await expect(target.getSymbolSize('foo')).resolves.toBeUndefined();
        await expect(target.getSymbolSize('')).resolves.toBeUndefined();

        accessMock.evaluateSymbolAddress.mockResolvedValue(undefined);
        await expect(target.findSymbolAddress('foo')).resolves.toBeUndefined();
    });

    it('decodes base64 and reads memory', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        expect(target.decodeGdbData('AQID')).toEqual(new Uint8Array([1, 2, 3]));
        expect(target.decodeGdbData('AQIDBA')).toEqual(new Uint8Array([1, 2, 3, 4]));
        // atob path
        const globalWithBuffer = global as unknown as { Buffer: typeof Buffer | undefined; atob: ((value: string) => string) | undefined };
        const origBuffer = globalWithBuffer.Buffer;
        const origAtob = globalWithBuffer.atob;
        globalWithBuffer.Buffer = undefined;
        globalWithBuffer.atob = (str: string) => origBuffer?.from(str, 'base64').toString('binary') ?? '';
        expect(target.decodeGdbData('AQID')).toEqual(new Uint8Array([1, 2, 3]));
        globalWithBuffer.Buffer = origBuffer;
        globalWithBuffer.atob = origAtob;

        accessMock.evaluateMemory.mockResolvedValue('AQID');
        await expect(target.readMemory(0x0, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));

        await target.beginUpdateCycle();
        accessMock.evaluateMemory.mockResolvedValue('Unable to read');
        await expect(target.readMemory(0x10, 3)).resolves.toBeUndefined();

        accessMock.evaluateMemory.mockResolvedValue(undefined);
        await expect(target.readMemory(0x10, 3)).resolves.toBeUndefined();

        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        accessMock.evaluateMemory.mockResolvedValue('No active session');
        await expect(target.readMemory(0x10, 3)).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();

        const invalidSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        accessMock.evaluateMemory.mockResolvedValue('bad@');
        await expect(target.readMemory(0x10, 3)).resolves.toBeUndefined();
        expect(invalidSpy).toHaveBeenCalled();
        invalidSpy.mockRestore();

        accessMock.evaluateMemory.mockResolvedValue('AQID');
        const decodeSpy = jest.spyOn(target, 'decodeGdbData').mockReturnValue(undefined);
        await expect(target.readMemory(0x10, 3)).resolves.toBeUndefined();
        decodeSpy.mockRestore();

        accessMock.evaluateMemory.mockResolvedValue('AQID'); // len 3 vs requested 4
        await expect(target.readMemory(0x10, 4)).resolves.toBeUndefined();
    });

    it('calculates memory usage and overflow bit', async () => {
        class MemTarget extends ScvdDebugTarget {
            constructor(private readonly data: Uint8Array) { super(); }
            async readMemory(): Promise<Uint8Array | undefined> {
                return this.data;
            }
        }
        // Two chunks: first fill pattern, second magic value triggers overflow bit
        const data = new Uint8Array([0, 0, 0, 0, 0x44, 0x33, 0x22, 0x11]);
        const target = new MemTarget(data);
        const result = await target.calculateMemoryUsage(0, 8, 0, 0x11223344);
        expect(result).toBeDefined();
        expect((result as number) >>> 0).toBe(0x80000000);

        // No data path
        const noData = new MemTarget(undefined as unknown as Uint8Array);
        await expect(noData.calculateMemoryUsage(0, 4, 0, 0)).resolves.toBeUndefined();

        const used = new MemTarget(new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0]));
        const usedResult = await used.calculateMemoryUsage(0, 8, 0, 0);
        expect((usedResult as number) >>> 0).toBeGreaterThan(0);
        expect(((usedResult as number) >>> 31) & 1).toBe(0);
    });

    it('reads string from pointer and registers', async () => {
        const target = new ScvdDebugTarget();
        await expect(target.readUint8ArrayStrFromPointer(0, 1, 4)).resolves.toBeUndefined();

        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        target.init(session, tracker);
        target.readMemory = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
        await expect(target.readUint8ArrayStrFromPointer(1, 1, 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));

        const spy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        await expect(target.readRegister('unknown')).resolves.toBeUndefined();
        spy.mockRestore();

        accessMock.evaluateRegisterValue.mockResolvedValue(5);
        await expect(target.readRegister('r0')).resolves.toBe(5);

        accessMock.evaluateRegisterValue.mockResolvedValue(undefined);
        await expect(target.readRegister('r0')).resolves.toBeUndefined();

        // Bigint toUint32 helper
        expect(__test__.toUint32(0x1_0000_0000n)).toBe(0n);

        await expect(target.readRegister(undefined as unknown as string)).resolves.toBeUndefined();
    });

    it('covers cache hits, misses, and normalization paths', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const otherSession = { session: { id: 'sess-2' } } as unknown as GDBTargetDebugSession;
        target.setActiveSession(otherSession);
        expect(accessMock.setActiveSession).toHaveBeenCalledWith(otherSession);

        (target as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = undefined;
        await target.beginUpdateCycle();

        const cache = new TargetReadCache();
        (target as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = cache;
        cache.write(0x1000, new Uint8Array([1, 2, 3, 4]));
        await expect(target.readMemory(0x1000, 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));

        const readMemoryFromTarget = jest.fn().mockResolvedValue(new Uint8Array([9, 9, 9, 9]));
        (target as unknown as { readMemoryFromTarget: (addr: number | bigint, size: number) => Promise<Uint8Array | undefined> }).readMemoryFromTarget = readMemoryFromTarget;
        await expect(target.readMemory(0x2000, 4)).resolves.toEqual(new Uint8Array([9, 9, 9, 9]));

        await target.readMemory(Number.NaN, 4);
        await target.readMemory(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 4);
        await target.readMemory(123n, 4);
        expect(readMemoryFromTarget).toHaveBeenCalled();
    });

    it('reads memory directly when cache is disabled', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        (target as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = undefined;
        accessMock.evaluateMemory.mockResolvedValue('AQIDBA==');

        await expect(target.readMemory(0x1000, 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('handles batch read merging, no-session, and invalid offsets', async () => {
        const target = new ScvdDebugTarget();
        const empty = await target.readMemoryBatch([]);
        expect(empty.size).toBe(0);

        target.readMemory = jest.fn().mockResolvedValue(new Uint8Array([1, 2])) as unknown as ScvdDebugTarget['readMemory'];
        const single = await target.readMemoryBatch([{ key: 'one', address: 0x10, size: 2 }]);
        expect(single.get('one')).toEqual(new Uint8Array([1, 2]));

        const noSession = new ScvdDebugTarget();
        const missing = await noSession.readMemoryBatch([
            { key: 'a', address: 0x0, size: 1 },
            { key: 'b', address: 0x2, size: 1 },
        ]);
        expect(missing.get('a')).toBeUndefined();
        expect(missing.get('b')).toBeUndefined();

        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const activeTarget = new ScvdDebugTarget();
        activeTarget.init(session, tracker);
        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(1));
        activeTarget.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await activeTarget.readMemoryBatch([
            { key: 'a', address: 0x1000, size: 4 },
            { key: 'b', address: 0x1004, size: 4 },
            { key: 'c', address: 0x2000, size: 4 },
        ]);
        expect(results.get('a')).toBeDefined();
        expect(results.get('b')).toBeDefined();
        expect(results.get('c')).toBeDefined();

        const activeTarget2 = new ScvdDebugTarget();
        activeTarget2.init(session, tracker);
        const readMemory2 = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(Math.max(0, size - 2)));
        activeTarget2.readMemory = readMemory2 as unknown as ScvdDebugTarget['readMemory'];
        const results2 = await activeTarget2.readMemoryBatch([
            { key: 'x', address: 0x3000, size: 4 },
            { key: 'y', address: 0x3004, size: 4 },
        ]);
        expect(results2.get('x')).toBeDefined();
        expect(results2.get('y')).toBeUndefined();

        const activeTarget3 = new ScvdDebugTarget();
        activeTarget3.init(session, tracker);
        const readMemory3 = jest.fn().mockResolvedValueOnce(undefined);
        activeTarget3.readMemory = readMemory3 as unknown as ScvdDebugTarget['readMemory'];
        const results3 = await activeTarget3.readMemoryBatch([
            { key: 'm', address: 0x4000, size: 4 },
            { key: 'n', address: 0x4004, size: 4 },
        ]);
        expect(results3.get('m')).toBeUndefined();
        expect(results3.get('n')).toBeUndefined();
    });

    it('merges contiguous batch requests into a single read', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(1));
        target.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'a', address: 0x1000, size: 4 },
            { key: 'b', address: 0x1004, size: 4 },
        ]);
        expect(readMemory).toHaveBeenCalledWith(0x1000n, 8);
        expect(results.get('a')).toEqual(new Uint8Array([1, 1, 1, 1]));
        expect(results.get('b')).toEqual(new Uint8Array([1, 1, 1, 1]));
    });

    it('sorts batch requests with identical start addresses', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(2));
        target.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'a', address: 0x2000, size: 4 },
            { key: 'b', address: 0x2000, size: 4 },
        ]);

        expect(results.get('a')).toEqual(new Uint8Array([2, 2, 2, 2]));
        expect(results.get('b')).toEqual(new Uint8Array([2, 2, 2, 2]));
    });

    it('sorts batch requests when addresses are out of order', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(4));
        target.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'b', address: 0x2004, size: 4 },
            { key: 'a', address: 0x2000, size: 4 },
        ]);

        expect(results.get('a')).toEqual(new Uint8Array([4, 4, 4, 4]));
        expect(results.get('b')).toEqual(new Uint8Array([4, 4, 4, 4]));
    });

    it('normalizes bigint batch addresses when merging reads', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(1));
        target.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'a', address: 0x1000n, size: 4 },
            { key: 'b', address: 0x1004n, size: 4 },
        ]);

        expect(readMemory).toHaveBeenCalledWith(0x1000n, 8);
        expect(results.get('a')).toBeDefined();
        expect(results.get('b')).toBeDefined();
    });

    it('handles overlapping batch requests and non-merge timing', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        const readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(2));
        target.readMemory = readMemory as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'a', address: 0x2000, size: 8 },
            { key: 'b', address: 0x2002, size: 2 },
        ]);
        expect(readMemory).toHaveBeenCalledWith(0x2000n, 8);
        expect(results.get('b')).toEqual(new Uint8Array([2, 2]));
    });

    it('skips timing stats when perf is disabled', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);
        (target as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = undefined;

        const stats = await import('../../stats-config') as { perf: { isBackendEnabled: () => boolean; setBackendEnabled: (v: boolean) => void } };
        const prev = stats.perf.isBackendEnabled();
        stats.perf.setBackendEnabled(false);

        accessMock.evaluateMemory.mockResolvedValue('AQIDBA==');
        await expect(target.readMemory(0x1000, 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));

        stats.perf.setBackendEnabled(prev);
    });

    it('filters zero-sized requests during batch reads', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);

        target.readMemory = jest.fn(async (_addr: number | bigint, size: number) => new Uint8Array(size).fill(3)) as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'zero', address: 0x3000, size: 0 },
            { key: 'ok', address: 0x3004, size: 4 },
        ]);

        expect(results.get('zero')).toBeUndefined();
        expect(results.get('ok')).toEqual(new Uint8Array([3, 3, 3, 3]));
    });

    it('reads without perf hooks when stats are disabled', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;

        jest.resetModules();
        const accessLocal = {
            setActiveSession: jest.fn(),
            evaluateSymbolAddress: jest.fn(),
            evaluateSymbolName: jest.fn(),
            evaluateSymbolContext: jest.fn(),
            evaluateNumberOfArrayElements: jest.fn(),
            evaluateSymbolSize: jest.fn(),
            evaluateMemory: jest.fn().mockResolvedValue('AQID'),
            evaluateRegisterValue: jest.fn(),
        };
        jest.doMock('../../component-viewer-target-access', () => ({
            ComponentViewerTargetAccess: jest.fn(() => accessLocal),
        }));
        jest.doMock('../../stats-config', () => ({
            perf: undefined,
            targetReadStats: undefined,
            targetReadTimingStats: undefined,
        }));

        const mod = await import('../../scvd-debug-target');
        const target = new mod.ScvdDebugTarget();
        target.init(session, tracker);
        (target as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = undefined;

        await target.readMemory(0x1000, 3);
    });

    it('covers cache-disabled initialization and readMemoryFromTarget timing', async () => {
        const target = new ScvdDebugTarget();
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        target.init(session, tracker);

        const readMemoryFromTarget = (target as unknown as {
            readMemoryFromTarget: (addr: number | bigint, size: number) => Promise<Uint8Array | undefined>;
        }).readMemoryFromTarget.bind(target);

        accessMock.evaluateMemory.mockResolvedValue('AQIDBA==');
        const data = await readMemoryFromTarget(0x1000, 4);
        expect(data).toEqual(new Uint8Array([1, 2, 3, 4]));

        accessMock.evaluateMemory.mockResolvedValue(123);
        await expect(readMemoryFromTarget(0x1000, 4)).resolves.toBeUndefined();
    });

    it('skips readMemory for zero-sized batch entries and respects gaps', async () => {
        const tracker = { onContinued: jest.fn(), onStopped: jest.fn() } as unknown as GDBTargetDebugTracker;
        const target = new ScvdDebugTarget();
        target.init(session, tracker);
        target.readMemory = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])) as unknown as ScvdDebugTarget['readMemory'];

        const results = await target.readMemoryBatch([
            { key: 'zero', address: 0x1000, size: 0 },
        ]);
        expect(results.get('zero')).toBeUndefined();

        const results2 = await target.readMemoryBatch([
            { key: 'a', address: 0x1000, size: 4 },
            { key: 'b', address: 0x1010, size: 4 },
        ]);
        expect(results2.get('a')).toBeDefined();
        expect(results2.get('b')).toBeDefined();
    });

    it('constructs targets without cache when disabled', async () => {
        jest.resetModules();
        jest.doMock('../../component-viewer-config', () => ({ TARGET_READ_CACHE_ENABLED: false }));
        const mod = await import('../../scvd-debug-target');
        const target = new mod.ScvdDebugTarget();
        expect((target as unknown as { targetReadCache?: TargetReadCache }).targetReadCache).toBeUndefined();
        jest.dontMock('../../component-viewer-config');
    });

    it('throws when no base64 decoder is available', () => {
        const target = new ScvdDebugTarget();
        const globalWithBuffer = global as unknown as { Buffer: typeof Buffer | undefined; atob: ((value: string) => string) | undefined };
        const origBuffer = globalWithBuffer.Buffer;
        const origAtob = globalWithBuffer.atob;
        // Remove decoders
        globalWithBuffer.Buffer = undefined;
        globalWithBuffer.atob = undefined;
        const errorSpy = jest.spyOn(componentViewerLogger, 'error').mockImplementation(() => {});
        expect(target.decodeGdbData('AQID')).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith('ScvdDebugTarget.decodeGdbData: no base64 decoder available in this environment');
        errorSpy.mockRestore();
        // restore
        globalWithBuffer.Buffer = origBuffer;
        globalWithBuffer.atob = origAtob;
    });
});
