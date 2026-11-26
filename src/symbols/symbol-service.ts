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

/** A normalized, unsigned hexadecimal address; address zero is valid. */
export type SymbolAddress = `0x${string}`;

/** A successful lookup on a named processor, or an unnamed single processor. */
export type SymbolMatch = readonly [pname: string | undefined, address: SymbolAddress];

/** An absolute ELF path and optional relocation applied to every section. */
export interface SymbolImage {
    readonly path: string;
    readonly offset?: bigint;
}

export interface SymbolLookupOptions {
    readonly signal?: AbortSignal;
}

/** Resolves static addresses without accessing a target or an active debug session. */
export interface SymbolResolver {
    /** Returns successful matches only; an omitted processor may be unavailable or unresolved.
     * Cancellation rejects with AbortError. Unsupported and runtime-dependent expressions yield no matches.
     */
    resolveSymbol(expression: string, options?: SymbolLookupOptions): Promise<readonly SymbolMatch[]>;
}

/** Owns build metadata and the processor handlers created for it. */
export interface SymbolService extends SymbolResolver {
    /** Replaces the watched build file; undefined clears the current build and all handlers. */
    setBuildFile(path: string | undefined): Promise<void>;
    /** Invalidates pending requests and releases watches and processes; safe to await repeatedly. */
    dispose(): Promise<void>;
}

/** Owns an offline symbol worker and watches its complete set of ELF images. */
export interface SymbolHandler {
    /** Reconciles absolute image paths and relocations without starting an unused worker. */
    setImages(images: readonly SymbolImage[]): Promise<void>;
    /** Returns a static address, or undefined when it cannot be resolved offline. */
    resolveSymbol(expression: string, options?: SymbolLookupOptions): Promise<SymbolAddress | undefined>;
    /** Releases watches and the worker; safe to await repeatedly. */
    dispose(): Promise<void>;
}
