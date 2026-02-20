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

import { componentViewerLogger } from '../../../logger';
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
    CastExpression,
    SizeofExpression,
    AlignofExpression,
    CallExpression,
    EvalPointCall,
    PrintfExpression,
    FormatSegment,
    TextSegment,
    ParseResult,
    ColonPath,
} from './parser';
import type { ScvdNode } from '../model/scvd-node';
import type { DataAccessHost, EvalValue, ModelHost, RefContainer, ScalarKind, ScalarType } from './model-host';
import type { IntrinsicProvider } from './intrinsics';
import { handleIntrinsic, INTRINSIC_DEFINITIONS, IntrinsicName, isIntrinsicName } from './intrinsics';
import { perf } from '../stats-config';
import { EvaluatorCache } from './evaluator-cache';
import { EvaluatorDiagnostics } from './evaluator-diagnostics';
import {
    applyBinary,
    applyUnary,
    convertToType,
    DEFAULT_INTEGER_MODEL,
    type IntegerModel,
    parseNumericLiteral,
    parseTypeName,
    sizeofTypeName,
    type CType,
    type CValue,
} from './c-numeric';

/* =============================================================================
 * Public API
 * ============================================================================= */

export type EvaluateResult = number | string | bigint | Uint8Array | undefined;

type Host = ModelHost & DataAccessHost & IntrinsicProvider;
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
    private static readonly STRICT_C = true;
    private static readonly MEMO_ENABLED = true;
    private readonly diagnostics = new EvaluatorDiagnostics();
    private caches = new EvaluatorCache();
    private containerStack: RefContainer[] = [];
    private containerPool: RefContainer[] = [];
    private _model: IntegerModel;

    constructor(model: IntegerModel = DEFAULT_INTEGER_MODEL) {
        this._model = model;
    }

    public setIntegerModel(model: IntegerModel): void {
        this._model = model;
    }

    public resetEvalCaches(): void {
        this.caches.resetAll();
    }

    private async getByteWidthCached(ctx: EvalContext, ref: ScvdNode): Promise<number | undefined> {
        const cached = this.caches.getByteWidth(ref);
        if (cached !== undefined) {
            return cached;
        }
        const byteWidthFn = ctx.data.getByteWidth;
        if (typeof byteWidthFn !== 'function') {
            return undefined;
        }
        const byteWidthStart = perf?.start() ?? 0;
        const w = await byteWidthFn.call(ctx.data, ref);
        perf?.end(byteWidthStart, 'evalHostGetByteWidthMs', 'evalHostGetByteWidthCalls');
        if (typeof w === 'number' && w > 0) {
            this.caches.setByteWidth(ref, w);
            return w;
        }
        return undefined;
    }

    protected getMessages(): string {
        return this.diagnostics.getMessages();
    }

    protected getTestHelpers(): Record<string, unknown> {
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
            formatEvalValueForMessage: this.diagnostics.formatEvalValueForMessage.bind(this.diagnostics),
            formatNodeForMessage: this.diagnostics.formatNodeForMessage.bind(this.diagnostics),
            toCTypeFromScalarType: this.toCTypeFromScalarType.bind(this),
            fromCValue: this.fromCValue.bind(this),
        };
    }

    /* =============================================================================
     * Helpers
     * ============================================================================= */

    private snapshotContainer(container: RefContainer): RefContainer {
        return { ...container };
    }

    private copyContainer(target: RefContainer, source: RefContainer): void {
        target.base = source.base;
        target.anchor = source.anchor;
        target.offsetBytes = source.offsetBytes;
        target.widthBytes = source.widthBytes;
        target.current = source.current;
        target.origin = source.origin;
        target.member = source.member;
        target.index = source.index;
        target.valueType = source.valueType;
    }

    private pushContainer(ctx: EvalContext, patch?: Partial<RefContainer>): void {
        const prev = ctx.container;
        const next = this.containerPool.pop() ?? { ...prev };
        this.copyContainer(next, prev);
        if (patch) {
            Object.assign(next, patch);
        }
        this.containerStack.push(prev);
        ctx.container = next;
    }

    private popContainer(ctx: EvalContext): void {
        const prev = this.containerStack.pop();
        if (!prev) {
            return;
        }
        const current = ctx.container;
        ctx.container = prev;
        this.containerPool.push(current);
    }

    private isReferenceNode(node: ASTNode): node is Identifier | MemberAccess | ArrayIndex {
        return node.kind === 'Identifier' || node.kind === 'MemberAccess' || node.kind === 'ArrayIndex';
    }

    private isPureNode(node: ASTNode): boolean {
        switch (node.kind) {
            case 'NumberLiteral':
            case 'StringLiteral':
            case 'BooleanLiteral':
                return true;
            case 'UnaryExpression':
                return this.isPureNode((node as UnaryExpression).argument);
            case 'BinaryExpression': {
                const b = node as BinaryExpression;
                return this.isPureNode(b.left) && this.isPureNode(b.right);
            }
            case 'ConditionalExpression': {
                const c = node as ConditionalExpression;
                return this.isPureNode(c.test) && this.isPureNode(c.consequent) && this.isPureNode(c.alternate);
            }
            default:
                return false;
        }
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
                // For intrinsic calls, the callee is metadata (intrinsic name), not a reference to evaluate.
                // Only search the arguments for references.
                const c = node as EvalPointCall;
                if (c.args.length) {
                    for (const arg of c.args) {
                        const r = this.findReferenceNode(arg);
                        if (r) {
                            return r;
                        }
                    }
                }
                // If no args, fall back to callee (it's still an identifier node)
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

    private compareVals(op: '==' | '!=' | '<' | '<=' | '>' | '>=', a: EvalValue, b: EvalValue): number | undefined {
        const cA = this.toCValueFromEval(a, undefined);
        const cB = this.toCValueFromEval(b, undefined);
        if (!cA || !cB) {
            return undefined;
        }
        const out = applyBinary(op, cA, cB, this._model);
        if (!out) {
            return undefined;
        }
        const v = this.fromCValue(out);
        return typeof v === 'bigint' ? Number(v) : v;
    }

    private eqVals(a: EvalValue, b: EvalValue): number | undefined {
        return this.compareVals('==', a, b);
    }

    private ltVals(a: EvalValue, b: EvalValue): number | undefined {
        return this.compareVals('<', a, b);
    }

    private lteVals(a: EvalValue, b: EvalValue): number | undefined {
        return this.compareVals('<=', a, b);
    }

    private gtVals(a: EvalValue, b: EvalValue): number | undefined {
        return this.compareVals('>', a, b);
    }

    private gteVals(a: EvalValue, b: EvalValue): number | undefined {
        return this.compareVals('>=', a, b);
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

    private toCTypeFromScalarType(type: ScalarType | undefined): CType | undefined {
        if (!type) {
            return undefined;
        }
        const name = type.name;
        if (type.kind === 'float') {
            const bits = type.bits ?? 64;
            return name ? { kind: 'float', bits, name } : { kind: 'float', bits };
        }
        if (type.kind === 'uint') {
            const bits = type.bits ?? this._model.intBits;
            return name ? { kind: 'uint', bits, name } : { kind: 'uint', bits };
        }
        const bits = type.bits ?? this._model.intBits;
        return name ? { kind: 'int', bits, name } : { kind: 'int', bits };
    }

    private toCValueFromEval(value: EvalValue, type: ScalarType | undefined): CValue | undefined {
        if (value === undefined) {
            return undefined;
        }
        const cType = this.toCTypeFromScalarType(type);
        if (typeof value === 'bigint') {
            const outType = cType ?? { kind: 'int', bits: this._model.longLongBits, name: 'long long' };
            return { type: outType, value };
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                return undefined;
            }
            const isInt = Number.isInteger(value);
            if (cType) {
                return { type: cType, value: cType.kind === 'float' ? value : BigInt(Math.trunc(value)) };
            }
            if (isInt) {
                return { type: { kind: 'int', bits: this._model.intBits, name: 'int' }, value: BigInt(Math.trunc(value)) };
            }
            return { type: { kind: 'float', bits: 64, name: 'double' }, value };
        }
        if (typeof value === 'boolean') {
            return { type: { kind: 'int', bits: this._model.intBits, name: 'int' }, value: value ? 1n : 0n };
        }
        return undefined;
    }

    private fromCValue(value: CValue): number | bigint {
        if (value.type.kind === 'float') {
            return value.value as number;
        }
        const big = value.value as bigint;
        const bits = value.type.bits ?? 0;
        if (bits > 32) {
            return big;
        }
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
        if (big > maxSafe || big < minSafe) {
            return big;
        }
        return Number(big);
    }

    private async getScalarTypeForContainer(ctx: EvalContext, container: RefContainer): Promise<ScalarType | undefined> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            if (container.valueType !== undefined) {
                return container.valueType;
            }
            if (container.current) {
                if (this.caches.hasValueType(container.current)) {
                    const cached = this.caches.getValueType(container.current);
                    container.valueType = cached;
                    return cached;
                }
            }
            const fn = ctx.data.getValueType;
            if (typeof fn !== 'function') {
                return undefined;
            }
            const valueTypeStart = perf?.start() ?? 0;
            const raw = await fn.call(ctx.data, container);
            perf?.end(valueTypeStart, 'evalGetValueTypeMs', 'evalGetValueTypeCalls');
            const normalized = this.normalizeScalarType(raw);
            if (container.current) {
                this.caches.setValueType(container.current, normalized);
            }
            container.valueType = normalized;
            return normalized;
        } finally {
            perf?.end(perfStartTime, 'evalGetScalarTypeMs', 'evalGetScalarTypeCalls');
        }
    }

    private integerDiv(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint | undefined {
        if (typeof a === 'number' && (!Number.isFinite(a) || !Number.isInteger(a))) {
            return undefined;
        }
        if (typeof b === 'number' && (!Number.isFinite(b) || !Number.isInteger(b))) {
            return undefined;
        }
        const type: ScalarType = { kind: unsigned ? 'uint' : 'int', bits: this._model.intBits, name: unsigned ? 'unsigned int' : 'int' };
        const cA = this.toCValueFromEval(a as EvalValue, type);
        const cB = this.toCValueFromEval(b as EvalValue, type);
        if (!cA || !cB) {
            return undefined;
        }
        const out = applyBinary('/', cA, cB, this._model);
        if (!out) {
            return undefined;
        }
        return this.fromCValue(out);
    }

    private integerMod(a: number | bigint, b: number | bigint, unsigned: boolean): number | bigint | undefined {
        if (typeof a === 'number' && (!Number.isFinite(a) || !Number.isInteger(a))) {
            return undefined;
        }
        if (typeof b === 'number' && (!Number.isFinite(b) || !Number.isInteger(b))) {
            return undefined;
        }
        const type: ScalarType = { kind: unsigned ? 'uint' : 'int', bits: this._model.intBits, name: unsigned ? 'unsigned int' : 'int' };
        const cA = this.toCValueFromEval(a as EvalValue, type);
        const cB = this.toCValueFromEval(b as EvalValue, type);
        if (!cA || !cB) {
            return undefined;
        }
        const out = applyBinary('%', cA, cB, this._model);
        if (!out) {
            return undefined;
        }
        return this.fromCValue(out);
    }

    private async evalArgsForIntrinsic(name: IntrinsicName, rawArgs: ASTNode[], ctx: EvalContext): Promise<EvalValue[] | undefined> {
        const perfStartTime = perf?.start() ?? 0;
        // INTRINSIC_DEFINITIONS is a trusted static map.
        // eslint-disable-next-line security/detect-object-injection
        const needsName = INTRINSIC_DEFINITIONS[name]?.expectsNameArg === true;

        const resolved: EvalValue[] = [];
        for (const [idx, arg] of rawArgs.entries()) {
            if (!needsName) {
                switch (arg.kind) {
                    case 'NumberLiteral':
                        resolved.push((arg as NumberLiteral).constValue ?? (arg as NumberLiteral).value);
                        continue;
                    case 'StringLiteral':
                        resolved.push((arg as StringLiteral).value);
                        continue;
                    case 'BooleanLiteral':
                        resolved.push((arg as BooleanLiteral).value);
                        continue;
                    default:
                        resolved.push(await this.evalNodeChild(arg, ctx));
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
            // __Offset_of accepts ColonPath (type:member) as in C++ implementation
            if (name === '__Offset_of' && arg.kind === 'ColonPath') {
                const cp = arg as ColonPath;
                // Convert ColonPath parts to "type:member" string format
                resolved.push(cp.parts.join(':'));
                continue;
            }
            // Make the failure explicit; this avoids silently passing evaluated values like 0.
            this.diagnostics.record(`${name} expects identifier/string for argument ${idx + 1}, got ${arg.kind}`);
            perf?.end(perfStartTime, 'evalIntrinsicArgsMs', 'evalIntrinsicArgsCalls');
            return undefined;
        }

        perf?.end(perfStartTime, 'evalIntrinsicArgsMs', 'evalIntrinsicArgsCalls');
        return resolved;
    }

    /* =============================================================================
     * Small utility to avoid container clobbering during nested evals
     * ============================================================================= */

    private async withIsolatedContainer<T>(ctx: EvalContext, fn: () => Promise<T>): Promise<T> {
        this.pushContainer(ctx);
        try {
            return await fn();
        } finally {
            this.popContainer(ctx);
        }
    }

    /* =============================================================================
     * Strict ref/value utilities (single-root + contextual hints)
     * ============================================================================= */

    private addByteOffset(ctx: EvalContext, bytes: number) {
        const c = ctx.container;
        const add = Number.isFinite(bytes) ? Math.trunc(bytes) : 0;
        c.offsetBytes = ((c.offsetBytes ?? 0) + add);
    }

    private async mustRef(node: ASTNode, ctx: EvalContext, forWrite = false): Promise<ScvdNode | undefined> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            switch (node.kind) {
                case 'Identifier': {
                    const perfStartKind = perf?.start() ?? 0;
                    const id = node as Identifier;
                    // Identifier lookup always starts from the root base
                    const cacheKey = forWrite ? `w:${id.name}` : `r:${id.name}`;
                    let ref: ScvdNode | undefined;
                    if (this.caches.hasIdentifier(ctx.container.base, cacheKey)) {
                        ref = this.caches.getIdentifier(ctx.container.base, cacheKey);
                    } else {
                        const symbolRefStart = perf?.start() ?? 0;
                        ref = await ctx.data.getSymbolRef(ctx.container, id.name, forWrite);
                        perf?.end(symbolRefStart, 'evalHostGetSymbolRefMs', 'evalHostGetSymbolRefCalls');
                        this.caches.setIdentifier(ctx.container.base, cacheKey, ref);
                    }
                    if (!ref) {
                        perf?.end(perfStartKind, 'evalMustRefIdentifierMs', 'evalMustRefIdentifierCalls');
                        // Check if this is an intrinsic function name being used as an identifier
                        if (isIntrinsicName(id.name)) {
                            this.diagnostics.record(`Intrinsic function '${id.name}' cannot be used as an identifier. Use it as a function call: ${id.name}(...)`);
                        } else {
                            this.diagnostics.record(`Unknown symbol '${id.name}' in ${this.diagnostics.formatNodeForMessage(node)}`);
                        }
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

                    const w = await this.getByteWidthCached(ctx, ref);
                    if (typeof w === 'number' && w > 0) {
                        ctx.container.widthBytes = w;
                    }

                    perf?.end(perfStartKind, 'evalMustRefIdentifierMs', 'evalMustRefIdentifierCalls');
                    return ref;
                }

                case 'MemberAccess': {
                    const perfStartKind = perf?.start() ?? 0;
                    const ma = node as MemberAccess;

                    // Pseudo-members are resolved against the base ref; capture container hints without member lookup.
                    if (ma.property === '_count' || ma.property === '_addr') {
                        const baseRef = await this.mustRef(ma.object, ctx, forWrite);
                        if (!baseRef) {
                            perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                            return undefined;
                        }
                        ctx.container.member = baseRef;
                        ctx.container.current = baseRef;
                        ctx.container.valueType = undefined;
                        perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                        return baseRef;
                    }

                    // Fast-path: if object is an ArrayIndex, compute index ONCE, then resolve the member on the element.
                    if (ma.object.kind === 'ArrayIndex') {
                        const ai = ma.object as ArrayIndex;

                        // Resolve array symbol and establish anchor/current
                        const baseRef = await this.mustRef(ai.array, ctx, forWrite);
                        if (!baseRef) {
                            perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                            return undefined;
                        }

                        // Evaluate index in isolation (so i/j/mem.length don't clobber outer anchor)
                        const idx = Math.trunc(this.asNumber(await this.withIsolatedContainer(ctx, () => this.evalNodeChild(ai.index, ctx))));

                        // Remember the index for hosts that use it
                        ctx.container.index = idx;

                        // Use the thing we're actually indexing (supports nested arr[i][j].field)
                        const arrayRef = ctx.container.current ?? baseRef;

                        // Apply array offset using the correct dimension's stride (bytes)
                        let strideBytes = 0;
                        if (ctx.data.getElementStride) {
                            const strideStart = perf?.start() ?? 0;
                            strideBytes = await ctx.data.getElementStride(arrayRef);
                            perf?.end(strideStart, 'evalHostGetElementStrideMs', 'evalHostGetElementStrideCalls');
                        }
                        if (typeof strideBytes === 'number' && strideBytes !== 0) {
                            this.addByteOffset(ctx, idx * strideBytes);
                        }

                        // Base for member resolution = element model if host provides one
                        let baseForMember = arrayRef;
                        if (ctx.data.getElementRef) {
                            const elementRefStart = perf?.start() ?? 0;
                            baseForMember = (await ctx.data.getElementRef(arrayRef)) ?? arrayRef;
                            perf?.end(elementRefStart, 'evalHostGetElementRefMs', 'evalHostGetElementRefCalls');
                        }
                        ctx.container.current = baseForMember;

                        // Resolve member
                        const memberRefStart = perf?.start() ?? 0;
                        const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
                        perf?.end(memberRefStart, 'evalHostGetMemberRefMs', 'evalHostGetMemberRefCalls');
                        if (!child) {
                            const baseName = baseForMember?.name ?? baseRef?.name ?? 'unknown';
                            this.diagnostics.record(`Missing member '${ma.property}' on '${baseName}'`);
                            perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                            return undefined;
                        }

                        // Accumulate member byte offset
                        const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseForMember, child) : undefined;
                        if (typeof memberOffsetBytes === 'number') {
                            this.addByteOffset(ctx, memberOffsetBytes);
                        }

                        const w = await this.getByteWidthCached(ctx, child);
                        if (typeof w === 'number' && w > 0) {
                            ctx.container.widthBytes = w;
                        }

                        // Finalize hints
                        ctx.container.member = child;
                        ctx.container.current = child;
                        ctx.container.origin = arrayRef;
                        ctx.container.valueType = undefined; // will be resolved on read/write via getValueType
                        perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                        return child;
                    }

                    // Default path: resolve base then member
                    const baseRef = await this.mustRef(ma.object, ctx, forWrite);
                    if (!baseRef) {
                        perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                        return undefined;
                    }

                    ctx.container.current = baseRef;
                    const memberRefStart = perf?.start() ?? 0;
                    const child = await ctx.data.getMemberRef(ctx.container, ma.property, forWrite);
                    perf?.end(memberRefStart, 'evalHostGetMemberRefMs', 'evalHostGetMemberRefCalls');
                    if (!child) {
                        const baseName = baseRef?.name ?? 'unknown';
                        this.diagnostics.record(`Missing member '${ma.property}' on '${baseName}'`);
                        perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                        return undefined;
                    }

                    const memberOffsetBytes = ctx.data.getMemberOffset ? await ctx.data.getMemberOffset(baseRef, child) : undefined;
                    if (typeof memberOffsetBytes === 'number') {
                        this.addByteOffset(ctx, memberOffsetBytes);
                    }

                    const w = await this.getByteWidthCached(ctx, child);
                    if (typeof w === 'number' && w > 0) {
                        ctx.container.widthBytes = w;
                    }

                    ctx.container.member = child;
                    ctx.container.current = child;
                    ctx.container.origin = undefined;
                    ctx.container.valueType = undefined;
                    perf?.end(perfStartKind, 'evalMustRefMemberMs', 'evalMustRefMemberCalls');
                    return child;
                }

                case 'ArrayIndex': {
                    const perfStartKind = perf?.start() ?? 0;
                    const ai = node as ArrayIndex;

                    // Resolve array base (establishes anchor/current on the array)
                    const baseRef = await this.mustRef(ai.array, ctx, forWrite);
                    if (!baseRef) {
                        perf?.end(perfStartKind, 'evalMustRefArrayMs', 'evalMustRefArrayCalls');
                        return undefined;
                    }

                    // Evaluate the index in isolation
                    const idx = Math.trunc(this.asNumber(await this.withIsolatedContainer(ctx, () => this.evalNodeChild(ai.index, ctx))));

                    // Translate index -> byte offset
                    ctx.container.index = idx;

                    const arrayRef = ctx.container.current ?? baseRef;
                    ctx.container.member = undefined;
                    ctx.container.valueType = undefined;
                    ctx.container.origin = arrayRef;

                    let strideBytes = 0;
                    if (ctx.data.getElementStride) {
                        const strideStart = perf?.start() ?? 0;
                        strideBytes = await ctx.data.getElementStride(arrayRef);
                        perf?.end(strideStart, 'evalHostGetElementStrideMs', 'evalHostGetElementStrideCalls');
                    }
                    if (typeof strideBytes === 'number' && strideBytes !== 0) {
                        this.addByteOffset(ctx, idx * strideBytes);
                    }

                    // Current target becomes element if host exposes it, otherwise array
                    let elementRef = arrayRef;
                    if (ctx.data.getElementRef) {
                        const elementRefStart = perf?.start() ?? 0;
                        elementRef = (await ctx.data.getElementRef(arrayRef)) ?? arrayRef;
                        perf?.end(elementRefStart, 'evalHostGetElementRefMs', 'evalHostGetElementRefCalls');
                    }
                    ctx.container.current = elementRef;

                    const w = await this.getByteWidthCached(ctx, elementRef);
                    if (typeof w === 'number' && w > 0) {
                        ctx.container.widthBytes = w;
                    }

                    perf?.end(perfStartKind, 'evalMustRefArrayMs', 'evalMustRefArrayCalls');
                    return baseRef;
                }

                case 'EvalPointCall': {
                    this.diagnostics.record(`Invalid reference target (${node.kind})`);
                    return undefined;
                }

                default:
                    this.diagnostics.record(`Invalid reference target (${node.kind})`);
                    return undefined;
            }
        } finally {
            perf?.end(perfStartTime, 'evalMustRefMs', 'evalMustRefCalls');
        }
    }

    private async mustRead(ctx: EvalContext): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            // ensure hosts know the expected scalar type for decoding (e.g., float vs int)
            if (ctx.container.valueType === undefined) {
                ctx.container.valueType = await this.getScalarTypeForContainer(ctx, ctx.container);
            }
            ctx.readCount++;
            const v = await ctx.data.readValue(ctx.container);
            return v;
        } finally {
            perf?.end(perfStartTime, 'evalMustReadMs', 'evalMustReadCalls');
        }
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

        const lv: LValue = {
            get: async (): Promise<EvalValue> => {
                const readRef = await this.mustRef(node, ctx, false);
                if (!readRef) {
                    return undefined;
                }
                ctx.container.valueType = valueType;
                return this.mustRead(ctx);
            },
            set: async (v: EvalValue): Promise<EvalValue> => {
                this.clearEvalNodeMemo();
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
        const perfStartTime = perf?.start() ?? 0;
        let capturedType: ScalarType | undefined;
        try {
            const value = await this.withIsolatedContainer(ctx, async () => {
                const v = await this.evalNodeChild(node, ctx);
                if (typeof ctx.data.getValueType === 'function') {
                    capturedType = await this.getScalarTypeForContainer(ctx, ctx.container);
                }
                return v;
            });

            return { value, type: capturedType };
        } finally {
            perf?.end(perfStartTime, 'evalOperandWithTypeMs', 'evalOperandWithTypeCalls');
        }
    }

    private async evalRunningIntrinsic(ctx: EvalContext): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            const fn = ctx.data.__Running;
            if (typeof fn !== 'function') {
                this.diagnostics.record('Missing intrinsic __Running');
                return undefined;
            }
            const out = await fn.call(ctx.data);
            if (out === undefined) {
                this.diagnostics.record('Intrinsic __Running returned undefined');
                return undefined;
            }
            if (!Number.isFinite(out)) {
                this.diagnostics.record('Intrinsic __Running returned non-finite');
                return undefined;
            }
            return Math.trunc(out);
        } finally {
            perf?.end(perfStartTime, 'evalRunningIntrinsicMs', 'evalRunningIntrinsicCalls');
        }
    }

    private async evalPseudoMember(ctx: EvalContext, property: string, baseRef: ScvdNode): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            ctx.container.member = baseRef;
            ctx.container.current = baseRef;
            ctx.container.valueType = undefined;
            const fn = property === '_count' ? ctx.data._count : ctx.data._addr;
            if (typeof fn !== 'function') {
                this.diagnostics.record(`Missing pseudo-member ${property}`);
                return undefined;
            }
            const out = await fn.call(ctx.data, ctx.container);
            if (out === undefined) {
                this.diagnostics.record(`Pseudo-member ${property} returned undefined`);
            }
            return out;
        } finally {
            perf?.end(perfStartTime, 'evalPseudoMemberMs', 'evalPseudoMemberCalls');
        }
    }

    protected async evalNode(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
        perf?.recordEvalNodeKind(node.kind);
        const start = perf?.now() ?? 0;
        perf?.beginEvalNodeFrame(start, node.kind);
        try {
            switch (node.kind) {
                case 'NumberLiteral': {
                    const nl = node as NumberLiteral;
                    if (nl.constValue !== undefined) {
                        return nl.constValue as number | bigint;
                    }
                    const parsed = parseNumericLiteral(nl.raw, this._model);
                    return this.fromCValue(parsed);
                }
                case 'StringLiteral':  return (node as StringLiteral).value;
                case 'BooleanLiteral': return (node as BooleanLiteral).value;

                case 'Identifier': {
                    const name = (node as Identifier).name;
                    // __Running can appear as a bare identifier; treat it as an intrinsic, not a symbol.
                    if (name === '__Running') {
                        return this.evalRunningIntrinsic(ctx);
                    }
                    const ref = await this.mustRef(node, ctx, false);
                    if (!ref) {
                        return undefined;
                    }
                    return this.mustRead(ctx);
                }

                case 'MemberAccess': {
                    const ma = node as MemberAccess;
                    // Support pseudo-members that evaluate to numbers: obj._count and obj._addr
                    if (ma.property === '_count' || ma.property === '_addr') {
                        const baseRef = await this.mustRef(ma.object, ctx, false);
                        if (!baseRef) {
                            return undefined;
                        }
                        return this.evalPseudoMember(ctx, ma.property, baseRef);
                    }
                    // Default: resolve member and read its value
                    const ref = await this.mustRef(node, ctx, false);
                    if (!ref) {
                        return undefined;
                    }
                    return this.mustRead(ctx);
                }

                case 'ArrayIndex': {
                    const ref = await this.mustRef(node, ctx, false);
                    if (!ref) {
                        return undefined;
                    }
                    return this.mustRead(ctx);
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
                    if (Evaluator.STRICT_C && (u.operator === '+' || u.operator === '-' || u.operator === '!' || u.operator === '~')) {
                        const { value: v, type } = await this.evalOperandWithType(u.argument, ctx);
                        if (v === undefined) {
                            return undefined;
                        }
                        const cv = this.toCValueFromEval(v, type);
                        if (!cv) {
                            return undefined;
                        }
                        const out = applyUnary(u.operator, cv);
                        if (!out) {
                            if (cv.type.kind === 'float' && u.operator === '~') {
                                this.diagnostics.record('Illegal operation on floating-point value');
                                return undefined;
                            }
                            this.diagnostics.record(`Unsupported unary operator ${u.operator} for ${this.diagnostics.formatNodeForMessage(u.argument)}`);
                            return undefined;
                        }
                        return this.fromCValue(out);
                    }
                    const v = await this.evalNodeChild(u.argument, ctx);
                    if (v === undefined) {
                        return undefined;
                    }
                    switch (u.operator) {
                        case '&': {
                            const ref = await this.mustRef(u.argument, ctx, false);
                            if (!ref) {
                                return undefined;
                            }
                            return this.evalPseudoMember(ctx, '_addr', ref);
                        }
                        case '*': {
                            this.diagnostics.record('Dereference operator "*" is not supported in expression evaluation.');
                            return undefined;
                        }
                        default:
                            this.diagnostics.record(`Unsupported unary operator ${u.operator} for ${this.diagnostics.formatNodeForMessage(u.argument)}`);
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
                    if (Evaluator.STRICT_C) {
                        const lhsType = ref.type;
                        const cPrev = this.toCValueFromEval(prev, lhsType);
                        const one = this.toCValueFromEval(1, lhsType);
                        if (!cPrev || !one) {
                            return undefined;
                        }
                        const op = u.operator === '++' ? '+' : '-';
                        const tmp = applyBinary(op, cPrev, one, this._model);
                        if (!tmp) {
                            return undefined;
                        }
                        const targetType = this.toCTypeFromScalarType(lhsType);
                        const converted = targetType ? convertToType(tmp, targetType) : tmp;
                        const nextValue = this.fromCValue(converted);
                        const updated = await ref.set(nextValue);
                        if (updated === undefined) {
                            return undefined;
                        }
                        return u.prefix ? ref.get() : prev;
                    }
                    const prevNum = typeof prev === 'bigint' ? undefined : this.asNumber(prev);
                    const next = (u.operator === '++'
                        ? (typeof prev === 'bigint' ? prev + 1n : (prevNum ?? 0) + 1)
                        : (typeof prev === 'bigint' ? prev - 1n : (prevNum ?? 0) - 1));
                    const updated = await ref.set(next);
                    if (updated === undefined) {
                        return undefined;
                    }
                    return u.prefix ? ref.get() : prev;
                }

                case 'BinaryExpression':   return this.evalBinary(node as BinaryExpression, ctx);

                case 'CastExpression': {
                    const ce = node as CastExpression;
                    const v = await this.evalNodeChild(ce.argument, ctx);
                    if (v === undefined) {
                        return undefined;
                    }
                    const target = parseTypeName(ce.typeName, this._model);
                    const cv = this.toCValueFromEval(v, undefined);
                    if (!cv) {
                        return undefined;
                    }
                    if (!target) {
                        return this.fromCValue(cv);
                    }
                    const converted = convertToType(cv, target);
                    return this.fromCValue(converted);
                }

                case 'SizeofExpression': {
                    const se = node as SizeofExpression;
                    if (se.typeName) {
                        const size = sizeofTypeName(se.typeName, this._model);
                        return size;
                    }
                    if (se.argument) {
                        const refNode = this.findReferenceNode(se.argument);
                        if (refNode) {
                            const ref = await this.mustRef(refNode, ctx, false);
                            if (!ref) {
                                return undefined;
                            }
                            const w = await this.getByteWidthCached(ctx, ref);
                            return w;
                        }
                    }
                    return undefined;
                }

                case 'AlignofExpression': {
                    const ae = node as AlignofExpression;
                    if (ae.typeName) {
                        const size = sizeofTypeName(ae.typeName, this._model);
                        return size;
                    }
                    if (ae.argument) {
                        const refNode = this.findReferenceNode(ae.argument);
                        if (refNode) {
                            const ref = await this.mustRef(refNode, ctx, false);
                            if (!ref) {
                                return undefined;
                            }
                            const w = await this.getByteWidthCached(ctx, ref);
                            return w;
                        }
                    }
                    return undefined;
                }

                case 'ConditionalExpression': {
                    const c = node as ConditionalExpression;
                    const testValue = await this.evalNodeChild(c.test, ctx);
                    if (testValue === undefined) {
                        return undefined;
                    }
                    const testCv = this.toCValueFromEval(testValue, undefined);
                    if (!testCv) {
                        return undefined;
                    }
                    const truthy = testCv.type.kind === 'float'
                        ? (testCv.value as number) !== 0
                        : (testCv.value as bigint) !== 0n;
                    const branch = truthy ? c.consequent : c.alternate;
                    return this.evalNodeChild(branch, ctx);
                }

                case 'AssignmentExpression': {
                    const a = node as AssignmentExpression;
                    const ref = await this.lref(a.left, ctx);
                    if (a.operator === '=') {
                        const value = await this.withIsolatedContainer(ctx, () => this.evalNodeChild(a.right, ctx));
                        if (value === undefined) {
                            return undefined;
                        }
                        if (Evaluator.STRICT_C) {
                            const targetType = this.toCTypeFromScalarType(ref.type);
                            if (!targetType) {
                                return ref.set(value);
                            }
                            const cValue = this.toCValueFromEval(value, ref.type);
                            if (!cValue) {
                                return undefined;
                            }
                            const converted = convertToType(cValue, targetType);
                            return ref.set(this.fromCValue(converted));
                        }
                        return ref.set(value);
                    }

                    // Use the LValue to read current LHS value (and we already captured its type in lref)
                    const L = await ref.get();
                    const R = await this.evalNodeChild(a.right, ctx);
                    if (L === undefined || R === undefined) {
                        return undefined;
                    }
                    if (Evaluator.STRICT_C) {
                        const cType = this.toCTypeFromScalarType(ref.type);
                        const cL = this.toCValueFromEval(L, ref.type);
                        const cR = this.toCValueFromEval(R, ref.type);
                        if (!cL || !cR) {
                            return undefined;
                        }
                        let tmp: CValue | undefined;
                        switch (a.operator) {
                            case '+=': tmp = applyBinary('+', cL, cR, this._model); break;
                            case '-=': tmp = applyBinary('-', cL, cR, this._model); break;
                            case '*=': tmp = applyBinary('*', cL, cR, this._model); break;
                            case '/=': tmp = applyBinary('/', cL, cR, this._model); break;
                            case '%=': tmp = applyBinary('%', cL, cR, this._model); break;
                            case '<<=': tmp = applyBinary('<<', cL, cR, this._model); break;
                            case '>>=': tmp = applyBinary('>>', cL, cR, this._model); break;
                            case '&=': tmp = applyBinary('&', cL, cR, this._model); break;
                            case '^=': tmp = applyBinary('^', cL, cR, this._model); break;
                            case '|=': tmp = applyBinary('|', cL, cR, this._model); break;
                            default:
                                this.diagnostics.record(`Unsupported assignment operator ${a.operator} for ${this.diagnostics.formatNodeForMessage(a.left)}`);
                                return undefined;
                        }
                        if (!tmp) {
                            return undefined;
                        }
                        const converted = cType ? convertToType(tmp, cType) : tmp;
                        return ref.set(this.fromCValue(converted));
                    }

                    this.diagnostics.record(`Unsupported assignment operator ${a.operator} for ${this.diagnostics.formatNodeForMessage(a.left)}`);
                    return undefined;
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
                            return handleIntrinsic(ctx.data, ctx.container, name, args, this.diagnostics.onIntrinsicError);
                        }
                    }

                    const args = [];
                    for (const a of c.args) {
                        args.push(await this.evalNodeChild(a, ctx)); // evaluate sequentially to avoid parallel side effects
                    }
                    const fnVal = await this.evalNodeChild(c.callee, ctx);
                    if (typeof fnVal === 'function') {
                        return fnVal(...args);
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
                    return handleIntrinsic(ctx.data, ctx.container, intrinsicName, args, this.diagnostics.onIntrinsicError);
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
                    return this.formatValue(seg.spec, value, ctx, container);
                }

                case 'ErrorNode':
                    this.diagnostics.record('Cannot evaluate an ErrorNode.');
                    return undefined;

                default: {
                    const kind = (node as Partial<ASTNode>).kind ?? 'unknown';
                    this.diagnostics.record(`Unhandled node kind: ${kind}`);
                    return undefined;
                }
            }
        } finally {
            const end = perf?.now() ?? 0;
            perf?.endEvalNodeFrame(start, end);
        }
    }

    private async evalBinary(node: BinaryExpression, ctx: EvalContext): Promise<EvalValue> {
        return this.evalBinaryStrict(node, ctx);
    }

    private async evalBinaryStrict(node: BinaryExpression, ctx: EvalContext): Promise<EvalValue> {
        const { operator, left, right } = node;
        if (operator === ',') {
            await this.evalNodeChild(left, ctx);
            return this.evalNodeChild(right, ctx);
        }
        if (operator === '&&' || operator === '||') {
            const { value: lv, type: lt } = await this.evalOperandWithType(left, ctx);
            if (lv === undefined) {
                return undefined;
            }
            const lcv = this.toCValueFromEval(lv, lt);
            if (!lcv) {
                return undefined;
            }
            const lTruth = lcv.type.kind === 'float' ? (lcv.value as number) !== 0 : (lcv.value as bigint) !== 0n;
            if (operator === '&&' && !lTruth) {
                return 0;
            }
            if (operator === '||' && lTruth) {
                return 1;
            }
            const { value: rv, type: rt } = await this.evalOperandWithType(right, ctx);
            if (rv === undefined) {
                return undefined;
            }
            const rcv = this.toCValueFromEval(rv, rt);
            if (!rcv) {
                return undefined;
            }
            const rTruth = rcv.type.kind === 'float' ? (rcv.value as number) !== 0 : (rcv.value as bigint) !== 0n;
            return rTruth ? 1 : 0;
        }

        const { value: a, type: typeA } = await this.evalOperandWithType(left, ctx);
        const { value: b, type: typeB } = await this.evalOperandWithType(right, ctx);
        if (a === undefined || b === undefined) {
            return undefined;
        }
        const cA = this.toCValueFromEval(a, typeA);
        const cB = this.toCValueFromEval(b, typeB);
        if (!cA || !cB) {
            return undefined;
        }
        if ((operator === '&' || operator === '|' || operator === '^' || operator === '<<' || operator === '>>' || operator === '%')
            && (cA.type.kind === 'float' || cB.type.kind === 'float')) {
            this.diagnostics.record('Illegal operation on floating-point value');
            return undefined;
        }
        const out = applyBinary(operator, cA, cB, this._model);
        if (!out) {
            if (operator === '/' || operator === '%') {
                this.diagnostics.record(`Division by zero in "${operator}": a=${this.diagnostics.formatEvalValueForMessage(a)}, b=${this.diagnostics.formatEvalValueForMessage(b)}`);
            } else if (operator === '<<' || operator === '>>') {
                this.diagnostics.record(`Invalid shift in "${operator}": a=${this.diagnostics.formatEvalValueForMessage(a)}, b=${this.diagnostics.formatEvalValueForMessage(b)}`);
            }
            return undefined;
        }
        return this.fromCValue(out);
    }

    /* =============================================================================
     * Printf helpers (callback-first, spec-agnostic with sensible fallbacks)
     * ============================================================================= */

    private async evaluateFormatSegmentValue(segment: FormatSegment, ctx: EvalContext): Promise<{ value: EvalValue; container: RefContainer | undefined }> {
        const valueNode = segment.value;
        const isPseudoMember = valueNode.kind === 'MemberAccess'
            && (((valueNode as MemberAccess).property) === '_addr' || (valueNode as MemberAccess).property === '_count');
        const isRunningIdentifier = valueNode.kind === 'Identifier' && (valueNode as Identifier).name === '__Running';

        if (this.isReferenceNode(valueNode) && !isPseudoMember && !isRunningIdentifier) {
            let captured: RefContainer | undefined;
            const value = await this.withIsolatedContainer(ctx, async () => {
                const ref = await this.mustRef(valueNode, ctx, false);
                if (!ref) {
                    return undefined;
                }
                captured = this.snapshotContainer(ctx.container);
                return this.mustRead(ctx);
            });
            return { value, container: captured };
        }

        const value = await this.evalNodeChild(valueNode, ctx);
        let containerSnapshot = this.snapshotContainer(ctx.container);
        const hasConst = (segment.value as Partial<{ constValue: unknown }>).constValue !== undefined;
        const refNode = this.findReferenceNode(segment.value);
        if (refNode && (!this.isReferenceNode(segment.value) || !containerSnapshot.current)) {
            const recovered = await this.captureContainerForReference(refNode, ctx);
            if (recovered) {
                containerSnapshot = recovered;
            }
        }
        if (!containerSnapshot.current && !hasConst && !refNode) {
            return { value, container: undefined };
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
        const formatInt = (value: EvalValue, unsigned: boolean, radix: number): string | undefined => {
            const perfStart = perf?.start() ?? 0;
            const scalarType: ScalarType = { kind: unsigned ? 'uint' : 'int', bits: this._model.intBits, name: unsigned ? 'unsigned int' : 'int' };
            const target = { kind: unsigned ? 'uint' : 'int', bits: this._model.intBits, name: unsigned ? 'unsigned int' : 'int' } as const;
            const cv = this.toCValueFromEval(value, scalarType);
            if (!cv) {
                if (typeof value === 'number' && !Number.isFinite(value)) {
                    perf?.end(perfStart, 'evalFormatIntMs', 'evalFormatIntCalls');
                    return 'NaN';
                }
                perf?.end(perfStart, 'evalFormatIntMs', 'evalFormatIntCalls');
                return undefined;
            }
            const normalized = convertToType(cv, target);
            if (normalized.type.kind === 'float') {
                const num = normalized.value as number;
                if (!Number.isFinite(num)) {
                    perf?.end(perfStart, 'evalFormatIntMs', 'evalFormatIntCalls');
                    return 'NaN';
                }
                perf?.end(perfStart, 'evalFormatIntMs', 'evalFormatIntCalls');
                return Math.trunc(num).toString(radix);
            }
            const big = normalized.value as bigint;
            perf?.end(perfStart, 'evalFormatIntMs', 'evalFormatIntCalls');
            return big.toString(radix);
        };
        switch (spec) {
            case '%':  return '%';
            case 'd':  {
                return formatInt(v, false, 10);
            }
            case 'u':  {
                return formatInt(v, true, 10);
            }
            case 'x':  {
                const formatted = formatInt(v, true, 16);
                if (formatted === undefined || formatted === 'NaN') {
                    return formatted;
                }
                return `0x${formatted}`;
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
        const perfStartTime = perf?.start() ?? 0;
        this.diagnostics.reset();
        const override = container !== undefined;
        this.pushContainer(ctx, override ? { base: container as ScvdNode } : undefined);
        try {
            const v = await this.evalNodeChild(pr.ast, ctx);
            const normalized = this.normalizeEvaluateResult(v);
            return normalized;
        } catch (error) {
            componentViewerLogger.error('Error evaluating parse result:', error);
            return undefined;
        } finally {
            perf?.end(perfStartTime, 'evalMs', 'evalCalls');
            const messages = this.diagnostics.getMessages();
            if (messages.length > 0) {
                componentViewerLogger.error(messages);
            }
            this.popContainer(ctx);
        }
    }

    private async evalNodeChild(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            const start = perf?.now() ?? 0;
            if (start === 0) {
                return this.evalNodeWithMemo(node, ctx);
            }
            const out = await this.evalNodeWithMemo(node, ctx);
            const end = perf?.now() ?? 0;
            perf?.addEvalNodeChildMs?.(start, end);
            return out;
        } finally {
            perf?.end(perfStartTime, 'evalNodeChildMs', 'evalNodeChildCalls');
        }
    }

    private async evalNodeWithMemo(node: ASTNode, ctx: EvalContext): Promise<EvalValue> {
        if (!Evaluator.MEMO_ENABLED) {
            return this.evalNode(node, ctx);
        }
        if (!this.isPureNode(node)) {
            return this.evalNode(node, ctx);
        }
        if (this.caches.hasMemo(node)) {
            perf?.recordEvalNodeCacheHit();
            const cached = this.caches.getMemo(node);
            return cached === null ? undefined : cached;
        }
        perf?.recordEvalNodeCacheMiss();
        const readBefore = ctx.readCount;
        const value = await this.evalNode(node, ctx);
        if (ctx.readCount === readBefore) {
            this.caches.setMemo(node, value === undefined ? null : value);
        }
        return value;
    }

    private clearEvalNodeMemo(): void {
        this.caches.resetMemo();
    }
}

export class EvalContext {
    readonly data: Host;
    // Composite container context (root + last member/index/current).
    container: RefContainer;
    readCount = 0;

    constructor(init: EvalContextInit) {
        this.data = init.data;
        this.container = {
            base: init.container,
            valueType: undefined,
        };
    }
}
