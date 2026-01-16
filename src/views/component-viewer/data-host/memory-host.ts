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

import { EvalValue, RefContainer } from '../model-host';
import { ValidatingCache } from './validating-cache';

export class MemoryContainer {
    constructor(
        readonly symbolName: string
    ){ }
    private buf: Uint8Array | null = null;
    private winStart = 0;
    private winSize = 0;

    private store: Uint8Array = new Uint8Array(0);

    private ensure(off: number, size: number) {
        // Grow the local store if needed so [off, off+size) fits.
        const needed = off + size;
        if (this.store.length < needed) {
            const next = new Uint8Array(needed);
            next.set(this.store, 0);
            this.store = next;
        }

        // If our current window already covers the requested range, we're done.
        if (this.buf && off >= this.winStart && off + size <= this.winStart + this.winSize) {
            return;
        }

        // Point the window at the requested range in the local store.
        this.buf = this.store.subarray(off, off + size);
        this.winStart = off;
        this.winSize = size;
    }

    public get byteLength(): number {
        return this.store.length;
    }

    public read(off: number, size: number): Uint8Array {
        this.ensure(off, size);
        if (!this.buf) {
            console.error('window not initialized');
            return new Uint8Array(size);
        }
        const rel = off - this.winStart;
        return this.buf.subarray(rel, rel + size);
    }

    // allow writing with optional zero padding to `virtualSize`
    public write(off: number, data: Uint8Array, virtualSize?: number): void {
        const total = virtualSize !== undefined ? Math.max(virtualSize, data.length) : data.length;
        this.ensure(off, total);
        if (!this.buf) {
            console.error('window not initialized');
            return;
        }
        const rel = off - this.winStart;

        // write the payload
        this.buf.set(data, rel);

        // zero-fill up to total
        const extra = total - data.length;
        if (extra > 0) {
            this.buf.fill(0, rel + data.length, rel + total);
        }
    }

    public clear(): void {
        this.buf = null;
        this.winStart = 0;
        this.winSize = 0;
        this.store = new Uint8Array(0);
    }
}

// --- helpers (LE encoding) ---
function leToNumber(bytes: Uint8Array): number {
    let out = 0;
    for (const b of Array.from(bytes).reverse()) {
        out = (out << 8) | (b & 0xff);
    }
    return out >>> 0;
}
function leIntToBytes(v: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    let tmp = v >>> 0;
    for (let i = 0; i < size; i++) {
        out.set([tmp & 0xff], i);
        tmp >>>= 8;
    }
    return out;
}

export type Endianness = 'little';
export interface HostOptions { endianness?: Endianness; }

type ElementMeta = {
  offsets: number[];              // append offsets within the symbol
  sizes: number[];                // logical size (actualSize) per append
  bases: number[];                // target base address per append
  elementSize?: number;           // known uniform stride when consistent
};

/** The piece your host delegates to for readValue/writeValue. */
export class MemoryHost {
    private cache = new ValidatingCache<MemoryContainer>();
    private endianness: Endianness;
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
            console.error(`invalid target base address (number): ${x}`);
            return undefined;
        }
        return x;
    }

    constructor() {
        this.endianness = 'little';
    }

    private getContainer(varName: string): MemoryContainer {
        return this.cache.ensure(varName, () => new MemoryContainer(varName), false);
    }

    /** Read a value, using byte-only offsets and widths. */
    public async readValue(ref: RefContainer): Promise<EvalValue> {
        const variableName = ref.anchor?.name;
        const widthBytes = ref.widthBytes ?? 0;
        if (!variableName || widthBytes <= 0) {
            return undefined;
        }

        const container = this.getContainer(variableName);
        const byteOff = ref.offsetBytes ?? 0;

        const raw = container.read(byteOff, widthBytes);

        if (this.endianness !== 'little') {
            // TOIMPL: add BE support if needed
        }

        // Interpret the bytes:
        //  - float kinds decode as float32/float64
        //  - ≤4 bytes: JS number (uint32)
        //  - 8 bytes: BigInt for full 64-bit integer fidelity
        //  - >8 bytes: return a copy of the raw bytes
        if (ref.valueType?.kind === 'float') {
            if (widthBytes === 4) {
                const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
                return dv.getFloat32(0, true);
            }
            if (widthBytes === 8) {
                const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
                return dv.getFloat64(0, true);
            }
        }
        if (widthBytes <= 4) {
            return leToNumber(raw);
        }
        if (widthBytes === 8) {
            let out = 0n;
            for (let i = 0; i < 8; i++) {
                // raw is a Uint8Array; indexed access is safe here.
                // eslint-disable-next-line security/detect-object-injection
                out |= BigInt(raw[i]) << BigInt(8 * i);
            }
            return out;
        }
        // for larger widths, return a copy of the bytes
        return raw.slice();
    }

    /** Read raw bytes without interpretation. */
    public async readRaw(ref: RefContainer, size: number): Promise<Uint8Array | undefined> {
        const variableName = ref.anchor?.name;
        if (!variableName || size <= 0) {
            return undefined;
        }
        const container = this.getContainer(variableName);
        const byteOff = ref.offsetBytes ?? 0;
        return container.read(byteOff, size).slice();
    }

    /** Write a value, using byte-only offsets and widths. */
    public async writeValue(ref: RefContainer, value: EvalValue, virtualSize?: number): Promise<void> {
        const variableName = ref.anchor?.name;
        const widthBytes = ref.widthBytes ?? 0;
        if (!variableName || widthBytes <= 0) {
            return;
        }

        const container = this.getContainer(variableName);
        const byteOff = ref.offsetBytes ?? 0;

        let buf: Uint8Array;

        if (value instanceof Uint8Array) {
            if (value.length === widthBytes) {
                buf = value;
            } else {
                // truncate or pad to widthBytes
                buf = new Uint8Array(widthBytes);
                buf.set(value.subarray(0, widthBytes), 0);
            }
        } else {
            // normalize value to number then to bytes
            let valNum: number | bigint;
            if (typeof value === 'boolean') {
                valNum = value ? 1 : 0;
            } else if (typeof value === 'number') {
                valNum = Math.trunc(value);
            } else if (typeof value === 'bigint') {
                valNum = value;
            } else {
                console.error('writeValue: unsupported value type');
                return;
            }

            if (typeof valNum === 'bigint') {
                buf = new Uint8Array(widthBytes);
                let tmp = valNum;
                for (let i = 0; i < widthBytes; i++) {
                    // Indexing into a Uint8Array is safe here.
                    // eslint-disable-next-line security/detect-object-injection
                    buf[i] = Number(tmp & 0xFFn);
                    tmp >>= 8n;
                }
            } else {
                buf = leIntToBytes(valNum, widthBytes);
            }
        }

        if (virtualSize !== undefined && virtualSize < widthBytes) {
            console.error(`writeValue: virtualSize (${virtualSize}) must be >= widthBytes (${widthBytes})`);
            return;
        }

        const total = virtualSize ?? widthBytes;
        container.write(byteOff, buf, total);
    }

    public setVariable(
        name: string,
        size: number,
        value: number | bigint | Uint8Array,
        offset: number,                     // NEW: controls where to place the data
        targetBase?: number,       // target base address where it was read from
        virtualSize?: number,                // total logical bytes for this element (>= size)
    ): void {
        if (!Number.isSafeInteger(offset)) {
            console.error(`setVariable: offset must be a safe integer, got ${offset}`);
            return;
        }

        const container = this.getContainer(name);

        // Decide where to write:
        //  - offset === -1 → append at the end
        //  - otherwise     → write at the given offset
        const appendOff = offset === -1 ? (container.byteLength ?? 0) : offset;
        if (appendOff < 0) {
            console.error(`setVariable: offset must be >= 0 or -1, got ${offset}`);
            return;
        }

        // normalize payload to exactly `size` bytes (numbers LE-encoded)
        let buf: Uint8Array;
        if (typeof value === 'number') {
            buf = leIntToBytes(Math.trunc(value), size);
        } else if (typeof value === 'bigint') {
            buf = new Uint8Array(size);
            let tmp = value;
            for (let i = 0; i < size; i++) {
                // Indexing into a Uint8Array is safe here.
                // eslint-disable-next-line security/detect-object-injection
                buf[i] = Number(tmp & 0xffn);
                tmp >>= 8n;
            }
        } else if (value instanceof Uint8Array) {
            // Avoid an extra allocation when already the right size
            buf = value.length === size ? value : new Uint8Array(value.subarray(0, size));
        } else {
            console.error('setVariable: unsupported value type');
            return;
        }

        if (virtualSize !== undefined && virtualSize < size) {
            console.error(`setVariable: virtualSize (${virtualSize}) must be >= size (${size})`);
            return;
        }
        const total = virtualSize ?? size;

        // write and zero-pad to `total`, extends as needed
        container.write(appendOff, buf, total);

        // record per-append metadata
        const meta = this.getOrInitMeta(name);
        meta.offsets.push(appendOff);
        meta.sizes.push(total);
        const normBase = targetBase !== undefined ? this.toAddrNumber(targetBase) : 0;
        meta.bases.push(normBase !== undefined ? normBase : 0);

        // maintain uniform stride when consistent
        if (meta.elementSize === undefined && meta.sizes.length === 1) {
            meta.elementSize = total;                // first append sets stride
        } else if (meta.elementSize !== undefined && meta.elementSize !== total) {
            delete meta.elementSize;                 // mixed sizes → remove the optional prop
        }

        this.cache.set(name, container, true);
    }

    /**
     * Get bytes previously recorded for a symbol.
     *
     * - No args           → whole symbol.
     * - `offset` only     → best-effort element at that offset (using metadata),
     *                       or `[offset .. end)` if no matching element exists.
     * - `offset` + `size` → exact range `[offset .. offset+size)`.
     */
    public getVariable(name: string, size?: number, offset?: number): number | undefined {
        const container = this.getContainer(name);
        const totalBytes = container.byteLength ?? 0;

        if (totalBytes === 0) {
            // symbol exists but has no data yet
            return undefined;
        }

        const off = offset ?? 0;
        if (!Number.isSafeInteger(off) || off < 0) {
            return undefined;
        }
        if (off >= totalBytes) {
            return undefined;
        }

        let spanSize: number;

        if (size !== undefined) {
            // explicit size wins
            if (!Number.isSafeInteger(size) || size <= 0) {
                return undefined;
            }
            spanSize = size;
        } else {
            // infer size from metadata if possible
            const meta = this.elementMeta.get(name);
            if (meta) {
                const idx = meta.offsets.indexOf(off);
                if (idx >= 0 && idx < meta.sizes.length) {
                    spanSize = meta.sizes.at(idx) as number;
                } else {
                    // no matching element → default to [off .. end)
                    spanSize = totalBytes - off;
                }
            } else {
                // no metadata at all → [off .. end)
                spanSize = totalBytes - off;
            }
        }

        if (off + spanSize > totalBytes) {
            return undefined;
        }

        if (spanSize > 4) {
            return undefined;
        }

        // read() returns a view; return a copy so callers can't mutate our backing store
        const raw = container.read(off, spanSize).slice();
        return leToNumber(raw);
    }

    public invalidate(name?: string): void {
        if (name === undefined) {
            this.cache.invalidateAll();
        } else {
            this.cache.invalidate(name);
        }
    }

    public clearVariable(name: string): boolean {
        this.elementMeta.delete(name);
        const container = this.cache.get(name);
        if (container?.clear) {
            container.clear();
        }
        return this.cache.delete(name);
    }

    public clear(): void {
        this.elementMeta.clear();
        this.cache.clear();
    }

    /** Number of array elements recorded for `name`. Defaults to 1 when unknown. */
    public getArrayElementCount(name: string): number {
        const m = this.elementMeta.get(name);
        const n = m?.offsets.length ?? 0;
        return n > 0 ? n : 1;
    }

    /** All recorded target base addresses (per append) for `name`. */
    public getArrayTargetBases(name: string): (number | undefined)[] {
        const m = this.elementMeta.get(name);
        return m ? m.bases.slice() : [];
    }

    /** Target base address for element `index` of `name` (number | undefined). */
    public getElementTargetBase(name: string, index: number): number | undefined {
        const m = this.elementMeta.get(name);
        if (!m) {
            console.error(`getElementTargetBase: unknown symbol "${name}"`);
            return undefined;
        }
        if (index < 0 || index >= m.bases.length) {
            console.error(`getElementTargetBase: index ${index} out of range for "${name}"`);
            return undefined;
        }
        return m.bases.at(index);
    }

    /** Optional: repair or set an address later. */
    public setElementTargetBase(name: string, index: number, base: number): void {
        const m = this.elementMeta.get(name);
        if (!m) {
            console.error(`setElementTargetBase: unknown symbol "${name}"`);
            return;
        }
        if (index < 0 || index >= m.bases.length) {
            console.error(`setElementTargetBase: index ${index} out of range for "${name}"`);
            return;
        }
        const norm = this.toAddrNumber(base);
        if (norm !== undefined) {
            m.bases.fill(norm, index, index + 1);
        }
    }

    // Optional: if you sometimes need to infer a count from bytes for legacy data
    public getArrayLengthFromBytes(name: string): number {
        const m = this.elementMeta.get(name);
        if (!m) {
            return 1;
        }
        if (m.offsets.length > 0) {
            return m.offsets.length;
        }

        const container = this.getContainer(name);
        const totalBytes = container.byteLength ?? 0;
        const stride = m.elementSize;
        if (!stride || stride <= 0) {
            return 1;
        }
        return Math.max(1, Math.floor(totalBytes / stride));
    }
}
