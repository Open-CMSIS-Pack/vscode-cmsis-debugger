/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import * as path from 'node:path';
import { GdbSymbolHandler } from './gdb-symbol-handler';
import { deferred, symbolFilesFactory, symbolSessionFactory } from './__test__/symbol-test-support';

/** An absolute fixture image works on all supported host platforms. */
const IMAGE = { path: path.resolve('test.elf') };
/** A second fixture image exercises complete-set reloads. */
const SECOND_IMAGE = { path: path.resolve('second.axf'), offset: 4096n };

describe('GdbSymbolHandler', () => {
    const files = symbolFilesFactory();
    let session: ReturnType<typeof symbolSessionFactory>;
    let createSession: jest.Mock;
    let handler: GdbSymbolHandler;
    const log = jest.fn();

    beforeEach(() => {
        session = symbolSessionFactory();
        createSession = jest.fn(() => session);
        handler = new GdbSymbolHandler({ files, createSession, log, loadTimeoutMs: 300, queryTimeoutMs: 100 });
    });

    afterEach(async () => {
        await handler.dispose();
        jest.useRealTimers();
        files.missing.clear();
        expect(files.watchers.size).toBe(0);
    });

    it('starts lazily, deduplicates images, and preserves zero addresses', async () => {
        await handler.setImages([IMAGE, IMAGE, SECOND_IMAGE]);
        expect(createSession).not.toHaveBeenCalled();
        session.resolveSymbol.mockResolvedValue('0x0');
        await expect(handler.resolveSymbol('main')).resolves.toBe('0x0');
        await expect(handler.resolveSymbol('main')).resolves.toBe('0x0');
        expect(session.start).toHaveBeenCalledTimes(1);
        expect(session.loadImages).toHaveBeenCalledTimes(1);
        expect(session.loadImages).toHaveBeenCalledWith([IMAGE, SECOND_IMAGE]);
        expect(session.resolveSymbol).toHaveBeenCalledTimes(2);
    });

    it('rejects relative paths and avoids starting for unsupported expressions or missing files', async () => {
        await expect(handler.setImages([{ path: 'relative.elf' }])).rejects.toThrow('absolute');
        await handler.setImages([IMAGE]);
        await expect(handler.resolveSymbol('call()')).resolves.toBeUndefined();
        files.missing.add(IMAGE.path);
        await expect(handler.resolveSymbol('main')).resolves.toBeUndefined();
        expect(createSession).not.toHaveBeenCalled();
    });

    it('loads available images when another image is missing', async () => {
        files.missing.add(SECOND_IMAGE.path);
        await handler.setImages([IMAGE, SECOND_IMAGE]);
        await handler.resolveSymbol('main');
        expect(session.loadImages).toHaveBeenCalledWith([IMAGE]);
        expect(files.watchers.has(SECOND_IMAGE.path)).toBe(true);
    });

    it('distinguishes complete symbol misses from misses with missing images and recovers after rebuild', async () => {
        await handler.setImages([IMAGE, SECOND_IMAGE]);
        session.resolveSymbol.mockResolvedValue(undefined);
        await expect(handler.lookupSymbol('unknown')).resolves.toEqual({ status: 'unresolved' });

        files.missing.add(SECOND_IMAGE.path);
        files.change(SECOND_IMAGE.path);
        await expect(handler.lookupSymbol('unknown')).resolves.toEqual({ status: 'unavailable' });
        await expect(handler.lookupSymbol('unknown')).resolves.toEqual({ status: 'unavailable' });

        session.resolveSymbol.mockResolvedValueOnce('0x0');
        await expect(handler.lookupSymbol('main')).resolves.toEqual({ status: 'resolved', address: '0x0' });

        files.missing.delete(SECOND_IMAGE.path);
        files.change(SECOND_IMAGE.path);
        await expect(handler.lookupSymbol('unknown')).resolves.toEqual({ status: 'unresolved' });
    });

    it('reports unavailable when no images can be loaded', async () => {
        await handler.setImages([IMAGE]);
        files.missing.add(IMAGE.path);

        await expect(handler.lookupSymbol('main')).resolves.toEqual({ status: 'unavailable' });
        expect(createSession).not.toHaveBeenCalled();
    });

    it.each(['start', 'loadImages', 'resolveSymbol'] as const)('reports worker %s failures as unavailable and retries', async operation => {
        await handler.setImages([IMAGE]);
        jest.spyOn(session, operation).mockRejectedValueOnce(new Error('worker failure'));

        await expect(handler.lookupSymbol('main')).resolves.toEqual({ status: 'unavailable' });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        await expect(handler.lookupSymbol('main')).resolves.toEqual({ status: 'resolved', address: '0x1234' });
    });

    it('reconciles watches and reloads only when the image set changes', async () => {
        await handler.setImages([IMAGE]);
        await handler.resolveSymbol('main');
        await handler.setImages([IMAGE]);
        expect(session.loadImages).toHaveBeenCalledTimes(1);
        await handler.setImages([SECOND_IMAGE]);
        expect(files.watchers.has(IMAGE.path)).toBe(false);
        expect(files.watchers.has(SECOND_IMAGE.path)).toBe(true);
        expect(session.loadImages).toHaveBeenCalledTimes(1);

        await handler.resolveSymbol('main');
        expect(session.loadImages).toHaveBeenLastCalledWith([SECOND_IMAGE]);
        await handler.setImages([]);
        expect(session.dispose).toHaveBeenCalledTimes(1);
    });

    it('reloads the available images once on the next lookup after repeated file changes', async () => {
        jest.useFakeTimers();
        await handler.setImages([IMAGE, SECOND_IMAGE]);
        await handler.resolveSymbol('main');
        files.missing.add(SECOND_IMAGE.path);
        files.change(SECOND_IMAGE.path);
        files.change(IMAGE.path);
        files.change(SECOND_IMAGE.path);
        await jest.runAllTimersAsync();
        expect(session.loadImages).toHaveBeenCalledTimes(1);

        await handler.resolveSymbol('main');
        await handler.resolveSymbol('other');
        expect(session.loadImages).toHaveBeenCalledTimes(2);
        expect(session.loadImages).toHaveBeenLastCalledWith([IMAGE]);

        files.missing.delete(SECOND_IMAGE.path);
        files.change(SECOND_IMAGE.path);
        await handler.resolveSymbol('main');
        expect(session.loadImages).toHaveBeenLastCalledWith([IMAGE, SECOND_IMAGE]);
    });

    it('discards an address when its image changes during a query', async () => {
        await handler.setImages([IMAGE]);
        const reply = deferred<`0x${string}` | undefined>();
        const queried = deferred<void>();
        session.resolveSymbol.mockImplementation(() => {
            queried.resolve();
            return reply.promise;
        });
        const result = handler.resolveSymbol('main');
        await queried.promise;
        files.change(IMAGE.path);
        reply.resolve('0x1234');
        await expect(result).resolves.toBeUndefined();
    });

    it('cancels a caller without killing its shared worker or overlapping MI queries', async () => {
        await handler.setImages([IMAGE]);
        const reply = deferred<`0x${string}` | undefined>();
        const queried = deferred<void>();
        session.resolveSymbol.mockImplementationOnce(() => {
            queried.resolve();
            return reply.promise;
        });
        const controller = new AbortController();
        const first = handler.resolveSymbol('main', { signal: controller.signal });
        await queried.promise;
        const second = handler.resolveSymbol('other');
        controller.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        expect(session.dispose).not.toHaveBeenCalled();
        expect(session.resolveSymbol).toHaveBeenCalledTimes(1);
        reply.resolve('0x1000');
        await expect(second).resolves.toBe('0x1234');
        expect(session.resolveSymbol).toHaveBeenCalledTimes(2);
    });

    it('does not issue a query cancelled while its worker is still initializing', async () => {
        await handler.setImages([IMAGE]);
        const starting = deferred<void>();
        const ready = deferred<void>();
        session.start.mockImplementationOnce(() => {
            starting.resolve();
            return ready.promise;
        });
        const controller = new AbortController();
        const first = handler.resolveSymbol('main', { signal: controller.signal });
        await starting.promise;
        controller.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        ready.resolve();
        await expect(handler.resolveSymbol('other')).resolves.toBe('0x1234');
        expect(session.resolveSymbol).toHaveBeenCalledTimes(1);
        expect(session.resolveSymbol).toHaveBeenCalledWith('other');
        expect(session.dispose).not.toHaveBeenCalled();
    });

    it('does not revive a timed-out worker when its delayed startup completes', async () => {
        jest.useFakeTimers();
        await handler.setImages([IMAGE]);
        const oldSession = session;
        const ready = deferred<void>();
        oldSession.start.mockReturnValueOnce(ready.promise);
        const first = handler.resolveSymbol('main');
        await jest.advanceTimersByTimeAsync(300);
        await expect(first).resolves.toBeUndefined();
        session = symbolSessionFactory();
        await expect(handler.resolveSymbol('other')).resolves.toBe('0x1234');
        ready.resolve();
        await jest.advanceTimersByTimeAsync(0);
        expect(oldSession.loadImages).not.toHaveBeenCalled();
        expect(session.loadImages).toHaveBeenCalledTimes(1);
    });

    it('times out queries, terminates the worker and retries on the next lookup', async () => {
        jest.useFakeTimers();
        await handler.setImages([IMAGE]);
        session.resolveSymbol.mockReturnValueOnce(new Promise(() => {}));
        const result = handler.lookupSymbol('main');
        await jest.advanceTimersByTimeAsync(100);
        await expect(result).resolves.toEqual({ status: 'unavailable' });
        expect(session.dispose).toHaveBeenCalledTimes(1);
        await expect(handler.resolveSymbol('main')).resolves.toBe('0x1234');
        expect(createSession).toHaveBeenCalledTimes(2);
    });

    it('times out initialization and retries without an automatic restart loop', async () => {
        jest.useFakeTimers();
        await handler.setImages([IMAGE]);
        session.start.mockReturnValueOnce(new Promise(() => {}));
        const result = handler.lookupSymbol('main');
        await jest.advanceTimersByTimeAsync(300);
        await expect(result).resolves.toEqual({ status: 'unavailable' });
        await jest.advanceTimersByTimeAsync(1000);
        expect(createSession).toHaveBeenCalledTimes(1);
        await expect(handler.resolveSymbol('main')).resolves.toBe('0x1234');
        expect(createSession).toHaveBeenCalledTimes(2);
    });

    it('drops failed reloads rather than querying stale symbols', async () => {
        await handler.setImages([IMAGE]);
        await handler.resolveSymbol('main');
        session.loadImages.mockRejectedValueOnce(new Error('corrupt ELF'));
        await handler.setImages([SECOND_IMAGE]);

        await expect(handler.resolveSymbol('other')).resolves.toBeUndefined();
        expect(session.resolveSymbol).toHaveBeenCalledTimes(1);
        expect(session.dispose).toHaveBeenCalledTimes(1);
        await handler.resolveSymbol('other');
        expect(session.start).toHaveBeenCalledTimes(2);
        expect(session.loadImages).toHaveBeenLastCalledWith([SECOND_IMAGE]);
    });

    it('awaits a worker shutdown already started by a query failure', async () => {
        await handler.setImages([IMAGE]);
        const stopping = deferred<void>();
        const stopped = deferred<void>();
        session.resolveSymbol.mockRejectedValueOnce(new Error('pipe closed'));
        session.dispose.mockImplementationOnce(() => {
            stopping.resolve();
            return stopped.promise;
        });
        const result = handler.resolveSymbol('main');
        const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
        await stopping.promise;
        let finished = false;
        const disposal = handler.dispose().then(() => { finished = true; });
        await new Promise<void>(resolve => setImmediate(resolve));
        const finishedBeforeShutdown = finished;
        stopped.resolve();
        await Promise.all([disposal, rejected]);
        expect(finishedBeforeShutdown).toBe(false);
    });

    it('invalidates pending requests on idempotent disposal and rejects later operations', async () => {
        await handler.setImages([IMAGE]);
        const queried = deferred<void>();
        const reply = deferred<undefined>();
        session.resolveSymbol.mockImplementation(() => {
            queried.resolve();
            return reply.promise;
        });
        const result = handler.resolveSymbol('main');
        await queried.promise;
        const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
        await Promise.all([handler.dispose(), handler.dispose()]);
        await rejected;
        expect(session.dispose).toHaveBeenCalledTimes(1);
        await expect(handler.resolveSymbol('main')).rejects.toThrow('disposed');
        await expect(handler.setImages([])).rejects.toThrow('disposed');
        reply.resolve(undefined);
    });
});
