/**
 * Copyright 2025-2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI, refactored

type StringNumberCache = Map<string, number>;
type StringValueCache = Map<string, string>;

export class SymbolCaches {
    private addressCache: StringNumberCache = new Map();
    private sizeCache: StringNumberCache = new Map();
    private arrayCountCache: StringNumberCache = new Map();
    private symbolNameByAddressCache: StringValueCache = new Map();
    private symbolContextByAddressCache: StringValueCache = new Map();

    public clearAll(): void {
        this.addressCache.clear();
        this.sizeCache.clear();
        this.arrayCountCache.clear();
        this.symbolNameByAddressCache.clear();
        this.symbolContextByAddressCache.clear();
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

    public getSymbolNameByAddress(address: string): string | undefined {
        return this.symbolNameByAddressCache.get(this.normalizeAddressKey(address));
    }

    public setSymbolNameByAddress(address: string, symbolName: string): void {
        this.symbolNameByAddressCache.set(this.normalizeAddressKey(address), symbolName);
    }

    public getSymbolContextByAddress(address: string): string | undefined {
        return this.symbolContextByAddressCache.get(this.normalizeAddressKey(address));
    }

    public setSymbolContextByAddress(address: string, symbolContext: string): void {
        this.symbolContextByAddressCache.set(this.normalizeAddressKey(address), symbolContext);
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

    private normalizeAddressKey(address: string): string {
        return address.trim().toLowerCase();
    }
}
