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

import { componentViewerLogger } from '../../logger';
import { DataAccessHost, EvalValue, ModelHost, RefContainer, ScalarType } from './parser-evaluator/model-host';
import type { IntrinsicProvider } from './parser-evaluator/intrinsics';
import { ScvdNode } from './model/scvd-node';
import { MemoryHost } from './data-host/memory-host';
import { RegisterHost } from './data-host/register-host';
import { ScvdDebugTarget } from './scvd-debug-target';
import { FormatSegment } from './parser-evaluator/parser';
import { FormatTypeInfo, ScvdFormatSpecifier } from './model/scvd-format-specifier';
import { ScvdMember } from './model/scvd-member';
import { ScvdVar } from './model/scvd-var';
import { perf } from './stats-config';
import { ScvdEvalInterfaceCache } from './scvd-eval-interface-cache';

export class ScvdEvalInterface implements ModelHost, DataAccessHost, IntrinsicProvider {
    private static readonly INVALID_ADDR_MIN = 0xFFFFFFF0;
    private _registerCache: RegisterHost;
    private _memHost: MemoryHost;
    private _debugTarget: ScvdDebugTarget;
    private _formatSpecifier: ScvdFormatSpecifier;
    private _caches = new ScvdEvalInterfaceCache();

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

    public resetPrintfCache(): void {
        this._caches.clearPrintf();
    }

    public resetEvalCaches(): void {
        this._caches.clearAll();
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
        let widthBytes: number | undefined = currentRef?.getTargetSize ? await currentRef.getTargetSize() : undefined;
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

        const info: FormatTypeInfo & { widthBytes?: number } = { kind, bits };
        if (widthBytes !== undefined) {
            info.widthBytes = widthBytes;
        }
        return info;
    }

    private async readBytesFromPointer(address: number, length: number): Promise<Uint8Array | undefined> {
        if (!Number.isFinite(address) || length <= 0) {
            return undefined;
        }
        if (address === 0 || address >= ScvdEvalInterface.INVALID_ADDR_MIN) {
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

    // ---------------- Host Interface: model + data access ----------------
    public async getSymbolRef(container: RefContainer, name: string, _forWrite?: boolean): Promise<ScvdNode | undefined> {
        if (this._caches.hasSymbolRef(container.base, name)) {
            return this._caches.getSymbolRef(container.base, name);
        }
        const modelStart = perf?.start() ?? 0;
        const ref = container.base.getSymbol?.(name);
        perf?.end(modelStart, 'modelGetSymbolMs', 'modelGetSymbolCalls');
        this._caches.setSymbolRef(container.base, name, ref);
        return ref;
    }

    public async getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): Promise<ScvdNode | undefined> {
        const base = container.current;
        if (!base) {
            return undefined;
        }
        if (this._caches.hasMemberRef(base, property)) {
            return this._caches.getMemberRef(base, property);
        }
        const modelStart = perf?.start() ?? 0;
        const ref = base.getMember(property);
        perf?.end(modelStart, 'modelGetMemberMs', 'modelGetMemberCalls');
        this._caches.setMemberRef(base, property, ref);
        return ref;
    }

    public async resolveColonPath(_container: RefContainer, _parts: string[]): Promise<EvalValue> {
        return undefined;
    }

    public async getElementRef(ref: ScvdNode): Promise<ScvdNode | undefined> {
        return ref.getElementRef();
    }

    // Optional helper used by the evaluator
    // Returns the byte width of a ref (scalars, structs, arrays – host-defined).
    // getTargetSize, getTypeSize, getVirtualSize
    public async getByteWidth(ref: ScvdNode): Promise<number | undefined> {
        if (this._caches.hasByteWidth(ref)) {
            return this._caches.getByteWidth(ref);
        }
        const isPointer = ref.getIsPointer();
        if (isPointer) {
            this._caches.setByteWidth(ref, 4);
            return 4;   // pointer size
        }
        const size = await ref.getTargetSize();
        const numOfElements = await ref.getArraySize();

        if (size !== undefined) {
            const width = numOfElements ? size * numOfElements : size;
            if (width > 0) {
                this._caches.setByteWidth(ref, width);
            }
            return width;
        }
        componentViewerLogger.error(`ScvdEvalInterface.getByteWidth: size undefined for ${ref.getDisplayLabel()}`);
        return undefined;
    }

    /* bytes per element (including any padding/alignment inside the array layout).
       Stride only answers: “how far do I move to get from element i to i+1?”
    */
    public async getElementStride(ref: ScvdNode): Promise<number> {
        const isPointer = ref.getIsPointer();
        if (isPointer) {
            return 4;   // pointer size
        }
        const stride = await ref.getVirtualSize();
        if (stride !== undefined) {
            return stride;
        }
        const size = await ref.getTargetSize();
        if (size !== undefined) {
            return size;
        }
        componentViewerLogger.error(`ScvdEvalInterface.getElementStride: size/stride undefined for ${ref.getDisplayLabel()}`);
        return 0;
    }

    public async getMemberOffset(_base: ScvdNode, member: ScvdNode): Promise<number | undefined> {
        if (this._caches.hasMemberOffset(member)) {
            return this._caches.getMemberOffset(member);
        }
        const modelStart = perf?.start() ?? 0;
        const offset = await member.getMemberOffset();
        perf?.end(modelStart, 'modelGetMemberOffsetMs', 'modelGetMemberOffsetCalls');
        if (offset === undefined) {
            componentViewerLogger.error(`ScvdEvalInterface.getMemberOffset: offset undefined for ${member.getDisplayLabel()}`);
            return undefined;
        }
        this._caches.setMemberOffset(member, offset);
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
    public async readValue(container: RefContainer): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            const value = await this.memHost.readValue(container);
            return value as EvalValue;
        } catch (e) {
            componentViewerLogger.error(`ScvdEvalInterface.readValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        } finally {
            perf?.end(perfStartTime, 'evalReadMs', 'evalReadCalls');
        }
    }

    public async writeValue(container: RefContainer, value: EvalValue): Promise<EvalValue> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            await this.memHost.writeValue(container, value);
            return value;
        } catch (e) {
            componentViewerLogger.error(`ScvdEvalInterface.writeValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        } finally {
            perf?.end(perfStartTime, 'evalWriteMs', 'evalWriteCalls');
        }
    }

    /* ---------------- Intrinsics ---------------- */

    public async __FindSymbol(symbolName: string): Promise<number | undefined> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            return this.findSymbolAddressNormalized(symbolName);
        } finally {
            perf?.end(perfStartTime, 'symbolFindMs', 'symbolFindCalls');
        }
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
        const perfStartTime = perf?.start() ?? 0;
        try {
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
        } finally {
            perf?.end(perfStartTime, 'symbolSizeMs', 'symbolSizeCalls');
        }
    }

    public async __Offset_of(container: RefContainer, typedefMember: string): Promise<number | undefined> {
        const perfStartTime = perf?.start() ?? 0;
        try {
            const memberRef = container.base.getMember(typedefMember);
            if (memberRef) {
                const offset = await memberRef.getMemberOffset();
                return offset;
            }
            return undefined;
        } finally {
            perf?.end(perfStartTime, 'symbolOffsetMs', 'symbolOffsetCalls');
        }
    }

    public async __Running(): Promise<number | undefined> {
        const isRunning = await this.debugTarget.getTargetIsRunning();
        return isRunning ? 1 : 0;
    }

    public async _count(container: RefContainer): Promise<number | undefined> {
        const base = container.current;
        const name = base?.name;
        if (name !== undefined) {
            const count = this.memHost.getArrayElementCount(name);  // TOIMPL: this works only for <readlist>, must add for <read>
            return count;
        }
        return undefined;
    }

    public async _addr(container: RefContainer): Promise<number | undefined> {
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
        const perfStartTime = perf?.start() ?? 0;
        perf?.recordPrintfSpec(spec);
        perf?.recordPrintfValueType(value);
        try {
            const base = container.current;
            const formatRef = container.origin ?? base;
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

            const cacheableNumber =
            (spec === 'd' || spec === 'u' || spec === 'x') &&
            (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'bigint');
            const cacheableText = spec === 't' && typeof value === 'string';
            if (cacheableNumber) {
                const numericValue = value as number | bigint;
                const key = this.makePrintfCacheKey(spec, numericValue, typeInfo);
                const cached = this._caches.getPrintf(key);
                if (cached !== undefined) {
                    perf?.recordPrintfCacheHit();
                    return cached;
                }
                perf?.recordPrintfCacheMiss();
            } else if (cacheableText) {
                const key = this.makePrintfTextCacheKey(spec, value);
                const cached = this._caches.getPrintf(key);
                if (cached !== undefined) {
                    perf?.recordPrintfCacheHit();
                    return cached;
                }
                perf?.recordPrintfCacheMiss();
            }

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
                    const memberItem = formatRef?.castToDerived(ScvdMember);
                    const varItem = formatRef?.castToDerived(ScvdVar);
                    const enumItem = typeof value === 'number'
                        ? await (memberItem?.getEnum(value) ?? varItem?.getEnum(value))
                        : undefined;
                    const enumStr = await enumItem?.getGuiName();
                    if (typeof value === 'number' && enumStr !== undefined) {
                        const enumKey = this.makePrintfCacheKey('E', value, typeInfo, enumStr);
                        const cached = this._caches.getPrintf(enumKey);
                        if (cached !== undefined) {
                            perf?.recordPrintfCacheHit();
                            return cached;
                        }
                        perf?.recordPrintfCacheMiss();
                    }
                    const opts: { typeInfo: FormatTypeInfo; allowUnknownSpec: true; enumText?: string } = { typeInfo, allowUnknownSpec: true };
                    if (enumStr !== undefined) {
                        opts.enumText = enumStr;
                    }
                    const formatted = this.formatSpecifier.format(spec, value, opts);
                    if (typeof value === 'number' && enumStr !== undefined) {
                        this._caches.setPrintf(this.makePrintfCacheKey('E', value, typeInfo, enumStr), formatted);
                    }
                    return formatted;
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
                    const formatted = this.formatSpecifier.format(spec, n, { typeInfo, allowUnknownSpec: true });
                    this.storePrintfCache(spec, value, typeInfo, formatted);
                    return formatted;
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
                case 't': {
                    const ensureNullTerminated = (bytes: Uint8Array): Uint8Array => {
                        if (bytes.length === 0 || bytes[bytes.length - 1] === 0) {
                            return bytes;
                        }
                        const next = new Uint8Array(bytes.length + 1);
                        next.set(bytes, 0);
                        next[bytes.length] = 0;
                        return next;
                    };
                    if (typeof value === 'string') {
                        const formatted = this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                        this.storePrintfTextCache(spec, value, formatted);
                        return formatted;
                    }
                    if (value instanceof Uint8Array) {
                        return this.formatSpecifier.format(spec, ensureNullTerminated(value), { typeInfo, allowUnknownSpec: true });
                    }
                    const anchor = container.anchor ?? base;
                    const width = container.widthBytes ?? (formatRef ? await this.getByteWidth(formatRef) : undefined);
                    if (anchor?.name !== undefined && width !== undefined && width > 0) {
                        const cacheRef: RefContainer = {
                            ...container,
                            anchor,
                            widthBytes: width
                        };
                        const raw = await this.memHost.readRaw(cacheRef, width);
                        if (raw !== undefined) {
                            return this.formatSpecifier.format(spec, ensureNullTerminated(raw), { typeInfo, allowUnknownSpec: true });
                        }
                    }
                    return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                }
                case 'M': {
                    if (value instanceof Uint8Array) {
                        return this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                    }
                    const anchor = container.anchor ?? base;
                    let width = container.widthBytes;
                    if (width === undefined) {
                        width = formatRef ? await this.getByteWidth(formatRef) : undefined;
                    }
                    if (width === undefined) {
                        width = 6;
                    }
                    if (anchor?.name !== undefined && width > 0) {
                        const cacheRef: RefContainer = {
                            ...container,
                            anchor,
                            widthBytes: width
                        };
                        const raw = await this.memHost.readRaw(cacheRef, width);
                        if (raw !== undefined) {
                            return this.formatSpecifier.format(spec, raw, { typeInfo, allowUnknownSpec: true });
                        }
                    }
                    const isPointer = formatRef?.getIsPointer?.() ?? false;
                    if (isPointer && typeof value === 'number') {
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
                    const formatted = this.formatSpecifier.format(spec, value, { typeInfo, allowUnknownSpec: true });
                    this.storePrintfCache(spec, value, typeInfo, formatted);
                    return formatted;
                }
            }
        } finally {
            perf?.end(perfStartTime, 'printfMs', 'printfCalls');
        }
    }

    private makePrintfCacheKey(spec: string, value: number | bigint, typeInfo: FormatTypeInfo, suffix?: string): string {
        const bits = typeInfo.bits ?? 0;
        const kind = typeInfo.kind ?? 'unknown';
        const extra = suffix ? `:${suffix}` : '';
        return `${spec}:${kind}:${bits}:${value.toString()}${extra}`;
    }

    private storePrintfCache(spec: string, value: EvalValue, typeInfo: FormatTypeInfo, formatted: string): void {
        if (
            (spec === 'd' || spec === 'u' || spec === 'x') &&
            (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'bigint')
        ) {
            const numericValue = value as number | bigint;
            const key = this.makePrintfCacheKey(spec, numericValue, typeInfo);
            this._caches.setPrintf(key, formatted);
        }
    }

    private makePrintfTextCacheKey(spec: string, value: string): string {
        return `${spec}:text:${value}`;
    }

    private storePrintfTextCache(spec: string, value: string, formatted: string): void {
        if (spec === 't') {
            const key = this.makePrintfTextCacheKey(spec, value);
            this._caches.setPrintf(key, formatted);
        }
    }
}
