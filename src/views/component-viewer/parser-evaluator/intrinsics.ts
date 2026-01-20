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

import type { EvalValue, RefContainer } from './model-host';
import type { ScvdNode } from '../model/scvd-node';

export interface IntrinsicDefinition {
    // Arguments should be identifier names (not evaluated values).
    expectsNameArg?: boolean;
    // Allow CallExpression(Identifier(...)) as a fallback to EvalPointCall.
    allowCallExpression?: boolean;
    // Minimum positional arguments expected.
    minArgs?: number;
    // Maximum positional arguments expected.
    maxArgs?: number;
}

// formatPrintf is a host hook, not an intrinsic. Exclude it from intrinsic names.
export type IntrinsicName = Exclude<keyof IntrinsicProvider, 'formatPrintf'>;

// Intrinsic hooks exposed by the host (built-ins plus pseudo-members).
export interface IntrinsicProvider {
    // Named intrinsics
    // Note: __GetRegVal(reg) is special-cased (no container); others use the explicit hooks below
    __GetRegVal(reg: string): Promise<number | bigint | undefined>;
    __FindSymbol(symbol: string): Promise<number | undefined>;
    __CalcMemUsed(stackAddress: number, stackSize: number, fillPattern: number, magicValue: number): Promise<number | undefined>;

    // sizeof-like intrinsic – semantics are host-defined (usually bytes).
    __size_of(symbol: string): Promise<number | undefined>;

    __Symbol_exists(symbol: string): Promise<number | undefined>;
    __Offset_of(container: RefContainer, typedefMember: string): Promise<number | undefined>;

    // Additional named intrinsics
    // __Running is special-cased (no container) and returns 1 or 0 for use in expressions
    __Running(): Promise<number | undefined>;

    // Pseudo-member evaluators used as obj._count / obj._addr; must return numbers
    _count(container: RefContainer): Promise<number | undefined>;
    _addr(container: RefContainer): Promise<number | undefined>;    // added as var because arrays can have different base addresses
}

// Intrinsics that expect identifier *names* instead of evaluated values.
/**
 * Metadata describing special intrinsic handling. Used both by evaluator logic
 * and as the single source of truth for intrinsic names in type definitions.
 */
export const INTRINSIC_DEFINITIONS: Record<IntrinsicName, IntrinsicDefinition> = {
    __size_of:       { expectsNameArg: true, allowCallExpression: true, minArgs: 1, maxArgs: 1 },
    __FindSymbol:    { expectsNameArg: true, allowCallExpression: true, minArgs: 1, maxArgs: 1 },
    __Symbol_exists: { expectsNameArg: true, allowCallExpression: true, minArgs: 1, maxArgs: 1 },
    __GetRegVal:     { expectsNameArg: true, allowCallExpression: true, minArgs: 1, maxArgs: 1 },
    __Offset_of:     { expectsNameArg: true, allowCallExpression: true, minArgs: 1, maxArgs: 1 },
    __Running:       { allowCallExpression: true, minArgs: 0, maxArgs: 0 },
    __CalcMemUsed:   { allowCallExpression: true, minArgs: 4, maxArgs: 4 },
    // Included to keep IntrinsicName exhaustive; no special handling flags.
    _count:          {},
    _addr:           {},
};

export function isIntrinsicName(name: string): name is IntrinsicName {
    return Object.prototype.hasOwnProperty.call(INTRINSIC_DEFINITIONS, name);
}

/**
 * Route built-in intrinsics to the host implementation (enforcing presence).
 * Throws when an intrinsic is missing or returns undefined.
 */
export async function handleIntrinsic(
    data: IntrinsicProvider,
    container: RefContainer,
    name: IntrinsicName,
    args: EvalValue[]
): Promise<EvalValue> {
    // INTRINSIC_DEFINITIONS is a static map of trusted keys.
    // eslint-disable-next-line security/detect-object-injection
    const intrinsicDef = INTRINSIC_DEFINITIONS[name];
    if (intrinsicDef) {
        const { minArgs, maxArgs } = intrinsicDef;
        if (minArgs !== undefined && args.length < minArgs) {
            throw new Error(`Intrinsic ${name} expects at least ${minArgs} argument(s)`);
        }
        if (maxArgs !== undefined && args.length > maxArgs) {
            throw new Error(`Intrinsic ${name} expects at most ${maxArgs} argument(s)`);
        }
    }

    // Explicit numeric intrinsics (simple parameter lists)
    if (name === '__GetRegVal') {
        const fn = data.__GetRegVal;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __GetRegVal');
        }
        const out = await fn.call(data, String(args[0] ?? ''));
        if (out === undefined) {
            throw new Error('Intrinsic __GetRegVal returned undefined');
        }
        return out;
    }
    if (name === '__FindSymbol') {
        const fn = data.__FindSymbol;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __FindSymbol');
        }
        const out = await fn.call(data, String(args[0] ?? ''));
        if (out === undefined) {
            throw new Error('Intrinsic __FindSymbol returned undefined');
        }
        return out | 0;
    }
    if (name === '__CalcMemUsed') {
        const fn = data.__CalcMemUsed;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __CalcMemUsed');
        }
        const n0 = Number(args[0] ?? 0) >>> 0;
        const n1 = Number(args[1] ?? 0) >>> 0;
        const n2 = Number(args[2] ?? 0) >>> 0;
        const n3 = Number(args[3] ?? 0) >>> 0;
        const out = await fn.call(data, n0, n1, n2, n3);
        if (out === undefined) {
            throw new Error('Intrinsic __CalcMemUsed returned undefined');
        }
        return out >>> 0;
    }
    if (name === '__size_of') {
        const fn = data.__size_of;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __size_of');
        }
        const out = await fn.call(data, String(args[0] ?? ''));
        if (out === undefined) {
            throw new Error('Intrinsic __size_of returned undefined');
        }
        return out | 0;
    }
    if (name === '__Symbol_exists') {
        const fn = data.__Symbol_exists;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __Symbol_exists');
        }
        const out = await fn.call(data, String(args[0] ?? ''));
        if (out === undefined) {
            throw new Error('Intrinsic __Symbol_exists returned undefined');
        }
        return out | 0;
    }
    // Explicit intrinsic that needs the container but returns a number
    if (name === '__Offset_of') {
        const fn = data.__Offset_of;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __Offset_of');
        }
        const out = await fn.call(data, container, String(args[0] ?? ''));
        if (out === undefined) {
            throw new Error('Intrinsic __Offset_of returned undefined');
        }
        return out >>> 0;
    }
    if (name === '__Running') {
        const fn = data.__Running;
        if (typeof fn !== 'function') {
            throw new Error('Missing intrinsic __Running');
        }
        const out = await fn.call(data);
        if (out === undefined) {
            throw new Error('Intrinsic __Running returned undefined');
        }
        return out | 0;
    }

    throw new Error(`Missing intrinsic ${name}`);
}

/**
 * Handle pseudo-member access (obj._count / obj._addr) using the host helpers.
 */
export async function handlePseudoMember(
    data: IntrinsicProvider,
    container: RefContainer,
    property: string,
    baseRef: ScvdNode
): Promise<EvalValue> {
    container.member = baseRef;
    container.current = baseRef;
    container.valueType = undefined;
    const fn = property === '_count' ? data._count : data._addr;
    if (typeof fn !== 'function') {
        throw new Error(`Missing pseudo-member ${property}`);
    }
    const out = await fn.call(data, container);
    if (out === undefined) {
        throw new Error(`Pseudo-member ${property} returned undefined`);
    }
    return out;
}
