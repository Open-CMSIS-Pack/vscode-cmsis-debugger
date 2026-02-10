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

// generated with AI

/**
 * Test helpers for statement-engine.
 */

import { EvalContext, Evaluator } from '../../../parser-evaluator/evaluator';
import { ScvdExpressionParser } from '../../../scvd-eval-context';
import { DEFAULT_INTEGER_MODEL } from '../../../parser-evaluator/c-numeric';
import type { ExecutionContext } from '../../../scvd-eval-context';
import { MemoryHost } from '../../../data-host/memory-host';
import { RegisterHost } from '../../../data-host/register-host';
import type { ScvdDebugTarget } from '../../../scvd-debug-target';
import { ScvdNode } from '../../../model/scvd-node';

export class TestNode extends ScvdNode {
    private _conditionResult: boolean;
    private _guiName: string | undefined;
    private _guiValue: string | undefined;

    constructor(
        parent: ScvdNode | undefined,
        opts?: {
            conditionResult?: boolean;
            guiName?: string;
            guiValue?: string;
        }
    ) {
        super(parent);
        this._conditionResult = opts?.conditionResult ?? true;
        this._guiName = opts?.guiName;
        this._guiValue = opts?.guiValue;
    }

    public override async getConditionResult(): Promise<boolean> {
        return this._conditionResult;
    }

    public override async getGuiName(): Promise<string | undefined> {
        return this._guiName;
    }

    public override async getGuiValue(): Promise<string | undefined> {
        return this._guiValue;
    }

    public set conditionResult(value: boolean) {
        this._conditionResult = value;
    }

    public set guiName(value: string | undefined) {
        this._guiName = value;
    }

    public set guiValue(value: string | undefined) {
        this._guiValue = value;
    }
}

export function createExecutionContext(
    base: ScvdNode,
    debugTargetOverrides?: Partial<ScvdDebugTarget>
): ExecutionContext {
    const memoryHost = new MemoryHost();
    const registerHost = new RegisterHost();
    const evalContext = new EvalContext({
        data: {} as never,
        container: base,
    });
    const evaluator = new Evaluator();
    const debugTargetDefaults: Partial<ScvdDebugTarget> = {
        findSymbolAddress: async () => undefined,
        getNumArrayElements: async () => undefined,
        readMemory: async () => undefined,
        readMemoryBatch: async () => new Map(),
        beginUpdateCycle: async () => {},
    };
    const debugTarget = { ...debugTargetDefaults, ...debugTargetOverrides } as ScvdDebugTarget;

    const parser = new ScvdExpressionParser(DEFAULT_INTEGER_MODEL);

    return {
        memoryHost,
        registerHost,
        evalContext,
        debugTarget,
        evaluator,
        parser,
    };
}

export function applyExecutionContext(root: ScvdNode, ctx: ExecutionContext): void {
    root.setExecutionContext(ctx);
    root.children.forEach((child) => applyExecutionContext(child as ScvdNode, ctx));
}
