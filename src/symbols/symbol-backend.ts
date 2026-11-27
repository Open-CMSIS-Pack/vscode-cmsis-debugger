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

import { SymbolAddress, SymbolImage } from './symbol-service';

/** The private backend boundary; no GDB or editor types escape through the service API. */
export interface SymbolSession {
    /** Starts a symbols-only process without connecting to or loading an executable target. */
    start(): Promise<void>;
    /** Replaces the complete loaded symbol set, including section relocations. */
    loadImages(images: readonly SymbolImage[]): Promise<void>;
    /** Resolves a previously validated static expression. */
    resolveSymbol(expression: string): Promise<SymbolAddress | undefined>;
    /** Terminates the process with a bounded wait, including during startup. */
    dispose(): Promise<void>;
}

/** File events include creation, replacement, modification and deletion. */
export interface SymbolFileAccess {
    /** Watches all file lifecycle events until the returned registration is disposed. */
    watch(path: string, changed: () => void): { dispose(): void };
    /** Reports whether the image is currently available for loading. */
    exists(path: string): Promise<boolean>;
}

/** Receives operational failures with processor or file context. */
export type SymbolLog = (message: string, error: unknown) => void;
