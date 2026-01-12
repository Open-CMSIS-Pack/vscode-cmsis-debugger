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


function normalize(name: string): string {
    return name.trim().toUpperCase();
}

function toUint32(value: number): number {
    return value >>> 0;
}

interface RegisterCacheEntry {
    value: number;
    isValid: boolean;
}

export class RegisterHost {
    private _cache = new Map<string, RegisterCacheEntry>();

    constructor() {
    }

    private get cache(): Map<string, RegisterCacheEntry> {
        return this._cache;
    }

    private setCache(name: string, value: number, isValid: boolean = true): void {
        const key = normalize(name);
        const entry = this.cache.get(key);
        if (entry) {
            entry.value = toUint32(value);
            entry.isValid = isValid;
            this.cache.set(key, entry);
        }
    }

    private getCache(name: string): RegisterCacheEntry | undefined {
        const key = normalize(name);
        return this.cache.get(key);
    }


    // -------- Public API --------
    public read(name: string): number | undefined {
        if (!name) {
            console.error('RegisterHost: read: empty register name');
            return undefined;
        }
        const key = normalize(name);
        const cached = this.cache.get(key);
        if (!cached) return undefined;
        return cached.isValid ? cached.value : undefined;
    }

    public write(name: string, value: number): number | undefined {
        if (!name) {
            console.error('RegisterHost: write: empty register name');
            return undefined;
        }
        this.setCache(name, value, true);

        return value;
    }

    public invalidate(name: string): void {
        const entry = this.getCache(name);
        if (entry) {
            entry.isValid = false;
            this.setCache(name, entry.value, false);
        }
    }

    public clear(): void {
        this.cache.clear();
    }

}
