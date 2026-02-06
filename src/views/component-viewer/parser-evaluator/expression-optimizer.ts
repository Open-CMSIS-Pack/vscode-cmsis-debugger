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

import {
    applyBinary,
    applyUnary,
    cValueFromConst,
    convertToType,
    DEFAULT_INTEGER_MODEL,
    type IntegerModel,
    parseNumericLiteral,
    parseTypeName,
    sizeofTypeName,
    type CType,
    type CValue,
} from './c-numeric';
import type {
    ASTNode,
    AssignmentExpression,
    BinaryExpression,
    BooleanLiteral,
    CastExpression,
    CallExpression,
    ConditionalExpression,
    ConstValue,
    Diagnostic,
    EvalPointCall,
    FormatSegment,
    AlignofExpression,
    MemberAccess,
    NumberLiteral,
    ParseResult,
    PrintfExpression,
    SizeofExpression,
    UnaryExpression,
    UpdateExpression,
} from './parser';

const startOf = (n: ASTNode) => (n as { start: number }).start;
const endOf = (n: ASTNode) => (n as { end: number }).end;
const constOf = (n: ASTNode) => (n as { constValue?: ConstValue }).constValue;

const makeNumberLiteral = (value: number | bigint, start: number, end: number): NumberLiteral => ({
    kind: 'NumberLiteral',
    value,
    raw: value.toString(),
    valueType: 'number',
    constValue: value,
    start,
    end,
});

function literalFromConst(cv: ConstValue, start: number, end: number): ASTNode {
    if (typeof cv === 'number') {
        return makeNumberLiteral(cv, start, end);
    }
    if (typeof cv === 'bigint') {
        return { kind: 'NumberLiteral', value: cv, raw: cv.toString(), valueType: 'number', constValue: cv, start, end };
    }
    if (typeof cv === 'string') {
        return { kind: 'StringLiteral', value: cv, raw: JSON.stringify(cv), valueType: 'string', constValue: cv, start, end };
    }
    if (typeof cv === 'boolean') {
        return { kind: 'BooleanLiteral', value: cv, valueType: 'boolean', constValue: cv, start, end };
    }
    return { kind: 'ErrorNode', message: 'Unsupported literal', start, end };
}

function constValueFromCValue(value: CValue): ConstValue {
    if (value.type.kind === 'float') {
        return value.value as number;
    }
    const bigintValue = value.value as bigint;
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (bigintValue > maxSafe || bigintValue < minSafe) {
        return bigintValue;
    }
    return Number(bigintValue);
}

function normalizeConstValue(v: unknown): ConstValue {
    if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' || typeof v === 'boolean') {
        return v;
    }
    return undefined;
}

function isZeroConst(v: ConstValue): boolean {
    if (typeof v === 'number') {
        return v === 0;
    }
    if (typeof v === 'bigint') {
        return v === 0n;
    }
    return false;
}

function isOneConst(v: ConstValue): boolean {
    if (typeof v === 'number') {
        return v === 1;
    }
    if (typeof v === 'bigint') {
        return v === 1n;
    }
    return false;
}

function cValueFromNode(node: ASTNode, map: WeakMap<ASTNode, CValue>, model: IntegerModel): CValue | undefined {
    const cached = map.get(node);
    if (cached) {
        return cached;
    }
    if (node.kind === 'NumberLiteral') {
        const raw = (node as NumberLiteral).raw;
        if (raw.startsWith('\'') && raw.endsWith('\'')) {
            const value = (node as NumberLiteral).value;
            const cv = cValueFromConst(value, { kind: 'int', bits: model.intBits, name: 'int' });
            map.set(node, cv);
            return cv;
        }
        const parsed = parseNumericLiteral(raw, model);
        map.set(node, parsed);
        return parsed;
    }
    if (node.kind === 'BooleanLiteral') {
        const cv = cValueFromConst((node as BooleanLiteral).value, { kind: 'bool', bits: 1, name: 'bool' });
        map.set(node, cv);
        return cv;
    }
    const cv = constOf(node);
    if (typeof cv === 'number' || typeof cv === 'bigint' || typeof cv === 'boolean') {
        const type: CType = typeof cv === 'boolean'
            ? { kind: 'bool', bits: 1, name: 'bool' }
            : { kind: 'int', bits: model.intBits, name: 'int' };
        const out = cValueFromConst(cv, type);
        map.set(node, out);
        return out;
    }
    return undefined;
}

type FoldStats = { full: number; partial: number; identity: number };

function addError(diagnostics: Diagnostic[], message: string, start: number, end: number): void {
    diagnostics.push({ type: 'error', message, start, end });
}

export class ExpressionOptimizer {
    private _model: IntegerModel;

    constructor(model: IntegerModel = DEFAULT_INTEGER_MODEL) {
        this._model = model;
    }

    public setIntegerModel(model: IntegerModel): void {
        this._model = model;
    }

    public foldAst(node: ASTNode, diagnostics: Diagnostic[] = []): ASTNode {
        const stats: FoldStats = { full: 0, partial: 0, identity: 0 };
        const cMap = new WeakMap<ASTNode, CValue>();
        return this.fold(node, diagnostics, stats, cMap);
    }

    public optimizeParseResult(parsed: ParseResult): ParseResult {
        const diagnostics = parsed.diagnostics.slice();
        const stats: FoldStats = { full: 0, partial: 0, identity: 0 };
        const cMap = new WeakMap<ASTNode, CValue>();
        const ast = this.fold(parsed.ast, diagnostics, stats, cMap);
        if (diagnostics.some((d) => d.type === 'error')) {
            console.error(`[SCVD][expression-optimizer][fold] full=${stats.full} partial=${stats.partial} identity=${stats.identity}`);
        }
        const constValue = parsed.isPrintf ? undefined : ast.constValue;
        return {
            ...parsed,
            ast,
            diagnostics,
            constValue,
        };
    }

    private fold(node: ASTNode, diagnostics: Diagnostic[], stats: FoldStats, cMap: WeakMap<ASTNode, CValue>): ASTNode {
        const k = node.kind;

        if (k === 'NumberLiteral' || k === 'StringLiteral' || k === 'BooleanLiteral') {
            if (k === 'NumberLiteral') {
                const raw = (node as NumberLiteral).raw;
                if (raw.startsWith('\'') && raw.endsWith('\'')) {
                    const value = (node as NumberLiteral).value;
                    const cValue = cValueFromConst(value, { kind: 'int', bits: this._model.intBits, name: 'int' });
                    cMap.set(node, cValue);
                    return { ...node, constValue: constValueFromCValue(cValue) };
                }
                const cValue = parseNumericLiteral(raw, this._model);
                cMap.set(node, cValue);
                return { ...node, constValue: constValueFromCValue(cValue) };
            }
            if (k === 'BooleanLiteral') {
                const cValue = cValueFromNode(node, cMap, this._model);
                return { ...node, constValue: cValue ? constValueFromCValue(cValue) : (node as BooleanLiteral).value };
            }
            return { ...node, constValue: node.value };
        }
        if (k === 'Identifier') {
            return node;
        }
        if (k === 'ColonPath') {
            return node;
        }
        if (k === 'MemberAccess') {
            return { ...node, object: this.fold((node as MemberAccess).object, diagnostics, stats, cMap) };
        }
        if (k === 'ArrayIndex') {
            return { ...node, array: this.fold((node as { array: ASTNode }).array, diagnostics, stats, cMap), index: this.fold((node as { index: ASTNode }).index, diagnostics, stats, cMap) };
        }

        if (k === 'UnaryExpression') {
            const arg = this.fold((node as UnaryExpression).argument, diagnostics, stats, cMap);
            const op = (node as UnaryExpression).operator;
            const res: UnaryExpression & { constValue?: ConstValue } = { ...(node as UnaryExpression), argument: arg };
            if (op === '*' || op === '&') {
                return res;
            }
            const cv = cValueFromNode(arg, cMap, this._model);
            if (cv) {
                try {
                    const out = applyUnary(op, cv);
                    if (out) {
                        cMap.set(res as unknown as ASTNode, out);
                        res.constValue = constValueFromCValue(out);
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    addError(diagnostics, `Failed to fold unary expression ${op}: ${msg}`, startOf(node), endOf(node));
                }
                if (res.constValue !== undefined) {
                    stats.full += 1;
                    return literalFromConst(res.constValue, startOf(node), endOf(node));
                }
            }
            return res;
        }

        if (k === 'UpdateExpression') {
            const ue = node as UpdateExpression;
            return { ...ue, argument: this.fold(ue.argument, diagnostics, stats, cMap) };
        }

        if (k === 'BinaryExpression') {
            const left = this.fold((node as BinaryExpression).left, diagnostics, stats, cMap);
            const right = this.fold((node as BinaryExpression).right, diagnostics, stats, cMap);
            const op = (node as BinaryExpression).operator;
            const res: BinaryExpression & { constValue?: ConstValue } = { ...(node as BinaryExpression), left, right };
            if (op === ',' && constOf(right) !== undefined) {
                stats.full += 1;
                return right;
            }
            const lcv = cValueFromNode(left, cMap, this._model);
            const rcv = cValueFromNode(right, cMap, this._model);
            if (lcv && rcv) {
                try {
                    const out = applyBinary(op, lcv, rcv, this._model);
                    if (out) {
                        cMap.set(res as unknown as ASTNode, out);
                        res.constValue = constValueFromCValue(out);
                    } else if (op === '/' || op === '%') {
                        const rZero = rcv.type.kind === 'float'
                            ? (rcv.value as number) === 0
                            : (rcv.value as bigint) === 0n;
                        if (rZero) {
                            addError(diagnostics, 'Division by zero', startOf(node), endOf(node));
                        }
                    } else if (op === '<<' || op === '>>') {
                        addError(diagnostics, `Invalid ${op} operation in constant fold`, startOf(node), endOf(node));
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    addError(diagnostics, `Failed to fold binary expression ${op}: ${msg}`, startOf(node), endOf(node));
                }
                if (res.constValue !== undefined) {
                    stats.full += 1;
                    return literalFromConst(res.constValue, startOf(node), endOf(node));
                }
            }

            if (op === '&&' || op === '||') {
                const leftOnly = lcv ?? cValueFromNode(left, cMap, this._model);
                if (leftOnly) {
                    const lTruth = leftOnly.type.kind === 'float'
                        ? (leftOnly.value as number) !== 0
                        : (leftOnly.value as bigint) !== 0n;
                    if (op === '&&' && !lTruth) {
                        stats.full += 1;
                        return literalFromConst(0, startOf(node), endOf(node));
                    }
                    if (op === '||' && lTruth) {
                        stats.full += 1;
                        return literalFromConst(1, startOf(node), endOf(node));
                    }
                }
            }

            const leftConst = constOf(left);
            const rightConst = constOf(right);

            if (op === '&&' && rightConst !== undefined && rightConst !== false && rightConst !== 0 && rightConst !== 0n) {
                stats.identity += 1;
                return left;
            }
            if (op === '||' && rightConst !== undefined && (rightConst === false || rightConst === 0 || rightConst === 0n)) {
                stats.identity += 1;
                return left;
            }
        if (op === '+' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '+' && leftConst !== undefined && isZeroConst(leftConst)) {
            stats.identity += 1;
            return right;
        }
        if (op === '-' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '*' && rightConst !== undefined && isOneConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '*' && leftConst !== undefined && isOneConst(leftConst)) {
            stats.identity += 1;
            return right;
        }
        if (op === '/' && rightConst !== undefined && isOneConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '|' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '|' && leftConst !== undefined && isZeroConst(leftConst)) {
            stats.identity += 1;
            return right;
        }
        if (op === '^' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '^' && leftConst !== undefined && isZeroConst(leftConst)) {
            stats.identity += 1;
            return right;
        }
        if (op === '<<' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }
        if (op === '>>' && rightConst !== undefined && isZeroConst(rightConst)) {
            stats.identity += 1;
            return left;
        }

        // Partial folding: combine trailing numeric constants in addition/subtraction chains.
            if ((op === '+' || op === '-') && rightConst !== undefined && left.kind === 'BinaryExpression') {
                const lb = left as BinaryExpression;
                const lbRightConst = constOf(lb.right);
                if ((lb.operator === '+' || lb.operator === '-') && lbRightConst !== undefined) {
                    const cLeft = cValueFromNode(lb.right, cMap, this._model);
                    const cRight = cValueFromNode(right, cMap, this._model);
                    if (cLeft && cRight) {
                        let combined: CValue | undefined;
                        let newOp: '+' | '-' = '+';
                        if (lb.operator === '+' && op === '+') {
                            combined = applyBinary('+', cLeft, cRight, this._model);
                            newOp = '+';
                        } else if (lb.operator === '+' && op === '-') {
                            combined = applyBinary('-', cLeft, cRight, this._model);
                            newOp = '+';
                        } else if (lb.operator === '-' && op === '+') {
                            combined = applyBinary('-', cRight, cLeft, this._model);
                            newOp = '+';
                        } else {
                            combined = applyBinary('+', cLeft, cRight, this._model);
                            newOp = '-';
                        }
                        if (combined) {
                            const combinedConst = constValueFromCValue(combined);
                            const newRight = makeNumberLiteral(combinedConst as number | bigint, startOf(right), endOf(right));
                            const newLeft = lb.left;
                            stats.partial += 1;
                            return {
                                kind: 'BinaryExpression',
                                operator: newOp,
                                left: newLeft,
                                right: newRight,
                                start: startOf(newLeft),
                                end: endOf(newRight),
                            };
                        }
                    }
                }
            }

        // Partial folding: combine trailing numeric constants in multiplication chains.
            if (op === '*' && rightConst !== undefined && left.kind === 'BinaryExpression') {
                const lb = left as BinaryExpression;
                const lbRightConst = constOf(lb.right);
                if (lb.operator === '*' && lbRightConst !== undefined) {
                    const cLeft = cValueFromNode(lb.right, cMap, this._model);
                    const cRight = cValueFromNode(right, cMap, this._model);
                    if (cLeft && cRight) {
                        const combined = applyBinary('*', cLeft, cRight, this._model);
                        if (combined) {
                            const combinedConst = constValueFromCValue(combined);
                            const newRight = makeNumberLiteral(combinedConst as number | bigint, startOf(right), endOf(right));
                            const newLeft = lb.left;
                            stats.partial += 1;
                            return {
                                kind: 'BinaryExpression',
                                operator: '*',
                                left: newLeft,
                                right: newRight,
                                start: startOf(newLeft),
                                end: endOf(newRight),
                            };
                        }
                    }
                }
            }
        return res;
    }

        if (k === 'AssignmentExpression') {
            const ae = node as AssignmentExpression;
            const right = this.fold(ae.right, diagnostics, stats, cMap);
            // Do not fold assignments to constants; keep side effects for evaluator
            return { ...ae, right };
        }

        if (k === 'ConditionalExpression') {
            const test = this.fold((node as ConditionalExpression).test, diagnostics, stats, cMap);
            const cons = this.fold((node as ConditionalExpression).consequent, diagnostics, stats, cMap);
            const alt = this.fold((node as ConditionalExpression).alternate, diagnostics, stats, cMap);
            const res: ConditionalExpression & { constValue?: ConstValue } = { ...(node as ConditionalExpression), test, consequent: cons, alternate: alt };
            const testConst = constOf(test);
            if (testConst !== undefined) {
                stats.identity += 1;
                const truthy = testConst !== false && testConst !== 0 && testConst !== 0n;
                return truthy ? cons : alt;
            }
            return res;
        }

        if (k === 'CastExpression') {
            const ce = node as CastExpression;
            const arg = this.fold(ce.argument, diagnostics, stats, cMap);
            const res: CastExpression & { constValue?: ConstValue } = { ...ce, argument: arg };
            const cv = cValueFromNode(arg, cMap, this._model);
            const target = parseTypeName(ce.typeName, this._model);
            if (cv && target) {
                const out = convertToType(cv, target);
                cMap.set(res as unknown as ASTNode, out);
                res.constValue = constValueFromCValue(out);
                stats.full += 1;
                return literalFromConst(res.constValue, startOf(node), endOf(node));
            }
            return res;
        }

        if (k === 'SizeofExpression' || k === 'AlignofExpression') {
            const se = node as SizeofExpression | AlignofExpression;
            if (se.typeName) {
                const size = sizeofTypeName(se.typeName, this._model);
                if (typeof size === 'number') {
                    stats.full += 1;
                    return literalFromConst(size, startOf(node), endOf(node));
                }
            }
            if (se.argument) {
                const arg = this.fold(se.argument, diagnostics, stats, cMap);
                return { ...se, argument: arg };
            }
            return se;
        }

        if (k === 'CallExpression' || k === 'EvalPointCall') {
            const args = (node as CallExpression | EvalPointCall).args.map((a:ASTNode) => this.fold(a, diagnostics, stats, cMap));
            return { ...(node as CallExpression | EvalPointCall), args };
        }

        if (k === 'PrintfExpression') {
            return {
                ...node,
                segments: (node as PrintfExpression).segments.map(seg => {
                    if (seg.kind === 'FormatSegment') {
                        return { ...seg, value: this.fold((seg as FormatSegment).value, diagnostics, stats, cMap) };
                    }
                    return seg;
                })
            };
        }

        return node;
    }
}

export function foldAst(node: ASTNode, diagnostics: Diagnostic[] = [], model: IntegerModel = DEFAULT_INTEGER_MODEL): ASTNode {
    return new ExpressionOptimizer(model).foldAst(node, diagnostics);
}

export function optimizeParseResult(parsed: ParseResult, model: IntegerModel = DEFAULT_INTEGER_MODEL): ParseResult {
    return new ExpressionOptimizer(model).optimizeParseResult(parsed);
}

export const __expressionOptimizerTestUtils = { literalFromConst, normalizeConstValue, isZeroConst };
