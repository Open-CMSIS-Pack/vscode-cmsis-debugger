// evaluator.ts — ScvdBase-only, single container context (base/member/index/current)
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
import type { ScvdBase } from './model/scvd-base';

/* =============================================================================
 * Public API
 * ============================================================================= */

export type EvaluateResult = number | string | undefined;
export type EvalValue =
    | number
    | string
    | boolean
    | Uint8Array
    | ((...args: EvalValue[]) => MaybePromise<EvalValue>)
    | undefined;

type MaybePromise<T> = T | Promise<T>;

/* =============================================================================
 * Type model for host-provided scalar types
 * ============================================================================= */

export type ScalarKind = 'int' | 'uint' | 'float';

export interface ScalarType {
    kind: ScalarKind;
    bits?: number;
    /** Optional human-readable typename, e.g. "uint32_t" */
    name?: string;
    /** Alternative typename source used by some hosts. */
    typename?: string;
}

/** Container context carried during evaluation. */
export interface RefContainer {
    /** Root model where identifier lookups begin. */
    base: ScvdBase;

    /** Top-level anchor for the final read (e.g., TCB). */
    anchor?: ScvdBase | undefined;

    /** Accumulated byte offset from the anchor. */
    offsetBytes?: number | undefined;

    /** Final read width in bytes. */
    widthBytes?: number | undefined;

    /** Current ref resolved by the last resolution step (for chaining). */
    current?: ScvdBase | undefined;

    /** Most recent resolved member reference (child). */
    member?: ScvdBase | undefined;

    /** Most recent numeric index for array access (e.g., arr[3]). */
    index?: number | undefined;

    /**
     * Scalar type of the current value (if known).
     * Always present but may be undefined.
     */
    valueType: ScalarType | undefined;
}

/** Host contract used by the evaluator (implemented by ScvdEvalInterface). */
export interface DataHost {
    // Resolution APIs — must set container.current to the resolved ref on success
    getSymbolRef(container: RefContainer, name: string, forWrite?: boolean): MaybePromise<ScvdBase | undefined>;
    getMemberRef(container: RefContainer, property: string, forWrite?: boolean): MaybePromise<ScvdBase | undefined>;

    // Value access acts on container.{anchor,offsetBytes,widthBytes}
    readValue(container: RefContainer): MaybePromise<EvalValue>;            // may return undefined -> error
    writeValue(container: RefContainer, value: EvalValue): MaybePromise<EvalValue>;     // may return undefined -> error

    // Optional: advanced lookups / intrinsics use the whole container context
    resolveColonPath?(container: RefContainer, parts: string[]): MaybePromise<EvalValue>; // undefined => not found
    stats?(): { symbols?: number; bytesUsed?: number };
    evalIntrinsic?(name: string, container: RefContainer, args: EvalValue[]): MaybePromise<EvalValue>; // undefined => not handled

    // Optional metadata (lets evaluator accumulate offsets itself)
    /** Bytes per element (including any padding/alignment inside the array layout). */
    getElementStride?(ref: ScvdBase): MaybePromise<number>;                       // bytes per element

    /** Member offset in bytes from base. */
    getMemberOffset?(base: ScvdBase, member: ScvdBase): MaybePromise<number | undefined>;     // bytes

    /** Optional: explicit byte width helper for a ref. */
    getByteWidth?(ref: ScvdBase): MaybePromise<number | undefined>;

    /** Optional: provide an element model (prototype/type) for array-ish refs. */
    getElementRef?(ref: ScvdBase): MaybePromise<ScvdBase | undefined>;

    // Optional named intrinsics
    // Note: __GetRegVal(reg) is special-cased (no container); others use the evalIntrinsic convention
    __GetRegVal?(reg: string): MaybePromise<number | undefined>;
    __FindSymbol?(symbol: string): MaybePromise<number | undefined>;
    __CalcMemUsed?(args: number[]): MaybePromise<number | undefined>;

    /** sizeof-like intrinsic – semantics are host-defined (usually bytes). */
    __size_of?(symbol: string): MaybePromise<number | undefined>;

    __Symbol_exists?(symbol: string): MaybePromise<number | undefined>;
    __Offset_of?(container: RefContainer, typedefMember: string): MaybePromise<number | undefined>;

    // Additional named intrinsics
    // __Running is special-cased (no container) and returns 1 or 0 for use in expressions
    __Running?(): MaybePromise<number | undefined>;

    // Pseudo-member evaluators used as obj._count / obj._addr; must return numbers
    _count?(container: RefContainer): MaybePromise<number | undefined>;
    _addr?(container: RefContainer): MaybePromise<number | undefined>;    // added as var because arrays can have different base addresses

    // Optional printf formatting hook used by % specifiers in PrintfExpression.
    // If it returns a string, the evaluator uses it. If it returns undefined,
    // the evaluator falls back to its built-in formatting.
    formatPrintf?(
        spec: FormatSegment['spec'],
        value: EvalValue,
        container: RefContainer
    ): MaybePromise<string | undefined>;

    /**
     * Optional: return the scalar type of the value designated by `container`.
     *
     * You can return either:
     *   - a C-like typename string, e.g. "uint32_t", "int16_t", "float"
     *   - a normalized ScalarType
     */
    getValueType?(container: RefContainer): MaybePromise<string | ScalarType | undefined>;
}

export interface EvalContextInit {
    data: DataHost;
    /** Starting container for symbol resolution (root model). */
    container: ScvdBase;
}

export class EvalContext {
    readonly data: DataHost;
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
    if (!node) return undefined;
    if (isReferenceNode(node)) return node;

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
            for (let i = c.args.length - 1; i >= 0; i--) {
                const r = findReferenceNode(c.args[i]);
                if (r) return r;
            }
            return findReferenceNode(c.callee);
        }
        case 'EvalPointCall': {
            const c = node as EvalPointCall;
            for (let i = c.args.length - 1; i >= 0; i--) {
                const r = findReferenceNode(c.args[i]);
                if (r) return r;
            }
            return findReferenceNode(c.callee);
        }
        case 'PrintfExpression': {
            for (const seg of (node as PrintfExpression).segments) {
                if (seg.kind === 'FormatSegment') {
                    const r = findReferenceNode(seg.value);
                    if (r) return r;
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

function truthy(x: unknown): boolean { return !!x; }

function asNumber(x: unknown): number {
    if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string' && x.trim() !== '') {
        const n = +x; return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function addVals(a: EvalValue, b: EvalValue): EvalValue {
    if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
    return asNumber(a) + asNumber(b);
}
function subVals(a: EvalValue, b: EvalValue): EvalValue {
    return asNumber(a) - asNumber(b);
}
function mulVals(a: EvalValue, b: EvalValue): EvalValue {
    return asNumber(a) * asNumber(b);
}
function divVals(a: EvalValue, b: EvalValue): EvalValue {
    const nb = asNumber(b); if (nb === 0) throw new Error('Division by zero');
    return asNumber(a) / nb;
}
function modVals(a: EvalValue, b: EvalValue): EvalValue {
    return (asNumber(a) | 0) % (asNumber(b) | 0);
}
function andVals(a: EvalValue, b: EvalValue): EvalValue {
    return (((asNumber(a) | 0) & (asNumber(b) | 0)) >>> 0);
}
function xorVals(a: EvalValue, b: EvalValue): EvalValue {
    return (((asNumber(a) | 0) ^ (asNumber(b) | 0)) >>> 0);
}
function orVals(a: EvalValue, b: EvalValue): EvalValue {
    return (((asNumber(a) | 0) | (asNumber(b) | 0)) >>> 0);
}
function shlVals(a: EvalValue, b: EvalValue): EvalValue {
    return (((asNumber(a) | 0) << (asNumber(b) & 31)) >>> 0);
}
function sarVals(a: EvalValue, b: EvalValue): EvalValue {
    return (((asNumber(a) | 0) >> (asNumber(b) & 31)) >>> 0);
}
function shrVals(a: EvalValue, b: EvalValue): EvalValue {
    return (asNumber(a) >>> (asNumber(b) & 31)) >>> 0;
}
function eqVals(a: EvalValue, b: EvalValue): boolean {
    if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
    return asNumber(a) == asNumber(b);
}
function ltVals(a: EvalValue, b: EvalValue): boolean {
    return asNumber(a) < asNumber(b);
}
function lteVals(a: EvalValue, b: EvalValue): boolean {
    return asNumber(a) <= asNumber(b);
}
function gtVals(a: EvalValue, b: EvalValue): boolean {
    return asNumber(a) > asNumber(b);
}
function gteVals(a: EvalValue, b: EvalValue): boolean {
    return asNumber(a) >= asNumber(b);
}

/* =============================================================================
 * Type helpers and typed arithmetic decisions
 * ============================================================================= */

type MergedKind = ScalarKind | 'unknown';

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
    if (!t) return undefined;
    if (typeof t === 'string') return normalizeScalarTypeFromName(t);
    if (!t.name && t.typename) {
        t.name = t.typename;
    }
    return t;
}

async function getScalarTypeForContainer(ctx: EvalContext, container: RefContainer): Promise<ScalarType | undefined> {
    const fn = ctx.data.getValueType;
    if (typeof fn !== 'function') return undefined;
    const raw = await fn.call(ctx.data, container);
    return normalizeScalarType(raw);
}

function mergeKinds(a?: ScalarType, b?: ScalarType): MergedKind {
    const ka = a?.kind;
    const kb = b?.kind;
    if (ka === 'float' || kb === 'float') return 'float';
    if (ka === 'uint' || kb === 'uint') return 'uint';
    if (ka === 'int' || kb === 'int') return 'int';
    return 'unknown';
}

function integerDiv(a: number, b: number, unsigned: boolean): number {
    if (b === 0) throw new Error('Division by zero');
    if (unsigned) {
        const na = a >>> 0;
        const nb = b >>> 0;
        if (nb === 0) throw new Error('Division by zero');
        return Math.trunc(na / nb) >>> 0;
    } else {
        const na = a | 0;
        const nb = b | 0;
        if (nb === 0) throw new Error('Division by zero');
        return (na / nb) | 0;
    }
}

function integerMod(a: number, b: number, unsigned: boolean): number {
    if (b === 0) throw new Error('Division by zero');
    if (unsigned) {
        const na = a >>> 0;
        const nb = b >>> 0;
        if (nb === 0) throw new Error('Division by zero');
        return (na % nb) >>> 0;
    } else {
        const na = a | 0;
        const nb = b | 0;
        if (nb === 0) throw new Error('Division by zero');
        return na % nb;
    }
}

/**
 * Decide whether to prefer integer semantics for a/b based on:
 *   - an explicit merged kind from type info, OR
 *   - a fallback heuristic: both operands are integer-valued numbers.
 */
function prefersInteger(kind: MergedKind | undefined, a: EvalValue, b: EvalValue): { use: boolean; unsigned: boolean } {
    if (kind === 'int') return { use: true, unsigned: false };
    if (kind === 'uint') return { use: true, unsigned: true };

    // Fallback when host doesn't provide types:
    const na = asNumber(a);
    const nb = asNumber(b);
    if (Number.isInteger(na) && Number.isInteger(nb)) {
        // Default to signed if we only know "integer-ish"
        return { use: true, unsigned: false };
    }
    return { use: false, unsigned: false };
}

function divValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
    const pref = prefersInteger(kind, a, b);
    if (pref.use) {
        return integerDiv(asNumber(a), asNumber(b), pref.unsigned);
    }
    // Fallback to original floating semantics
    return divVals(a, b);
}

function modValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
    const pref = prefersInteger(kind, a, b);
    if (pref.use) {
        return integerMod(asNumber(a), asNumber(b), pref.unsigned);
    }
    return modVals(a, b);
}

// Intrinsics that expect identifier *names* instead of evaluated values.
const NAME_ARG_INTRINSICS = new Set<string>([
    '__size_of',
    '__FindSymbol',
    '__Symbol_exists',
    '__GetRegVal', // keeps consistency: reg names not values
    '__Offset_of',
]);

async function evalArgsForIntrinsic(name: string, rawArgs: ASTNode[], ctx: EvalContext): Promise<EvalValue[]> {
    const needsName = NAME_ARG_INTRINSICS.has(name);

    const resolved: EvalValue[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
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
        throw new Error(`${name} expects an identifier or string literal for argument ${i + 1}`);
    }

    return resolved;
}

/* =============================================================================
 * Small utility to avoid container clobbering during nested evals
 * ============================================================================= */

async function withIsolatedContainer<T>(ctx: EvalContext, fn: () => MaybePromise<T>): Promise<T> {
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

async function mustRef(node: ASTNode, ctx: EvalContext, forWrite = false): Promise<ScvdBase> {
    switch (node.kind) {
        case 'Identifier': {
            const id = node as Identifier;
            // Identifier lookup always starts from the root base
            const ref = await ctx.data.getSymbolRef(ctx.container, id.name, forWrite);
            if (!ref) throw new Error(`Unknown symbol '${id.name}'`);
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
                if (!child) throw new Error(`Missing member '${ma.property}'`);

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
            if (!child) throw new Error(`Missing member '${ma.property}'`);

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
            return await mustRead(ctx);
        },
        async set(v: EvalValue): Promise<EvalValue> {
            const out = await ctx.data.writeValue(target, v); // use frozen target
            if (out === undefined) throw new Error('Write returned undefined');
            return out;
        },
        type: valueType,
    };

    return lv;
}

/* =============================================================================
 * Evaluation
 * ============================================================================= */

// Belt-and-braces: value-returning intrinsics that may be written as CallExpression(Identifier(...))
// We still prefer EvalPointCall from the parser, but this keeps us robust.
const VALUE_INTRINSICS = new Set<string>([
    '__GetRegVal',
    '__Running',
    '__CalcMemUsed',
    '__size_of',
    '__Symbol_exists',
    '__Offset_of',
    '__FindSymbol',
]);

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
            await mustRef(node, ctx, false);
            return await mustRead(ctx, (node as Identifier).name);
        }

        case 'MemberAccess': {
            const ma = node as MemberAccess;
            // Support pseudo-members that evaluate to numbers: obj._count and obj._addr
            if (ma.property === '_count' || ma.property === '_addr') {
                const baseRef = await mustRef(ma.object, ctx, false);
                ctx.container.member = baseRef;
                ctx.container.current = baseRef;
                ctx.container.valueType = undefined;
                const fn = ma.property === '_count' ? ctx.data._count : ctx.data._addr;
                if (typeof fn !== 'function') throw new Error(`Missing pseudo-member ${ma.property}`);
                const out = await fn.call(ctx.data, ctx.container);
                if (out === undefined) throw new Error(`Pseudo-member ${ma.property} returned undefined`);
                return out;
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
            const handled = ctx.data.resolveColonPath
                ? await ctx.data.resolveColonPath(ctx.container, cp.parts.slice())
                : undefined;
            if (handled === undefined) throw new Error(`Unresolved colon path: ${cp.parts.join(':')}`);
            return handled;
        }

        case 'UnaryExpression': {
            const u = node as UnaryExpression;
            const v = await evalNode(u.argument, ctx);
            switch (u.operator) {
                case '+': return +asNumber(v);
                case '-': return -asNumber(v);
                case '!': return !truthy(v);
                case '~': return ((~(asNumber(v) | 0)) >>> 0);
                default:  throw new Error(`Unsupported unary operator ${u.operator}`);
            }
        }

        case 'UpdateExpression': {
            const u = node as UpdateExpression;
            const ref = await lref(u.argument, ctx);
            const prev = await ref.get();
            const next = (u.operator === '++' ? asNumber(prev) + 1 : asNumber(prev) - 1);
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
                if (VALUE_INTRINSICS.has(name)) {
                    const args = await evalArgsForIntrinsic(name, c.args, ctx);
                    return await routeIntrinsic(ctx, name, args);
                }
            }

            const args = [];
            for (const a of c.args) {
                args.push(await evalNode(a, ctx)); // evaluate sequentially to avoid parallel side effects
            }
            const fnVal = await evalNode(c.callee, ctx);
            if (typeof fnVal === 'function') return await fnVal(...args);
            throw new Error('Callee is not callable.');
        }

        case 'EvalPointCall': {
            const c = node as EvalPointCall;
            const name = c.intrinsic as string;
            const args = await evalArgsForIntrinsic(name, c.args, ctx);
            return await routeIntrinsic(ctx, name, args);
        }

        case 'PrintfExpression': {
            const pf = node as PrintfExpression;
            let out = '';
            for (const seg of pf.segments) {
                if (seg.kind === 'TextSegment') out += (seg as TextSegment).text;
                else {
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

    switch (operator) {
        case '+':   return addVals(a, b);
        case '-':   return subVals(a, b);
        case '*':   return mulVals(a, b);
        case '/':   return divValsWithKind(a, b, mergedKind);
        case '%':   return modValsWithKind(a, b, mergedKind);
        case '<<':  return shlVals(a, b);
        case '>>':  return sarVals(a, b);
        case '>>>': return shrVals(a, b);
        case '&':   return andVals(a, b);
        case '^':   return xorVals(a, b);
        case '|':   return orVals(a, b);
        case '==':  return eqVals(a, b);
        case '!=':  return !eqVals(a, b);
        case '<':   return ltVals(a, b);
        case '<=':  return lteVals(a, b);
        case '>':   return gtVals(a, b);
        case '>=':  return gteVals(a, b);
        default: throw new Error(`Unsupported binary operator ${operator}`);
    }
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
        case 'd':  return String((asNumber(v) | 0));
        case 'u':  return String((asNumber(v) >>> 0));
        case 'x':  return (asNumber(v) >>> 0).toString(16);
        case 't':  return truthy(v) ? 'true' : 'false';
        case 'S':  return typeof v === 'string' ? v : String(v);
        case 'C': case 'E': case 'I': case 'J': case 'N': case 'M': case 'T': case 'U': return String(v);
        default:   return String(v);
    }
}

/* =============================================================================
 * Intrinsics routing (strict, single-root)
 * ============================================================================= */

async function routeIntrinsic(ctx: EvalContext, name: string, args: EvalValue[]): Promise<EvalValue> {
    // Explicit numeric intrinsics (simple parameter lists)
    if (name === '__GetRegVal') {
        const fn = ctx.data.__GetRegVal;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __GetRegVal');
        const out = await fn.call(ctx.data, String(args[0] ?? ''));
        if (out === undefined) throw new Error('Intrinsic __GetRegVal returned undefined');
        return out;
    }
    if (name === '__FindSymbol') {
        const fn = ctx.data.__FindSymbol;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __FindSymbol');
        const out = await fn.call(ctx.data, String(args[0] ?? ''));
        if (out === undefined) throw new Error('Intrinsic __FindSymbol returned undefined');
        return out | 0;
    }
    if (name === '__CalcMemUsed') {
        const fn = ctx.data.__CalcMemUsed;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __CalcMemUsed');
        const a = args.map(v => Number(v) >>> 0);
        const out = await fn.call(ctx.data, a);
        if (out === undefined) throw new Error('Intrinsic __CalcMemUsed returned undefined');
        return out >>> 0;
    }
    if (name === '__size_of') {
        const fn = ctx.data.__size_of;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __size_of');
        const out = await fn.call(ctx.data, String(args[0] ?? ''));
        if (out === undefined) throw new Error('Intrinsic __size_of returned undefined');
        return out | 0;
    }
    if (name === '__Symbol_exists') {
        const fn = ctx.data.__Symbol_exists;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __Symbol_exists');
        const out = await fn.call(ctx.data, String(args[0] ?? ''));
        if (out === undefined) throw new Error('Intrinsic __Symbol_exists returned undefined');
        return out | 0;
    }
    // Explicit intrinsic that needs the container but returns a number
    if (name === '__Offset_of') {
        const fn = ctx.data.__Offset_of;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __Offset_of');
        const out = await fn.call(ctx.data, ctx.container, String(args[0] ?? ''));
        if (out === undefined) throw new Error('Intrinsic __Offset_of returned undefined');
        return out >>> 0;
    }
    if (name === '__Running') {
        const fn = ctx.data.__Running;
        if (typeof fn !== 'function') throw new Error('Missing intrinsic __Running');
        const out = await fn.call(ctx.data);
        if (out === undefined) throw new Error('Intrinsic __Running returned undefined');
        return out | 0;
    }

    // Generic dispatch paths (legacy/custom)
    if (typeof ctx.data.evalIntrinsic === 'function') {
        const out = await ctx.data.evalIntrinsic(name, ctx.container, args);
        if (out === undefined) throw new Error(`Intrinsic ${name} returned undefined`);
        return out;
    }
    const direct = (ctx.data as unknown as Record<string, unknown>)[name];
    if (typeof direct === 'function') {
        const out = await (direct as (container: RefContainer, a: EvalValue[]) => MaybePromise<EvalValue>).call(ctx.data, ctx.container, args);
        if (out === undefined) throw new Error(`Intrinsic ${name} returned undefined`);
        return out;
    }
    throw new Error(`Missing intrinsic ${name}`);
}

/* =============================================================================
 * Top-level convenience
 * ============================================================================= */

function normalizeEvaluateResult(v: EvalValue): EvaluateResult {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'number' || typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return undefined;
}

export async function evaluateParseResult(pr: ParseResult, ctx: EvalContext, container?: ScvdBase): Promise<EvaluateResult> {
    const prevBase = ctx.container.base;
    const saved = { ...ctx.container } as RefContainer;
    const override = container !== undefined;
    if (override) ctx.container.base = container as ScvdBase;
    try {
        const v = await evalNode(pr.ast, ctx);
        return normalizeEvaluateResult(v);
    } catch (e) {
        console.error('Error evaluating parse result:', pr, e);
        return undefined;
    } finally {
        if (override) ctx.container.base = prevBase;
        ctx.container.anchor = saved.anchor;
        ctx.container.offsetBytes = saved.offsetBytes;
        ctx.container.widthBytes = saved.widthBytes;
        ctx.container.current = saved.current;
        ctx.container.member = saved.member;
        ctx.container.index = saved.index;
        ctx.container.valueType = saved.valueType;
    }
}
