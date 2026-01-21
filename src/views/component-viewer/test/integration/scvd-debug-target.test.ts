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
 *
 * Integration test for ScvdDebugTarget.
 */
// generated with AI

import { ScvdDebugTarget, gdbNameFor, __test__ } from '../../scvd-debug-target';
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
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
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

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
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

        accessMock.evaluateMemory.mockResolvedValue('Unable to read');
        await expect(target.readMemory(0x0, 3)).resolves.toBeUndefined();

        accessMock.evaluateMemory.mockResolvedValue(undefined);
        await expect(target.readMemory(0x0, 3)).resolves.toBeUndefined();

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        accessMock.evaluateMemory.mockResolvedValue('No active session');
        await expect(target.readMemory(0x0, 3)).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();

        accessMock.evaluateMemory.mockResolvedValue('AQID'); // len 3 vs requested 4
        await expect(target.readMemory(0x0, 4)).resolves.toBeUndefined();
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

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
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

    it('throws when no base64 decoder is available', () => {
        const target = new ScvdDebugTarget();
        const globalWithBuffer = global as unknown as { Buffer: typeof Buffer | undefined; atob: ((value: string) => string) | undefined };
        const origBuffer = globalWithBuffer.Buffer;
        const origAtob = globalWithBuffer.atob;
        // Remove decoders
        globalWithBuffer.Buffer = undefined;
        globalWithBuffer.atob = undefined;
        expect(() => target.decodeGdbData('AQID')).toThrow('No base64 decoder available');
        // restore
        globalWithBuffer.Buffer = origBuffer;
        globalWithBuffer.atob = origAtob;
    });
});
