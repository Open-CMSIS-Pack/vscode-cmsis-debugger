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
import { SymbolFileAccess, SymbolLog, SymbolSession } from './symbol-backend';
import { SymbolAddress, SymbolHandler, SymbolImage, SymbolLookupOptions } from './symbol-service';
import { isStaticSymbolExpression } from './static-symbol-expression';
import { throwIfAborted, waitForSymbolOperation, withSymbolTimeout } from './symbol-operations';

export interface GdbSymbolHandlerOptions {
    readonly createSession: () => SymbolSession;
    readonly files: SymbolFileAccess;
    readonly log: SymbolLog;
    readonly loadTimeoutMs?: number;
    readonly queryTimeoutMs?: number;
}

/** Serializes access to one lazy GDB worker and invalidates results as soon as its files change. */
export class GdbSymbolHandler implements SymbolHandler {
    private images: readonly SymbolImage[] = [];
    private readonly watches = new Map<string, { dispose(): void }>();
    private session: SymbolSession | undefined;
    private dirty = true;
    private generation = 0;
    private tail = Promise.resolve();
    private readonly lifetime = new AbortController();
    private disposal: Promise<void> | undefined;
    private stopping = Promise.resolve();

    /** Retains injected I/O and worker factories without starting a process. */
    public constructor(private readonly options: GdbSymbolHandlerOptions) {}

    /** Updates image watches for the next lookup and releases the worker if all images are removed. */
    public async setImages(images: readonly SymbolImage[]): Promise<void> {
        this.assertOpen();
        const unique = new Map<string, SymbolImage>();
        for (const image of images) {
            if (!path.isAbsolute(image.path)) {
                throw new Error(`Symbol image path must be absolute: ${image.path}`);
            }
            const normalized = { ...image, path: path.normalize(image.path) };
            unique.set(`${normalized.path}:${normalized.offset ?? 0n}`, normalized);
        }
        const next = [...unique.values()];
        if (next.length === this.images.length && next.every((image, index) =>
            image.path === this.images.at(index)?.path && (image.offset ?? 0n) === (this.images.at(index)?.offset ?? 0n))) {
            return;
        }
        this.images = next;
        this.invalidate();
        const paths = new Set(next.map(image => image.path));
        for (const [file, watch] of this.watches) {
            if (!paths.has(file)) {
                watch.dispose();
                this.watches.delete(file);
            }
        }
        for (const file of paths) {
            if (!this.watches.has(file)) {
                this.watches.set(file, this.options.files.watch(file, () => this.invalidate()));
            }
        }
        if (next.length === 0 && this.session) {
            await this.enqueue(() => this.stopSession());
        }
    }

    /** Resolves static addresses while keeping concurrent MI requests serialized. */
    public async resolveSymbol(expression: string, options: SymbolLookupOptions = {}): Promise<SymbolAddress | undefined> {
        this.assertOpen();
        throwIfAborted(options.signal);
        if (!isStaticSymbolExpression(expression)) {
            return undefined;
        }
        const generation = this.generation;
        const operation = this.enqueue(async () => {
            throwIfAborted(options.signal);
            if (this.lifetime.signal.aborted || generation !== this.generation) {
                return undefined;
            }
            if (!await this.reload()) {
                return undefined;
            }
            throwIfAborted(options.signal);
            const session = this.session;
            if (!session || generation !== this.generation) {
                return undefined;
            }
            try {
                const address = await withSymbolTimeout(session.resolveSymbol(expression), this.options.queryTimeoutMs ?? 5000);
                return generation === this.generation && !this.lifetime.signal.aborted ? address : undefined;
            } catch (error) {
                this.options.log(`Offline symbol query failed: ${expression}`, error);
                await this.stopSession();
                return undefined;
            }
        });
        const signal = options.signal ? AbortSignal.any([options.signal, this.lifetime.signal]) : this.lifetime.signal;
        return waitForSymbolOperation(operation, signal);
    }

    /** Immediately invalidates requests and awaits worker termination once. */
    public dispose(): Promise<void> {
        if (!this.disposal) {
            this.lifetime.abort();
            this.invalidate();
            for (const watch of this.watches.values()) {
                watch.dispose();
            }
            this.watches.clear();
            this.disposal = this.stopSession();
        }
        return this.disposal;
    }

    /** Prevents use after disposal. */
    private assertOpen(): void {
        if (this.lifetime.signal.aborted) {
            throw new Error('Symbol handler has been disposed.');
        }
    }

    /** Marks the loaded images and in-flight results as obsolete. */
    private invalidate(): void {
        this.generation++;
        this.dirty = true;
    }

    /** Queues operations without allowing a rejected request to poison the queue. */
    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation);
        this.tail = result.then(() => {}, () => {});
        return result;
    }

    /** Replaces all symbols and drops the worker after any initialization failure. */
    private async reload(): Promise<boolean> {
        if (this.lifetime.signal.aborted) {
            return false;
        }
        if (!this.dirty) {
            return true;
        }
        const generation = this.generation;
        try {
            const available = await Promise.all(this.images.map(async image =>
                await this.options.files.exists(image.path) ? image : undefined));
            if (generation !== this.generation || this.lifetime.signal.aborted) {
                return false;
            }
            const images = available.filter(image => image !== undefined);
            if (!images.length) {
                await this.stopSession();
                return false;
            }
            let session = this.session;
            const starting = !session;
            if (!session) {
                session = this.options.createSession();
                this.session = session;
            }
            const worker = session;
            await withSymbolTimeout((async () => {
                if (starting) {
                    await worker.start();
                }
                if (generation === this.generation && this.session === worker && !this.lifetime.signal.aborted) {
                    await worker.loadImages(images);
                }
            })(), this.options.loadTimeoutMs ?? 30000);
            this.dirty = generation !== this.generation;
            return !this.dirty && !this.lifetime.signal.aborted;
        } catch (error) {
            this.options.log('Offline symbol worker initialization failed.', error);
            await this.stopSession();
            return false;
        }
    }

    /** Detaches the worker before awaiting cleanup, so it cannot be reused. */
    private stopSession(): Promise<void> {
        const session = this.session;
        this.session = undefined;
        this.dirty = true;
        if (session) {
            const stopped = (async () => {
                try {
                    await session.dispose();
                } catch (error) {
                    this.options.log('Offline symbol worker shutdown failed.', error);
                }
            })();
            this.stopping = Promise.all([this.stopping, stopped]).then(() => {});
        }
        return this.stopping;
    }
}
