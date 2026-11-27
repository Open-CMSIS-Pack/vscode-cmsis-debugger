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
import { SymbolFileAccess, SymbolLog } from './symbol-backend';
import { SymbolHandler, SymbolImage, SymbolLookupOptions, SymbolLookupResult, SymbolMatch, SymbolResolution, SymbolService } from './symbol-service';
import { throwIfAborted, waitForSymbolOperation } from './symbol-operations';

/** A snapshot from one successfully parsed build file. Unqualified images apply to every processor. */
export interface SymbolBuild {
    readonly processors: readonly (string | undefined)[];
    readonly images: readonly (SymbolImage & { readonly pname?: string })[];
}

export interface CbuildRunSymbolServiceOptions {
    readonly readBuild: (path: string) => Promise<SymbolBuild>;
    readonly files: Pick<SymbolFileAccess, 'watch'>;
    readonly createHandler: (pname: string | undefined) => SymbolHandler;
    readonly log: SymbolLog;
}

/** Reconciles build metadata and aggregates independent offline processor lookups. */
export class CbuildRunSymbolService implements SymbolService {
    private buildFile: string | undefined;
    private watch: { dispose(): void } | undefined;
    private readonly handlers = new Map<string | undefined, SymbolHandler>();
    private generation = 0;
    private valid = false;
    private pending = Promise.resolve();
    private readonly lifetime = new AbortController();
    private disposal: Promise<void> | undefined;
    private stopping = Promise.resolve();

    /** Retains build and handler factories until a build file is selected. */
    public constructor(private readonly options: CbuildRunSymbolServiceOptions) {}

    /** Changes the build source and releases handlers belonging to the previous solution. */
    public async setBuildFile(file: string | undefined): Promise<void> {
        this.assertOpen();
        const normalized = file === undefined ? undefined : path.resolve(file);
        const changed = normalized !== this.buildFile;
        this.buildFile = normalized;
        this.watch?.dispose();
        this.watch = normalized === undefined ? undefined : this.options.files.watch(normalized, () => {
            void this.refresh(false);
        });
        return this.refresh(changed);
    }

    /** Queries processors concurrently and returns successful, current-generation matches only. */
    public async resolveSymbol(expression: string, options: SymbolLookupOptions = {}): Promise<readonly SymbolMatch[]> {
        return (await this.lookupSymbol(expression, options)).matches;
    }

    /** Queries processors concurrently, retaining unavailable processors alongside current matches. */
    public async lookupSymbol(expression: string, options: SymbolLookupOptions = {}): Promise<SymbolLookupResult> {
        this.assertOpen();
        throwIfAborted(options.signal);
        const generation = this.generation;
        const operation = (async (): Promise<SymbolLookupResult> => {
            await this.pending;
            if (!this.valid || generation !== this.generation || this.lifetime.signal.aborted) {
                return { matches: [], unavailableProcessors: [] };
            }
            const results = await Promise.all([...this.handlers].map(async ([pname, handler]): Promise<SymbolResolution & { pname: string | undefined }> => {
                try {
                    return { pname, ...await handler.lookupSymbol(expression, options) };
                } catch (error) {
                    throwIfAborted(options.signal);
                    this.options.log(`Offline symbol lookup unavailable for processor ${pname ?? '<unnamed>'}.`, error);
                    return { pname, status: 'unavailable' };
                }
            }));
            const matches: SymbolMatch[] = [];
            const unavailableProcessors: (string | undefined)[] = [];
            if (generation === this.generation && !this.lifetime.signal.aborted) {
                results.forEach(result => {
                    if (result.status === 'resolved') {
                        matches.push([result.pname, result.address]);
                    } else if (result.status === 'unavailable') {
                        unavailableProcessors.push(result.pname);
                    }
                });
            }
            return { matches, unavailableProcessors };
        })();
        const signal = options.signal ? AbortSignal.any([options.signal, this.lifetime.signal]) : this.lifetime.signal;
        return waitForSymbolOperation(operation, signal);
    }

    /** Invalidates requests and awaits all owned handlers, without waiting for pending file reads. */
    public dispose(): Promise<void> {
        if (!this.disposal) {
            this.lifetime.abort();
            this.generation++;
            this.valid = false;
            this.watch?.dispose();
            this.disposal = this.clearHandlers();
        }
        return this.disposal;
    }

    /** Rejects operations after disposal. */
    private assertOpen(): void {
        if (this.lifetime.signal.aborted) {
            throw new Error('Symbol service has been disposed.');
        }
    }

    /** Invalidates immediately and serializes metadata changes to preserve handler ownership. */
    private refresh(clear: boolean): Promise<void> {
        const generation = ++this.generation;
        const file = this.buildFile;
        this.valid = false;
        this.pending = this.pending.then(async () => {
            if (clear) {
                await this.clearHandlers();
            }
            if (generation !== this.generation || this.lifetime.signal.aborted || !file) {
                return;
            }
            try {
                const build = await this.options.readBuild(file);
                if (generation !== this.generation || this.lifetime.signal.aborted) {
                    return;
                }
                const processors = new Set(build.processors);
                for (const [pname, handler] of this.handlers) {
                    if (!processors.has(pname)) {
                        this.handlers.delete(pname);
                        await this.disposeHandlers([handler]);
                    }
                }
                await Promise.all([...processors].map(async pname => {
                    if (this.lifetime.signal.aborted || generation !== this.generation) {
                        return;
                    }
                    let handler = this.handlers.get(pname);
                    if (!handler) {
                        handler = this.options.createHandler(pname);
                        this.handlers.set(pname, handler);
                    }
                    const images = build.images
                        .filter(image => image.pname === undefined || image.pname === pname)
                        .map(image => ({
                            path: image.path,
                            ...(image.offset === undefined ? {} : { offset: image.offset })
                        }));
                    await handler.setImages(images);
                }));
                this.valid = generation === this.generation && !this.lifetime.signal.aborted;
            } catch (error) {
                this.options.log(`Cannot read offline symbols from ${file}.`, error);
                await this.clearHandlers();
            }
        });
        return this.pending;
    }

    /** Removes handlers from the registry before awaiting their shutdown. */
    private clearHandlers(): Promise<void> {
        const handlers = [...this.handlers.values()];
        this.handlers.clear();
        return this.disposeHandlers(handlers);
    }

    /** Tracks detached handlers so disposal also awaits shutdowns already in progress. */
    private disposeHandlers(handlers: readonly SymbolHandler[]): Promise<void> {
        const stopped = Promise.all(handlers.map(async handler => {
            try {
                await handler.dispose();
            } catch (error) {
                this.options.log('Cannot dispose offline symbol handler.', error);
            }
        }));
        this.stopping = Promise.all([this.stopping, stopped]).then(() => {});
        return this.stopping;
    }
}
