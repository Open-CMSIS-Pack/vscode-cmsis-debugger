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

import type { ScalarKind, ScalarType } from './math-ops';
import type { ScvdNode } from '../model/scvd-node';

export type EvalValue =
    | number
    | bigint
    | string
    | boolean
    | Uint8Array
    | ((...args: EvalValue[]) => Promise<EvalValue>)
    | undefined;

export type { ScalarKind, ScalarType };

// Container context carried during evaluation.
export interface RefContainer {
    // Root model where identifier lookups begin.
    base: ScvdNode;

    // Top-level anchor for the final read (e.g., TCB).
    anchor?: ScvdNode | undefined;

    // Accumulated byte offset from the anchor.
    offsetBytes?: number | undefined;

    // Final read width in bytes.
    widthBytes?: number | undefined;

    // Current ref resolved by the last resolution step (for chaining).
    current?: ScvdNode | undefined;

    // Most recent resolved member reference (child).
    member?: ScvdNode | undefined;

    // Most recent numeric index for array access (e.g., arr[3]).
    index?: number | undefined;

    /**
     * Scalar type of the current value (if known).
     * Always present but may be undefined.
     */
    valueType: ScalarType | undefined;
}
