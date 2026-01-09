// src/views/component-viewer/scvd-eval-interface.ts
// DataHost using EvalSymbolCache + Cm81MRegisterCache, with:
//  - per-instance virtual vars (auto-add on first use)
//  - optional auto-declare unknown globals on write
//  - module-level helpers to add/read globals without host reference

import { DataHost, EvalValue, RefContainer, ScalarType } from './evaluator';
import { ScvdBase } from './model/scvd-base';
import { CachedMemoryHost } from './cache/cache';
import { Cm81MRegisterCache } from './cache/register-cache';
import { ScvdDebugTarget } from './scvd-debug-target';
import { FormatSegment } from './parser';
import { ScvdFormatSpecifier } from './model/scvd-format-specifier';
import { ScvdMember } from './model/scvd-member';

export class ScvdEvalInterface implements DataHost {
    private _registerCache: Cm81MRegisterCache;
    private _memHost: CachedMemoryHost;
    private _debugTarget: ScvdDebugTarget;
    private _formatSpecifier: ScvdFormatSpecifier;

    constructor(
        memHost: CachedMemoryHost,
        regHost: Cm81MRegisterCache,
        debugTarget: ScvdDebugTarget,
        formatterSpecifier: ScvdFormatSpecifier
    ) {
        this._memHost = memHost;
        this._registerCache = regHost;
        this._debugTarget = debugTarget;
        this._formatSpecifier = formatterSpecifier;
    }

    private get registerCache(): Cm81MRegisterCache {
        return this._registerCache;
    }

    private get memHost(): CachedMemoryHost {
        return this._memHost;
    }

    private get debugTarget(): ScvdDebugTarget {
        return this._debugTarget;
    }

    private get formatSpecifier(): ScvdFormatSpecifier {
        return this._formatSpecifier;
    }

    // ---------------- DataHost Interface ----------------
    getSymbolRef(container: RefContainer, name: string, _forWrite?: boolean): ScvdBase | undefined {
        const symbol = container.base.getSymbol?.(name);
        return symbol;
    }

    getMemberRef(container: RefContainer, property: string, _forWrite?: boolean): ScvdBase | undefined {
        const base = container.current;
        return base?.getMember(property);
    }

    // Optional helper used by the evaluator
    // Returns the byte width of a ref (scalars, structs, arrays – host-defined).
    // getTargetSize, getTypeSize, getVirtualSize
    async getByteWidth(ref: ScvdBase): Promise<number | undefined> {
        const isPointer = ref.getIsPointer();
        if(isPointer) {
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
    getElementStride(ref: ScvdBase): number {
        const isPointer = ref.getIsPointer();
        if(isPointer) {
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

    async getMemberOffset(_base: ScvdBase, member: ScvdBase): Promise<number | undefined> {
        const offset = await member.getMemberOffset();
        console.log(`${member.getLineNoStr()}: getMemberOffset: parent=${member.parent?.getDisplayLabel()} member=${member.getDisplayLabel()} offset=${offset}`);
        return offset;
    }

    async getValueType(container: RefContainer): Promise<string | ScalarType | undefined> {
        const base = container.current;
        const type = base?.getValueType();
        if (type !== undefined) {
            return type;
        }
        return undefined;
    }

    /* ---------------- Read/Write via caches ---------------- */
    readValue(container: RefContainer): EvalValue {
        try {
            const value = this.memHost.readValue(container);
            return value;
        } catch (e) {
            console.error(`ScvdEvalInterface.readValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        }
    }

    writeValue(container: RefContainer, value: EvalValue): EvalValue {
        try {
            this.memHost.writeValue(container, value);
            return value;
        } catch (e) {
            console.error(`ScvdEvalInterface.writeValue: exception for container with base=${container.base.getDisplayLabel()}: ${e}`);
            return undefined;
        }
    }

    /* ---------------- Intrinsics ---------------- */

    async __FindSymbol(symbolName: string): Promise<number | undefined> {
        if (typeof symbolName === 'string') {
            const symbolAddress = await this.debugTarget.findSymbolAddress(symbolName);
            return symbolAddress;
        }
        return undefined;
    }

    __GetRegVal(regName: string): number | undefined {
        return this.registerCache.read(regName); // read from register cache
    }

    async __Symbol_exists(symbol: string): Promise<number | undefined> {
        return await this.debugTarget.findSymbolAddress(symbol) ? 1 : 0;
    }

    /* Returns
    A packed 32-bit integer value that indicates memory usage in bytes, in percent, and memory overflow:
    Bit 0..19 Used memory in Bytes (how many bytes of FillPattern are overwritten)
    Bit 20..28 Used memory in percent (how many percent of FillPattern are overwritten)
    Bit 31 Memory overflow (MagicValue is overwritten)
    */
    __CalcMemUsed(_args: number[]): number | undefined {
        const StackAddress: number = _args[0];
        const StackSize: number = _args[1];
        const FillPattern: number = _args[2];
        const MagicValue: number = _args[3];
        const memUsed = this.debugTarget.calculateMemoryUsage(
            StackAddress,
            StackSize,
            FillPattern,
            MagicValue
        );
        return memUsed;
    }

    __size_of(symbol: string): number | undefined {
        const arrayElements = this.debugTarget.getNumArrayElements(symbol);
        if (arrayElements != undefined) {
            return arrayElements;
        }
        return undefined;
    }

    async __Offset_of(container: RefContainer, typedefMember: string): Promise<number | undefined> {
        const memberRef = container.base.getMember(typedefMember);
        if (memberRef) {
            const offset = await memberRef.getMemberOffset();
            return offset;
        }
        return undefined;
    }

    async __Running(): Promise<number | undefined> {
        const isRunning = await this.debugTarget.getTargetIsRunning();
        return isRunning ? 1 : 0;
    }

    _count(container: RefContainer): number | undefined {
        const base = container.current;
        const name = base?.name;
        if (name !== undefined) {
            const count = this.memHost.getArrayElementCount(name);  // this works only for <readlist>, must add for <read>
            return count;
        }
        return undefined;
    }

    _addr(container: RefContainer): number | undefined {
        const base = container.current;
        const name = base?.name;
        const index = container.index ?? 0;
        if (name !== undefined) {
            const addr = this.memHost.getElementTargetBase(name, index);
            return addr;
        }
        return undefined;
    }

    async formatPrintf(spec: FormatSegment['spec'], value: EvalValue, container: RefContainer): Promise<string | undefined> {
        const base = container.current;

        switch (spec) {
            case 'd': {
                return typeof value === 'number' ? this.formatSpecifier.format_d(value) : '';
            }
            case 'u': {
                return typeof value === 'number' ? this.formatSpecifier.format_u(value) : '';
            }
            case 't': {
                return typeof value === 'number' ? this.formatSpecifier.format_t(value) : '';
            }
            case 'x': {
                return typeof value === 'number' ? this.formatSpecifier.format_x(value) : '';
            }
            case 'C': { // Address value as symbolic name with file context, if fails in hexadecimal format
                const addr = typeof value === 'number' ? value : undefined;
                if(addr === undefined) {
                    return '';
                }
                const name = await this.debugTarget.findSymbolNameAtAddress(addr);
                return this.formatSpecifier.format_C(name ?? addr);
            }
            case 'S': { // Address value as symbolic name, if fails in hexadecimal format
                const addr = typeof value === 'number' ? value : undefined;
                if(addr === undefined) {
                    return '';
                }
                const name = await this.debugTarget.findSymbolNameAtAddress(addr);
                return this.formatSpecifier.format_S(name ?? addr);
            }
            case 'E': { // Symbolic enumerator value, if fails in decimal format
                const memberItem = base?.castToDerived(ScvdMember);
                const enumItem = typeof value === 'number' ? await memberItem?.getEnum(value) : undefined;
                const enumStr = await enumItem?.getGuiName();
                const fallback = (typeof value === 'number' || typeof value === 'string') ? value : '';
                return this.formatSpecifier.format_E(enumStr ?? fallback);
            }
            case 'I': {
                return typeof value === 'number' ? this.formatSpecifier.format_I(value) : '';
            }
            case 'J': {
                return typeof value === 'number' ? this.formatSpecifier.format_J(value) : '';
            }
            case 'N': {
                if(typeof value === 'number' && Number.isInteger(value)) {
                    const bytesPerChar = 1;
                    const data = await this.debugTarget.readUint8ArrayStrFromPointer(value, bytesPerChar, 260-4);
                    if(data !== undefined) {
                        return this.formatSpecifier.format_N(data);
                    }
                } else if(value instanceof Uint8Array) {
                    return this.formatSpecifier.format_N(value);
                }
                return '';
            }
            case 'M': {
                if (typeof value === 'number' || typeof value === 'string') {
                    return this.formatSpecifier.format_M(value);
                }
                return '';
            }
            case 'T': {
                return typeof value === 'number' ? this.formatSpecifier.format_T(value) : '';
            }
            case 'U': {
                if(typeof value === 'number' && Number.isInteger(value)) {
                    const bytesPerChar = 2;
                    const data = await this.debugTarget.readUint8ArrayStrFromPointer(value, bytesPerChar, 260-4);
                    if(data !== undefined) {
                        return this.formatSpecifier.format_U(data);
                    }
                } else if(value instanceof Uint8Array) {
                    return this.formatSpecifier.format_U(value);
                }
                return '';
            }
            case '%': {
                return this.formatSpecifier.format_percent();
            }
            default: {
                return 'unknown format specifier';
            }
        }
    }
}
