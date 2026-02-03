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
        const symbolName = this.normalizeKey(symbol);
        const cached = this.addressCache.get(symbolName);
        if (cached !== undefined) {
            return cached;
        }
        const value = await compute(symbolName);
        if (value !== undefined) {
            this.addressCache.set(symbolName, value);
        }
        return value;
    }

    public async getAddressWithName(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<{ name: string; value: number } | undefined> {
        const symbolName = this.normalizeKey(symbol);
        const cached = this.addressCache.get(symbolName);
        if (cached !== undefined) {
            return { name: symbolName, value: cached };
        }
        const value = await compute(symbolName);
        if (value !== undefined) {
            this.addressCache.set(symbolName, value);
            return { name: symbolName, value };
        }
        return undefined;
    }

    public async getSize(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        const symbolName = this.normalizeKey(symbol);
        const cached = this.sizeCache.get(symbolName);
        if (cached !== undefined) {
            return cached;
        }
        const value = await compute(symbolName);
        if (value !== undefined) {
            this.sizeCache.set(symbolName, value);
        }
        return value;
    }

    public async getArrayCount(
        symbol: string,
        compute: (symbolName: string) => Promise<number | undefined>
    ): Promise<number | undefined> {
        const symbolName = this.normalizeKey(symbol);
        const cached = this.arrayCountCache.get(symbolName);
        if (cached !== undefined) {
            return cached;
        }
        const value = await compute(symbolName);
        if (value !== undefined) {
            this.arrayCountCache.set(symbolName, value);
        }
        return value;
    }

    private normalizeKey(symbol: string): string {
        return symbol.trim();
    }
}
