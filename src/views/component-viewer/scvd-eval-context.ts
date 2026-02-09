/**
 * Copyright 2025-2026 Arm Limited
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

import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';
import { MemoryHost } from './data-host/memory-host';
import { RegisterHost } from './data-host/register-host';
import { EvalContext, Evaluator } from './parser-evaluator/evaluator';
import { Parser, type ParseResult } from './parser-evaluator/parser';
import { ExpressionOptimizer } from './parser-evaluator/expression-optimizer';
import { IntegerModelKind, type IntegerModel, integerModelFromKind } from './parser-evaluator/c-numeric';
import { ScvdNode } from './model/scvd-node';
import { ScvdComponentViewer } from './model/scvd-component-viewer';
import { ScvdFormatSpecifier } from './model/scvd-format-specifier';
import { ScvdDebugTarget } from './scvd-debug-target';
import { ScvdEvalInterface } from './scvd-eval-interface';
import { parsePerf } from './stats-config';

export interface ExecutionContext {
    memoryHost: MemoryHost;
    registerHost: RegisterHost;
    evalContext: EvalContext;
    debugTarget: ScvdDebugTarget;
    evaluator: Evaluator;
    parseExpression: (expression: string, isPrintExpression: boolean) => ParseResult;
}

export class ScvdEvalContext {
    private _ctx: EvalContext;
    private _evalHost: ScvdEvalInterface;
    private _evaluator: Evaluator;
    private _parser: Parser;
    private _optimizer: ExpressionOptimizer;
    private _integerModel: IntegerModel;
    private _memoryHost: MemoryHost;
    private _registerHost: RegisterHost;
    private _debugTarget: ScvdDebugTarget;
    private _formatSpecifier: ScvdFormatSpecifier;
    private _model: ScvdComponentViewer;
    private _integerModelKind: IntegerModelKind;

    constructor(
        model: ScvdComponentViewer
    ) {
        this._model = model;
        this._integerModelKind = IntegerModelKind.Model32;
        this._integerModel = integerModelFromKind(this._integerModelKind);
        this._memoryHost = new MemoryHost();
        this._registerHost = new RegisterHost();
        this._debugTarget = new ScvdDebugTarget();
        this._formatSpecifier = new ScvdFormatSpecifier();
        this._evalHost = new ScvdEvalInterface(this._memoryHost, this._registerHost, this._debugTarget, this._formatSpecifier);
        this._parser = new Parser(this._integerModel);
        this._optimizer = new ExpressionOptimizer(this._integerModel);
        this._evaluator = new Evaluator(this._integerModel);
        const outItem = this.getOutItem();
        if (outItem === undefined) {
            throw new Error('SCVD EvalContext: No output item defined');
        }

        this._ctx = new EvalContext({
            data: this._evalHost,               // host for model lookup + data access + intrinsics
            container: outItem,                 // ScvdNode root for symbol resolution
        });
    }

    private get model(): ScvdComponentViewer {
        return this._model !== undefined ? this._model : (() => {
            throw new Error('SCVD EvalContext: Model not initialized');
        })();
    }

    private get memoryHost(): MemoryHost {
        return this._memoryHost !== undefined ? this._memoryHost : (() => {
            throw new Error('SCVD EvalContext: MemoryHost not initialized');
        })();
    }

    private get registerHost(): RegisterHost {
        return this._registerHost !== undefined ? this._registerHost : (() => {
            throw new Error('SCVD EvalContext: RegisterHost not initialized');
        })();
    }

    private get ctx(): EvalContext {
        return this._ctx !== undefined ? this._ctx : (() => {
            throw new Error('SCVD EvalContext: EvalContext not initialized');
        })();
    }

    public updateActiveSession(debugSession: GDBTargetDebugSession): void {
        this._debugTarget.setActiveSession(debugSession);
    }

    public setIntegerModelKind(kind: IntegerModelKind | undefined): void {
        if (!kind) {
            return;
        }
        this._integerModelKind = kind;
        this._integerModel = integerModelFromKind(kind);
        this.applyIntegerModel();
    }

    public getExecutionContext(): ExecutionContext {
        return {
            memoryHost: this.memoryHost,
            registerHost: this.registerHost,
            evalContext: this.ctx,
            evaluator: this._evaluator,
            debugTarget: this._debugTarget !== undefined ? this._debugTarget : (() => {
                throw new Error('SCVD EvalContext: DebugTarget not initialized');
            })(),
            parseExpression: (expression: string, isPrintExpression: boolean) => this.parseExpression(expression, isPrintExpression),
        };
    }

    public getOutItem(): ScvdNode | undefined {
        const objects = this.model.objects;
        if (objects === undefined) {
            return undefined;
        }
        if (objects.objects.length > 0) {
            const object = objects.objects[0];
            return object;
        }
        return undefined;
    }

    public init(debugSession: GDBTargetDebugSession, debugTracker: GDBTargetDebugTracker): void {
        this.configureIntegerModel(debugSession);
        this._debugTarget.init(debugSession, debugTracker);
    }

    private configureIntegerModel(debugSession: GDBTargetDebugSession): void {
        void debugSession;
        this.applyIntegerModel();
    }

    private applyIntegerModel(): void {
        this._parser.setIntegerModel(this._integerModel);
        this._optimizer.setIntegerModel(this._integerModel);
        this._evaluator.setIntegerModel(this._integerModel);
    }

    private parseExpression(expression: string, isPrintExpression: boolean): ParseResult {
        const parseStart = parsePerf?.start() ?? 0;
        const parsed = this._parser.parseWithDiagnostics(expression, isPrintExpression);
        parsePerf?.endParse(parseStart);
        parsePerf?.recordParse(parsed.ast);
        const optimizeStart = parsePerf?.start() ?? 0;
        const optimized = this._optimizer.optimizeParseResult(parsed);
        parsePerf?.endOptimize(optimizeStart);
        parsePerf?.recordOptimize(parsed.ast, optimized.ast, isPrintExpression);
        return optimized;
    }
}
