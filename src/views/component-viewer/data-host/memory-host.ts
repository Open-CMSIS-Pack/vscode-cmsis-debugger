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

import { componentViewerLogger } from '../../../logger';
import { EvalValue, RefContainer } from '../parser-evaluator/model-host';
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

// --- helpers (LE encoding) ---
function leToNumber(bytes: Uint8Array): number {
    let out = 0;
    for (const b of Array.from(bytes).reverse()) {
        out = (out << 8) | (b & 0xff);
    }
    return out >>> 0;
}

function leToSignedNumber(bytes: Uint8Array): number {
    const unsigned = leToNumber(bytes);
    const bits = bytes.length * 8;
    if (bits <= 0 || bits >= 32) {
        return unsigned | 0;
    }
    const signBit = 1 << (bits - 1);
    return (unsigned & signBit) ? (unsigned | (~0 << bits)) : unsigned;
}

function leToFloat16(bytes: Uint8Array): number {
    if (bytes.length < 2) {
        return NaN;
    }
    const half = bytes[0] | (bytes[1] << 8);
    const sign = (half & 0x8000) ? -1 : 1;
    const exp = (half >> 10) & 0x1f;
    const frac = half & 0x03ff;
    if (exp === 0) {
        if (frac === 0) {
            return sign < 0 ? -0 : 0;
        }
        return sign * Math.pow(2, -14) * (frac / 1024);
    }
    if (exp === 0x1f) {
        return frac === 0 ? (sign * Infinity) : NaN;
    }
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

export const __test__ = {
    leToFloat16,
};
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
  bases: Array<number | undefined>; // target base address per append
  elementSize?: number;           // known uniform stride when consistent
};

// The piece your host delegates to for readValue/writeValue.
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
            componentViewerLogger.error(`invalid target base address (number): ${x}`);
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

    // Read a value, using byte-only offsets and widths.
    public async readValue(ref: RefContainer): Promise<EvalValue> {
        const variableName = ref.anchor?.name;
        const widthBytes = ref.widthBytes ?? 0;
        if (!variableName || widthBytes <= 0) {
            return undefined;
        }

        const container = this.getContainer(variableName);
        const byteOff = ref.offsetBytes ?? 0;

        const raw = widthBytes > 8
            ? container.readPartial(byteOff, widthBytes)
            : container.readExact(byteOff, widthBytes);
        if (!raw) {
            componentViewerLogger.trace(`[MemoryHost.readValue] MISS: var="${variableName}" offset=${byteOff} width=${widthBytes}`);
            return undefined;
        }
        componentViewerLogger.trace(`[MemoryHost.readValue] var="${variableName}" offset=${byteOff} width=${widthBytes} data=[${Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);

        if (this.endianness !== 'little') {
            // TOIMPL: add BE support if needed
        }

        // Interpret the bytes:
        //  - float kinds decode as float32/float64
        //  - ≤4 bytes: JS number (uint32)
        //  - 8 bytes: BigInt for full 64-bit integer fidelity
        //  - >8 bytes: return a copy of the raw bytes
        if (ref.valueType?.kind === 'float') {
            if (widthBytes === 2) {
                return leToFloat16(raw);
            }
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
            const value = ref.valueType?.kind === 'int' ? leToSignedNumber(raw) : leToNumber(raw);
            componentViewerLogger.trace(`[MemoryHost.readValue] → decoded as ${ref.valueType?.kind === 'int' ? 'int' : 'uint'}: ${value}`);
            return value;
        }
        if (widthBytes === 8) {
            let out = 0n;
            for (let i = 0; i < 8; i++) {
                // raw is a Uint8Array; indexed access is safe here.
                // eslint-disable-next-line security/detect-object-injection
                out |= BigInt(raw[i]) << BigInt(8 * i);
            }
            componentViewerLogger.trace(`[MemoryHost.readValue] → decoded as bigint: ${out}`);
            return out;
        }
        // for larger widths, return a copy of the bytes
        componentViewerLogger.trace(`[MemoryHost.readValue] → raw bytes (len=${raw.length})`);
        return raw.slice();
    }

    // Read raw bytes without interpretation.
    public async readRaw(ref: RefContainer, size: number): Promise<Uint8Array | undefined> {
        const variableName = ref.anchor?.name;
        if (!variableName || size <= 0) {
            return undefined;
        }
        const container = this.getContainer(variableName);
        const byteOff = ref.offsetBytes ?? 0;
        const raw = container.readPartial(byteOff, size);
        if (!raw) {
            return undefined;
        }
        if (raw.length === size) {
            return raw.slice();
        }
        const out = new Uint8Array(size);
        out.set(raw, 0);
        return out;
    }

    // Write a value, using byte-only offsets and widths.
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
                componentViewerLogger.error('writeValue: unsupported value type');
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
            componentViewerLogger.error(`writeValue: virtualSize (${virtualSize}) must be >= widthBytes (${widthBytes})`);
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
