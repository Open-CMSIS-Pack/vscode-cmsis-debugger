/**
 * Copyright 2026 Arm Limited
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
// generated with AI

import { componentViewerLogger } from '../../../logger';
import { encodeToLeBytes } from './byte-encoding';
import { ValidatingCache } from './validating-cache';

export class MemoryContainer {
    constructor(
        readonly symbolName: string
    ){ }
    private store: Uint8Array = new Uint8Array(0);

    public get byteLength(): number {
        return this.store.length;
    }

    public readExact(off: number, size: number): Uint8Array | undefined {
        if (size <= 0 || off < 0) {
            return undefined;
        }
        const end = off + size;
        if (end > this.store.length) {
            return undefined;
        }
        return this.store.subarray(off, end);
    }

    public readPartial(off: number, size: number): Uint8Array | undefined {
        if (size <= 0 || off < 0) {
            return undefined;
        }
        if (off >= this.store.length) {
            return undefined;
        }
        const end = Math.min(this.store.length, off + size);
        return this.store.subarray(off, end);
    }

    // allow writing with optional zero padding to `virtualSize`
    public write(off: number, data: Uint8Array, virtualSize?: number): void {
        const total = virtualSize !== undefined ? Math.max(virtualSize, data.length) : data.length;
        if (total <= 0 || off < 0) {
            return;
        }
        const needed = off + total;
        if (this.store.length < needed) {
            const next = new Uint8Array(needed);
            next.set(this.store, 0);
            this.store = next;
        }

        // write the payload
        this.store.set(data, off);

        // zero-fill up to total
        const extra = total - data.length;
        if (extra > 0) {
            this.store.fill(0, off + data.length, off + total);
        }
    }

    public clear(): void {
        this.store = new Uint8Array(0);
    }
}

type ElementMeta = {
  offsets: number[];              // append offsets within the symbol
  sizes: number[];                // logical size (actualSize) per append
  bases: Array<number | undefined>; // target base address per append
  elementSize?: number;           // known uniform stride when consistent
};

// Pure byte store for SCVD variables.  No type interpretation — that lives in the evaluator.
export class MemoryHost {
    private cache = new ValidatingCache<MemoryContainer>();
    private elementMeta = new Map<string, ElementMeta>();

    private getOrInitMeta(name: string): ElementMeta {
        const existing = this.elementMeta.get(name);
        if (!existing) {
            // with exactOptionalPropertyTypes: do NOT assign elementSize: undefined
            const created: ElementMeta = { offsets: [], sizes: [], bases: [] };
            this.elementMeta.set(name, created);
            return created;
        }
        return existing;
    }

    // normalize number → safe JS number for addresses
    private toAddrNumber(x: number): number | undefined {
        if (!Number.isFinite(x) || x < 0 || !Number.isSafeInteger(x)) {
            componentViewerLogger.error(`invalid target base address (number): ${x}`);
            return undefined;
        }
        return x;
    }

    constructor() {
    }

    private getContainer(varName: string): MemoryContainer {
        return this.cache.ensure(varName, () => new MemoryContainer(varName), false);
    }

    /**
     * Read raw bytes from a named variable at the given byte offset.
     *
     * For sizes ≤ 8 an exact match is required (returns undefined when the
     * store is shorter than offset + size).  For sizes > 8 a partial read is
     * allowed so that callers reading large buffers don't fail on undersized stores.
     *
     * Always returns a **copy** so callers never alias internal storage.
     */
    public read(name: string, offset: number, size: number): Uint8Array | undefined {
        if (!name || size <= 0) {
            return undefined;
        }
        const container = this.cache.get(name);
        if (!container) {
            return undefined;
        }
        const raw = size > 8
            ? container.readPartial(offset, size)
            : container.readExact(offset, size);
        if (!raw) {
            componentViewerLogger.trace(`[MemoryHost.read] MISS: var="${name}" offset=${offset} size=${size}`);
            return undefined;
        }
        componentViewerLogger.trace(`[MemoryHost.read] var="${name}" offset=${offset} size=${size} data=[${Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
        // For partial reads that returned fewer bytes than requested, zero-pad to the requested size
        if (raw.length < size) {
            const out = new Uint8Array(size);
            out.set(raw, 0);
            return out;
        }
        return raw.slice();
    }

    /**
     * Write raw bytes into a named variable's buffer at the given offset.
     * The buffer is zero-filled to `totalSize` bytes when provided.
     */
    public write(name: string, offset: number, data: Uint8Array, totalSize?: number): void {
        const container = this.getContainer(name);
        container.write(offset, data, totalSize);
        this.cache.set(name, container, true);
    }

    /**
     * Return the total byte length of a named variable's backing buffer,
     * or 0 if the variable does not exist.
     */
    public getByteLength(name: string): number {
        const container = this.cache.get(name);
        return container?.byteLength ?? 0;
    }

    public setVariable(
        name: string,
        size: number,
        value: number | bigint | Uint8Array,
        offset: number,                     // NEW: controls where to place the data
        targetBase?: number,       // target base address where it was read from
        virtualSize?: number,                // total logical bytes for this element (>= size)
        isConst?: boolean,
    ): void {
        componentViewerLogger.trace(`[MemoryHost.setVariable] var="${name}" offset=${offset} size=${size} virtualSize=${virtualSize ?? size} targetBase=0x${targetBase?.toString(16)} value=${typeof value === 'object' ? `[${value.length}B]` : value}`);
        if (!Number.isSafeInteger(offset)) {
            componentViewerLogger.error(`setVariable: offset must be a safe integer, got ${offset}`);
            return;
        }

        const container = this.getContainer(name);

        // Decide where to write:
        //  - offset === -1 → append at the end
        //  - otherwise     → write at the given offset
        const appendOff = offset === -1 ? (container.byteLength ?? 0) : offset;
        if (appendOff < 0) {
            componentViewerLogger.error(`setVariable: offset must be >= 0 or -1, got ${offset}`);
            return;
        }

        // normalize payload to exactly `size` bytes (numbers LE-encoded)
        const buf = encodeToLeBytes(value, size);
        if (buf.length !== size) {
            componentViewerLogger.error('setVariable: unsupported value type');
            return;
        }

        if (virtualSize !== undefined && virtualSize < size) {
            componentViewerLogger.error(`setVariable: virtualSize (${virtualSize}) must be >= size (${size})`);
            return;
        }
        const total = virtualSize ?? size;

        // write and zero-pad to `total`, extends as needed
        container.write(appendOff, buf, total);

        // record per-append metadata
        const meta = this.getOrInitMeta(name);
        meta.offsets.push(appendOff);
        meta.sizes.push(total);
        const normBase = targetBase !== undefined ? this.toAddrNumber(targetBase) : undefined;
        meta.bases.push(normBase);
        componentViewerLogger.trace(`[MemoryHost.setVariable] → wrote at offset=${appendOff}, element count now=${meta.offsets.length}, targetBase=0x${normBase?.toString(16)}`);

        // maintain uniform stride when consistent
        if (meta.elementSize === undefined && meta.sizes.length === 1) {
            meta.elementSize = total;                // first append sets stride
        } else if (meta.elementSize !== undefined && meta.elementSize !== total) {
            delete meta.elementSize;                 // mixed sizes → remove the optional prop
        }

        this.cache.set(name, container, true, isConst);
    }

    public clearVariable(name: string): boolean {
        this.elementMeta.delete(name);
        const container = this.cache.get(name);
        if (container?.clear) {
            container.clear();
        }
        return this.cache.delete(name);
    }

    public clearNonConst(): void {
        // Iterate a snapshot since we delete entries during the pass.
        for (const [name, entry] of Array.from(this.cache.entries())) {
            if (entry.isConst === true) {
                continue;
            }
            this.elementMeta.delete(name);
            if (entry.value?.clear) {
                entry.value.clear();
            }
            this.cache.delete(name);
        }
    }

    // Number of array elements recorded for `name`. Defaults to 1 when unknown.
    public getArrayElementCount(name: string): number {
        const m = this.elementMeta.get(name);
        const n = m?.offsets.length ?? 0;
        const count = n > 0 ? n : 1;
        componentViewerLogger.trace(`[MemoryHost.getArrayElementCount] var="${name}" → count=${count}`);
        return count;
    }

    // Target base address for element `index` of `name` (number | undefined).
    public getElementTargetBase(name: string, index: number): number | undefined {
        const m = this.elementMeta.get(name);
        if (!m) {
            componentViewerLogger.error(`getElementTargetBase: unknown symbol "${name}"`);
            return undefined;
        }
        let targetBase: number | undefined;
        if (m.bases.length === 1) {
            targetBase = m.bases[0];
        } else if (index >= 0 && index < m.bases.length) {
            targetBase = m.bases.at(index);
        } else {
            componentViewerLogger.error(`getElementTargetBase: index ${index} out of range for "${name}"`);
            return undefined;
        }
        componentViewerLogger.trace(`[MemoryHost.getElementTargetBase] var="${name}" index=${index} → targetBase=0x${targetBase?.toString(16)}`);
        return targetBase;
    }

}
