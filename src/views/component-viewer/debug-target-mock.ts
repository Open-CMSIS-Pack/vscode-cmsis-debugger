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

import { MemberInfo, SymbolInfo } from './scvd-debug-target';

/* Mock data
 * Stack: https://arm-software.github.io/CMSIS-View/main/elem_readlist.html
 */
export const ADDR = {
    Stack: {
        TStack: 0x20001000,                   // pick any free RAM slot
    },
    RTOS: {
        OsRtxInfo:   0x20003000,
        OsRtxConfig: 0x20004000,

        Str: {
            KernelId: 0x200060A0,             // mock location for "RTX V5.5.4"
        },
    },
    MyList: {
        // Globals
        ValueC:     0x20005100,
        ValueB:     0x20005120,
        ValueA:     0x20005140,
        ListStart:  0x20005140,   // holds pointer to ValueA
        ValueArray: 0x20005200,   // 3 x MyList (12 bytes each) => 36 bytes
        pArray:     0x20005000,   // 5 pointers (20 bytes)

        // Strings
        Str: {
            ListValueC: 0x20006000,
            ListValueB: 0x20006020,
            ListValueA: 0x20006040,
            V0:         0x20006060,
            V1:         0x20006070,
            V2:         0x20006080,
        }
    },
    // Additional global string variables
    Strings: {
        string:  0x20006100,      // volatile char string[10]  = "MyTest";
        wString: 0x20006120,      // unsigned short wString[15] = L"USB_MSC1";
    },
} as const;

/**
 * Global mock configuration: all *data* used by the mock lives here.
 */
export const MOCK = {
    Stack: {
        wordSizeBytes: 4,
        TStack: {
            totalBytes: 200,
            fillPattern: 0x8A,
            sentinel: 0xE25A2EA5 >>> 0,
            initFromWord: 10,   // for (i = 49; i >= 10; i--) tstack[i] = i;
        },
    },

    RTOS: {
        // From CMSIS-RTX rtx_os.h:
        //   #define osRtxKernelId      "RTX V5.5.4"
        //   #define osRtxVersionKernel 50050004
        OsRtxInfo: {
            kernelId:       'RTX V5.5.4',
            versionKernel:  50050004,
            osIdPtr:        ADDR.RTOS.Str.KernelId,   // os_id is a pointer to the string
        },
        OsRtxConfig: {
            flags:    0x0000000F,
            tickFreq: 1000,
        },
    },

    MyList: {
        structSize: 12,
        fieldOffsets: {
            next:  0,
            value: 4,
            name:  8,
        } as const,

        // Node layout used for ValueA/B/C globals
        Nodes: {
            ValueC: {
                next:  0,
                value: 0xcccccccc,
                name:  ADDR.MyList.Str.ListValueC,
            },
            ValueB: {
                next:  ADDR.MyList.ValueC,
                value: 0xbbbbbbbb,
                name:  ADDR.MyList.Str.ListValueB,
            },
            ValueA: {
                next:  ADDR.MyList.ValueB,
                value: 0xaaaaaaaa,
                name:  ADDR.MyList.Str.ListValueA,
            },
        },

        // Global pointer to head of list
        ListStart: ADDR.MyList.ValueA,

        // Text for the string storage at ADDR.MyList.Str.*
        Strings: {
            ListValueC: 'List Value C',
            ListValueB: 'List Value B',
            ListValueA: 'List Value A',
            V0: 'Value[0]',
            V1: 'Value[1]',
            V2: 'Value[2]',
        },

        // 3 x MyList structs stored starting at ADDR.MyList.ValueArray
        ValueArray: [
            { next: 0, value: 0x1d, name: ADDR.MyList.Str.V0 },
            { next: 0, value: 0x1e, name: ADDR.MyList.Str.V1 },
            { next: 0, value: 0x1f, name: ADDR.MyList.Str.V2 },
        ],

        // 5 pointers at ADDR.MyList.pArray
        pArray: [
            ADDR.MyList.ValueA,
            ADDR.MyList.ValueB,
            ADDR.MyList.ValueC,
            ADDR.MyList.ValueArray + 12 * 0,
            ADDR.MyList.ValueArray + 12 * 1,
        ],
    },

    // Extra global string variables corresponding to:
    //   volatile char string[10] = "MyTest";
    //   unsigned short wString[15] = L"USB_MSC1";
    Strings: {
        string: {
            text:        'MyTest',
            lengthBytes: 10,
        },
        wString: {
            text:        'USB_MSC1',
            lengthChars: 15,   // 15 x unsigned short
        },
    },
} as const;

// ── Derived constants from global table ─────────────────────────────────────────

const STACK_BYTES        = MOCK.Stack.TStack.totalBytes;
const STACK_WORDS        = STACK_BYTES / MOCK.Stack.wordSizeBytes;
const PARRAY_BYTES       = MOCK.MyList.pArray.length * 4;

const STRING_LEN_BYTES   = MOCK.Strings.string.lengthBytes;
const WSTRING_LEN_CHARS  = MOCK.Strings.wString.lengthChars;
const WSTRING_LEN_BYTES  = WSTRING_LEN_CHARS * 2;

/** Map ASCII string addresses to their contents, driven entirely by ADDR + MOCK. */
const STRING_BY_ADDR = new Map<number, string>([
    // MyList strings
    [ADDR.MyList.Str.ListValueC, MOCK.MyList.Strings.ListValueC],
    [ADDR.MyList.Str.ListValueB, MOCK.MyList.Strings.ListValueB],
    [ADDR.MyList.Str.ListValueA, MOCK.MyList.Strings.ListValueA],
    [ADDR.MyList.Str.V0,         MOCK.MyList.Strings.V0],
    [ADDR.MyList.Str.V1,         MOCK.MyList.Strings.V1],
    [ADDR.MyList.Str.V2,         MOCK.MyList.Strings.V2],

    // RTOS kernel ID string
    [ADDR.RTOS.Str.KernelId,     MOCK.RTOS.OsRtxInfo.kernelId],

    // Global char string[10] = "MyTest"
    [ADDR.Strings.string,        MOCK.Strings.string.text],
]);

export class DebugTargetMock {

    constructor() {}

    public getMockStringData(address: number, bytesPerChar: number, maxLength: number): Uint8Array | undefined {
        const expr = `(${bytesPerChar ? 'wchar_t' : 'char'}*)${address.toString(16)}`;
        console.log(`Mock: read string from ${expr} (maxLength=${maxLength})`);
        return this.getMockMemoryData(address, maxLength);
    }

    // ============================================================================
    // Memory side: "what bytes live at each address?"
    // ============================================================================

    public getMockMemoryData(startAddress: number, size: number): Uint8Array | undefined {
        // --- RTOS fixtures -------------------------------------------------------
        if (startAddress === ADDR.RTOS.OsRtxInfo)   {
            return this.getMockOsRtxInfoData(size);
        }
        if (startAddress === ADDR.RTOS.OsRtxConfig) {
            return this.getMockOsRtxConfigData(size);
        }

        // --- Stack mock: support base reads and arbitrary sub-range/element reads -
        if (startAddress >= ADDR.Stack.TStack && startAddress < ADDR.Stack.TStack + STACK_BYTES) {
            const offset = startAddress - ADDR.Stack.TStack;
            return this.getMockTStackSlice(size, offset);
        }

        // --- MyList fixture: nodes and arrays ------------------------------------
        if (startAddress === ADDR.MyList.ValueC)     {
            return this.getMockMyListNode(size, 'ValueC');
        }
        if (startAddress === ADDR.MyList.ValueB)     {
            return this.getMockMyListNode(size, 'ValueB');
        }
        if (startAddress === ADDR.MyList.ValueA)     {
            return this.getMockMyListNode(size, 'ValueA');
        }
        if (startAddress === ADDR.MyList.ListStart)  {
            return this.getMockListStart(size);
        }
        if (startAddress === ADDR.MyList.ValueArray) {
            return this.getMockValueArray(size);
        }

        // Per-element reads (e.g., when dereferencing pArray[3] or pArray[4]):
        const elemSize = MOCK.MyList.structSize;
        if (startAddress === ADDR.MyList.ValueArray + elemSize * 0) {
            return this.getMockValueArrayElem(size, 0);
        }
        if (startAddress === ADDR.MyList.ValueArray + elemSize * 1) {
            return this.getMockValueArrayElem(size, 1);
        }
        if (startAddress === ADDR.MyList.ValueArray + elemSize * 2) {
            return this.getMockValueArrayElem(size, 2);
        }

        // pArray: 5 x pointer
        if (startAddress >= ADDR.MyList.pArray && startAddress < ADDR.MyList.pArray + PARRAY_BYTES) {
            const offset = startAddress - ADDR.MyList.pArray;
            return this.getMockPArraySlice(size, offset);
        }

        // --- Global wide string: unsigned short wString[15] = L"USB_MSC1" -------
        if (startAddress === ADDR.Strings.wString) {
            return this.makeU16CString(MOCK.Strings.wString.text, size);
        }

        // --- General ASCII string region (MyList + RTOS KernelId + string[10]) ---
        const str = STRING_BY_ADDR.get(startAddress);
        if (str !== undefined) {
            return this.makeCString(str, size);
        }

        return undefined;
    }

    // ============================================================================
    // Symbol side: "how should we interpret those bytes?"
    // ============================================================================

    public getMockSymbolInfo(symbol: string): SymbolInfo | undefined {
        // simple demo symbol
        if (symbol === 'mySymbol') {
            const symbolInfo: SymbolInfo = { name: symbol, address: 0x12345678, size: 4 * 1, member: [] };
            symbolInfo.member?.push(this.mockMemberInfo('A', 1, 4 + 0));
            symbolInfo.member?.push(this.mockMemberInfo('B', 1, 4 + 1));
            symbolInfo.member?.push(this.mockMemberInfo('C', 1, 4 + 2));
            symbolInfo.member?.push(this.mockMemberInfo('D', 1, 4 + 3));
            return symbolInfo;
        }

        // Stack as array
        if (symbol === 'tstack') {
            const s: SymbolInfo = {
                name: symbol,
                address: ADDR.Stack.TStack,
                size: STACK_BYTES,
                member: [],
            };
            for (let i = 0; i < STACK_WORDS; i++) {
                s.member?.push(this.mockMemberInfo(
                    `[${i}]`,
                    MOCK.Stack.wordSizeBytes,
                    i * MOCK.Stack.wordSizeBytes,
                ));
            }
            return s;
        }

        // RTOS globals
        if (symbol === 'osRtxInfo') {
            return {
                name: symbol,
                address: ADDR.RTOS.OsRtxInfo,
                size: 4 * 2, // os_id pointer + version
            };
        }
        if (symbol === 'osRtxConfig') {
            return {
                name: symbol,
                address: ADDR.RTOS.OsRtxConfig,
                size: 4 * 2,
            };
        }

        // MyList nodes
        if (symbol === 'ValueC') {
            return this.makeMyListSymbol(symbol, ADDR.MyList.ValueC);
        }
        if (symbol === 'ValueB') {
            return this.makeMyListSymbol(symbol, ADDR.MyList.ValueB);
        }
        if (symbol === 'ValueA') {
            return this.makeMyListSymbol(symbol, ADDR.MyList.ValueA);
        }

        // Pointer to head of list
        if (symbol === 'ListStart') {
            // global pointer variable: 4 bytes
            return { name: symbol, address: ADDR.MyList.ListStart, size: 4 };
        }

        // ValueArray (3 elements)
        if (symbol === 'ValueArray') {
            const elemSize  = MOCK.MyList.structSize;
            const elemCount = MOCK.MyList.ValueArray.length;
            const s: SymbolInfo = {
                name: symbol,
                address: ADDR.MyList.ValueArray,
                size: elemSize * elemCount,
                member: [],
            };
            for (let i = 0; i < elemCount; i++) {
                s.member?.push(this.mockMemberInfo(`[${i}]`, elemSize, i * elemSize));
            }
            return s;
        }

        // pArray (5 pointers)
        if (symbol === 'pArray') {
            const count = MOCK.MyList.pArray.length;
            const s: SymbolInfo = {
                name: symbol,
                address: ADDR.MyList.pArray,
                size: 4 * count,
                member: [],
            };
            for (let i = 0; i < count; i++) {
                s.member?.push(this.mockMemberInfo(`[${i}]`, 4, i * 4));
            }
            return s;
        }

        // char string[10] = "MyTest"
        if (symbol === 'string') {
            return {
                name: symbol,
                address: ADDR.Strings.string,
                size: STRING_LEN_BYTES,
            };
        }

        // unsigned short wString[15] = L"USB_MSC1"
        if (symbol === 'wString') {
            return {
                name: symbol,
                address: ADDR.Strings.wString,
                size: WSTRING_LEN_BYTES,
            };
        }

        return undefined;
    }

    // ============================================================================
    // RTOS helpers
    // ============================================================================

    public getMockOsRtxInfoData(size: number): Uint8Array {
        const data = new Uint8Array(size);
        data.fill(0);

        // os_id: pointer to kernel ID string
        if (size >= 4) {
            this.writeU32LE(data, 0, MOCK.RTOS.OsRtxInfo.osIdPtr >>> 0);
        }

        // version: osRtxVersionKernel (50050004)
        if (size >= 8) {
            this.writeU32LE(data, 4, MOCK.RTOS.OsRtxInfo.versionKernel >>> 0);
        }

        return data;
    }

    public getMockOsRtxConfigData(size: number): Uint8Array {
        const data = new Uint8Array(size);
        data.fill(0);

        const flags    = MOCK.RTOS.OsRtxConfig.flags;
        const tickFreq = MOCK.RTOS.OsRtxConfig.tickFreq;

        if (size >= 4) {
            this.writeU32LE(data, 0, flags);
        }
        if (size >= 8) {
            this.writeU32LE(data, 4, tickFreq);
        }
        return data;
    }

    // ============================================================================
    // Stack helpers
    // ============================================================================

    /** Slice of the tstack, honoring the C initialization. */
    private getMockTStackSlice(size: number, offset: number): Uint8Array {
        const out = new Uint8Array(size);
        const cfg = MOCK.Stack.TStack;

        out.fill(cfg.fillPattern & 0xFF);

        // Helper to write a u32 only if it is fully inside the requested window
        const tryWriteU32 = (globalByteOffset: number, value: number) => {
            const local = globalByteOffset - offset;
            if (local >= 0 && local + 4 <= size) {
                this.writeU32LE(out, local, value >>> 0);
            }
        };

        // tstack[0] = sentinel
        tryWriteU32(0, cfg.sentinel);

        // for (i = 49; i >= initFromWord; i--) tstack[i] = i;
        for (let i = STACK_WORDS - 1; i >= cfg.initFromWord; i--) {
            tryWriteU32(i * MOCK.Stack.wordSizeBytes, i);
        }

        return out;
    }

    // ============================================================================
    // MyList helpers
    // ============================================================================

    /** MyList node (ValueA / ValueB / ValueC) by name, driven from MOCK.MyList.Nodes. */
    private getMockMyListNode(size: number, key: keyof typeof MOCK.MyList.Nodes): Uint8Array {
        const cfg = Reflect.get(MOCK.MyList.Nodes, key) as (typeof MOCK.MyList.Nodes)[typeof key];
        return this.makeMyListStruct(size, cfg.next, cfg.value, cfg.name);
    }

    /** ListStart holds a single pointer to ValueA (configured in MOCK.MyList.ListStart). */
    private getMockListStart(size: number): Uint8Array {
        const out = new Uint8Array(size);
        if (size >= 4) {
            this.writeU32LE(out, 0, MOCK.MyList.ListStart);
        }
        return out;
    }

    /** ValueArray: N MyList structs at ValueArray + (i * structSize) */
    private getMockValueArray(size: number): Uint8Array {
        const out      = new Uint8Array(size);
        const elemSize = MOCK.MyList.structSize;
        const elems    = MOCK.MyList.ValueArray;

        for (const [idx, entry] of elems.entries()) {
            const base = idx * elemSize;
            if (size >= base + 4)  {
                this.writeU32LE(out, base + 0, entry.next);
            }
            if (size >= base + 8)  {
                this.writeU32LE(out, base + 4, entry.value);
            }
            if (size >= base + 12) {
                this.writeU32LE(out, base + 8, entry.name);
            }
        }
        return out;
    }

    /** ValueArray[i] address reads for element-only loads (structSize bytes each). */
    private getMockValueArrayElem(size: number, index: number): Uint8Array {
        const entries = MOCK.MyList.ValueArray;
        const e       = entries.at(index) ?? entries.at(0);
        if (!e) {
            return new Uint8Array(size);
        }
        return this.makeMyListStruct(size, e.next, e.value, e.name);
    }

    /** pArray memory slice (5 pointers). */
    private getMockPArraySlice(size: number, offset: number): Uint8Array {
        const ptrs = MOCK.MyList.pArray;
        const full = new Uint8Array(ptrs.length * 4);
        for (const [idx, ptr] of ptrs.entries()) {
            this.writeU32LE(full, idx * 4, ptr);
        }
        const out = new Uint8Array(size);
        out.set(full.subarray(offset, offset + size));
        return out;
    }

    /** Build SymbolInfo for a single MyList node (ValueA/B/C) using shared layout. */
    private makeMyListSymbol(name: string, address: number): SymbolInfo {
        const size  = MOCK.MyList.structSize;
        const off   = MOCK.MyList.fieldOffsets;
        const s: SymbolInfo = { name, address, size, member: [] };
        s.member?.push(this.mockMemberInfo('nextL', 4, off.next));
        s.member?.push(this.mockMemberInfo('valueL', 4, off.value));
        s.member?.push(this.mockMemberInfo('nameL', 4, off.name));
        return s;
    }

    // ============================================================================
    // Generic helpers
    // ============================================================================

    public mockMemberInfo(memberName: string, size: number, offset: number): MemberInfo {
        return { name: memberName, size, offset };
    }

    /** Write a 32-bit unsigned value in little-endian into dst at off. */
    private writeU32LE(dst: Uint8Array, off: number, value: number): void {
        dst.set([
            (value >>> 0) & 0xFF,
            (value >>> 8) & 0xFF,
            (value >>> 16) & 0xFF,
            (value >>> 24) & 0xFF,
        ], off);
    }

    /** Make a (possibly truncated) ASCII C-string buffer of 'size' bytes. */
    private makeCString(text: string, size: number): Uint8Array {
        const out = new Uint8Array(size);
        const n   = Math.max(0, Math.min(size - 1, text.length));
        for (let i = 0; i < n; i++) {
            out.set([text.charCodeAt(i) & 0xFF], i);
        }
        if (size > 0) {
            out.set([0], n);
        } // NUL-terminate if there’s room
        return out;
    }

    /**
     * Make a (possibly truncated) UTF-16LE wide C-string buffer of 'size' bytes.
     * Models: unsigned short wString[15] = L"USB_MSC1";
     */
    private makeU16CString(text: string, size: number): Uint8Array {
        const out = new Uint8Array(size);
        if (size < 2) {
            // Too small even for a single wchar_t NUL, just leave as zeros.
            return out;
        }

        const maxChars = Math.floor(size / 2) - 1; // reserve one wchar_t for NUL
        const n        = Math.max(0, Math.min(maxChars, text.length));

        for (let i = 0; i < n; i++) {
            const code = text.charCodeAt(i);  // basic BMP is fine for this mock
            const idx  = i * 2;
            out.set([code & 0xFF], idx);
            out.set([(code >> 8) & 0xFF], idx + 1);
        }

        // NUL-terminate (one UTF-16 code unit)
        const termIndex = n * 2;
        if (termIndex + 1 < size) {
            out.set([0, 0], termIndex);
        }

        return out;
    }

    /** Produce bytes for a single MyList struct. Offsets: 0=next*, 4=value (u32), 8=name* */
    private makeMyListStruct(size: number, nextPtr: number, value: number, namePtr: number): Uint8Array {
        const out = new Uint8Array(size);
        const off = MOCK.MyList.fieldOffsets;
        if (size >= off.next  + 4) {
            this.writeU32LE(out, off.next,  nextPtr >>> 0);
        }
        if (size >= off.value + 4) {
            this.writeU32LE(out, off.value, value >>> 0);
        }
        if (size >= off.name  + 4) {
            this.writeU32LE(out, off.name,  namePtr >>> 0);
        }
        return out;
    }
}
