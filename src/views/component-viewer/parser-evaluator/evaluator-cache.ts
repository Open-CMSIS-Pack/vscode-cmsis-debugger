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

import type { ASTNode } from './parser';
import type { ScvdNode } from '../model/scvd-node';
import type { EvalValue, ScalarType } from './model-host';

export class EvaluatorCache {
    private identifierRefCache: Map<ScvdNode, Map<string, ScvdNode | undefined>> = new Map();
    private byteWidthCache: Map<ScvdNode, number> = new Map();
    private valueTypeCache: Map<ScvdNode, ScalarType | undefined> = new Map();
    private pureEvalMemo: WeakMap<ASTNode, EvalValue | null> = new WeakMap();

    public resetAll(): void {
        this.identifierRefCache.clear();
        this.byteWidthCache.clear();
        this.valueTypeCache.clear();
        this.pureEvalMemo = new WeakMap();
    }

    private getIdentifierCache(base: ScvdNode): Map<string, ScvdNode | undefined> {
        let cache = this.identifierRefCache.get(base);
        if (!cache) {
            cache = new Map();
            this.identifierRefCache.set(base, cache);
        }
        return cache;
    }

    public hasIdentifier(base: ScvdNode, key: string): boolean {
        return this.getIdentifierCache(base).has(key);
    }

    public getIdentifier(base: ScvdNode, key: string): ScvdNode | undefined {
        return this.getIdentifierCache(base).get(key);
    }

    public setIdentifier(base: ScvdNode, key: string, value: ScvdNode | undefined): void {
        this.getIdentifierCache(base).set(key, value);
    }

    public getByteWidth(ref: ScvdNode): number | undefined {
        return this.byteWidthCache.get(ref);
    }

    public setByteWidth(ref: ScvdNode, width: number): void {
        this.byteWidthCache.set(ref, width);
    }

    public getValueType(ref: ScvdNode): ScalarType | undefined {
        return this.valueTypeCache.get(ref);
    }

    public hasValueType(ref: ScvdNode): boolean {
        return this.valueTypeCache.has(ref);
    }

    public setValueType(ref: ScvdNode, value: ScalarType | undefined): void {
        this.valueTypeCache.set(ref, value);
    }

    public hasMemo(node: ASTNode): boolean {
        return this.pureEvalMemo.has(node);
    }

    public getMemo(node: ASTNode): EvalValue | null | undefined {
        return this.pureEvalMemo.get(node);
    }

    public setMemo(node: ASTNode, value: EvalValue | null): void {
        this.pureEvalMemo.set(node, value);
    }

    public resetMemo(): void {
        this.pureEvalMemo = new WeakMap();
    }
}
