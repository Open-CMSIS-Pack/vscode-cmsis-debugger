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
import { perf, targetReadStats, targetReadTimingStats } from './stats-config';
import { TARGET_READ_CACHE_ENABLED } from './component-viewer-config';
import { MAX_BATCH_BYTES, MAX_BATCH_GAP_BYTES, TargetReadCache } from './target-read-cache';
import { SymbolCaches } from './scvd-debug-target-cache';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';
import { GDBTargetDebugTracker } from '../../debug-session';
import { componentViewerLogger } from '../../logger';

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
    private symbolCaches = new SymbolCaches();
    private targetReadCache: TargetReadCache | undefined = TARGET_READ_CACHE_ENABLED ? new TargetReadCache() : undefined;

    // -------------  Interface to debugger  -----------------
    public init(session: GDBTargetDebugSession, tracker: GDBTargetDebugTracker): void {
        this.activeSession = session;
        this.targetAccess.setActiveSession(session);
        this.debugTracker = tracker;
        this.subscribeToTargetRunningState(this.debugTracker);
        this.symbolCaches.clearAll();
    }

    public setActiveSession(session: GDBTargetDebugSession): void {
        this.activeSession = session;
        this.targetAccess.setActiveSession(session);
    }

    public async beginUpdateCycle(): Promise<void> {
        targetReadStats?.reset();
        const targetReadCache = this.targetReadCache;
        if (!TARGET_READ_CACHE_ENABLED || !targetReadCache) {
            return;
        }
        await targetReadCache.beginUpdateCycle(
            (addr, length) => this.readMemoryFromTarget(addr, length),
            targetReadStats
        );
    }

    protected async subscribeToTargetRunningState(debugTracker: GDBTargetDebugTracker): Promise<void> {
        debugTracker.onContinued(async (event) => {
            if (!this.activeSession || event.session.session.id !== this.activeSession.session.id) {
                return;
            }
            this.isTargetRunning = true;
        });

        debugTracker.onStopped(async (event) => {
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

        const addressInfo = await this.symbolCaches.getAddressWithName(symbol, async (symbolName) => {
            const symbolAddressStr = await this.targetAccess.evaluateSymbolAddress(symbolName);
            if (symbolAddressStr !== undefined) {
                const parsed = parseInt(symbolAddressStr as unknown as string, 16);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
                componentViewerLogger.error(`getSymbolInfo: could not parse address for ${symbolName}:`, symbolAddressStr);
            }
            return undefined;
        });

        if (!addressInfo) {
            return undefined;
        }

        return {
            name: addressInfo.name,
            address: addressInfo.value
        };
    }

    public async findSymbolNameAtAddress(address: number): Promise<string | undefined> {
        if (!this.activeSession) {
            return Promise.resolve(undefined);
        }

        try {
            return await this.targetAccess.evaluateSymbolName(address.toString());
        } catch (error: unknown) {
            componentViewerLogger.error(`findSymbolNameAtAddress failed for ${address}:`, error);
            return undefined;
        }
    }

    public async findSymbolContextAtAddress(address: number | bigint): Promise<string | undefined> {
        // Return file/line context for an address when the adapter supports it.
        if (!this.activeSession) {
            return Promise.resolve(undefined);
        }

        try {
            return await this.targetAccess.evaluateSymbolContext(address.toString());
        } catch (error: unknown) {
            componentViewerLogger.error(`findSymbolContextAtAddress failed for ${address}:`, error);
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
        return this.symbolCaches.getArrayCount(symbol, async (symbolName) => {
            return this.targetAccess.evaluateNumberOfArrayElements(symbolName);
        });
    }

    public async getTargetIsRunning(): Promise<boolean> {
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

        return this.symbolCaches.getSize(symbol, async (symbolName) => {
            const size = await this.targetAccess.evaluateSymbolSize(symbolName);
            if (typeof size === 'number' && size >= 0) {
                return size;
            }
            return undefined;
        });
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

        componentViewerLogger.error('ScvdDebugTarget.decodeGdbData: no base64 decoder available in this environment');
        return undefined;
    }

    public async readMemory(address: number | bigint, size: number): Promise<Uint8Array | undefined> {
        const normalized = this.normalizeAddress(address);
        const targetReadCache = this.targetReadCache;
        if (TARGET_READ_CACHE_ENABLED && normalized !== undefined && targetReadCache) {
            targetReadStats?.recordRequest();
            targetReadCache.recordRequestRange(normalized, size);
            const hitStart = perf?.start() ?? 0;
            const cached = targetReadCache.read(normalized, size);
            if (cached) {
                perf?.end(hitStart, 'targetReadCacheHitMs', 'targetReadCacheHitCalls');
                return cached;
            }
            const missStart = perf?.start() ?? 0;
            const missing = targetReadCache.getMissingRanges(normalized, size);
            for (const range of missing) {
                const data = await this.readMemoryFromTarget(range.start, range.size);
                if (!data) {
                    perf?.end(missStart, 'targetReadCacheMissMs', 'targetReadCacheMissCalls');
                    return undefined;
                }
                targetReadStats?.recordMissRead();
                targetReadCache.write(range.start, data);
            }
            const filled = targetReadCache.read(normalized, size);
            perf?.end(missStart, 'targetReadCacheMissMs', 'targetReadCacheMissCalls');
            return filled;
        }
        return this.readMemoryFromTarget(address, size);
    }

    private async readMemoryFromTarget(address: number | bigint, size: number): Promise<Uint8Array | undefined> {
        if (!this.activeSession) {
            return undefined;
        }

        const perfStartTime = perf?.start() ?? 0;
        const timingStart = perf?.isBackendEnabled() ? Date.now() : 0;
        const dataAsString = await this.targetAccess.evaluateMemory(address.toString(), size, 0);
        if (typeof dataAsString !== 'string') {
            perf?.end(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        // if data is returned as error message string
        if (dataAsString.startsWith('Unable')) {
            perf?.end(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        if (!isLikelyBase64(dataAsString)) {
            componentViewerLogger.error(`ScvdDebugTarget.readMemory: invalid base64 data for address ${address.toString()}`);
            perf?.end(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }
        // Convert String data to Uint8Array
        const byteArray = this.decodeGdbData(dataAsString);
        if (byteArray === undefined) {
            perf?.end(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
            return undefined;
        }

        const result = byteArray.length === size ? byteArray : undefined;
        if (timingStart !== 0) {
            const elapsed = Date.now() - timingStart;
            targetReadTimingStats?.recordRead(elapsed, size);
            // Aggregate stats are reported after statement execution; avoid per-read logging.
        }
        perf?.end(perfStartTime, 'targetReadFromTargetMs', 'targetReadFromTargetCalls');
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
            const gapOk = gap <= BigInt(MAX_BATCH_GAP_BYTES) && gap >= 0n;
            const mergedEnd = itemEnd > lastEnd ? itemEnd : lastEnd;
            const mergedSize = Number(mergedEnd - last.start);

            if (gapOk && mergedSize <= MAX_BATCH_BYTES) {
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


    public readUint8ArrayStrFromPointer(address: number | bigint, bytesPerChar: number, maxLength: number): Promise<Uint8Array | undefined> {
        if (address === 0 || address === 0n) {
            return Promise.resolve(undefined);
        }
        return this.readMemory(address, maxLength * bytesPerChar);
    }

    private normalizeCalcMemUsedArgs(
        stackAddress: number,
        stackSize: number,
        fillPattern: number,
        magicValue: number
    ): { addr: number; size: number; fill: number; magic: number } {
        const toUint32 = (value: number): number => (Number.isFinite(value) ? (value >>> 0) : 0);
        return {
            addr: toUint32(stackAddress),
            size: toUint32(stackSize),
            fill: toUint32(fillPattern),
            magic: toUint32(magicValue),
        };
    }

    public async calculateMemoryUsage(startAddress: number, size: number, FillPattern: number, MagicValue: number): Promise<number | undefined> {
        const normalized = this.normalizeCalcMemUsedArgs(startAddress, size, FillPattern, MagicValue);
        if (normalized.addr === 0 || normalized.size === 0) {
            return 0;
        }
        const memData = await this.readMemory(normalized.addr, normalized.size);
        if (memData === undefined || memData.length < normalized.size) {
            return undefined;
        }

        const k = Math.floor(normalized.size / 4); // number of u32 words
        if (k <= 0) {
            return 0;
        }

        const view = new DataView(memData.buffer, memData.byteOffset, memData.byteLength);
        const readWord = (index: number): number => view.getUint32(index * 4, true);
        const word0 = readWord(0);
        const fill = normalized.fill;
        const magic = normalized.magic;

        let n = 0;
        if (word0 === magic) {
            n = 1; // aStk[0] := MAGIC pattern for overflow check.
            for (; n < k; n += 1) {
                if (readWord(n) !== fill) {
                    break;
                }
            }
        }

        const usedWords = k - n;
        const usedBytes = usedWords * 4;
        const usedPercent = Math.trunc((usedWords * 100) / k);

        let result = (usedBytes & 0xFFFFF) | ((usedPercent & 0xFF) << 20);
        if (fill !== magic && word0 !== magic) {
            result |= (1 << 31); // overflow indicator
        }

        return result >>> 0;
    }


    public async readRegister(name: string): Promise<number | bigint | undefined> {
        if (name === undefined) {
            return undefined;
        }

        const gdbName = gdbNameFor(name);
        if (gdbName === undefined) {
            componentViewerLogger.error(`ScvdDebugTarget: readRegister: could not find GDB name for register: ${name}`);
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
