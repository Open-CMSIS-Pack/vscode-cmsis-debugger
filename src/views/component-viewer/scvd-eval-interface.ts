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

import { DataHost, EvalValue, RefContainer, ScalarType } from './evaluator';
import { ScvdNode } from './model/scvd-node';
import { MemoryHost } from './data-host/memory-host';
import { RegisterHost } from './data-host/register-host';
import { ScvdDebugTarget } from './scvd-debug-target';
import { FormatSegment } from './parser';
import { FormatTypeInfo, ScvdFormatSpecifier } from './model/scvd-format-specifier';
import { ScvdMember } from './model/scvd-member';

export class ScvdEvalInterface implements DataHost {
    private _registerCache: RegisterHost;
    private _memHost: MemoryHost;
    private _debugTarget: ScvdDebugTarget;
    private _formatSpecifier: ScvdFormatSpecifier;

    constructor(
        memHost: MemoryHost,
        regHost: RegisterHost,
        debugTarget: ScvdDebugTarget,
        formatterSpecifier: ScvdFormatSpecifier
    ) {
        this._memHost = memHost;
        this._registerCache = regHost;
        this._debugTarget = debugTarget;
        this._formatSpecifier = formatterSpecifier;
    }

    private get registerHost(): RegisterHost {
        return this._registerCache;
    }

    private get memHost(): MemoryHost {
        return this._memHost;
    }

    private get debugTarget(): ScvdDebugTarget {
        return this._debugTarget;
    }

    private get formatSpecifier(): ScvdFormatSpecifier {
        return this._formatSpecifier;
    }

    private normalizeScalarType(raw: string | ScalarType | undefined): ScalarType | undefined {
        if (!raw) {
            return undefined;
        }
        if (typeof raw !== 'string') {
            return raw;
        }

        const trimmed = raw.trim();
        const lower = trimmed.toLowerCase();
        let kind: ScalarType['kind'] = 'int';
        if (lower.includes('uint') || lower.includes('unsigned')) {
            kind = 'uint';
        } else if (lower.includes('float') || lower.includes('double')) {
            kind = 'float';
        }

        const out: ScalarType = { kind, name: trimmed };
        const bits = lower.match(/(8|16|32|64)/);
        if (bits) {
            out.bits = parseInt(bits[1], 10);
        }
        return out;
    }

    private async getScalarInfo(container: RefContainer): Promise<FormatTypeInfo & { widthBytes?: number }> {
        const currentRef = container.current ?? container.base;

        // Prefer explicit scalar type
        const rawType = await this.getValueType(container);
        const scalar = this.normalizeScalarType(rawType);
        const kind = scalar?.kind ?? 'unknown';

        // Derive element width and array-ness
        const arrayCount = typeof currentRef?.getArraySize === 'function' ? await currentRef.getArraySize() : undefined;
        if (currentRef?.name === '_addr') {
            return { kind, bits: 32, widthBytes: 4 };
        }
        if (arrayCount && arrayCount > 1) {
            return { kind, bits: 32, widthBytes: 4 };
        }

        // Determine element width: prefer target size, then container hint, then byte-width helper.
        let widthBytes: number | undefined = currentRef?.getTargetSize?.();
        if ((!widthBytes || widthBytes <= 0) && container.widthBytes) {
            widthBytes = container.widthBytes;
        }
        if ((!widthBytes || widthBytes <= 0) && typeof this.getByteWidth === 'function' && currentRef) {
            const w = await this.getByteWidth(currentRef);
            if (typeof w === 'number' && w > 0) {
                widthBytes = w;
            }
        }

        // Only pad numbers.
        let bits: number | undefined;
        const isScalar = kind === 'int' || kind === 'uint' || kind === 'float';

        if (isScalar) {
            bits = scalar?.bits;
            if (bits === undefined && widthBytes && widthBytes > 0) {
                bits = widthBytes * 8;
            }
            if (bits === undefined) {
                bits = 32;
            }
            if (bits > 64) {
                bits = 64;
            }
        } else {
            bits = 32; // default padding for unknown/non-scalar
        }

        const info: FormatTypeInfo & { widthBytes?: number } = { kind };
        if (bits !== undefined) {
            info.bits = bits;
        }
        if (widthBytes !== undefined) {
            info.widthBytes = widthBytes;
        }
        return info;
    }

    private async readBytesFromPointer(address: number, length: number): Promise<Uint8Array | undefined> {
        if (!Number.isFinite(address) || length <= 0) {
            return undefined;
        }
        return this.debugTarget.readMemory(address >>> 0, length);
    }

    private normalizeName(name: string | undefined): string | undefined {
        const trimmed = name?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }

    private async findSymbolAddressNormalized(name: string | undefined): Promise<number | undefined> {
        const normalized = this.normalizeName(name);
        if (!normalized) {
            return undefined;
        }
        return this.debugTarget.findSymbolAddress(normalized);
    }

    // ---------------- DataHost Interface ----------------
    public getSymbolRef(container: RefContainer, name: string, _forWrite?: boolean): ScvdNode | undefined {
        const symbol = container.base.getSymbol?.(name);
        return symbol;
    }

    public getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): ScvdNode | undefined {
        const base = container.current;
        return base?.getMember(property);
    }

    // Optional helper used by the evaluator
    // Returns the byte width of a ref (scalars, structs, arrays – host-defined).
    // getTargetSize, getTypeSize, getVirtualSize
    public async getByteWidth(ref: ScvdNode): Promise<number | undefined> {
        const isPointer = ref.getIsPointer();
        if (isPointer) {
            return 4;   // pointer size
        }
        const size = ref.getTargetSize();
        const numOfElements = await ref.getArraySize();

        if (size !== undefined) {
            return numOfElements ? size * numOfElements : size;
        }
        console.error(`ScvdEvalInterface.getByteWidth: size undefined for ${ref.getDisplayLabel()}`);
        return undefined;
    }

    /* bytes per element (including any padding/alignment inside the array layout).
       Stride only answers: “how far do I move to get from element i to i+1?”
    */
    public getElementStride(ref: ScvdNode): number {
        const isPointer = ref.getIsPointer();
        if (isPointer) {
            return 4;   // pointer size
        }
        const stride = ref.getVirtualSize();
        if (stride !== undefined) {
            return stride;
        }
        const size = ref.getTargetSize();
        if (size !== undefined) {
            return size;
        }
        console.error(`ScvdEvalInterface.getElementStride: size/stride undefined for ${ref.getDisplayLabel()}`);
        return 0;
    }

    public async getMemberOffset(_base: ScvdNode, member: ScvdNode): Promise<number | undefined> {
        const offset = await member.getMemberOffset();
        if (offset === undefined) {
            console.error(`ScvdEvalInterface.getMemberOffset: offset undefined for ${member.getDisplayLabel()}`);
            return undefined;
        }
        return offset;
    }

    public async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
        const base = container.current;
        const type = base?.getValueType();
        if (type !== undefined) {
            return type;
        }
        return undefined;
    }

    /* ---------------- Read/Write via caches ---------------- */
    public readValue(container: RefContainer): EvalValue {
        try {
            const value = this.memHost.readValue(container);
            return value;
        } catch (e) {
            console.error(`ScvdEvalInterface.readValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        }
    }

    public writeValue(container: RefContainer, value: EvalValue): EvalValue {
        try {
            this.memHost.writeValue(container, value);
            return value;
        } catch (e) {
            console.error(`ScvdEvalInterface.writeValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        }
    }

    /* ---------------- Intrinsics ---------------- */

    public async __FindSymbol(symbolName: string): Promise<number | undefined> {
        return this.findSymbolAddressNormalized(symbolName);
    }

    public async __GetRegVal(regName: string): Promise<number | bigint | undefined> {
        const normalized = this.normalizeName(regName);
        if (!normalized) {
            return undefined;
        }
        const cachedRegVal = this.registerHost.read(normalized);
        if (cachedRegVal === undefined) {
            const value = await this.debugTarget.readRegister(normalized);
            if (value === undefined) {
                return undefined;
            }
            this.registerHost.write(normalized, value);
            return value;
        }
        return cachedRegVal;
    }

    public async __Symbol_exists(symbol: string): Promise<number | undefined> {
        const found = await this.findSymbolAddressNormalized(symbol);
        return found !== undefined ? 1 : 0;
    }

    /* Returns
    A packed 32-bit integer value that indicates memory usage in bytes, in percent, and memory overflow:
    Bit 0..19 Used memory in Bytes (how many bytes of FillPattern are overwritten)
    Bit 20..28 Used memory in percent (how many percent of FillPattern are overwritten)
    Bit 31 Memory overflow (MagicValue is overwritten)
    */
    public async __CalcMemUsed(stackAddress: number, stackSize: number, fillPattern: number, magicValue: number): Promise<number | undefined> {
        const memUsed = await this.debugTarget.calculateMemoryUsage(
            stackAddress >>> 0,
            stackSize >>> 0,
            fillPattern >>> 0,
            magicValue >>> 0
        );
        return memUsed;
    }

    // Number of elements of an array defined by a symbol in user application.
    public async __size_of(symbol: string): Promise<number | undefined> {
        const sizeBytes = await this.debugTarget.getSymbolSize(symbol);
        if (sizeBytes !== undefined) {
            return sizeBytes;
        }
        // Legacy fallback: try array element count if size is unavailable
        const arrayElements = await this.debugTarget.getNumArrayElements(symbol);
        if (arrayElements !== undefined) {
            return arrayElements;
        }
        return undefined;
    }

    public async __Offset_of(container: RefContainer, typedefMember: string): Promise<number | undefined> {
        const memberRef = container.base.getMember(typedefMember);
        if (memberRef) {
            const offset = await memberRef.getMemberOffset();
            return offset;
        }
        return undefined;
    }

    public async __Running(): Promise<number | undefined> {
        const isRunning = await this.debugTarget.getTargetIsRunning();
        return isRunning ? 1 : 0;
    }

    public _count(container: RefContainer): number | undefined {
        const base = container.current;
        const name = base?.name;
        if (name !== undefined) {
            const count = this.memHost.getArrayElementCount(name);  // TOIMPL: this works only for <readlist>, must add for <read>
            return count;
        }
        return undefined;
    }

    public _addr(container: RefContainer): number | undefined {
        const base = container.current;
        const name = base?.name;
        const index = container.index ?? 0;
        if (name !== undefined) {
            const addr = this.memHost.getElementTargetBase(name, index);
            return addr;
        }
        return undefined;
    }

    public async formatPrintf(spec: FormatSegment['spec'], value: EvalValue, container: RefContainer): Promise<string | undefined> {
        const base = container.current;
        const typeInfo = await this.getScalarInfo(container);

        const toNumeric = (v: unknown): number | bigint => {
            if (typeof v === 'number' || typeof v === 'bigint') {
                return v;
            }
            if (typeof v === 'boolean') {
                return v ? 1 : 0;
            }
            if (typeof v === 'string') {
                const n = Number(v);
                return Number.isFinite(n) ? n : NaN;
            }
            return NaN;
        };

        switch (spec) {
            case 'C': {
                // TOIMPL: include file/line context when targetAccess exposes it (e.g., GDB "info line *addr").
                const addr = typeof value === 'number' ? value : undefined;
                if (addr === undefined) {
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                const context = await this.debugTarget.findSymbolContextAtAddress(addr);
                if (context !== undefined) {
                    return this.formatSpecifier.format(spec, context, { typeInfo, allowUnknownSpec: true });
                }
                const name = await this.debugTarget.findSymbolNameAtAddress(addr);
                return this.formatSpecifier.format(spec, name ?? addr, { typeInfo, allowUnknownSpec: true });
            }
            case 'S': {
                const addr = typeof value === 'number' ? value : undefined;
                if (addr === undefined) {
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                const name = await this.debugTarget.findSymbolNameAtAddress(addr);
                return this.formatSpecifier.format(spec, name ?? addr, { typeInfo, allowUnknownSpec: true });
            }
            case 'E': {
                const memberItem = base?.castToDerived(ScvdMember);
                const enumItem = typeof value === 'number' ? await memberItem?.getEnum(value) : undefined;
                const enumStr = await enumItem?.getGuiName();
                const opts: { typeInfo: FormatTypeInfo; allowUnknownSpec: true; enumText?: string } = { typeInfo, allowUnknownSpec: true };
                if (enumStr !== undefined) {
                    opts.enumText = enumStr;
                }
                return this.formatSpecifier.format(spec, value, opts);
            }
            case 'I': {
                if (value instanceof Uint8Array) {
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                if (typeof value === 'number') {
                    const buf = await this.readBytesFromPointer(value, 4);
                    return this.formatSpecifier.format(spec, buf ?? value, { typeInfo, allowUnknownSpec: true });
                }
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
            case 'J': {
                if (value instanceof Uint8Array) {
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                if (typeof value === 'number') {
                    const buf = await this.readBytesFromPointer(value, 16);
                    return this.formatSpecifier.format(spec, buf ?? value, { typeInfo, allowUnknownSpec: true });
                }
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
            case 'x': {
                let n = toNumeric(value);
                if (typeof n === 'number') {
                    n = Math.trunc(n);
                }
                return this.formatSpecifier.format(spec, n, { typeInfo, allowUnknownSpec: true });
            }
            case 'N': {
                if (typeof value === 'number' && Number.isInteger(value)) {
                    const data = await this.debugTarget.readUint8ArrayStrFromPointer(value, 1, 260 - 4);
                    if (data !== undefined) {
                        return this.formatSpecifier.format(spec, data, { typeInfo, allowUnknownSpec: true });
                    }
                }
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
            case 'M': {
                if (value instanceof Uint8Array) {
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                if (typeof value === 'number') {
                    const buf = await this.readBytesFromPointer(value, 6);
                    return this.formatSpecifier.format(spec, buf ?? value, { typeInfo, allowUnknownSpec: true });
                }
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
            case 'U': {
                if (typeof value === 'number' && Number.isInteger(value)) {
                    const data = await this.debugTarget.readUint8ArrayStrFromPointer(value, 2, 260 - 4);
                    if (data !== undefined) {
                        return this.formatSpecifier.format(spec, data, { typeInfo, allowUnknownSpec: true });
                    }
                }
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
            default: {
                return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
            }
        }
    }
}
