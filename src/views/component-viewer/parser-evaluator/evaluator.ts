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
import type { ScvdNode } from '../model/scvd-node';
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
import { perfEnd, perfStart, recordEvalNodeKind } from '../perf-stats';

/* =============================================================================
 * Public API
 * ============================================================================= */

export type EvaluateResult = number | string | bigint | Uint8Array | undefined;

type Host = ModelHost & DataAccessHost & IntrinsicProvider;
type MergedKind = ScalarKind | 'unknown';
type LValue = {
    get(): Promise<EvalValue>;
    set(v: EvalValue): Promise<EvalValue>;
    type: ScalarType | undefined;
};

export interface EvalContextInit {
    data: Host;
    // Starting container for symbol resolution (root model).
    container: ScvdNode;
}

export class Evaluator {
    private readonly messages: string[] = [];
    private readonly onIntrinsicError = (message: string): void => {
        this.recordMessage(message);
    };

    private resetMessages(): void {
        this.messages.length = 0;
    }

    private recordMessage(message: string): void {
        this.messages.push(message);
    }

    public getMessages(): string {
        return this.messages.join('\n');
    }

    private formatEvalValueForMessage(value: EvalValue): string {
        if (value === undefined) {
            return 'undefined';
        }
        if (typeof value === 'string') {
            const trimmed = value.length > 64 ? `${value.slice(0, 61)}...` : value;
            return `"${trimmed}"`;
        }
        if (typeof value === 'number' || typeof value === 'bigint') {
            return String(value);
        }
        if (value instanceof Uint8Array) {
            return `Uint8Array(${value.length})`;
        }
        return String(value);
    }

    private formatNodeForMessage(node: ASTNode): string {
        switch (node.kind) {
            case 'Identifier':
                return `Identifier(${(node as Identifier).name})`;
            case 'MemberAccess': {
                const ma = node as MemberAccess;
                return `MemberAccess(${this.formatNodeForMessage(ma.object)}.${ma.property})`;
            }
            case 'ArrayIndex': {
                const ai = node as ArrayIndex;
                return `ArrayIndex(${this.formatNodeForMessage(ai.array)}[...])`;
            }
            case 'CallExpression':
                return 'CallExpression';
            case 'EvalPointCall':
                return 'EvalPointCall';
            case 'UnaryExpression':
                return `UnaryExpression(${(node as UnaryExpression).operator})`;
            case 'BinaryExpression':
                return `BinaryExpression(${(node as BinaryExpression).operator})`;
            case 'ConditionalExpression':
                return 'ConditionalExpression';
            case 'AssignmentExpression':
                return `AssignmentExpression(${(node as AssignmentExpression).operator})`;
            case 'UpdateExpression':
                return `UpdateExpression(${(node as UpdateExpression).operator})`;
            case 'PrintfExpression':
                return 'PrintfExpression';
            case 'FormatSegment':
                return 'FormatSegment';
            case 'TextSegment':
                return 'TextSegment';
            case 'NumberLiteral':
                return `NumberLiteral(${(node as NumberLiteral).value})`;
            case 'StringLiteral':
                return `StringLiteral("${(node as StringLiteral).value}")`;
            case 'BooleanLiteral':
                return `BooleanLiteral(${(node as BooleanLiteral).value})`;
            default:
                return node.kind;
        }
    }

    public getTestHelpers(): Record<string, unknown> {
        return {
            findReferenceNode: this.findReferenceNode.bind(this),
            asNumber: this.asNumber.bind(this),
            integerDiv: this.integerDiv.bind(this),
            integerMod: this.integerMod.bind(this),
            evalArgsForIntrinsic: this.evalArgsForIntrinsic.bind(this),
            mustRef: this.mustRef.bind(this),
            formatValue: this.formatValue.bind(this),
            eqVals: this.eqVals.bind(this),
            ltVals: this.ltVals.bind(this),
            lteVals: this.lteVals.bind(this),
            gtVals: this.gtVals.bind(this),
            gteVals: this.gteVals.bind(this),
            getScalarTypeForContainer: this.getScalarTypeForContainer.bind(this),
            captureContainerForReference: this.captureContainerForReference.bind(this),
            evalBinary: this.evalBinary.bind(this),
            normalizeEvaluateResult: this.normalizeEvaluateResult.bind(this),
        };
    }

    /* =============================================================================
     * Helpers
     * ============================================================================= */

    private snapshotContainer(container: RefContainer): RefContainer {
        return { ...container };
    }

    private isReferenceNode(node: ASTNode): node is Identifier | MemberAccess | ArrayIndex {
        return node.kind === 'Identifier' || node.kind === 'MemberAccess' || node.kind === 'ArrayIndex';
    }

    private findReferenceNode(node: ASTNode | undefined): Identifier | MemberAccess | ArrayIndex | undefined {
        if (!node) {
            return undefined;
        }
        if (this.isReferenceNode(node)) {
            return node;
        }

        switch (node.kind) {
            case 'UnaryExpression': return this.findReferenceNode((node as UnaryExpression).argument);
            case 'UpdateExpression': return this.findReferenceNode((node as UpdateExpression).argument);
            case 'BinaryExpression': {
                const b = node as BinaryExpression;
                return this.findReferenceNode(b.right) ?? this.findReferenceNode(b.left);
            }
            case 'ConditionalExpression': {
                const c = node as ConditionalExpression;
                return this.findReferenceNode(c.test) ?? this.findReferenceNode(c.consequent) ?? this.findReferenceNode(c.alternate);
            }
            case 'AssignmentExpression': {
                const a = node as AssignmentExpression;
                return this.findReferenceNode(a.right) ?? this.findReferenceNode(a.left);
            }
            case 'CallExpression': {
                const c = node as CallExpression;
                if (c.args.length) {
                    for (const arg of c.args) {
                        const r = this.findReferenceNode(arg);
                        if (r) {
                            return r;
                        }
                    }
                }
                return this.findReferenceNode(c.callee);
            }
            case 'EvalPointCall': {
                const c = node as EvalPointCall;
                if (c.args.length) {
                    for (const arg of c.args) {
                        const r = this.findReferenceNode(arg);
                        if (r) {
                            return r;
                        }
                    }
                }
                return this.findReferenceNode(c.callee);
            }
            case 'PrintfExpression': {
                for (const seg of (node as PrintfExpression).segments) {
                    if (seg.kind === 'FormatSegment') {
                        const r = this.findReferenceNode(seg.value);
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

    private async captureContainerForReference(node: ASTNode, ctx: EvalContext): Promise<RefContainer | undefined> {
        if (!this.isReferenceNode(node)) {
            return undefined;
        }

        let captured: RefContainer | undefined;
        await this.withIsolatedContainer(ctx, async () => {
            const ref = await this.mustRef(node, ctx, false);
            if (!ref) {
                return;
            }
            captured = this.snapshotContainer(ctx.container);
        });
        return captured;
    }

    private truthy(x: unknown): boolean {
        return !!x;
    }

    private asNumber(x: unknown): number {
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
            const n = +x;
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }

    private eqVals(a: EvalValue, b: EvalValue): boolean {
        if (typeof a === 'string' || typeof b === 'string') {
            return String(a) === String(b);
        }
        if (typeof a === 'boolean' || typeof b === 'boolean') {
            return this.asNumber(a) === this.asNumber(b);
        }
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            return toBigInt(a) === toBigInt(b);
        }
        return a === b;
    }

    private ltVals(a: EvalValue, b: EvalValue): boolean {
        if (typeof a === 'string' || typeof b === 'string') {
            return String(a) < String(b);
        }
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            return toBigInt(a) < toBigInt(b);
        }
        return (a as number) < (b as number);
    }

    private lteVals(a: EvalValue, b: EvalValue): boolean {
        return this.ltVals(a, b) || this.eqVals(a, b);
    }

    private gtVals(a: EvalValue, b: EvalValue): boolean {
        if (typeof a === 'string' || typeof b === 'string') {
            return String(a) > String(b);
        }
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            return toBigInt(a) > toBigInt(b);
        }
        return (a as number) > (b as number);
    }

    private gteVals(a: EvalValue, b: EvalValue): boolean {
        return this.gtVals(a, b) || this.eqVals(a, b);
    }

    private normalizeScalarTypeFromName(name: string): ScalarType {
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

    private normalizeScalarType(t: string | ScalarType | undefined): ScalarType | undefined {
        if (!t) {
            return undefined;
        }
        if (typeof t === 'string') {
            return this.normalizeScalarTypeFromName(t);
        }
        if (!t.name && t.typename) {
            t.name = t.typename;
        }
        return t;
    }

    private async getScalarTypeForContainer(ctx: EvalContext, container: RefContainer): Promise<ScalarType | undefined> {
        const fn = ctx.data.getValueType;
        if (typeof fn !== 'function') {
            return undefined;
        }
        const raw = await fn.call(ctx.data, container);
        return this.normalizeScalarType(raw);
    }

    private integerDiv(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint | undefined {
        if ((typeof b === 'bigint' && b === 0n) || (typeof b === 'number' && b === 0)) {
            return undefined;
        }
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            const na = toBigInt(a as EvalValue);
            const nb = toBigInt(b as EvalValue);
            if (nb === 0n) {
                return undefined;
            }
            // unsigned is ignored for bigint (values already exact)
            return na / nb;
        }
        if (unsigned) {
            const na = (a as number) >>> 0;
            const nb = (b as number) >>> 0;
            if (nb === 0) {
                return undefined;
            }
            return Math.trunc(na / nb) >>> 0;
        } else {
            const na = (a as number) | 0;
            const nb = (b as number) | 0;
            if (nb === 0) {
                return undefined;
            }
            return (na / nb) | 0;
        }
    }

    private integerMod(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint | undefined {
        if ((typeof b === 'bigint' && b === 0n) || (typeof b === 'number' && b === 0)) {
            return undefined;
        }
        if (typeof a === 'bigint' || typeof b === 'bigint') {
            const na = toBigInt(a as EvalValue);
            const nb = toBigInt(b as EvalValue);
            if (nb === 0n) {
                return undefined;
            }
            return na % nb;
        }
        if (unsigned) {
            const na = (a as number) >>> 0;
            const nb = (b as number) >>> 0;
            if (nb === 0) {
                return undefined;
            }
            return (na % nb) >>> 0;
        } else {
            const na = (a as number) | 0;
            const nb = (b as number) | 0;
            if (nb === 0) {
                return undefined;
            }
            return na % nb;
        }
    }

    private prefersInteger(kind: MergedKind | undefined, a: EvalValue, b: EvalValue): { use: boolean; unsigned: boolean } {
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

    private divValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
        const pref = this.prefersInteger(kind, a, b);
        if (pref.use) {
            const result = this.integerDiv(toNumeric(a), toNumeric(b), pref.unsigned);
            if (result === undefined) {
                this.recordMessage(`Division by zero in "/": a=${this.formatEvalValueForMessage(a)}, b=${this.formatEvalValueForMessage(b)}`);
            }
            return result;
        }
        // Fallback to original floating semantics
        return divVals(a, b);
    }

    private modValsWithKind(a: EvalValue, b: EvalValue, kind: MergedKind | undefined): EvalValue {
        const pref = this.prefersInteger(kind, a, b);
        if (pref.use) {
            const result = this.integerMod(toNumeric(a), toNumeric(b), pref.unsigned);
            if (result === undefined) {
                this.recordMessage(`Division by zero in "%": a=${this.formatEvalValueForMessage(a)}, b=${this.formatEvalValueForMessage(b)}`);
            }
            return result;
        }
        return modVals(a, b);
    }

    private async evalArgsForIntrinsic(name: IntrinsicName, rawArgs: ASTNode[], ctx: EvalContext): Promise<EvalValue[] | undefined> {
        const perfStartTime = perfStart();
        // INTRINSIC_DEFINITIONS is a trusted static map.
        // eslint-disable-next-line security/detect-object-injection
        const needsName = INTRINSIC_DEFINITIONS[name]?.expectsNameArg === true;

        const resolved: EvalValue[] = [];
        for (const [idx, arg] of rawArgs.entries()) {
            if (!needsName) {
                switch (arg.kind) {
                    case 'NumberLiteral':
                        resolved.push((arg as NumberLiteral).value);
                        continue;
                    case 'StringLiteral':
                        resolved.push((arg as StringLiteral).value);
                        continue;
                    case 'BooleanLiteral':
                        resolved.push((arg as BooleanLiteral).value);
                        continue;
                    default:
                        resolved.push(await this.evalNode(arg, ctx));
                        continue;
                }
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
            this.recordMessage(`${name} expects identifier/string for argument ${idx + 1}, got ${arg.kind}`);
            perfEnd(perfStartTime, 'evalIntrinsicArgsMs', 'evalIntrinsicArgsCalls');
            return undefined;
        }

        perfEnd(perfStartTime, 'evalIntrinsicArgsMs', 'evalIntrinsicArgsCalls');
        return resolved;
    }

    /* =============================================================================
     * Small utility to avoid container clobbering during nested evals
     * ============================================================================= */

    private async withIsolatedContainer<T>(ctx: EvalContext, fn: () => Promise<T>): Promise<T> {
        const c = ctx.container;
        const saved = this.snapshotContainer(c);
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

    private addByteOffset(ctx: EvalContext, bytes: number) {
        const c = ctx.container;
        const add = (bytes | 0);
        c.offsetBytes = ((c.offsetBytes ?? 0) + add);
    }

    private async mustRef(node: ASTNode, ctx: EvalContext, forWrite = false): Promise<ScvdNode | undefined> {
        switch (node.kind) {
            case 'Identifier': {
                const id = node as Identifier;
                // Identifier lookup always starts from the root base
                const ref = await ctx.data.getSymbolRef(ctx.container, id.name, forWrite);
                if (!ref) {
                    this.recordMessage(`Unknown symbol '${id.name}' in ${this.formatNodeForMessage(node)}`);
                    return undefined;
                }
                // Start a new anchor chain at this identifier
                ctx.container.anchor = ref;
                ctx.container.offsetBytes = 0;
                ctx.container.widthBytes = undefined;
                // Reset last-context hints for a plain identifier
                ctx.container.member = undefined;
                ctx.container.index = undefined;
                ctx.container.valueType = undefined;
                ctx.container.origin = undefined;
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
                    const baseRef = await this.mustRef(ai.array, ctx, forWrite);
                    if (!baseRef) {
                        return undefined;
                    }

                    // Evaluate index in isolation (so i/j/mem.length don't clobber outer anchor)
                    const idx = this.asNumber(await this.withIsolatedContainer(ctx, () => this.evalNode(ai.index, ctx))) | 0;

                    // Remember the index for hosts that use it
                    ctx.container.index = idx;

                    // Use the thing we're actually indexing (supports nested arr[i][j].field)
                    const arrayRef = ctx.container.current ?? baseRef;

                    // Apply array offset using the correct dimension's stride (bytes)
                    const strideBytes = ctx.data.getElementStride ? await ctx.data.getElementStride(arrayRef) : 0;
                    if (typeof strideBytes === 'number' && strideBytes !== 0) {
                        this.addByteOffset(ctx, idx * strideBytes);
                    }

                    // Base for member resolution = element model if host provides one
                    const baseForMember = ctx.data.getElementRef ? (await ctx.data.getElementRef(arrayRef)) ?? arrayRef : arrayRef;
                    ctx.container.current = baseForMember;

                    // Resolve member
                    const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
                    if (!child) {
                        const baseName = baseForMember?.name ?? baseRef?.name ?? 'unknown';
                        this.recordMessage(`Missing member '${ma.property}' on '${baseName}'`);
                        return undefined;
                    }

                    // Accumulate member byte offset
                    const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseForMember, child) : undefined;
                    if (typeof memberOffsetBytes === 'number') {
                        this.addByteOffset(ctx, memberOffsetBytes);
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
                    ctx.container.origin = arrayRef;
                    ctx.container.valueType = undefined; // will be resolved on read/write via getValueType
                    return child;
                }

                // Default path: resolve base then member
                const baseRef = await this.mustRef(ma.object, ctx, forWrite);
                if (!baseRef) {
                    return undefined;
                }

                ctx.container.current = baseRef;
                const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
                if (!child) {
                    const baseName = baseRef?.name ?? 'unknown';
                    this.recordMessage(`Missing member '${ma.property}' on '${baseName}'`);
                    return undefined;
                }

                const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseRef, child) : undefined;
                if (typeof memberOffsetBytes === 'number') {
                    this.addByteOffset(ctx, memberOffsetBytes);
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
                ctx.container.origin = undefined;
                ctx.container.valueType = undefined;
                return child;
            }

            case 'ArrayIndex': {
                const ai = node as ArrayIndex;

                // Resolve array base (establishes anchor/current on the array)
                const baseRef = await this.mustRef(ai.array, ctx, forWrite);
                if (!baseRef) {
                    return undefined;
                }

                // Evaluate the index in isolation
                const idx = this.asNumber(await this.withIsolatedContainer(ctx, () => this.evalNode(ai.index, ctx))) | 0;

                // Translate index -> byte offset
                ctx.container.index = idx;

                const arrayRef = ctx.container.current ?? baseRef;
                ctx.container.member = undefined;
                ctx.container.valueType = undefined;
                ctx.container.origin = arrayRef;

                const strideBytes = ctx.data.getElementStride ? await ctx.data.getElementStride(arrayRef) : 0;
                if (typeof strideBytes === 'number' && strideBytes !== 0) {
                    this.addByteOffset(ctx, idx * strideBytes);
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
                this.recordMessage(`Invalid reference target (${node.kind})`);
                return undefined;
            }

            default:
                this.recordMessage(`Invalid reference target (${node.kind})`);
                return undefined;
        }
    }

    private async mustRead(ctx: EvalContext): Promise<EvalValue> {
        // ensure hosts know the expected scalar type for decoding (e.g., float vs int)
        if (ctx.container.valueType === undefined) {
            ctx.container.valueType = await this.getScalarTypeForContainer(ctx, ctx.container);
        }
        const v = await ctx.data.readValue(ctx.container);
        return v;
    }

    private async lref(node: ASTNode, ctx: EvalContext): Promise<LValue> {
        // Resolve and set the current target in the container for writes
        const writeRef = await this.mustRef(node, ctx, true);
        if (!writeRef) {
            return {
                async get(): Promise<EvalValue> {
                    return undefined;
                },
                async set(_v: EvalValue): Promise<EvalValue> {
                    return undefined;
                },
                type: undefined,
            };
        }

        // Snapshot the LHS write target so RHS evaluation can't clobber it
        const target = this.snapshotContainer(ctx.container);

        const valueType = await this.getScalarTypeForContainer(ctx, target);

        const evaluator = this;
        const lv: LValue = {
            get: async (): Promise<EvalValue> => {
                const readRef = await evaluator.mustRef(node, ctx, false);
                if (!readRef) {
                    return undefined;
                }
                ctx.container.valueType = valueType;
                return await evaluator.mustRead(ctx);
            },
            set: async (v: EvalValue): Promise<EvalValue> => {
                const out = await ctx.data.writeValue(target, v); // use frozen target
                return out;
            },
            type: valueType,
        };

        return lv;
    }

    /* =============================================================================
     * Evaluation
     * ============================================================================= */

    private async evalOperandWithType(node: ASTNode, ctx: EvalContext): Promise<{ value: EvalValue; type: ScalarType | undefined }> {
        let capturedType: ScalarType | undefined;

        const value = await this.withIsolatedContainer(ctx, async () => {
            const v = await this.evalNode(node, ctx);

            const snapshot = this.snapshotContainer(ctx.container);

            capturedType = await this.getScalarTypeForContainer(ctx, snapshot);
            return v;
        });

        return { value, type: capturedType };
    }

    public async evalNode(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
        recordEvalNodeKind(node.kind);
        switch (node.kind) {
            case 'NumberLiteral':  return (node as NumberLiteral).value;
            case 'StringLiteral':  return (node as StringLiteral).value;
            case 'BooleanLiteral': return (node as BooleanLiteral).value;

            case 'Identifier': {
                const name = (node as Identifier).name;
                // __Running can appear as a bare identifier; treat it as an intrinsic, not a symbol.
                if (name === '__Running') {
                    return await handleIntrinsic(ctx.data, ctx.container, '__Running', [], this.onIntrinsicError);
                }
                const ref = await this.mustRef(node, ctx, false);
                if (!ref) {
                    return undefined;
                }
                return await this.mustRead(ctx);
            }

            case 'MemberAccess': {
                const ma = node as MemberAccess;
                // Support pseudo-members that evaluate to numbers: obj._count and obj._addr
                if (ma.property === '_count' || ma.property === '_addr') {
                    const baseRef = await this.mustRef(ma.object, ctx, false);
                    if (!baseRef) {
                        return undefined;
                    }
                    return await handlePseudoMember(ctx.data, ctx.container, ma.property, baseRef, this.onIntrinsicError);
                }
                // Default: resolve member and read its value
                const ref = await this.mustRef(node, ctx, false);
                if (!ref) {
                    return undefined;
                }
                return await this.mustRead(ctx);
            }

            case 'ArrayIndex': {
                const ref = await this.mustRef(node, ctx, false);
                if (!ref) {
                    return undefined;
                }
                return await this.mustRead(ctx);
            }

            case 'ColonPath': {
                const cp = node as ColonPath;
                // Colon paths (foo:bar:baz) are host-defined lookups resolved by the DataHost.
                const handled = ctx.data.resolveColonPath
                    ? await ctx.data.resolveColonPath(ctx.container, cp.parts.slice())
                    : undefined;
                if (handled === undefined) {
                    return undefined;
                }
                return handled;
            }

            case 'UnaryExpression': {
                const u = node as UnaryExpression;
                const v = await this.evalNode(u.argument, ctx);
                if (v === undefined) {
                    return undefined;
                }
                switch (u.operator) {
                    case '+': {
                        const n = toNumeric(v);
                        return typeof n === 'bigint' ? n : +n;
                    }
                    case '-': {
                        const n = toNumeric(v);
                        return typeof n === 'bigint' ? -toBigInt(n as EvalValue) : -this.asNumber(n);
                    }
                    case '!': return !this.truthy(v);
                    case '~': {
                        const n = toNumeric(v);
                        if (typeof n === 'bigint') {
                            return ~n;
                        }
                        return ((~(this.asNumber(n) | 0)) >>> 0);
                    }
                    default:
                        this.recordMessage(`Unsupported unary operator ${u.operator} for ${this.formatNodeForMessage(u.argument)}`);
                        return undefined;
                }
            }

            case 'UpdateExpression': {
                const u = node as UpdateExpression;
                const ref = await this.lref(u.argument, ctx);
                const prev = await ref.get();
                if (prev === undefined) {
                    return undefined;
                }
                const next = (u.operator === '++'
                    ? (typeof prev === 'bigint' ? prev + 1n : this.asNumber(prev) + 1)
                    : (typeof prev === 'bigint' ? prev - 1n : this.asNumber(prev) - 1));
                const updated = await ref.set(next);
                if (updated === undefined) {
                    return undefined;
                }
                return u.prefix ? ref.get() : prev;
            }

            case 'BinaryExpression':   return await this.evalBinary(node as BinaryExpression, ctx);

            case 'ConditionalExpression': {
                const c = node as ConditionalExpression;
                const testValue = await this.evalNode(c.test, ctx);
                if (testValue === undefined) {
                    return undefined;
                }
                const branch = this.truthy(testValue) ? c.consequent : c.alternate;
                return await this.evalNode(branch, ctx);
            }

            case 'AssignmentExpression': {
                const a = node as AssignmentExpression;
                const ref = await this.lref(a.left, ctx);
                if (a.operator === '=') {
                    const value = await this.withIsolatedContainer(ctx, () => this.evalNode(a.right, ctx));
                    if (value === undefined) {
                        return undefined;
                    }
                    return await ref.set(value);
                }

                // Use the LValue to read current LHS value (and we already captured its type in lref)
                const L = await ref.get();
                const R = await this.evalNode(a.right, ctx);
                if (L === undefined || R === undefined) {
                    return undefined;
                }
                const lhsKind: MergedKind = ref.type ? ref.type.kind : 'unknown';

                let out: EvalValue;
                switch (a.operator) {
                    case '+=':  out = addVals(L, R); break;
                    case '-=':  out = subVals(L, R); break;
                    case '*=':  out = mulVals(L, R); break;
                    case '/=':  out = this.divValsWithKind(L, R, lhsKind); break;
                    case '%=':  out = this.modValsWithKind(L, R, lhsKind); break;
                    case '<<=': out = shlVals(L, R); break;
                    case '>>=': out = sarVals(L, R); break;
                    case '&=':  out = andVals(L, R); break;
                    case '^=':  out = xorVals(L, R); break;
                    case '|=':  out = orVals(L, R); break;
                    default:
                        this.recordMessage(`Unsupported assignment operator ${a.operator} for ${this.formatNodeForMessage(a.left)}`);
                        return undefined;
                }
                if (out === undefined) {
                    return undefined;
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
                        const args = await this.evalArgsForIntrinsic(name, c.args, ctx);
                        if (!args) {
                            return undefined;
                        }
                        return await handleIntrinsic(ctx.data, ctx.container, name, args, this.onIntrinsicError);
                    }
                }

                const args = [];
                for (const a of c.args) {
                    args.push(await this.evalNode(a, ctx)); // evaluate sequentially to avoid parallel side effects
                }
                const fnVal = await this.evalNode(c.callee, ctx);
                if (typeof fnVal === 'function') {
                    return await fnVal(...args);
                }
                return undefined;
            }

            case 'EvalPointCall': {
                const c = node as EvalPointCall;
                const name = c.intrinsic as string;
                if (!isIntrinsicName(name)) {
                    return undefined;
                }
                const intrinsicName = name as IntrinsicName;
                const args = await this.evalArgsForIntrinsic(intrinsicName, c.args, ctx);
                if (!args) {
                    return undefined;
                }
                return await handleIntrinsic(ctx.data, ctx.container, intrinsicName, args, this.onIntrinsicError);
            }

            case 'PrintfExpression': {
                const pf = node as PrintfExpression;
                let out = '';
                for (const seg of pf.segments) {
                    if (seg.kind === 'TextSegment') {
                        out += (seg as TextSegment).text;
                    } else {
                        const fs = seg as FormatSegment;
                        const { value, container } = await this.evaluateFormatSegmentValue(fs, ctx);
                        if (value === undefined) {
                            return undefined;
                        }
                        const formatted = await this.formatValue(fs.spec, value, ctx, container);
                        if (formatted === undefined) {
                            return undefined;
                        }
                        out += formatted;
                    }
                }
                return out;
            }

            case 'TextSegment':    return (node as TextSegment).text;
            case 'FormatSegment': {
                const seg = node as FormatSegment;
                const { value, container } = await this.evaluateFormatSegmentValue(seg, ctx);
                if (value === undefined) {
                    return undefined;
                }
                return await this.formatValue(seg.spec, value, ctx, container);
            }

            case 'ErrorNode':
                this.recordMessage('Cannot evaluate an ErrorNode.');
                return undefined;

            default: {
                const kind = (node as Partial<ASTNode>).kind ?? 'unknown';
                this.recordMessage(`Unhandled node kind: ${kind}`);
                return undefined;
            }
        }
    }

    private async evalBinary(node: BinaryExpression, ctx: EvalContext): Promise<EvalValue> {
        const { operator, left, right } = node;
        if (operator === '&&') {
            const lv = await this.evalNode(left, ctx);
            if (lv === undefined) {
                return undefined;
            }
            return this.truthy(lv) ? await this.evalNode(right, ctx) : lv;
        }
        if (operator === '||') {
            const lv = await this.evalNode(left, ctx);
            if (lv === undefined) {
                return undefined;
            }
            return this.truthy(lv) ? lv : await this.evalNode(right, ctx);
        }

        const { value: a, type: typeA } = await this.evalOperandWithType(left, ctx);
        const { value: b, type: typeB } = await this.evalOperandWithType(right, ctx);
        if (a === undefined || b === undefined) {
            return undefined;
        }
        const mergedKind = mergeScalarKinds(typeA, typeB);
        const bitWidthValue = Math.max(typeA?.bits ?? 0, typeB?.bits ?? 0);
        const bitWidth = bitWidthValue > 0 ? bitWidthValue : undefined;

        const isUnsigned = mergedKind === 'uint';

        let result: EvalValue;

        switch (operator) {
            case '+':
                result = addVals(a, b, bitWidth, isUnsigned);
                break;
            case '-':
                result = subVals(a, b, bitWidth, isUnsigned);
                break;
            case '*':
                result = mulVals(a, b, bitWidth, isUnsigned);
                break;
            case '/':
                result = this.divValsWithKind(a, b, mergedKind);
                break;
            case '%':
                result = this.modValsWithKind(a, b, mergedKind);
                break;
            case '<<':
                result = shlVals(a, b, bitWidth, isUnsigned);
                break;
            case '>>':
                result = sarVals(a, b, bitWidth, isUnsigned);
                break;
            case '>>>':
                this.recordMessage(`Unsupported operator >>> for a=${this.formatEvalValueForMessage(a)}, b=${this.formatEvalValueForMessage(b)}`);
                return undefined;
            case '&':
                result = andVals(a, b, bitWidth, isUnsigned);
                break;
            case '^':
                result = xorVals(a, b, bitWidth, isUnsigned);
                break;
            case '|':
                result = orVals(a, b, bitWidth, isUnsigned);
                break;
            case '==': {
                return this.eqVals(a, b);
            }
            case '!=': {
                return !this.eqVals(a, b);
            }
            case '<': {
                return this.ltVals(a, b);
            }
            case '<=': {
                return this.lteVals(a, b);
            }
            case '>': {
                return this.gtVals(a, b);
            }
            case '>=': {
                return this.gteVals(a, b);
            }
            default:
                this.recordMessage(`Unsupported binary operator ${operator} for a=${this.formatEvalValueForMessage(a)}, b=${this.formatEvalValueForMessage(b)}`);
                return undefined;
        }

        if (typeof result === 'number' || typeof result === 'bigint') {
            return normalizeToWidth(result, bitWidth, mergedKind);
        }
        return result;
    }

    /* =============================================================================
     * Printf helpers (callback-first, spec-agnostic with sensible fallbacks)
     * ============================================================================= */

    private async evaluateFormatSegmentValue(segment: FormatSegment, ctx: EvalContext): Promise<{ value: EvalValue; container: RefContainer | undefined }> {
        const value = await this.evalNode(segment.value, ctx);
        let containerSnapshot = this.snapshotContainer(ctx.container);
        if (!containerSnapshot.current) {
            const hasConst = (segment.value as Partial<{ constValue: unknown }>).constValue !== undefined;
            if (!hasConst) {
                const refNode = this.findReferenceNode(segment.value);
                const recovered = refNode ? await this.captureContainerForReference(refNode, ctx) : undefined;
                if (recovered) {
                    containerSnapshot = recovered;
                }
            }
        }
        return { value, container: containerSnapshot };
    }

    private async formatValue(spec: FormatSegment['spec'], v: EvalValue, ctx?: EvalContext, containerOverride?: RefContainer): Promise<string | undefined> {
        if (v === undefined) {
            return undefined;
        }
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
                return (num | 0).toString(10);
            }
            case 'u':  {
                const n = toNumeric(v);
                if (typeof n === 'bigint') {
                    return (n < 0n ? -n : n).toString(10);
                }
                const num = Number(n);
                if (!Number.isFinite(num)) {
                    return 'NaN';
                }
                return (num >>> 0).toString(10);
            }
            case 'x':  {
                const n = toNumeric(v);
                if (typeof n === 'bigint') {
                    return `0x${n.toString(16)}`;
                }
                const num = Number(n);
                if (!Number.isFinite(num)) {
                    return 'NaN';
                }
                return (num >>> 0).toString(16);
            }
            case 't':  return this.truthy(v) ? 'true' : 'false';
            case 'S':  return typeof v === 'string' ? v : String(v);
            case 'C': case 'E': case 'I': case 'J': case 'N': case 'M': case 'T': case 'U': return String(v);
            default:   return String(v);
        }
    }

    private normalizeEvaluateResult(v: EvalValue): EvaluateResult {
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

    public async evaluateParseResult(pr: ParseResult, ctx: EvalContext, container?: ScvdNode): Promise<EvaluateResult> {
        const perfStartTime = perfStart();
        this.resetMessages();
        const prevBase = ctx.container.base;
        const saved = this.snapshotContainer(ctx.container);
        const override = container !== undefined;
        if (override) {
            ctx.container.base = container as ScvdNode;
        }
        try {
            const v = await this.evalNode(pr.ast, ctx);
            const normalized = this.normalizeEvaluateResult(v);
            return normalized;
        } catch (error) {
            console.error('Error evaluating parse result:', error);
            return undefined;
        } finally {
            perfEnd(perfStartTime, 'evalMs', 'evalCalls');
            if (this.messages.length > 0) {
                console.error(this.getMessages());
            }
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
}

export class EvalContext {
    readonly data: Host;
    // Composite container context (root + last member/index/current).
    container: RefContainer;

    constructor(init: EvalContextInit) {
        this.data = init.data;
        this.container = {
            base: init.container,
            valueType: undefined,
        };
    }
}
