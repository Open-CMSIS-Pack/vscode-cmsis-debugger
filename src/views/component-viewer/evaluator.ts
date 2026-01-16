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

// evaluator.ts — ScvdNode-only, single container context (base/member/index/current)
// Strict error semantics: any unresolved ref/value causes throw; top-level returns undefined

import type {
    ASTNode,
    NumberLiteral,
    StringLiteral,
    BooleanLiteral,
    Identifier,
    MemberAccess,
    ArrayIndex,
    UnaryExpression,
    BinaryExpression,
    ConditionalExpression,
    AssignmentExpression,
    UpdateExpression,
    CallExpression,
    EvalPointCall,
    PrintfExpression,
    FormatSegment,
    TextSegment,
    ParseResult,
    ColonPath,
} from './parser';
import type { ScvdNode } from './model/scvd-node';
import {
    addVals,
    andVals,
    divVals,
    mergeKinds as mergeScalarKinds,
    modVals,
    mulVals,
    normalizeToWidth,
    orVals,
    sarVals,
    shlVals,
    subVals,
    toBigInt,
    toNumeric,
    xorVals,
} from './math-ops';
import type { DataAccessHost, EvalValue, ModelHost, RefContainer, ScalarKind, ScalarType } from './model-host';
import type { IntrinsicProvider } from './intrinsics';
import { handleIntrinsic, handlePseudoMember, INTRINSIC_DEFINITIONS, IntrinsicName, isIntrinsicName } from './intrinsics';

/* =============================================================================
 * Public API
 * ============================================================================= */

export type EvaluateResult = number | string | bigint | Uint8Array | undefined;

type Host = ModelHost & DataAccessHost & IntrinsicProvider;

export interface EvalContextInit {
    data: Host;
    /** Starting container for symbol resolution (root model). */
    container: ScvdNode;
}

export class EvalContext {
    readonly data: Host;
    /** Composite container context (root + last member/index/current). */
    container: RefContainer;

    constructor(init: EvalContextInit) {
        this.data = init.data;
        this.container = {
            base: init.container,
            valueType: undefined,
        };
    }
}

/* =============================================================================
 * Helpers
 * ============================================================================= */

function snapshotContainer(container: RefContainer): RefContainer {
    return {
        base: container.base,
        anchor: container.anchor,
        offsetBytes: container.offsetBytes,
        widthBytes: container.widthBytes,
        current: container.current,
        member: container.member,
        index: container.index,
        valueType: container.valueType,
    };
}

function isReferenceNode(node: ASTNode): node is Identifier | MemberAccess | ArrayIndex {
    return node.kind === 'Identifier' || node.kind === 'MemberAccess' || node.kind === 'ArrayIndex';
}

function findReferenceNode(node: ASTNode | undefined): Identifier | MemberAccess | ArrayIndex | undefined {
    if (!node) {
        return undefined;
    }
    if (isReferenceNode(node)) {
        return node;
    }

    switch (node.kind) {
        case 'UnaryExpression': return findReferenceNode((node as UnaryExpression).argument);
        case 'UpdateExpression': return findReferenceNode((node as UpdateExpression).argument);
        case 'BinaryExpression': {
            const b = node as BinaryExpression;
            return findReferenceNode(b.right) ?? findReferenceNode(b.left);
        }
        case 'ConditionalExpression': {
            const c = node as ConditionalExpression;
            return findReferenceNode(c.test) ?? findReferenceNode(c.consequent) ?? findReferenceNode(c.alternate);
        }
        case 'AssignmentExpression': {
            const a = node as AssignmentExpression;
            return findReferenceNode(a.right) ?? findReferenceNode(a.left);
        }
        case 'CallExpression': {
            const c = node as CallExpression;
            for (const arg of [...c.args].reverse()) {
                const r = findReferenceNode(arg);
                if (r) {
                    return r;
                }
            }
            return findReferenceNode(c.callee);
        }
        case 'EvalPointCall': {
            const c = node as EvalPointCall;
            for (const arg of [...c.args].reverse()) {
                const r = findReferenceNode(arg);
                if (r) {
                    return r;
                }
            }
            return findReferenceNode(c.callee);
        }
        case 'PrintfExpression': {
            for (const seg of (node as PrintfExpression).segments) {
                if (seg.kind === 'FormatSegment') {
                    const r = findReferenceNode(seg.value);
                    if (r) {
                        return r;
                    }
                }
            }
            return undefined;
        }
        default:
            return undefined;
    }
}

async function captureContainerForReference(node: ASTNode, ctx: EvalContext): Promise<RefContainer | undefined> {
    if (!isReferenceNode(node)) {
        return undefined;
    }

    let captured: RefContainer | undefined;
    await withIsolatedContainer(ctx, async () => {
        await mustRef(node, ctx, false);
        captured = snapshotContainer(ctx.container);
    });
    return captured;
}

function truthy(x: unknown): boolean {
    return !!x;
}

function asNumber(x: unknown): number {
    if (typeof x === 'number') {
        return Number.isFinite(x) ? x : 0;
    }
    if (typeof x === 'bigint') {
        return Number(x);
    }
    if (typeof x === 'boolean') {
        return x ? 1 : 0;
    }
    if (typeof x === 'string' && x.trim() !== '') {
        const n = +x; return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function eqVals(a: EvalValue, b: EvalValue): boolean {
    if (typeof a === 'string' || typeof b === 'string') {
        return String(a) === String(b);
    }
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na as EvalValue) === toBigInt(nb as EvalValue);
    }
    return (na as number) == (nb as number);
}
function ltVals(a: EvalValue, b: EvalValue): boolean {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na as EvalValue) < toBigInt(nb as EvalValue);
    }
    return (na as number) < (nb as number);
}
function lteVals(a: EvalValue, b: EvalValue): boolean {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na as EvalValue) <= toBigInt(nb as EvalValue);
    }
    return (na as number) <= (nb as number);
}
function gtVals(a: EvalValue, b: EvalValue): boolean {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na as EvalValue) > toBigInt(nb as EvalValue);
    }
    return (na as number) > (nb as number);
}
function gteVals(a: EvalValue, b: EvalValue): boolean {
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if (typeof na === 'bigint' || typeof nb === 'bigint') {
        return toBigInt(na as EvalValue) >= toBigInt(nb as EvalValue);
    }
    return (na as number) >= (nb as number);
}

/* =============================================================================
 * Type helpers and typed arithmetic decisions
 * ============================================================================= */

type MergedKind = ScalarKind | 'unknown';
const mergeKinds = mergeScalarKinds;

function normalizeScalarTypeFromName(name: string): ScalarType {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();

    let kind: ScalarKind = 'int';
    if (lower.includes('uint') || lower.includes('unsigned')) {
        kind = 'uint';
    } else if (lower.includes('float') || lower.includes('double')) {
        kind = 'float';
    }

    const out: ScalarType = { kind, name: trimmed };

    const m = lower.match(/(8|16|32|64)/);
    if (m) {
        out.bits = parseInt(m[1], 10);
    }

    return out;
}

function normalizeScalarType(t: string | ScalarType | undefined): ScalarType | undefined {
    if (!t) {
        return undefined;
    }
    if (typeof t === 'string') {
        return normalizeScalarTypeFromName(t);
    }
    if (!t.name && t.typename) {
        t.name = t.typename;
    }
    return t;
}

async function getScalarTypeForContainer(ctx: EvalContext, container: RefContainer): Promise<ScalarType | undefined> {
    const fn = ctx.data.getValueType;
    if (typeof fn !== 'function') {
        return undefined;
    }
    const raw = await fn.call(ctx.data, container);
    return normalizeScalarType(raw);
}

function integerDiv(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint {
    if ((typeof b === 'bigint' && b === 0n) || (typeof b === 'number' && b === 0)) {
        throw new Error('Division by zero');
    }
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        const na = toBigInt(a as EvalValue);
        const nb = toBigInt(b as EvalValue);
        if (nb === 0n) {
            throw new Error('Division by zero');
        }
        // unsigned is ignored for bigint (values already exact)
        return na / nb;
    }
    if (unsigned) {
        const na = (a as number) >>> 0;
        const nb = (b as number) >>> 0;
        if (nb === 0) {
            throw new Error('Division by zero');
        }
        return Math.trunc(na / nb) >>> 0;
    } else {
        const na = (a as number) | 0;
        const nb = (b as number) | 0;
        if (nb === 0) {
            throw new Error('Division by zero');
        }
        return (na / nb) | 0;
    }
}

function integerMod(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint {
    if ((typeof b === 'bigint' && b === 0n) || (typeof b === 'number' && b === 0)) {
        throw new Error('Division by zero');
    }
    if (typeof a === 'bigint' || typeof b === 'bigint') {
        const na = toBigInt(a as EvalValue);
        const nb = toBigInt(b as EvalValue);
        if (nb === 0n) {
            throw new Error('Division by zero');
        }
        return na % nb;
    }
    if (unsigned) {
        const na = (a as number) >>> 0;
        const nb = (b as number) >>> 0;
        if (nb === 0) {
            throw new Error('Division by zero');
        }
        return (na % nb) >>> 0;
    } else {
        const na = (a as number) | 0;
        const nb = (b as number) | 0;
        if (nb === 0) {
            throw new Error('Division by zero');
        }
        return na % nb;
    }
}

/**
 * Decide whether to prefer integer semantics for a/b based on:
 *   - an explicit merged kind from type info, OR
 *   - a fallback heuristic: both operands are integer-valued numbers.
 */
function prefersInteger(kind: MergedKind | undefined, a: EvalValue, b: EvalValue): { use: boolean; unsigned: boolean } {
    if (kind === 'int') {
        return { use: true, unsigned: false };
    }
    if (kind === 'uint') {
        return { use: true, unsigned: true };
    }

    // Fallback when host doesn't provide types:
    const na = toNumeric(a);
    const nb = toNumeric(b);
    if ((typeof na === 'bigint') || (typeof nb === 'bigint') || (Number.isInteger(na as number) && Number.isInteger(nb as number))) {
        // Default to signed if we only know "integer-ish"
        return { use: true, unsigned: false };
    }
    return { use: false, unsigned: false };
}

function divValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
    const pref = prefersInteger(kind, a, b);
    if (pref.use) {
        return integerDiv(toNumeric(a), toNumeric(b), pref.unsigned);
    }
    // Fallback to original floating semantics
    return divVals(a, b);
}

function modValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
    const pref = prefersInteger(kind, a, b);
    if (pref.use) {
        return integerMod(toNumeric(a), toNumeric(b), pref.unsigned);
    }
    return modVals(a, b);
}

async function evalArgsForIntrinsic(name: IntrinsicName, rawArgs: ASTNode[], ctx: EvalContext): Promise<EvalValue[]> {
    // INTRINSIC_DEFINITIONS is a trusted static map.
    // eslint-disable-next-line security/detect-object-injection
    const needsName = INTRINSIC_DEFINITIONS[name]?.expectsNameArg === true;

    const resolved: EvalValue[] = [];
    for (const [idx, arg] of rawArgs.entries()) {
        if (!needsName) {
            resolved.push(await evalNode(arg, ctx));
            continue;
        }

        // For name-based intrinsics, allow Identifier or "string literal"
        if (arg.kind === 'Identifier') {
            resolved.push((arg as Identifier).name);
            continue;
        }
        if (arg.kind === 'StringLiteral') {
            resolved.push((arg as StringLiteral).value);
            continue;
        }
        // Make the failure explicit; this avoids silently passing evaluated values like 0.
        throw new Error(`${name} expects an identifier or string literal for argument ${idx + 1}`);
    }

    return resolved;
}

/* =============================================================================
 * Small utility to avoid container clobbering during nested evals
 * ============================================================================= */

async function withIsolatedContainer<T>(ctx: EvalContext, fn: () => Promise<T>): Promise<T> {
    const c = ctx.container;
    const saved = snapshotContainer(c);
    try {
        return await fn();
    } finally {
        c.anchor = saved.anchor;
        c.offsetBytes = saved.offsetBytes;
        c.widthBytes = saved.widthBytes;
        c.current = saved.current;
        c.member = saved.member;
        c.index = saved.index;
        c.valueType = saved.valueType;
    }
}

/* =============================================================================
 * Strict ref/value utilities (single-root + contextual hints)
 * ============================================================================= */

type LValue = {
    get(): Promise<EvalValue>;
    set(v: EvalValue): Promise<EvalValue>;
    type: ScalarType | undefined;
};

/** Accumulate a byte offset into the container (anchor-relative). */
function addByteOffset(ctx: EvalContext, bytes: number) {
    const c = ctx.container;
    const add = (bytes | 0);
    c.offsetBytes = ((c.offsetBytes ?? 0) + add);
}

async function mustRef(node: ASTNode, ctx: EvalContext, forWrite = false): Promise<ScvdNode> {
    switch (node.kind) {
        case 'Identifier': {
            const id = node as Identifier;
            // Identifier lookup always starts from the root base
            const ref = await ctx.data.getSymbolRef(ctx.container, id.name, forWrite);
            if (!ref) {
                throw new Error(`Unknown symbol '${id.name}'`);
            }
            // Start a new anchor chain at this identifier
            ctx.container.anchor = ref;
            ctx.container.offsetBytes = 0;
            ctx.container.widthBytes = undefined;
            // Reset last-context hints for a plain identifier
            ctx.container.member = undefined;
            ctx.container.index = undefined;
            ctx.container.valueType = undefined;
            // Set the current target for subsequent resolution
            ctx.container.current = ref;

            // Prefer a byte-based width helper if host provides one
            const byteWidthFn = ctx.data.getByteWidth;
            if (typeof byteWidthFn === 'function') {
                const w = await byteWidthFn.call(ctx.data, ref);
                if (typeof w === 'number' && w > 0) {
                    ctx.container.widthBytes = w;
                }
            }

            return ref;
        }

        case 'MemberAccess': {
            const ma = node as MemberAccess;

            // Fast-path: if object is an ArrayIndex, compute index ONCE, then resolve the member on the element.
            if (ma.object.kind === 'ArrayIndex') {
                const ai = ma.object as ArrayIndex;

                // Resolve array symbol and establish anchor/current
                const baseRef = await mustRef(ai.array, ctx, forWrite);

                // Evaluate index in isolation (so i/j/mem.length don't clobber outer anchor)
                const idx = asNumber(await withIsolatedContainer(ctx, () => evalNode(ai.index, ctx))) | 0;

                // Remember the index for hosts that use it
                ctx.container.index = idx;

                // Use the thing we're actually indexing (supports nested arr[i][j].field)
                const arrayRef = ctx.container.current ?? baseRef;

                // Apply array offset using the correct dimension's stride (bytes)
                const strideBytes = ctx.data.getElementStride ? await ctx.data.getElementStride(arrayRef) : 0;
                if (typeof strideBytes === 'number' && strideBytes !== 0) {
                    addByteOffset(ctx, idx * strideBytes);
                }

                // Base for member resolution = element model if host provides one
                const baseForMember = ctx.data.getElementRef ? (await ctx.data.getElementRef(arrayRef)) ?? arrayRef : arrayRef;
                ctx.container.current = baseForMember;

                // Resolve member
                const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
                if (!child) {
                    throw new Error(`Missing member '${ma.property}'`);
                }

                // Accumulate member byte offset
                const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseForMember, child) : undefined;
                if (typeof memberOffsetBytes === 'number') {
                    addByteOffset(ctx, memberOffsetBytes);
                }

                // Width: prefer host byte-width helper if present
                const byteWidthFn = ctx.data.getByteWidth;
                if (typeof byteWidthFn === 'function') {
                    const w = await byteWidthFn.call(ctx.data, child);
                    if (typeof w === 'number' && w > 0) {
                        ctx.container.widthBytes = w;
                    }
                }

                // Finalize hints
                ctx.container.member = child;
                ctx.container.current = child;
                ctx.container.valueType = undefined; // will be resolved on read/write via getValueType
                return child;
            }

            // Default path: resolve base then member
            const baseRef = await mustRef(ma.object, ctx, forWrite);

            ctx.container.current = baseRef;
            const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
            if (!child) {
                throw new Error(`Missing member '${ma.property}'`);
            }

            const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseRef, child) : undefined;
            if (typeof memberOffsetBytes === 'number') {
                addByteOffset(ctx, memberOffsetBytes);
            }

            // Width: prefer host byte-width helper if present
            const byteWidthFn = ctx.data.getByteWidth;
            if (typeof byteWidthFn === 'function') {
                const w = await byteWidthFn.call(ctx.data, child);
                if (typeof w === 'number' && w > 0) {
                    ctx.container.widthBytes = w;
                }
            }

            ctx.container.member = child;
            ctx.container.current = child;
            ctx.container.valueType = undefined;
            return child;
        }

        case 'ArrayIndex': {
            const ai = node as ArrayIndex;

            // Resolve array base (establishes anchor/current on the array)
            const baseRef = await mustRef(ai.array, ctx, forWrite);

            // Evaluate the index in isolation
            const idx = asNumber(await withIsolatedContainer(ctx, () => evalNode(ai.index, ctx))) | 0;

            // Translate index -> byte offset
            ctx.container.index = idx;

            const arrayRef = ctx.container.current ?? baseRef;
            ctx.container.member = undefined;
            ctx.container.valueType = undefined;

            const strideBytes = ctx.data.getElementStride ? await ctx.data.getElementStride(arrayRef) : 0;
            if (typeof strideBytes === 'number' && strideBytes !== 0) {
                addByteOffset(ctx, idx * strideBytes);
            }

            // Current target becomes element if host exposes it, otherwise array
            const elementRef = ctx.data.getElementRef ? (await ctx.data.getElementRef(arrayRef)) ?? arrayRef : arrayRef;
            ctx.container.current = elementRef;

            // Update width to element width if host exposes a byte-width helper
            const byteWidthFn = ctx.data.getByteWidth;
            if (typeof byteWidthFn === 'function') {
                const w = await byteWidthFn.call(ctx.data, elementRef);
                if (typeof w === 'number' && w > 0) {
                    ctx.container.widthBytes = w;
                }
            }

            return baseRef;
        }

        case 'EvalPointCall': {
            throw new Error('Invalid reference target.');
        }

        default:
            throw new Error('Invalid reference target.');
    }
}

async function mustRead(ctx: EvalContext, label?: string): Promise<EvalValue> {
    // ensure hosts know the expected scalar type for decoding (e.g., float vs int)
    if (ctx.container.valueType === undefined) {
        ctx.container.valueType = await getScalarTypeForContainer(ctx, ctx.container);
    }
    const v = await ctx.data.readValue(ctx.container);
    if (v === undefined) {
        throw new Error(label ? `Undefined value for ${label}` : 'Undefined value');
    }
    return v;
}

async function lref(node: ASTNode, ctx: EvalContext): Promise<LValue> {
    // Resolve and set the current target in the container for writes
    await mustRef(node, ctx, true);

    // Snapshot the LHS write target so RHS evaluation can't clobber it
    const target = snapshotContainer(ctx.container);

    const valueType = await getScalarTypeForContainer(ctx, target);

    const lv: LValue = {
        async get(): Promise<EvalValue> {
            await mustRef(node, ctx, false);
            ctx.container.valueType = valueType;
            return await mustRead(ctx);
        },
        async set(v: EvalValue): Promise<EvalValue> {
            const out = await ctx.data.writeValue(target, v); // use frozen target
            if (out === undefined) {
                throw new Error('Write returned undefined');
            }
            return out;
        },
        type: valueType,
    };

    return lv;
}

/* =============================================================================
 * Evaluation
 * ============================================================================= */

async function evalOperandWithType(node: ASTNode, ctx: EvalContext): Promise<{ value: EvalValue; type: ScalarType | undefined }> {
    let capturedType: ScalarType | undefined;

    const value = await withIsolatedContainer(ctx, async () => {
        const v = await evalNode(node, ctx);

        const snapshot = snapshotContainer(ctx.container);

        capturedType = await getScalarTypeForContainer(ctx, snapshot);
        return v;
    });

    return { value, type: capturedType };
}

export async function evalNode(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
    switch (node.kind) {
        case 'NumberLiteral':  return (node as NumberLiteral).value;
        case 'StringLiteral':  return (node as StringLiteral).value;
        case 'BooleanLiteral': return (node as BooleanLiteral).value;

        case 'Identifier': {
            const name = (node as Identifier).name;
            // __Running can appear as a bare identifier; treat it as an intrinsic, not a symbol.
            if (name === '__Running') {
                return await handleIntrinsic(ctx.data, ctx.container, '__Running', []);
            }
            await mustRef(node, ctx, false);
            return await mustRead(ctx, name);
        }

        case 'MemberAccess': {
            const ma = node as MemberAccess;
            // Support pseudo-members that evaluate to numbers: obj._count and obj._addr
            if (ma.property === '_count' || ma.property === '_addr') {
                const baseRef = await mustRef(ma.object, ctx, false);
                return await handlePseudoMember(ctx.data, ctx.container, ma.property, baseRef);
            }
            // Default: resolve member and read its value
            await mustRef(node, ctx, false);
            return await mustRead(ctx);
        }

        case 'ArrayIndex': {
            await mustRef(node, ctx, false);
            return await mustRead(ctx);
        }

        case 'ColonPath': {
            const cp = node as ColonPath;
            // Colon paths (foo:bar:baz) are host-defined lookups resolved by the DataHost.
            const handled = ctx.data.resolveColonPath
                ? await ctx.data.resolveColonPath(ctx.container, cp.parts.slice())
                : undefined;
            if (handled === undefined) {
                throw new Error(`Unresolved colon path: ${cp.parts.join(':')}`);
            }
            return handled;
        }

        case 'UnaryExpression': {
            const u = node as UnaryExpression;
            const v = await evalNode(u.argument, ctx);
            switch (u.operator) {
                case '+': {
                    const n = toNumeric(v);
                    return typeof n === 'bigint' ? n : +n;
                }
                case '-': {
                    const n = toNumeric(v);
                    return typeof n === 'bigint' ? -toBigInt(n as EvalValue) : -asNumber(n);
                }
                case '!': return !truthy(v);
                case '~': {
                    const n = toNumeric(v);
                    if (typeof n === 'bigint') {
                        return ~n;
                    }
                    return ((~(asNumber(n) | 0)) >>> 0);
                }
                default:  throw new Error(`Unsupported unary operator ${u.operator}`);
            }
        }

        case 'UpdateExpression': {
            const u = node as UpdateExpression;
            const ref = await lref(u.argument, ctx);
            const prev = await ref.get();
            const next = (u.operator === '++'
                ? (typeof prev === 'bigint' ? prev + 1n : asNumber(prev) + 1)
                : (typeof prev === 'bigint' ? prev - 1n : asNumber(prev) - 1));
            await ref.set(next);
            return u.prefix ? ref.get() : prev;
        }

        case 'BinaryExpression':   return await evalBinary(node as BinaryExpression, ctx);

        case 'ConditionalExpression': {
            const c = node as ConditionalExpression;
            return truthy(await evalNode(c.test, ctx))
                ? await evalNode(c.consequent, ctx)
                : await evalNode(c.alternate, ctx);
        }

        case 'AssignmentExpression': {
            const a = node as AssignmentExpression;
            const ref = await lref(a.left, ctx);
            if (a.operator === '=') {
                const value = await withIsolatedContainer(ctx, () => evalNode(a.right, ctx));
                return await ref.set(value);
            }

            // Use the LValue to read current LHS value (and we already captured its type in lref)
            const L = await ref.get();
            const R = await evalNode(a.right, ctx);
            const lhsKind: MergedKind = ref.type ? ref.type.kind : 'unknown';

            let out: EvalValue;
            switch (a.operator) {
                case '+=':  out = addVals(L, R); break;
                case '-=':  out = subVals(L, R); break;
                case '*=':  out = mulVals(L, R); break;
                case '/=':  out = divValsWithKind(L, R, lhsKind); break;
                case '%=':  out = modValsWithKind(L, R, lhsKind); break;
                case '<<=': out = shlVals(L, R); break;
                case '>>=': out = sarVals(L, R); break;
                case '&=':  out = andVals(L, R); break;
                case '^=':  out = xorVals(L, R); break;
                case '|=':  out = orVals(L, R); break;
                default: throw new Error(`Unsupported assignment operator ${a.operator}`);
            }
            return await ref.set(out);
        }

        case 'CallExpression': {
            const c = node as CallExpression;

            if (c.callee.kind === 'Identifier') {
                const name = (c.callee as Identifier).name;
                if (isIntrinsicName(name) && (
                    // eslint-disable-next-line security/detect-object-injection
                    INTRINSIC_DEFINITIONS[name].allowCallExpression
                )) {
                    const args = await evalArgsForIntrinsic(name, c.args, ctx);
                    return await handleIntrinsic(ctx.data, ctx.container, name, args);
                }
            }

            const args = [];
            for (const a of c.args) {
                args.push(await evalNode(a, ctx)); // evaluate sequentially to avoid parallel side effects
            }
            const fnVal = await evalNode(c.callee, ctx);
            if (typeof fnVal === 'function') {
                return await fnVal(...args);
            }
            throw new Error('Callee is not callable.');
        }

        case 'EvalPointCall': {
            const c = node as EvalPointCall;
            const name = c.intrinsic as string;
            if (!isIntrinsicName(name)) {
                throw new Error(`Missing intrinsic ${name}`);
            }
            const intrinsicName = name as IntrinsicName;
            const args = await evalArgsForIntrinsic(intrinsicName, c.args, ctx);
            return await handleIntrinsic(ctx.data, ctx.container, intrinsicName, args);
        }

        case 'PrintfExpression': {
            const pf = node as PrintfExpression;
            let out = '';
            for (const seg of pf.segments) {
                if (seg.kind === 'TextSegment') {
                    out += (seg as TextSegment).text;
                } else {
                    const fs = seg as FormatSegment;
                    const { value, container } = await evaluateFormatSegmentValue(fs, ctx);
                    out += await formatValue(fs.spec, value, ctx, container);
                }
            }
            return out;
        }

        case 'TextSegment':    return (node as TextSegment).text;
        case 'FormatSegment': {
            const seg = node as FormatSegment;
            const { value, container } = await evaluateFormatSegmentValue(seg, ctx);
            return await formatValue(seg.spec, value, ctx, container);
        }

        case 'ErrorNode':      throw new Error('Cannot evaluate an ErrorNode.');

        default: {
            const kind = (node as Partial<ASTNode>).kind ?? 'unknown';
            throw new Error(`Unhandled node kind: ${kind}`);
        }
    }
}

async function evalBinary(node: BinaryExpression, ctx: EvalContext): Promise<EvalValue> {
    const { operator, left, right } = node;
    if (operator === '&&') {
        const lv = await evalNode(left, ctx);
        return truthy(lv) ? await evalNode(right, ctx) : lv;
    }
    if (operator === '||') {
        const lv = await evalNode(left, ctx);
        return truthy(lv) ? lv : await evalNode(right, ctx);
    }

    const { value: a, type: typeA } = await evalOperandWithType(left, ctx);
    const { value: b, type: typeB } = await evalOperandWithType(right, ctx);
    const mergedKind = mergeKinds(typeA, typeB);
    const bitWidthValue = Math.max(typeA?.bits ?? 0, typeB?.bits ?? 0);
    const bitWidth = bitWidthValue > 0 ? bitWidthValue : undefined;

    const isUnsigned = mergedKind === 'uint';

    let result: EvalValue;

    switch (operator) {
        case '+':   result = addVals(a, b, bitWidth, isUnsigned); break;
        case '-':   result = subVals(a, b, bitWidth, isUnsigned); break;
        case '*':   result = mulVals(a, b, bitWidth, isUnsigned); break;
        case '/':   result = divValsWithKind(a, b, mergedKind); break;
        case '%':   result = modValsWithKind(a, b, mergedKind); break;
        case '<<':  result = shlVals(a, b, bitWidth, isUnsigned); break;
        case '>>':  result = sarVals(a, b, bitWidth, isUnsigned); break;
        case '>>>': throw new Error('Unsupported operator >>> in C-style expressions');
        case '&':   result = andVals(a, b, bitWidth, isUnsigned); break;
        case '^':   result = xorVals(a, b, bitWidth, isUnsigned); break;
        case '|':   result = orVals(a, b, bitWidth, isUnsigned); break;
        case '==':  return eqVals(a, b);
        case '!=':  return !eqVals(a, b);
        case '<':   return ltVals(a, b);
        case '<=':  return lteVals(a, b);
        case '>':   return gtVals(a, b);
        case '>=':  return gteVals(a, b);
        default: throw new Error(`Unsupported binary operator ${operator}`);
    }

    if (typeof result === 'number' || typeof result === 'bigint') {
        return normalizeToWidth(result, bitWidth, mergedKind);
    }
    return result;
}

/* =============================================================================
 * Printf helpers (callback-first, spec-agnostic with sensible fallbacks)
 * ============================================================================= */

async function evaluateFormatSegmentValue(segment: FormatSegment, ctx: EvalContext): Promise<{ value: EvalValue; container: RefContainer | undefined }> {
    const value = await evalNode(segment.value, ctx);
    let containerSnapshot = snapshotContainer(ctx.container);
    if (!containerSnapshot.current) {
        const hasConst = (segment.value as Partial<{ constValue: unknown }>).constValue !== undefined;
        if (!hasConst) {
            const refNode = findReferenceNode(segment.value);
            const recovered = refNode ? await captureContainerForReference(refNode, ctx) : undefined;
            if (recovered) {
                containerSnapshot = recovered;
            }
        }
    }
    return { value, container: containerSnapshot };
}

async function formatValue(spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, containerOverride?: RefContainer): Promise<string> {
    const formattingContainer = containerOverride ?? ctx?.container;
    // New: host-provided override
    if (ctx?.data.formatPrintf && formattingContainer) {
        const override = await ctx.data.formatPrintf(spec, v, formattingContainer);
        if (typeof override === 'string') {
            return override;
        }
    }

    // Existing fallback behaviour
    switch (spec) {
        case '%':  return '%';
        case 'd':  {
            const n = toNumeric(v);
            if (typeof n === 'bigint') {
                return n.toString(10);
            }
            const num = Number(n);
            if (!Number.isFinite(num)) {
                return 'NaN';
            }
            return String((num | 0));
        }
        case 'u':  {
            const n = toNumeric(v);
            if (typeof n === 'bigint') {
                return (n >= 0 ? n : -n).toString(10);
            }
            const num = Number(n);
            if (!Number.isFinite(num)) {
                return 'NaN';
            }
            return String((num >>> 0));
        }
        case 'x':  {
            const n = toNumeric(v);
            if (typeof n === 'bigint') {
                return '0x' + n.toString(16);
            }
            const num = Number(n);
            if (!Number.isFinite(num)) {
                return 'NaN';
            }
            return (num >>> 0).toString(16);
        }
        case 't':  return truthy(v) ? 'true' : 'false';
        case 'S':  return typeof v === 'string' ? v : String(v);
        case 'C': case 'E': case 'I': case 'J': case 'N': case 'M': case 'T': case 'U': return String(v);
        default:   return String(v);
    }
}

function normalizeEvaluateResult(v: EvalValue): EvaluateResult {
    if (v === undefined || v === null) {
        return undefined;
    }
    if (typeof v === 'number' || typeof v === 'string') {
        return v;
    }
    if (typeof v === 'boolean') {
        return v ? 1 : 0;
    }
    return undefined;
}

export async function evaluateParseResult(pr: ParseResult, ctx: EvalContext, container?: ScvdNode): Promise<EvaluateResult> {
    const prevBase = ctx.container.base;
    const saved = { ...ctx.container } as RefContainer;
    const override = container !== undefined;
    if (override) {
        ctx.container.base = container as ScvdNode;
    }
    try {
        const v = await evalNode(pr.ast, ctx);
        return normalizeEvaluateResult(v);
    } catch (e) {
        console.error('Error evaluating parse result:', pr, e);
        return undefined;
    } finally {
        if (override) {
            ctx.container.base = prevBase;
        }
        ctx.container.anchor = saved.anchor;
        ctx.container.offsetBytes = saved.offsetBytes;
        ctx.container.widthBytes = saved.widthBytes;
        ctx.container.current = saved.current;
        ctx.container.member = saved.member;
        ctx.container.index = saved.index;
        ctx.container.valueType = saved.valueType;
    }
}
