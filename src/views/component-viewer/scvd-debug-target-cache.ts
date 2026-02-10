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

class StringNumberCache {
    private cache = new Map<string, number>();

    public get(key: string): number | undefined {
        return this.cache.get(key);
    }

    public set(key: string, value: number): void {
        this.cache.set(key, value);
    }

    public clear(): void {
        this.cache.clear();
    }
}

export class SymbolCaches {
    private addressCache = new StringNumberCache();
    private sizeCache = new StringNumberCache();
    private arrayCountCache = new StringNumberCache();

    public clearAll(): void {
        this.addressCache.clear();
        this.sizeCache.clear();
        this.arrayCountCache.clear();
    }

    public async getAddress(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        return this.getCached(this.addressCache, symbol, compute);
    }

    public async getAddressWithName(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<{ name: string; value: number } | undefined> {
        const symbolName = this.normalizeKey(symbol);
        const value = await this.getCachedByName(this.addressCache, symbolName, compute);
        return value !== undefined ? { name: symbolName, value } : undefined;
    }

    public async getSize(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        return this.getCached(this.sizeCache, symbol, compute);
    }

    public async getArrayCount(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        return this.getCached(this.arrayCountCache, symbol, compute);
    }

    private async getCached(
        cache: StringNumberCache,
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        const symbolName = this.normalizeKey(symbol);
        return this.getCachedByName(cache, symbolName, compute);
    }

    private async getCachedByName(
        cache: StringNumberCache,
        symbolName: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        const cached = cache.get(symbolName);
        if (cached !== undefined) {
            return cached;
        }
        const value = await compute(symbolName);
        if (value !== undefined) {
            cache.set(symbolName, value);
        }
        return value;
    }

    private normalizeKey(symbol: string): string {
        return symbol.trim();
    }
}
