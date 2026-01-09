// cache.ts

import { EvalValue, RefContainer } from '../evaluator';

/** Entry stored in the symbol cache. */
export interface SymbolEntry {
  name: string;
  valid: boolean;
  data: MemoryContainer;
}

export class SymbolCache {
    private map = new Map<string, SymbolEntry>();
    constructor(private makeContainer: (name: string) => MemoryContainer) {}

    getSymbol(name: string): SymbolEntry {
        let entry = this.map.get(name);
        if (!entry) {
            entry = { name, valid: false, data: this.makeContainer(name) };
            this.map.set(name, entry);
        }
        return entry;
    }

    /** Remove a symbol from the cache.
     *  Returns true if an entry existed and was removed; false otherwise.
     *  Attempts to dispose the underlying MemoryContainer if it supports it.
     */
    removeSymbol(name: string): boolean {
        const entry = this.map.get(name);
        if (!entry) return false;

        // Best-effort cleanup of the backing container (optional)
        const maybe = entry.data as unknown as {
            dispose?: () => void;
            free?: () => void;
            clear?: () => void;
        };
        try {
            if (typeof maybe?.dispose === 'function') maybe.dispose();
            else if (typeof maybe?.free === 'function') maybe.free();
            else if (typeof maybe?.clear === 'function') maybe.clear();
        } catch {
            // ignore cleanup errors but still remove from the map
        }

        this.map.delete(name);
        return true;
    }

    invalidate(name: string) { const e = this.map.get(name); if (e) e.valid = false; }
    invalidateAll() { this.map.forEach((e) => e.valid = false); }
    clear() { this.map.clear(); }
}

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
        if (this.buf && off >= this.winStart && off + size <= this.winStart + this.winSize) return;

        // Point the window at the requested range in the local store.
        this.buf = this.store.subarray(off, off + size);
        this.winStart = off;
        this.winSize = size;
    }

    get byteLength(): number {
        return this.store.length;
    }

    read(off: number, size: number): Uint8Array {
        this.ensure(off, size);
        if (!this.buf) {
            console.error('window not initialized');
            return new Uint8Array(size);
        }
        const rel = off - this.winStart;
        return this.buf.subarray(rel, rel + size);
    }

    // allow writing with optional zero padding to `actualSize`
    write(off: number, data: Uint8Array, actualSize?: number): void {
        const total = actualSize !== undefined ? Math.max(actualSize, data.length) : data.length;
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
}

// --- helpers (LE encoding) ---
function leToNumber(bytes: Uint8Array): number {
    let out = 0;
    for (let i = bytes.length - 1; i >= 0; i--) {
        out = (out << 8) | (bytes[i]! & 0xff);
    }
    return out >>> 0;
}
function leIntToBytes(v: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    let tmp = v >>> 0;
    for (let i = 0; i < size; i++) {
        out[i] = tmp & 0xff;
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

/** The piece your DataHost delegates to for readValue/writeValue. */
export class CachedMemoryHost {
    private cache: SymbolCache;
    private endianness: Endianness;
    private elementMeta = new Map<string, ElementMeta>();

    private getOrInitMeta(name: string): ElementMeta {
        let m = this.elementMeta.get(name);
        if (!m) {
            // with exactOptionalPropertyTypes: do NOT assign elementSize: undefined
            m = { offsets: [], sizes: [], bases: [] };
            this.elementMeta.set(name, m);
        }
        return m;
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
        this.cache = new SymbolCache((name) => new MemoryContainer(name));
        this.endianness = 'little';
    }

    private getEntry(varName: string): SymbolEntry {
        const entry = this.cache.getSymbol(varName);
        return entry;
    }

    /** Read a value, using byte-only offsets and widths. */
    readValue(container: RefContainer): EvalValue {
        const variableName = container.anchor?.name;
        const widthBytes = container.widthBytes ?? 0;
        if (!variableName || widthBytes <= 0) {
            return;
        }

        const entry = this.getEntry(variableName);
        const byteOff = container.offsetBytes ?? 0;

        const raw = entry.data.read(byteOff, widthBytes);

        if (this.endianness !== 'little') {
            // TODO: add BE support if needed
        }

        // Interpret the bytes:
        //  - ≤4 bytes: JS number (uint32)
        //  - >4 bytes: return a copy of the raw bytes
        if (widthBytes <= 4) {
            return leToNumber(raw);
        }
        // for larger widths, return a copy of the bytes
        return raw.slice();
    }

    /** Write a value, using byte-only offsets and widths. */
    writeValue(container: RefContainer, value: EvalValue, actualSize?: number): void {
        const variableName = container.anchor?.name;
        const widthBytes = container.widthBytes ?? 0;
        if (!variableName || widthBytes <= 0) {
            return;
        }

        const entry = this.getEntry(variableName);
        const byteOff = container.offsetBytes ?? 0;

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
            let valNum: number;
            if (typeof value === 'boolean') valNum = value ? 1 : 0;
            else if (typeof value === 'number') valNum = Math.trunc(value);
            else {
                console.error('writeValue: unsupported value type');
                return;
            }

            buf = leIntToBytes(valNum, widthBytes);
        }

        if (actualSize !== undefined && actualSize < widthBytes) {
            console.error(`writeValue: actualSize (${actualSize}) must be >= widthBytes (${widthBytes})`);
            return;
        }

        const total = actualSize ?? widthBytes;
        entry.data.write(byteOff, buf, total);
    }

    setVariable(
        name: string,
        size: number,
        value: number | Uint8Array,
        offset: number,                     // NEW: controls where to place the data
        targetBase?: number,       // target base address where it was read from
        actualSize?: number,                // total logical bytes for this element (>= size)
    ): void {
        if (!Number.isSafeInteger(offset)) {
            console.error(`setVariable: offset must be a safe integer, got ${offset}`);
            return;
        }

        const entry = this.getEntry(name);

        // Decide where to write:
        //  - offset === -1 → append at the end
        //  - otherwise     → write at the given offset
        const appendOff = offset === -1 ? (entry.data.byteLength ?? 0) : offset;
        if (appendOff < 0) {
            console.error(`setVariable: offset must be >= 0 or -1, got ${offset}`);
            return;
        }

        // normalize payload to exactly `size` bytes (numbers LE-encoded)
        const buf = new Uint8Array(size);
        if (typeof value === 'number') {
            buf.set(leIntToBytes(Math.trunc(value), size), 0);
        } else if (value instanceof Uint8Array) {
            buf.set(value.subarray(0, size), 0); // truncate/zero-pad to `size`
        } else {
            console.error('setVariable: unsupported value type');
            return;
        }

        if (actualSize !== undefined && actualSize < size) {
            console.error(`setVariable: actualSize (${actualSize}) must be >= size (${size})`);
            return;
        }
        const total = actualSize ?? size;

        // write and zero-pad to `total`, extends as needed
        entry.data.write(appendOff, buf, total);

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

        entry.valid = true;
    }

    /**
     * Get bytes previously recorded for a symbol.
     *
     * - No args           → whole symbol.
     * - `offset` only     → best-effort element at that offset (using metadata),
     *                       or `[offset .. end)` if no matching element exists.
     * - `offset` + `size` → exact range `[offset .. offset+size)`.
     */
    getVariable(name: string, size?: number, offset?: number): number | undefined {
        const entry = this.getEntry(name);
        const totalBytes = entry.data.byteLength ?? 0;

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
                if (idx >= 0) {
                    spanSize = meta.sizes[idx];
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
        const raw = entry.data.read(off, spanSize).slice();
        return leToNumber(raw);
    }

    invalidate(name?: string): void {
        if (name === undefined) this.cache.invalidateAll();
        else this.cache.invalidate(name);
    }

    clearVariable(name: string): boolean {
        this.elementMeta.delete(name);
        return this.cache.removeSymbol(name);
    }

    clear(): void {
        this.elementMeta.clear();
        this.cache.clear();
    }

    /** Number of array elements recorded for `name`. Defaults to 1 when unknown. */
    getArrayElementCount(name: string): number {
        const m = this.elementMeta.get(name);
        const n = m?.offsets.length ?? 0;
        return n > 0 ? n : 1;
    }

    /** All recorded target base addresses (per append) for `name`. */
    getArrayTargetBases(name: string): (number | undefined)[] {
        const m = this.elementMeta.get(name);
        return m ? m.bases.slice() : [];
    }

    /** Target base address for element `index` of `name` (number | undefined). */
    getElementTargetBase(name: string, index: number): number | undefined {
        const m = this.elementMeta.get(name);
        if (!m) {
            console.error(`getElementTargetBase: unknown symbol "${name}"`);
            return undefined;
        }
        if (index < 0 || index >= m.bases.length) {
            console.error(`getElementTargetBase: index ${index} out of range for "${name}"`);
            return undefined;
        }
        return m.bases[index];
    }

    /** Optional: repair or set an address later. */
    setElementTargetBase(name: string, index: number, base: number): void {
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
            m.bases[index] = norm;
        }
    }

    // Optional: if you sometimes need to infer a count from bytes for legacy data
    getArrayLengthFromBytes(name: string): number {
        const m = this.elementMeta.get(name);
        if (!m) return 1;
        if (m.offsets.length > 0) return m.offsets.length;

        const entry = this.getEntry(name);
        const totalBytes = entry.data.byteLength ?? 0;
        const stride = m.elementSize;
        if (!stride || stride <= 0) return 1;
        return Math.max(1, Math.floor(totalBytes / stride));
    }
}
