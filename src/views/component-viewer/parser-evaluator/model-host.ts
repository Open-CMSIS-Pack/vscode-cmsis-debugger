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

import type { EvalValue, ScalarKind, ScalarType, RefContainer } from './ref-container';
import type { DataAccessHost } from '../data-host/data-access-host';
import type { ScvdNode } from '../model/scvd-node';

export type { EvalValue, ScalarKind, ScalarType, RefContainer, DataAccessHost };

// Symbol/model resolution and metadata helpers (no direct memory I/O).
export interface ModelHost {
    // Resolution APIs — must set container.current to the resolved ref on success
    getSymbolRef(container: RefContainer, name: string, forWrite?: boolean): Promise<ScvdNode | undefined>;
    getMemberRef(container: RefContainer, property: string, forWrite?: boolean): Promise<ScvdNode | undefined>;

    // Advanced lookups / intrinsics use the whole container context
    resolveColonPath(container: RefContainer, parts: string[]): Promise<EvalValue>; // undefined => not found
    // Metadata (lets evaluator accumulate offsets itself)
    // Bytes per element (including any padding/alignment inside the array layout).
    getElementStride(ref: ScvdNode): Promise<number>;                       // bytes per element

    // Member offset in bytes from base.
    getMemberOffset(base: ScvdNode, member: ScvdNode): Promise<number | undefined>;     // bytes

    // Explicit byte width helper for a ref.
    getByteWidth(ref: ScvdNode): Promise<number | undefined>;

    // Provide an element model (prototype/type) for array-ish refs.
    getElementRef(ref: ScvdNode): Promise<ScvdNode | undefined>;

    /**
     * Optional: return the scalar type of the value designated by `container`.
     *
     * You can return either:
     *   - a C-like typename string, e.g. "uint32_t", "int16_t", "float"
     *   - a normalized ScalarType
     */
    getValueType(container: RefContainer): Promise<string | ScalarType | undefined>;

    /**
     * Optional printf formatting hook used by % specifiers in PrintfExpression.
     * If it returns a string, the evaluator uses it. If it returns undefined,
     * the evaluator falls back to its built-in formatting.
     */
    formatPrintf?(
        spec: string,
        value: EvalValue,
        container: RefContainer
    ): Promise<string | undefined>;
}
