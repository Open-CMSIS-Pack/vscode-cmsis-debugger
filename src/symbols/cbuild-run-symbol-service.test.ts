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
import { CbuildRunSymbolService, SymbolBuild } from './cbuild-run-symbol-service';
import { SymbolHandler } from './symbol-service';
import { deferred, symbolFilesFactory, symbolHandlerFactory } from './__test__/symbol-test-support';

/** The watched build path is absolute on every host. */
const BUILD_FILE = path.resolve('solution.cbuild-run.yml');
/** Qualified and shared images model two independent processors. */
const BUILD: SymbolBuild = {
    processors: ['HP', 'HE'],
    images: [
        { path: path.resolve('hp.elf'), pname: 'HP' },
        { path: path.resolve('he.elf'), pname: 'HE' },
        { path: path.resolve('shared.elf'), offset: 0x1000n }
    ]
};

describe('CbuildRunSymbolService', () => {
    let files: ReturnType<typeof symbolFilesFactory>;
    let handlers: Map<string | undefined, jest.Mocked<SymbolHandler>>;
    let readBuild: jest.Mock<Promise<SymbolBuild>, [string]>;
    let service: CbuildRunSymbolService;
    const log = jest.fn();

    beforeEach(() => {
        files = symbolFilesFactory();
        handlers = new Map();
        readBuild = jest.fn().mockResolvedValue(BUILD);
        service = new CbuildRunSymbolService({ files, readBuild, log, createHandler(pname) {
            const handler = symbolHandlerFactory(pname === 'HE' ? '0x2000' : '0x1000');
            handlers.set(pname, handler);
            return handler;
        } });
    });

    afterEach(async () => {
        await service.dispose();
        expect(files.watchers.size).toBe(0);
    });

    it('assigns qualified images and shares unqualified ones, returning only successful tuples', async () => {
        await expect(service.resolveSymbol('main')).resolves.toEqual([]);
        await service.setBuildFile(BUILD_FILE);
        expect(handlers.get('HP')?.setImages).toHaveBeenCalledWith([{ path: path.resolve('hp.elf') }, BUILD.images[2]]);
        expect(handlers.get('HE')?.setImages).toHaveBeenCalledWith([{ path: path.resolve('he.elf') }, BUILD.images[2]]);
        await expect(service.resolveSymbol('main')).resolves.toEqual([['HP', '0x1000'], ['HE', '0x2000']]);
        handlers.get('HP')?.resolveSymbol.mockResolvedValue(undefined);
        await expect(service.resolveSymbol('main')).resolves.toEqual([['HE', '0x2000']]);
    });

    it('queries processors in parallel and isolates processor failures', async () => {
        await service.setBuildFile(BUILD_FILE);
        const hp = deferred<`0x${string}` | undefined>();
        handlers.get('HP')?.resolveSymbol.mockReturnValue(hp.promise);
        const he = deferred<void>();
        handlers.get('HE')?.resolveSymbol.mockImplementation(async () => {
            he.resolve();
            throw new Error('unavailable GDB');
        });
        const result = service.resolveSymbol('main');
        await he.promise;
        hp.resolve('0x0');
        await expect(result).resolves.toEqual([['HP', '0x0']]);
    });

    it.each(['unavailable', 'rejected'])('retains a %s processor alongside successful matches', async failure => {
        await service.setBuildFile(BUILD_FILE);
        if (failure === 'unavailable') {
            handlers.get('HE')?.lookupSymbol.mockResolvedValue({ status: 'unavailable' });
        } else {
            handlers.get('HE')?.lookupSymbol.mockRejectedValue(new Error('worker unavailable'));
        }

        await expect(service.lookupSymbol('main')).resolves.toEqual({
            matches: [['HP', '0x1000']],
            unavailableProcessors: ['HE']
        });
        await expect(service.resolveSymbol('main')).resolves.toEqual([['HP', '0x1000']]);
    });

    it('distinguishes a confirmed miss from an unavailable processor', async () => {
        await service.setBuildFile(BUILD_FILE);
        handlers.get('HE')?.lookupSymbol.mockResolvedValue({ status: 'unresolved' });

        await expect(service.lookupSymbol('unknown')).resolves.toEqual({
            matches: [['HP', '0x1000']],
            unavailableProcessors: []
        });
    });

    it('preserves an unchanged core, removes old cores and creates new cores on file events', async () => {
        await service.setBuildFile(BUILD_FILE);
        const hp = handlers.get('HP');
        const he = handlers.get('HE');
        readBuild.mockResolvedValue({ ...BUILD, processors: ['HE', 'NEW'] });
        files.change(BUILD_FILE);
        await service.resolveSymbol('main');
        expect(hp?.dispose).toHaveBeenCalledTimes(1);
        expect(handlers.get('HE')).toBe(he);
        expect(handlers.has('NEW')).toBe(true);
    });

    it('drops stale matches immediately when a build changes', async () => {
        await service.setBuildFile(BUILD_FILE);
        const reply = deferred<`0x${string}` | undefined>();
        const queried = deferred<void>();
        handlers.get('HP')?.resolveSymbol.mockImplementation(() => {
            queried.resolve();
            return reply.promise;
        });
        const result = service.resolveSymbol('main');
        await queried.promise;
        files.change(BUILD_FILE);
        reply.resolve('0x1234');
        await expect(result).resolves.toEqual([]);
    });

    it('clears old metadata after a missing or invalid build and recovers on recreation', async () => {
        await service.setBuildFile(BUILD_FILE);
        const old = handlers.get('HP');
        readBuild.mockRejectedValueOnce(new Error('missing build'));
        files.change(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([]);
        expect(old?.dispose).toHaveBeenCalledTimes(1);
        files.change(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([['HP', '0x1000'], ['HE', '0x2000']]);
    });

    it('supports an unnamed single core and clearing the build', async () => {
        readBuild.mockResolvedValue({ processors: [undefined], images: [] });
        await service.setBuildFile(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([[undefined, '0x1000']]);
        await service.setBuildFile(undefined);
        expect(handlers.get(undefined)?.dispose).toHaveBeenCalledTimes(1);
        await expect(service.resolveSymbol('main')).resolves.toEqual([]);
    });

    it('does not resurrect handlers when a slow parse completes after a solution switch', async () => {
        const pending = deferred<SymbolBuild>();
        const started = deferred<void>();
        readBuild.mockImplementationOnce(() => {
            started.resolve();
            return pending.promise;
        });
        const first = service.setBuildFile(BUILD_FILE);
        await started.promise;
        const second = service.setBuildFile(path.resolve('other.cbuild-run.yml'));
        pending.resolve({ processors: ['STALE'], images: [] });
        await Promise.all([first, second]);
        expect(handlers.has('STALE')).toBe(false);
        expect(handlers.size).toBe(2);
    });

    it('cancels pending lookups and rejects calls after disposal', async () => {
        await service.setBuildFile(BUILD_FILE);
        const controller = new AbortController();
        controller.abort();
        await expect(service.resolveSymbol('main', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        await Promise.all([service.dispose(), service.dispose()]);
        expect(handlers.get('HP')?.dispose).toHaveBeenCalledTimes(1);
        await expect(service.resolveSymbol('main')).rejects.toThrow('disposed');
        await expect(service.setBuildFile(BUILD_FILE)).rejects.toThrow('disposed');
    });

    it('awaits a removed processor whose shutdown is already in progress', async () => {
        await service.setBuildFile(BUILD_FILE);
        const stopping = deferred<void>();
        const stopped = deferred<void>();
        handlers.get('HP')?.dispose.mockImplementationOnce(() => {
            stopping.resolve();
            return stopped.promise;
        });
        readBuild.mockResolvedValue({ ...BUILD, processors: ['HE'] });
        files.change(BUILD_FILE);
        await stopping.promise;
        let finished = false;
        const disposal = service.dispose().then(() => { finished = true; });
        await new Promise<void>(resolve => setImmediate(resolve));
        const finishedBeforeShutdown = finished;
        stopped.resolve();
        await disposal;
        expect(finishedBeforeShutdown).toBe(false);
    });

    it('does not create handlers after disposal interrupts metadata parsing', async () => {
        const pending = deferred<SymbolBuild>();
        const started = deferred<void>();
        readBuild.mockImplementation(() => {
            started.resolve();
            return pending.promise;
        });
        const configuring = service.setBuildFile(BUILD_FILE);
        await started.promise;
        await service.dispose();
        pending.resolve(BUILD);
        await configuring;
        expect(handlers.size).toBe(0);
    });
});
