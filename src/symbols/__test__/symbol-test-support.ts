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

import { SymbolAddress, SymbolHandler, SymbolResolution, SymbolService } from '../symbol-service';
import { SymbolFileAccess, SymbolSession } from '../symbol-backend';

/** Supplies explicit promise completion for deterministic concurrency tests. */
export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((complete, fail) => {
        resolve = complete;
        reject = fail;
    });
    return { promise, resolve, reject };
}

/** Creates a narrow, reusable symbol backend fixture. */
export function symbolSessionFactory(): jest.Mocked<SymbolSession> {
    return {
        start: jest.fn().mockResolvedValue(undefined),
        loadImages: jest.fn().mockResolvedValue(undefined),
        resolveSymbol: jest.fn().mockResolvedValue('0x1234'),
        dispose: jest.fn().mockResolvedValue(undefined)
    };
}

/** Models file existence and exact watch ownership without filesystem or editor globals. */
export function symbolFilesFactory(): SymbolFileAccess & { change(path: string): void; missing: Set<string>; watchers: Map<string, Set<() => void>> } {
    const watchers = new Map<string, Set<() => void>>();
    const missing = new Set<string>();
    return {
        missing,
        watchers,
        watch(path, callback) {
            const callbacks = watchers.get(path) ?? new Set<() => void>();
            callbacks.add(callback);
            watchers.set(path, callbacks);
            return { dispose() {
                callbacks.delete(callback);
                if (!callbacks.size) {
                    watchers.delete(path);
                }
            } };
        },
        async exists(path) {
            return !missing.has(path);
        },
        change(path) {
            for (const callback of watchers.get(path) ?? []) {
                callback();
            }
        }
    };
}

/** Creates a service fixture for desktop ownership and lookup consumer tests. */
export function symbolServiceFactory(): jest.Mocked<SymbolService> {
    const resolveSymbol: jest.MockedFunction<SymbolService['resolveSymbol']> = jest.fn().mockResolvedValue([]);
    return {
        setBuildFile: jest.fn().mockResolvedValue(undefined),
        resolveSymbol,
        lookupSymbol: jest.fn(async (expression, options) => ({
            matches: await resolveSymbol(expression, options),
            unavailableProcessors: []
        })),
        dispose: jest.fn().mockResolvedValue(undefined)
    };
}

/** Creates a processor handler fixture with detailed results derived from its address mock. */
export function symbolHandlerFactory(address: SymbolAddress = '0x1234'): jest.Mocked<SymbolHandler> {
    const resolveSymbol: jest.MockedFunction<SymbolHandler['resolveSymbol']> = jest.fn().mockResolvedValue(address);
    return {
        setImages: jest.fn().mockResolvedValue(undefined),
        resolveSymbol,
        lookupSymbol: jest.fn(async (expression, options): Promise<SymbolResolution> => {
            const address = await resolveSymbol(expression, options);
            return address === undefined ? { status: 'unresolved' } : { status: 'resolved', address };
        }),
        dispose: jest.fn().mockResolvedValue(undefined)
    };
}
