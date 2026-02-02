/**
 * Copyright 2025-2026 Arm Limited
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

import { ComponentViewerTargetAccess } from './component-viewer-target-access';
import { perfEnd, perfStart } from './perf-stats';
import { TargetReadCache } from './target-read-cache';
import { TargetReadCacheStats, TargetReadStats } from './target-read-stats';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';
import { GDBTargetDebugTracker } from '../../debug-session';

const REGISTER_GDB_ENTRIES: Array<[string, string]> = [
    // Core
    ['R0', 'r0'], ['R1', 'r1'], ['R2', 'r2'], ['R3', 'r3'],
    ['R4', 'r4'], ['R5', 'r5'], ['R6', 'r6'], ['R7', 'r7'],
    ['R8', 'r8'], ['R9', 'r9'], ['R10', 'r10'], ['R11', 'r11'],
    ['R12', 'r12'], ['R13', 'r13'], ['R14', 'r14'], ['R15', 'r15'],
    ['PSP', 'psp'], ['MSP', 'msp'], ['XPSR', 'xpsr'], ['PRIMASK', 'primask'],
    ['BASEPRI', 'basepri'], ['FAULTMASK', 'faultmask'], ['CONTROL', 'control'],

    // Armv8-M Secure/Non-secure additions
    ['MSP_NS', 'msp_ns'], ['PSP_NS', 'psp_ns'], ['MSP_S', 'msp_s'], ['PSP_S', 'psp_s'],
    ['MSPLIM_S', 'msplim_s'], ['PSPLIM_S', 'psplim_s'], ['MSPLIM_NS', 'msplim_ns'], ['PSPLIM_NS', 'psplim_ns'],
    ['SYSREGS_S', 'sysregs_s'], ['SYSREGS_NS', 'sysregs_ns'], ['SECURITY', 'security'],
    ['PRIMASK_S', 'primask_s'], ['BASEPRI_S', 'basepri_s'], ['FAULTMASK_S', 'faultmask_s'], ['CONTROL_S', 'control_s'],
    ['PRIMASK_NS', 'primask_ns'], ['BASEPRI_NS', 'basepri_ns'], ['FAULTMASK_NS', 'faultmask_ns'], ['CONTROL_NS', 'control_ns'],
];

// Full mapping of register names to the GDB names used when requesting them.
const REGISTER_GDB_MAP = new Map<string, string>(REGISTER_GDB_ENTRIES);

function normalize(name: string): string {
    return name.trim().toUpperCase();
}

function toUint32(value: number | bigint): number | bigint {
    if (typeof value === 'bigint') {
        return value & 0xFFFFFFFFn;
    }
    return value >>> 0;
}

function isLikelyBase64(data: string): boolean {
    const trimmed = data.trim();
    if (trimmed.length === 0 || trimmed.length % 4 === 1) {
        return false;
    }
    if (/[^A-Za-z0-9+/=]/.test(trimmed)) {
        return false;
    }
    return true;
}

export function gdbNameFor(name: string): string | undefined {
    return REGISTER_GDB_MAP.get(normalize(name));
}

export interface MemberInfo {
    name: string;
    size: number;
    offset: number;
}

export interface SymbolInfo {
    name: string;
    address: number;
    size?: number;
    member?: MemberInfo[];
}

export interface ReadMemoryRequest {
    key: string;
    address: number | bigint;
    size: number;
}

export class ScvdDebugTarget {
    private activeSession: GDBTargetDebugSession | undefined;
    private targetAccess = new ComponentViewerTargetAccess();
    private debugTracker: GDBTargetDebugTracker | undefined;
    private isTargetRunning: boolean = false;
    private symbolAddressCache = new Map<string, number>();
    private symbolSizeCache = new Map<string, number>();
    private symbolArrayCountCache = new Map<string, number>();
    private static readonly MAX_BATCH_BYTES = 4096;
    private static readonly MAX_BATCH_GAP_BYTES = 0;
    private static readonly TIMING_ENABLED = true;
    private static readonly TARGET_READ_CACHE_ENABLED = true;
    private targetReadCache = new TargetReadCache();
    private targetReadStats = new TargetReadStats();
    private readStats = {
        count: 0,
        totalMs: 0,
        totalBytes: 0,
        maxMs: 0,
    };

    // -------------  Interface to debugger  -----------------
    public init(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): void {
        this.activeSession = session;
        this.targetAccess.setActiveSession(session);
        this.debugTracker = tracker;
        this.subscribeToTargetRunningState(this.debugTracker);
        this.clearSymbolCaches();
    }

    private normalizeSymbolKey(symbol: string): string {
        return symbol.trim();
    }

    private clearSymbolCaches(): void {
        this.symbolAddressCache.clear();
        this.symbolSizeCache.clear();
        this.symbolArrayCountCache.clear();
    }

    public async beginUpdateCycle(): Promise<void> {
        this.targetReadStats.reset();
        if (!ScvdDebugTarget.TARGET_READ_CACHE_ENABLED) {
            return;
        }
        await this.targetReadCache.beginUpdateCycle(
            (addr, length) => this.readMemoryFromTarget(addr, length),
            this.targetReadStats
        );
    }

    protected subscribeToTargetRunningState(debugTracker: GDBTargetDebugTracker): void {
        debugTracker.onContinued((event) => {
            if (!this.activeSession || event.session.session.id !== this.activeSession.session.id) {
                return;
            }
            this.isTargetRunning = true;
        });

        debugTracker.onStopped((event) => {
            if (!this.activeSession || event.session.session.id !== this.activeSession.session.id) {
                return;
            }
            this.isTargetRunning = false;
        });
    }

    public async getSymbolInfo(symbol: string): Promise<SymbolInfo | undefined> {
        if (symbol === undefined) {
            return undefined;
        }
        if (!this.activeSession) {
            return undefined;
        }

        const symbolName = this.normalizeSymbolKey(symbol);
        const cachedAddress = this.symbolAddressCache.get(symbolName);
        if (cachedAddress !== undefined) {
            return {
                name: symbolName,
                address: cachedAddress
            };
        }

        const symbolAddressStr = await this.targetAccess.evaluateSymbolAddress(symbolName);
        if (symbolAddressStr !== undefined) {
            const addr = parseInt(symbolAddressStr as unknown as string, 16);
            if (Number.isFinite(addr)) {
                this.symbolAddressCache.set(symbolName, addr);
                const symbolInfo: SymbolInfo = {
                    name: symbolName,
                    address: addr
                };
                return symbolInfo;
            }
            console.error(`getSymbolInfo: could not parse address for ${symbolName}:`, symbolAddressStr);
        }
        return undefined;
    }

    public async findSymbolNameAtAddress(address: number): Promise<string | undefined> {
        if (!this.activeSession) {
            return Promise.resolve(undefined);
        }

        try {
            return this.targetAccess.evaluateSymbolName(address.toString());
        } catch (error: unknown) {
            console.error(`findSymbolNameAtAddress failed for ${address}:`, error);
            return undefined;
        }
    }

    public async findSymbolContextAtAddress(address: number | bigint): Promise<string | undefined> {
        // Return file/line context for an address when the adapter supports it.
        if (!this.activeSession) {
            return Promise.resolve(undefined);
        }

        try {
            return this.targetAccess.evaluateSymbolContext(address.toString());
        } catch (error: unknown) {
            console.error(`findSymbolContextAtAddress failed for ${address}:`, error);
            return undefined;
        }
    }

    public async getNumArrayElements(symbol: string): Promise<number | undefined> {
        if (symbol === undefined) {
            return undefined;
        }
        // No active session: return undefined.
        if (!this.activeSession) {
            return undefined;
        }
        const symbolName = this.normalizeSymbolKey(symbol);
        const cachedCount = this.symbolArrayCountCache.get(symbolName);
        if (cachedCount !== undefined) {
            return cachedCount;
        }
        const count = await this.targetAccess.evaluateNumberOfArrayElements(symbolName);
        if (count !== undefined) {
            this.symbolArrayCountCache.set(symbolName, count);
        }
        return count;
    }

    public getTargetIsRunning(): boolean {
        if (!this.activeSession) {
            return false;
        }
        return this.isTargetRunning;
    }

    public async findSymbolAddress(symbol: string): Promise<number | undefined> {
        const symbolInfo = await this.getSymbolInfo(symbol);
        return symbolInfo?.address;
    }

    public async getSymbolSize(symbol: string): Promise<number | undefined> {
        if (!symbol) {
            return undefined;
        }
        if (!this.activeSession) {
            return undefined;
        }

        const symbolName = this.normalizeSymbolKey(symbol);
        const cachedSize = this.symbolSizeCache.get(symbolName);
        if (cachedSize !== undefined) {
            return cachedSize;
        }

        // real session: ask debugger via target access
        const size = await this.targetAccess.evaluateSymbolSize(symbolName);
        if (typeof size === 'number' && size >= 0) {
            this.symbolSizeCache.set(symbolName, size);
            return size;
        }
        return undefined;
    }

    /**
     * Decode a (possibly unpadded) base64 string from GDB into bytes.
     */
    public decodeGdbData(data: string): Uint8Array | undefined {
        // Fix missing padding: base64 length must be a multiple of 4
        const padLength = (4 - (data.length % 4)) % 4;
        const padded = data + '='.repeat(padLength);

        // Node.js or environments with Buffer
        if (typeof Buffer !== 'undefined') {
            return Uint8Array.from(Buffer.from(padded, 'base64'));
        }

        // Browser / Deno / modern runtimes with atob
        if (typeof atob === 'function') {
            const binary = atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                // eslint-disable-next-line security/detect-object-injection -- false positive: safe indexed copy from string to typed array
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return bytes;
        }

        console.error('ScvdDebugTarget.decodeGdbData: no base64 decoder available in this environment');
        return undefined;
    }

    public async readMemory(address: number | bigint, size: number): Promise<Uint8Array | undefined> {
        const normalized = this.normalizeAddress(address);
        if (ScvdDebugTarget.TARGET_READ_CACHE_ENABLED && normalized !== undefined) {
            this.targetReadStats.recordRequest();
            this.targetReadCache.recordRequestRange(normalized, size);
            const hitStart = perfStart();
            const cached = this.targetReadCache.read(normalized, size);
            if (cached) {
                perfEnd(hitStart, 'targetReadCacheHitMs', 'targetReadCacheHitCalls');
                return cached;
            }
            const missStart = perfStart();
            const missing = this.targetReadCache.getMissingRanges(normalized, size);
            for (const range of missing) {
                const data = await this.readMemoryFromTarget(range.start, range.size);
                if (!data) {
                    perfEnd(missStart, 'targetReadCacheMissMs', 'targetReadCacheMissCalls');
                    return undefined;
                }
                this.targetReadStats.recordMissRead();
                this.targetReadCache.write(range.start, data);
            }
            const filled = this.targetReadCache.read(normalized, size);
            perfEnd(missStart, 'targetReadCacheMissMs', 'targetReadCacheMissCalls');
            return filled;
        }
        return this.readMemoryFromTarget(address, size);
    }

    private async readMemoryFromTarget(address: number | bigint, size: number): Promise<Uint8Array | undefined> {
        if (!this.activeSession) {
            return undefined;
        }

        const perfStartTime = perfStart();
        const timingStart = ScvdDebugTarget.TIMING_ENABLED ? Date.now() : 0;
        const dataAsString = await this.targetAccess.evaluateMemory(address.toString(), size, 0);
        if (typeof dataAsString !== 'string') {
            perfEnd(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        // if data is returned as error message string
        if (dataAsString.startsWith('Unable')) {
            perfEnd(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        if (!isLikelyBase64(dataAsString)) {
            console.error(`ScvdDebugTarget.readMemory: invalid base64 data for address ${address.toString()}`);
            perfEnd(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        // Convert String data to Uint8Array
        const byteArray = this.decodeGdbData(dataAsString);
        if (byteArray === undefined) {
            perfEnd(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }

        const result = byteArray.length === size ? byteArray : undefined;
        if (ScvdDebugTarget.TIMING_ENABLED) {
            const elapsed = Date.now() - timingStart;
            this.readStats.count += 1;
            this.readStats.totalMs += elapsed;
            this.readStats.totalBytes += size;
            this.readStats.maxMs = Math.max(this.readStats.maxMs, elapsed);
            // Aggregate stats are reported after statement execution; avoid per-read logging.
        }
        perfEnd(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
        return result;
    }

    public async readMemoryBatch(requests: ReadMemoryRequest[]): Promise<Map<string, Uint8Array | undefined>> {
        const results = new Map<string, Uint8Array | undefined>();
        if (requests.length === 0) {
            return results;
        }
        if (requests.length === 1) {
            const req = requests[0];
            const data = req.size > 0 ? await this.readMemory(req.address, req.size) : undefined;
            results.set(req.key, data);
            return results;
        }
        if (!this.activeSession) {
            for (const req of requests) {
                results.set(req.key, undefined);
            }
            return results;
        }

        const toBigInt = (addr: number | bigint): bigint => typeof addr === 'bigint' ? addr : BigInt(addr >>> 0);

        const normalized = requests
            .filter(req => req.size > 0)
            .map(req => ({
                req,
                start: toBigInt(req.address),
                size: req.size,
            }))
            .sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0));

        type Range = { start: bigint; size: number; items: typeof normalized };
        const ranges: Range[] = [];

        for (const item of normalized) {
            const itemEnd = item.start + BigInt(item.size);
            const last = ranges[ranges.length - 1];
            if (!last) {
                ranges.push({ start: item.start, size: item.size, items: [item] });
                continue;
            }

            const lastEnd = last.start + BigInt(last.size);
            const gap = item.start - lastEnd;
            const gapOk = gap <= BigInt(ScvdDebugTarget.MAX_BATCH_GAP_BYTES) && gap >= 0n;
            const mergedEnd = itemEnd > lastEnd ? itemEnd : lastEnd;
            const mergedSize = Number(mergedEnd - last.start);

            if (gapOk && mergedSize <= ScvdDebugTarget.MAX_BATCH_BYTES) {
                last.size = mergedSize;
                last.items.push(item);
            } else {
                ranges.push({ start: item.start, size: item.size, items: [item] });
            }
        }

        for (const range of ranges) {
            const data = await this.readMemory(range.start, range.size);
            for (const item of range.items) {
                if (!data) {
                    results.set(item.req.key, undefined);
                    continue;
                }
                const offset = Number(item.start - range.start);
                if (!Number.isSafeInteger(offset) || offset < 0 || offset + item.size > data.length) {
                    results.set(item.req.key, undefined);
                    continue;
                }
                results.set(item.req.key, data.subarray(offset, offset + item.size));
            }
        }

        return results;
    }

    public resetReadStats(): void {
        this.readStats = {
            count: 0,
            totalMs: 0,
            totalBytes: 0,
            maxMs: 0,
        };
    }

    public getReadStats(): { count: number; totalMs: number; totalBytes: number; maxMs: number } {
        return { ...this.readStats };
    }

    public getTargetReadCacheStats(): TargetReadCacheStats {
        return this.targetReadStats.getStats();
    }

    public readUint8ArrayStrFromPointer(address: number | bigint, bytesPerChar: number, maxLength: number): Promise<Uint8Array | undefined> {
        if (address === 0 || address === 0n) {
            return Promise.resolve(undefined);
        }
        return this.readMemory(address, maxLength * bytesPerChar);
    }

    public async calculateMemoryUsage(startAddress: number, size: number, FillPattern: number, MagicValue: number): Promise<number | undefined> {
        const memData = await this.readMemory(startAddress, size);
        if (memData !== undefined) {
            let usedBytes = 0;
            const fillPatternBytes = new Uint8Array(4);
            const magicValueBytes = new Uint8Array(4);
            // Use FillPattern for the fill pattern bytes (little-endian)
            fillPatternBytes[0] = (FillPattern & 0xFF);
            fillPatternBytes[1] = (FillPattern >> 8) & 0xFF;
            fillPatternBytes[2] = (FillPattern >> 16) & 0xFF;
            fillPatternBytes[3] = (FillPattern >> 24) & 0xFF;
            // Use MagicValue for the magic value bytes (little-endian)
            magicValueBytes[0] = (MagicValue & 0xFF);
            magicValueBytes[1] = (MagicValue >> 8) & 0xFF;
            magicValueBytes[2] = (MagicValue >> 16) & 0xFF;
            magicValueBytes[3] = (MagicValue >> 24) & 0xFF;

            for (let i = 0; i < memData.length; i += 4) {
                const chunk = memData.subarray(i, i + 4);
                const matchesFill = chunk.every((byte, idx) => byte === fillPatternBytes.at(idx));
                const matchesMagic = matchesFill || chunk.every((byte, idx) => byte === magicValueBytes.at(idx));
                if (!matchesMagic) {
                    usedBytes += chunk.length;
                }
            }

            const usedPercent = Math.floor((usedBytes / size) * 100) & 0x1FF;
            let result = usedBytes & 0xFFFFF; // bits 0..19
            result |= (usedPercent << 20); // bits 20..28

            // Check for overflow (MagicValue overwritten)
            let overflow = true;
            const tailStart = Math.max(0, memData.length - 4);
            for (let i = tailStart; i < memData.length; i++) {
                const expected = magicValueBytes.at(i - tailStart);
                if (memData.at(i) !== expected) {
                    overflow = false;
                    break;
                }
            }
            if (overflow) {
                result |= (1 << 31); // set overflow bit
            }

            return result;
        }

        return undefined;
    }


    public async readRegister(name: string): Promise<number | bigint | undefined> {
        if (name === undefined) {
            return undefined;
        }

        const gdbName = gdbNameFor(name);
        if (gdbName === undefined) {
            console.error(`ScvdDebugTarget: readRegister: could not find GDB name for register: ${name}`);
            return undefined;
        }
        // Read register value via target access
        const value = await this.targetAccess.evaluateRegisterValue(gdbName);
        if (value === undefined) {
            return undefined;
        }
        // Convert to number or bigint and return as uint32
        const numericValue = Number(value);
        return toUint32(numericValue);
    }

    private normalizeAddress(address: number | bigint): number | undefined {
        if (typeof address === 'bigint') {
            if (address < 0n || address > BigInt(Number.MAX_SAFE_INTEGER)) {
                return undefined;
            }
            return Number(address);
        }
        if (!Number.isFinite(address) || address < 0 || !Number.isSafeInteger(address)) {
            return undefined;
        }
        return address;
    }
}

// Test-only helpers
export const __test__ = { toUint32 };
