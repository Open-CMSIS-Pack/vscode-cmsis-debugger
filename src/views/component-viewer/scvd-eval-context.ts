/**
 * Copyright 2025 Arm Limited
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

import { GDBTargetDebugSession } from '../../debug-session';
import { MemoryHost } from './memory-host/memory-host';
import { RegisterHost } from './memory-host/register-host';
import { EvalContext } from './evaluator';
import { ScvdBase } from './model/scvd-base';
import { ScvdComponentViewer } from './model/scvd-component-viewer';
import { ScvdFormatSpecifier } from './model/scvd-format-specifier';
import { ScvdDebugTarget } from './scvd-debug-target';
import { ScvdEvalInterface } from './scvd-eval-interface';

export interface ExecutionContext {
    memoryHost: MemoryHost;
    registerHost: RegisterHost;
    evalContext: EvalContext;
    debugTarget: ScvdDebugTarget;
}


export class ScvdEvalContext {
    private _ctx: EvalContext;
    private _evalHost: ScvdEvalInterface;
    private _memoryHost: MemoryHost;
    private _registerHost: RegisterHost;
    private _debugTarget: ScvdDebugTarget;
    private _formatSpecifier: ScvdFormatSpecifier;
    private _model: ScvdComponentViewer;

    constructor(
        model: ScvdComponentViewer
    ) {
        this._model = model;
        this._memoryHost = new MemoryHost();
        this._registerHost = new RegisterHost();
        this._debugTarget = new ScvdDebugTarget();
        this._formatSpecifier = new ScvdFormatSpecifier();
        this._evalHost = new ScvdEvalInterface(this._memoryHost, this._registerHost, this._debugTarget, this._formatSpecifier);
        const outItem = this.getOutItem();
        if(outItem === undefined) {
            throw new Error('SCVD EvalContext: No output item defined');
        }

        this._ctx = new EvalContext({
            data: this._evalHost,               // DataHost
            container: outItem,                 // ScvdBase root for symbol resolution
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

    public getExecutionContext(): ExecutionContext {
        return {
            memoryHost: this.memoryHost,
            registerHost: this.registerHost,
            evalContext: this.ctx,
            debugTarget: this._debugTarget !== undefined ? this._debugTarget : (() => {
                throw new Error('SCVD EvalContext: DebugTarget not initialized');
            })(),
        };
    }

    public getOutItem(): ScvdBase | undefined {
        const objects = this.model.objects;
        if(objects === undefined) {
            return undefined;
        }
        if(objects.objects.length > 0) {
            const object = objects.objects[0];
            return object;
        }
        return undefined;
    }

    public init(debugSession: GDBTargetDebugSession): void {
        this._debugTarget.init(debugSession);
    }
}
