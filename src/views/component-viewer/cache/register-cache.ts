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


export type ReadRegFn = (name: string) => number | undefined;

export function registerNorm(name: string): string {
    return name.trim().toUpperCase();
}

export function registerAlias(name: string): string {
    const n = registerNorm(name);
    if (n === 'R13') return 'SP';
    if (n === 'R14') return 'LR';
    if (n === 'R15') return 'PC';
    if (n === 'CPSR') return 'XPSR';
    return n;
}

/** Decide SP alias (MSP vs PSP) using CONTROL.SPSEL if available. */
export function registerResolveSP(store: Map<string, number>, readThrough: ReadRegFn): string {
    const ctl = store.get('CONTROL') ?? readThrough('CONTROL');
    if (ctl !== undefined) {
        const SPSEL = (ctl >>> 1) & 1;
        return SPSEL ? 'PSP' : 'MSP';
    }
    return 'MSP';
}


export class Cm81MRegisterCache {
    private store = new Map<string, number>();
    constructor(
        private readonly readReg: ReadRegFn
    ) {
    }

    read(name: string): number | undefined {
        let key = registerAlias(name);
        if (key === 'SP') key = registerResolveSP(this.store, this.readReg);

        let v = this.store.get(key);
        if (v === undefined) {
            v = this.readReg(key);
            if (v !== undefined) this.store.set(key, v >>> 0);
        }
        return v;
    }

    set(name: string, value: number): void {
        this.store.set(registerAlias(name), value >>> 0);
    }

    preload(map: Record<string, number>): void {
        for (const [k, v] of Object.entries(map)) this.set(k, v);
    }
}
