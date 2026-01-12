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

import { ValidatingCache } from './validating-cache';

function normalize(name: string): string {
    return name.trim().toUpperCase();
}

function toUint32(value: number): number {
    return value >>> 0;
}

export class RegisterHost {
    private cache = new ValidatingCache<number>(normalize);

    public read(name: string): number | undefined {
        if (!name) {
            console.error('RegisterHost: read: empty register name');
            return undefined;
        }
        return this.cache.get(name);
    }

    public write(name: string, value: number): number | undefined {
        if (!name) {
            console.error('RegisterHost: write: empty register name');
            return undefined;
        }
        this.cache.set(name, toUint32(value));
        return value;
    }

    public invalidate(name: string): void {
        this.cache.invalidate(name);
    }

    public clear(): void {
        this.cache.clear();
    }

}
