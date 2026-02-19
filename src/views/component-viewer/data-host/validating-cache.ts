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

export interface ValidatingEntry<T> { value: T; valid: boolean; isConst?: boolean; }

export class ValidatingCache<T> {
    private map = new Map<string, ValidatingEntry<T>>();

    public constructor(private normalize: (key: string) => string = (k) => k) {}

    public get(key: string): T | undefined {
        if (!key) {
            return undefined;
        }
        const norm = this.normalize(key);
        const entry = this.map.get(norm);
        return entry && entry.valid ? entry.value : undefined;
    }

    public set(key: string, value: T, valid = true, isConst?: boolean): void {
        if (!key) {
            return;
        }
        const norm = this.normalize(key);
        const existing = this.map.get(norm);
        const constFlag = isConst ?? existing?.isConst ?? false;
        this.map.set(norm, { value, valid, isConst: constFlag });
    }

    public ensure(key: string, factory: () => T, valid = true): T {
        const norm = this.normalize(key);
        const existing = this.map.get(norm);
        if (existing) {
            return existing.value;
        }
        const value = factory();
        this.map.set(norm, { value, valid });
        return value;
    }

    public invalidate(key: string): void {
        if (!key) {
            return;
        }
        const norm = this.normalize(key);
        const entry = this.map.get(norm);
        if (entry) {
            entry.valid = false;
            this.map.set(norm, entry);
        }
    }

    public clear(): void {
        this.map.clear();
    }

    public keys(): IterableIterator<string> {
        return this.map.keys();
    }

    public entries(): IterableIterator<[string, ValidatingEntry<T>]> {
        return this.map.entries();
    }

    public delete(key: string): boolean {
        if (!key) {
            return false;
        }
        const norm = this.normalize(key);
        return this.map.delete(norm);
    }
}
