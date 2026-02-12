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

import { performance } from 'node:perf_hooks';
import type { ASTNode, AssignmentExpression, BinaryExpression, CallExpression, ConditionalExpression, EvalPointCall, FormatSegment, PrintfExpression, UnaryExpression, UpdateExpression } from './parser-evaluator/parser';
import { componentViewerLogger } from '../../logger';

export class ParsePerfStats {
    private enabled = true;
    private parseMs = 0;
    private parseCalls = 0;
    private optimizeMs = 0;
    private optimizeCalls = 0;
    private parseNodes = 0;
    private parseMaxNodes = 0;
    private optimizeNodesIn = 0;
    private optimizeNodesOut = 0;
    private optimizeMaxNodesIn = 0;
    private optimizeMaxNodesOut = 0;
    private foldFull = 0;
    private foldPartial = 0;
    private parseKindCounts = new Map<string, number>();
    private parseOpCounts = new Map<string, number>();
    private optimizeKindCounts = new Map<string, number>();
    private optimizeOpCounts = new Map<string, number>();
    private optimizeKindOutCounts = new Map<string, number>();
    private optimizeOpOutCounts = new Map<string, number>();
    private parseMaxDepth = 0;
    private optimizeMaxDepthIn = 0;
    private optimizeMaxDepthOut = 0;
    private calleeCounts = new Map<string, number>();
    private parseMaxDepthKind = '-';
    private parseMaxNodesKind = '-';
    private optimizeMaxDepthInKind = '-';
    private optimizeMaxDepthOutKind = '-';
    private optimizeMaxNodesInKind = '-';
    private optimizeMaxNodesOutKind = '-';

    public reset(): void {
        this.parseMs = 0;
        this.parseCalls = 0;
        this.optimizeMs = 0;
        this.optimizeCalls = 0;
        this.parseNodes = 0;
        this.parseMaxNodes = 0;
        this.optimizeNodesIn = 0;
        this.optimizeNodesOut = 0;
        this.optimizeMaxNodesIn = 0;
        this.optimizeMaxNodesOut = 0;
        this.foldFull = 0;
        this.foldPartial = 0;
        this.parseKindCounts.clear();
        this.parseOpCounts.clear();
        this.optimizeKindCounts.clear();
        this.optimizeOpCounts.clear();
        this.optimizeKindOutCounts.clear();
        this.optimizeOpOutCounts.clear();
        this.parseMaxDepth = 0;
        this.optimizeMaxDepthIn = 0;
        this.optimizeMaxDepthOut = 0;
        this.calleeCounts.clear();
        this.parseMaxDepthKind = '-';
        this.parseMaxNodesKind = '-';
        this.optimizeMaxDepthInKind = '-';
        this.optimizeMaxDepthOutKind = '-';
        this.optimizeMaxNodesInKind = '-';
        this.optimizeMaxNodesOutKind = '-';
    }

    public hasData(): boolean {
        return this.enabled && (this.parseCalls > 0 || this.optimizeCalls > 0);
    }

    public start(): number {
        return this.enabled ? performance.now() : 0;
    }

    public endParse(start: number): void {
        if (!this.enabled || start === 0) {
            return;
        }
        this.parseMs += performance.now() - start;
        this.parseCalls += 1;
    }

    public endOptimize(start: number): void {
        if (!this.enabled || start === 0) {
            return;
        }
        this.optimizeMs += performance.now() - start;
        this.optimizeCalls += 1;
    }

    public recordParse(ast: ASTNode): void {
        if (!this.enabled) {
            return;
        }
        const { nodes, maxDepth, maxDepthKind } = this.collectAstStats(ast, this.parseKindCounts, this.parseOpCounts, this.calleeCounts);
        this.parseNodes += nodes;
        if (nodes > this.parseMaxNodes) {
            this.parseMaxNodes = nodes;
            this.parseMaxNodesKind = ast.kind;
        }
        if (maxDepth > this.parseMaxDepth) {
            this.parseMaxDepth = maxDepth;
            this.parseMaxDepthKind = maxDepthKind;
        }
    }

    public recordOptimize(astIn: ASTNode, astOut: ASTNode, isPrintExpression: boolean): void {
        if (!this.enabled) {
            return;
        }
        const inStats = this.collectAstStats(astIn, this.optimizeKindCounts, this.optimizeOpCounts, this.calleeCounts);
        const outStats = this.collectAstStats(astOut, this.optimizeKindOutCounts, this.optimizeOpOutCounts);
        this.optimizeNodesIn += inStats.nodes;
        this.optimizeNodesOut += outStats.nodes;
        if (inStats.nodes > this.optimizeMaxNodesIn) {
            this.optimizeMaxNodesIn = inStats.nodes;
            this.optimizeMaxNodesInKind = astIn.kind;
        }
        if (outStats.nodes > this.optimizeMaxNodesOut) {
            this.optimizeMaxNodesOut = outStats.nodes;
            this.optimizeMaxNodesOutKind = astOut.kind;
        }
        if (inStats.maxDepth > this.optimizeMaxDepthIn) {
            this.optimizeMaxDepthIn = inStats.maxDepth;
            this.optimizeMaxDepthInKind = inStats.maxDepthKind;
        }
        if (outStats.maxDepth > this.optimizeMaxDepthOut) {
            this.optimizeMaxDepthOut = outStats.maxDepth;
            this.optimizeMaxDepthOutKind = outStats.maxDepthKind;
        }
        const constValue = astOut.constValue;
        const isNumericConst = typeof constValue === 'number' || typeof constValue === 'bigint';
        if (!isPrintExpression && isNumericConst) {
            this.foldFull += 1;
        } else if (outStats.nodes < inStats.nodes) {
            this.foldPartial += 1;
        }
    }

    public formatSummary(): string {
        if (!this.hasData()) {
            return '';
        }
        const ms = (value: number) => Math.max(0, Math.floor(value));
        const parseAvg = this.parseCalls > 0 ? (this.parseNodes / this.parseCalls) : 0;
        const optimizeAvgIn = this.optimizeCalls > 0 ? (this.optimizeNodesIn / this.optimizeCalls) : 0;
        const optimizeAvgOut = this.optimizeCalls > 0 ? (this.optimizeNodesOut / this.optimizeCalls) : 0;
        const fullRate = this.optimizeCalls > 0 ? (this.foldFull / this.optimizeCalls) * 100 : 0;
        const partialRate = this.optimizeCalls > 0 ? (this.foldPartial / this.optimizeCalls) * 100 : 0;
        const parseKinds = this.formatTop(this.parseKindCounts);
        const parseOps = this.formatTop(this.parseOpCounts);
        const optKindsIn = this.formatTop(this.optimizeKindCounts);
        const optOpsIn = this.formatTop(this.optimizeOpCounts);
        const optKindsOut = this.formatTop(this.optimizeKindOutCounts);
        const optOpsOut = this.formatTop(this.optimizeOpOutCounts);
        const callees = this.formatTop(this.calleeCounts);
        return `[parse-perf] parseMs=${ms(this.parseMs)} parseCalls=${this.parseCalls} parseNodes=${this.parseNodes} parseAvgNodes=${parseAvg.toFixed(1)} parseMaxNodes=${this.parseMaxNodes} parseMaxNodesKind=${this.parseMaxNodesKind} parseMaxDepth=${this.parseMaxDepth} parseMaxDepthKind=${this.parseMaxDepthKind} optimizeMs=${ms(this.optimizeMs)} optimizeCalls=${this.optimizeCalls} optimizeNodesIn=${this.optimizeNodesIn} optimizeAvgNodesIn=${optimizeAvgIn.toFixed(1)} optimizeMaxNodesIn=${this.optimizeMaxNodesIn} optimizeMaxNodesInKind=${this.optimizeMaxNodesInKind} optimizeMaxDepthIn=${this.optimizeMaxDepthIn} optimizeMaxDepthInKind=${this.optimizeMaxDepthInKind} optimizeNodesOut=${this.optimizeNodesOut} optimizeAvgNodesOut=${optimizeAvgOut.toFixed(1)} optimizeMaxNodesOut=${this.optimizeMaxNodesOut} optimizeMaxNodesOutKind=${this.optimizeMaxNodesOutKind} optimizeMaxDepthOut=${this.optimizeMaxDepthOut} optimizeMaxDepthOutKind=${this.optimizeMaxDepthOutKind} foldFull=${this.foldFull} foldFullRate=${fullRate.toFixed(1)}% foldPartial=${this.foldPartial} foldPartialRate=${partialRate.toFixed(1)}% parseKinds=${parseKinds} parseOps=${parseOps} optKindsIn=${optKindsIn} optOpsIn=${optOpsIn} optKindsOut=${optKindsOut} optOpsOut=${optOpsOut} callees=${callees}`;
    }

    public logSummary(): void {
        const summary = this.formatSummary();
        if (summary) {
            componentViewerLogger.trace(summary);
        }
    }

    private bump(map: Map<string, number>, key: string): void {
        map.set(key, (map.get(key) ?? 0) + 1);
    }

    private collectAstStats(
        node: ASTNode,
        kindCounts: Map<string, number>,
        opCounts?: Map<string, number>,
        calleeCounts?: Map<string, number>
    ): { nodes: number; maxDepth: number; maxDepthKind: string } {
        let nodes = 0;
        let maxDepth = 0;
        let maxDepthKind = node.kind;
        const visit = (n: ASTNode, depth: number): void => {
            nodes += 1;
            if (depth > maxDepth) {
                maxDepth = depth;
                maxDepthKind = n.kind;
            }
            this.bump(kindCounts, n.kind);
            switch (n.kind) {
                case 'MemberAccess':
                    visit(n.object, depth + 1);
                    return;
                case 'ArrayIndex':
                    visit(n.array, depth + 1);
                    visit(n.index, depth + 1);
                    return;
                case 'UnaryExpression':
                    visit((n as UnaryExpression).argument, depth + 1);
                    return;
                case 'UpdateExpression':
                    visit((n as UpdateExpression).argument, depth + 1);
                    return;
                case 'BinaryExpression': {
                    const be = n as BinaryExpression;
                    if (opCounts) {
                        this.bump(opCounts, be.operator);
                    }
                    visit(be.left, depth + 1);
                    visit(be.right, depth + 1);
                    return;
                }
                case 'ConditionalExpression': {
                    const ce = n as ConditionalExpression;
                    visit(ce.test, depth + 1);
                    visit(ce.consequent, depth + 1);
                    visit(ce.alternate, depth + 1);
                    return;
                }
                case 'CastExpression':
                    visit(n.argument, depth + 1);
                    return;
                case 'SizeofExpression':
                case 'AlignofExpression':
                    if (n.argument) {
                        visit(n.argument, depth + 1);
                    }
                    return;
                case 'AssignmentExpression': {
                    const ae = n as AssignmentExpression;
                    visit(ae.left, depth + 1);
                    visit(ae.right, depth + 1);
                    return;
                }
                case 'CallExpression':
                case 'EvalPointCall': {
                    const call = n as CallExpression | EvalPointCall;
                    if (calleeCounts) {
                        if (call.callee.kind === 'Identifier') {
                            this.bump(calleeCounts, call.callee.name);
                        } else {
                            this.bump(calleeCounts, call.callee.kind);
                        }
                    }
                    visit(call.callee, depth + 1);
                    for (const arg of call.args) {
                        visit(arg, depth + 1);
                    }
                    return;
                }
                case 'PrintfExpression': {
                    const pe = n as PrintfExpression;
                    for (const seg of pe.segments) {
                        visit(seg as ASTNode, depth + 1);
                    }
                    return;
                }
                case 'FormatSegment':
                    visit((n as FormatSegment).value, depth + 1);
                    return;
                case 'TextSegment':
                case 'NumberLiteral':
                case 'StringLiteral':
                case 'BooleanLiteral':
                case 'Identifier':
                case 'ColonPath':
                case 'ErrorNode':
                default:
                    return;
            }
        };
        visit(node, 1);
        return { nodes, maxDepth, maxDepthKind };
    }

    private formatTop(map: Map<string, number>, limit = 5): string {
        if (map.size === 0) {
            return '-';
        }
        const entries = [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([k, v]) => `${k}:${v}`);
        return entries.join(',');
    }
}
