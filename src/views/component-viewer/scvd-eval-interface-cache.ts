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

import { ScvdNode } from './model/scvd-node';

export class ScvdEvalInterfaceCache {
    private printfCache = new Map<string, string>();
    private symbolRefCache: Map<ScvdNode, Map<string, ScvdNode | undefined>> = new Map();
    private memberRefCache: Map<ScvdNode, Map<string, ScvdNode | undefined>> = new Map();
    private byteWidthCache: Map<ScvdNode, number> = new Map();
    private memberOffsetCache: Map<ScvdNode, number> = new Map();

    public clearAll(): void {
        this.printfCache.clear();
        this.symbolRefCache.clear();
        this.memberRefCache.clear();
        this.byteWidthCache.clear();
        this.memberOffsetCache.clear();
    }

    public clearPrintf(): void {
        this.printfCache.clear();
    }

    public getPrintf(key: string): string | undefined {
        return this.printfCache.get(key);
    }

    public setPrintf(key: string, value: string): void {
        this.printfCache.set(key, value);
    }

    private getSymbolCache(base: ScvdNode): Map<string, ScvdNode | undefined> {
        let cache = this.symbolRefCache.get(base);
        if (!cache) {
            cache = new Map();
            this.symbolRefCache.set(base, cache);
        }
        return cache;
    }

    public hasSymbolRef(base: ScvdNode, name: string): boolean {
        return this.getSymbolCache(base).has(name);
    }

    public getSymbolRef(base: ScvdNode, name: string): ScvdNode | undefined {
        return this.getSymbolCache(base).get(name);
    }

    public setSymbolRef(base: ScvdNode, name: string, value: ScvdNode | undefined): void {
        this.getSymbolCache(base).set(name, value);
    }

    private getMemberCache(base: ScvdNode): Map<string, ScvdNode | undefined> {
        let cache = this.memberRefCache.get(base);
        if (!cache) {
            cache = new Map();
            this.memberRefCache.set(base, cache);
        }
        return cache;
    }

    public hasMemberRef(base: ScvdNode, name: string): boolean {
        return this.getMemberCache(base).has(name);
    }

    public getMemberRef(base: ScvdNode, name: string): ScvdNode | undefined {
        return this.getMemberCache(base).get(name);
    }

    public setMemberRef(base: ScvdNode, name: string, value: ScvdNode | undefined): void {
        this.getMemberCache(base).set(name, value);
    }

    public getByteWidth(ref: ScvdNode): number | undefined {
        return this.byteWidthCache.get(ref);
    }

    public hasByteWidth(ref: ScvdNode): boolean {
        return this.byteWidthCache.has(ref);
    }

    public setByteWidth(ref: ScvdNode, width: number): void {
        this.byteWidthCache.set(ref, width);
    }

    public getMemberOffset(ref: ScvdNode): number | undefined {
        return this.memberOffsetCache.get(ref);
    }

    public hasMemberOffset(ref: ScvdNode): boolean {
        return this.memberOffsetCache.has(ref);
    }

    public setMemberOffset(ref: ScvdNode, offset: number): void {
        this.memberOffsetCache.set(ref, offset);
    }
}
