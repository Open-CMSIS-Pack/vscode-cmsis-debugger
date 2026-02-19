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

/**
 * Full-chain integration test: Parser → Evaluator → ScvdEvalInterface → MemoryHost.
 *
 * Uses REAL data from the Part1 (source build) log to verify that the full
 * evaluation pipeline produces correct results for the RTX SCVD thread
 * discovery path:
 *
 *   1. Walk mem_list_com linked list (mem_block_t, 9 bytes, virtualSize=9)
 *   2. For each block with (len & 1) && (id == 0xF1), read TCB at _addr+8
 *   3. TCB data (osRtxThread_t, 80 bytes, virtualSize=129) is appended via -1
 *   4. Evaluate TCB[i].sp, TCB[i].id, TCB[i].state, TCB[i].cb_valid
 *
 * The model is built from ScvdNode subclasses that mirror the SCVD typedef
 * definitions. The ScvdEvalInterface delegates to MemoryHost for storage and
 * uses the model for symbol/member/stride/offset resolution — the exact same
 * code path used in production.
 *
 * Data comes from the Part1 cycle 2 log:
 *   - 12 mem_list_com blocks (5 MCBs, 3 TCBs, 3 unmatched, 1 sentinel)
 *   - 5 TCBs total (2 from static sections + 3 from mem_list_com)
 *   - All 5 TCBs have cb_valid=1 (idle, timer, app_main, led, button)
 */

import { Evaluator, EvalContext } from '../../../../parser-evaluator/evaluator';
import { ScvdEvalInterface } from '../../../../scvd-eval-interface';
import { MemoryHost } from '../../../../data-host/memory-host';
import { RegisterHost } from '../../../../data-host/register-host';
import { ScvdFormatSpecifier } from '../../../../model/scvd-format-specifier';
import { ScvdDebugTarget } from '../../../../scvd-debug-target';
import { ScvdNode } from '../../../../model/scvd-node';
import { parseExpressionForTest as parseExpression } from '../../../unit/helpers/parse-expression';

// =============================================================================
// MODEL: Minimal ScvdNode tree matching RTX5.scvd typedefs
// =============================================================================

/**
 * A member node within a typedef. Has name, offset, targetSize, valueType.
 * Mirrors ScvdMember behavior for the evaluator chain.
 */
class MemberNode extends ScvdNode {
    private readonly _offset: number;
    private readonly _targetSize: number;
    private readonly _valueType: string;
    private readonly _isPointer: boolean;
    private readonly _elementRef: ScvdNode | undefined;

    constructor(
        parent: ScvdNode,
        name: string,
        offset: number,
        targetSize: number,
        valueType: string,
        isPointer = false,
        elementRef?: ScvdNode,
    ) {
        super(parent);
        this.name = name;
        this._offset = offset;
        this._targetSize = targetSize;
        this._valueType = valueType;
        this._isPointer = isPointer;
        this._elementRef = elementRef;
    }

    public override get classname(): string { return 'MemberNode'; }
    public override async getMemberOffset(): Promise<number | undefined> { return this._offset; }
    public override async getTargetSize(): Promise<number | undefined> { return this._targetSize; }
    public override getValueType(): string | undefined { return this._valueType; }
    public override getIsPointer(): boolean { return this._isPointer; }
    public override getTypeSize(): number | undefined { return this._targetSize; }
    public override async getVirtualSize(): Promise<number | undefined> { return this._targetSize; }
    public override getElementRef(): ScvdNode | undefined { return this._elementRef; }
}

/**
 * A typedef node representing a struct type (e.g., mem_block_t, osRtxThread_t).
 * Has members accessible via getMember(), and size/virtualSize.
 */
class TypedefNode extends ScvdNode {
    private readonly _members = new Map<string, MemberNode>();
    private readonly _targetSize: number;
    private readonly _virtualSize: number;

    constructor(parent: ScvdNode | undefined, name: string, targetSize: number, virtualSize: number) {
        super(parent);
        this.name = name;
        this._targetSize = targetSize;
        this._virtualSize = virtualSize;
    }

    public addMember(
        name: string,
        offset: number,
        targetSize: number,
        valueType: string,
        isPointer = false,
    ): MemberNode {
        const member = new MemberNode(this, name, offset, targetSize, valueType, isPointer);
        this._members.set(name, member);
        return member;
    }

    public override get classname(): string { return 'TypedefNode'; }
    public override getMember(property: string): ScvdNode | undefined { return this._members.get(property); }
    public override async getTargetSize(): Promise<number | undefined> { return this._targetSize; }
    public override async getVirtualSize(): Promise<number | undefined> { return this._virtualSize; }
    public override getTypeSize(): number | undefined { return this._targetSize; }
    public override getIsPointer(): boolean { return false; }
    public override getElementRef(): ScvdNode | undefined { return this; }
}

/**
 * A symbol node representing a variable (e.g., "mem_list_com", "TCB").
 * It delegates getMember to its typedef for field resolution.
 * getElementStride → virtualSize, getElementRef → typedef.
 */
class SymbolNode extends ScvdNode {
    private readonly typedef: TypedefNode;

    constructor(parent: ScvdNode, name: string, typedef: TypedefNode) {
        super(parent);
        this.name = name;
        this.typedef = typedef;
    }

    public override get classname(): string { return 'SymbolNode'; }
    public override getMember(property: string): ScvdNode | undefined { return this.typedef.getMember(property); }
    public override async getTargetSize(): Promise<number | undefined> { return this.typedef.getTargetSize(); }
    public override async getVirtualSize(): Promise<number | undefined> { return this.typedef.getVirtualSize(); }
    public override getTypeSize(): number | undefined { return this.typedef.getTypeSize(); }
    public override getIsPointer(): boolean { return false; }
    public override getElementRef(): ScvdNode | undefined { return this.typedef; }
}

/**
 * Root model node — contains symbols that getSymbol() can resolve.
 */
class RootNode extends ScvdNode {
    private readonly _symbols = new Map<string, SymbolNode>();

    constructor() {
        super(undefined);
        this.name = 'root';
    }

    public addSymbol(name: string, typedef: TypedefNode): SymbolNode {
        const sym = new SymbolNode(this, name, typedef);
        this._symbols.set(name, sym);
        return sym;
    }

    public override getSymbol(name: string): ScvdNode | undefined {
        return this._symbols.get(name);
    }

    public override get classname(): string { return 'RootNode'; }
}

// =============================================================================
// HELPERS
// =============================================================================

/** Build a 9-byte mem_block_t: [next:4][len:4][id:1] in LE. */
function makeBlock9(nextAddr: number, len: number, id: number): Uint8Array {
    const buf = new Uint8Array(9);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, nextAddr, true);
    dv.setUint32(4, len, true);
    buf[8] = id;
    return buf;
}

/** Build an 80-byte osRtxThread_t with the key fields populated. */
function makeTCB(fields: {
    id: number;          // offset 0, uint8
    state: number;       // offset 1, uint8
    flags: number;       // offset 2, uint8
    attr: number;        // offset 3, uint8
    name: number;        // offset 4, uint32 (pointer to name string)
    priority: number;    // offset 32, int8
    stack_mem: number;   // offset 48, uint32
    stack_size: number;  // offset 52, uint32
    sp: number;          // offset 56, uint32
    thread_addr: number; // offset 60, uint32
    delay: number;       // offset 28, uint32
}): Uint8Array {
    const buf = new Uint8Array(80);
    const dv = new DataView(buf.buffer);
    buf[0] = fields.id;
    buf[1] = fields.state;
    buf[2] = fields.flags;
    buf[3] = fields.attr;
    dv.setUint32(4, fields.name, true);
    dv.setUint32(28, fields.delay, true);
    buf[32] = fields.priority & 0xFF;
    dv.setUint32(48, fields.stack_mem, true);
    dv.setUint32(52, fields.stack_size, true);
    dv.setUint32(56, fields.sp, true);
    dv.setUint32(60, fields.thread_addr, true);
    return buf;
}

const evaluator = new Evaluator();

// =============================================================================
// REAL DATA FROM PART1 LOG (source build, cycle 2)
// =============================================================================

/**
 * mem_list_com linked list from Part1 cycle 2:
 * 12 nodes, addresses and types derived from the log.
 *
 * next pointers form the chain:
 *   0x20010d28 → 0x20010d50 → 0x20010d78 → 0x20010da0 → 0x20010dc8
 *   → 0x20010df0 → 0x20010e48 → 0x20011a50 → 0x20011aa8 → 0x200126b0
 *   → 0x20012708 → 0x20018d18 (sentinel, next=0)
 *
 * Block types by id:
 *   blocks 0-4: MCB (id=0xF5, len=41|1=0x29)
 *   block 5: TCB (id=0xF1, len varies)
 *   block 6: unmatched (stack region for TCB[2])
 *   block 7: TCB (id=0xF1)
 *   block 8: unmatched (stack region for TCB[3])
 *   block 9: TCB (id=0xF1)
 *   block 10: unmatched (stack region for TCB[4])
 *   block 11: sentinel (id=0, len=9720)
 */
const MEM_LIST_COM_BLOCKS: Array<{ addr: number; next: number; len: number; id: number }> = [
    { addr: 0x20010d28, next: 0x20010d50, len: 41,   id: 0xF5 },   // MCB 0
    { addr: 0x20010d50, next: 0x20010d78, len: 41,   id: 0xF5 },   // MCB 1
    { addr: 0x20010d78, next: 0x20010da0, len: 41,   id: 0xF5 },   // MCB 2
    { addr: 0x20010da0, next: 0x20010dc8, len: 41,   id: 0xF5 },   // MCB 3
    { addr: 0x20010dc8, next: 0x20010df0, len: 41,   id: 0xF5 },   // MCB 4
    { addr: 0x20010df0, next: 0x20010e48, len: 89,   id: 0xF1 },   // TCB → thread at addr+8 = 0x20010df8
    { addr: 0x20010e48, next: 0x20011a50, len: 3089, id: 0x00 },   // stack region (unmatched)
    { addr: 0x20011a50, next: 0x20011aa8, len: 89,   id: 0xF1 },   // TCB → thread at addr+8 = 0x20011a58
    { addr: 0x20011aa8, next: 0x200126b0, len: 3081, id: 0x00 },   // stack region (unmatched)
    { addr: 0x200126b0, next: 0x20012708, len: 89,   id: 0xF1 },   // TCB → thread at addr+8 = 0x200126b8
    { addr: 0x20012708, next: 0x20018d18, len: 2945, id: 0x00 },   // stack region (unmatched)
    { addr: 0x20018d18, next: 0x00000000, len: 9720, id: 0x00 },   // sentinel
];

/**
 * TCB data from Part1 cycle 2. Includes 2 from static sections + 3 from mem_list_com.
 * The "sections" TCBs are at a separate base address (0x20018f94).
 * Thread names (from log): idle, timer, app_main, led, button.
 */
const TCB_DATA: Array<{
    targetBase: number;
    fields: Parameters<typeof makeTCB>[0];
    threadName: string;
}> = [
    {
        // TCB[0] = idle thread (from sections at 0x20018f94)
        targetBase: 0x20018f94,
        threadName: 'idle',
        fields: {
            id: 0xF1, state: 1, flags: 0, attr: 0,
            name: 0x08008000,     // pointer to "idle" string
            priority: 1,
            stack_mem: 0x20019038, stack_size: 512,
            sp: 0x200191F8,       // from log: 536973816
            thread_addr: 0x08001000,
            delay: 0,
        },
    },
    {
        // TCB[1] = timer thread (from sections at 0x20018f94 + 80)
        targetBase: 0x20018f94 + 80,
        threadName: 'timer',
        fields: {
            id: 0xF1, state: 3, flags: 0, attr: 0,
            name: 0x08008010,     // pointer to "timer" string
            priority: 40,
            stack_mem: 0x20019238, stack_size: 512,
            sp: 0x200193D8,       // from log: 536974296
            thread_addr: 0x08001100,
            delay: 0xFFFFFFFF,    // infinite wait
        },
    },
    {
        // TCB[2] = app_main (from mem_list_com[5], addr+8 = 0x20010df8) — RUNNING
        targetBase: 0x20010df8,
        threadName: 'app_main',
        fields: {
            id: 0xF1, state: 2, flags: 0, attr: 0,  // state=2 = Running
            name: 0x08008020,
            priority: 24,
            stack_mem: 0x20010e50, stack_size: 3072,
            sp: 0x20011A10,       // from log: 536943120
            thread_addr: 0x08002000,
            delay: 3,             // round-robin tick
        },
    },
    {
        // TCB[3] = led (from mem_list_com[7], addr+8 = 0x20011a58)
        targetBase: 0x20011a58,
        threadName: 'led',
        fields: {
            id: 0xF1, state: 3, flags: 0, attr: 0,  // Blocked
            name: 0x08008030,
            priority: 24,
            stack_mem: 0x20011ab0, stack_size: 3072,
            sp: 0x20012698,       // from log: 536946280
            thread_addr: 0x08003000,
            delay: 90,
        },
    },
    {
        // TCB[4] = button (from mem_list_com[9], addr+8 = 0x200126b8)
        targetBase: 0x200126b8,
        threadName: 'button',
        fields: {
            id: 0xF1, state: 3, flags: 0, attr: 0,  // Blocked
            name: 0x08008040,
            priority: 24,
            stack_mem: 0x20012710, stack_size: 3280,
            sp: 0x200131C0,       // from log: 536949312
            thread_addr: 0x08004000,
            delay: 0,
        },
    },
];

// =============================================================================
// TEST SETUP
// =============================================================================

/**
 * Build the model, populate the MemoryHost, and return the evaluation context.
 */
function setupTestEnvironment() {
    const root = new RootNode();

    // mem_block_t: size=9, virtualSize=9
    // members: next(offset=0, 4B, pointer), len(offset=4, 4B, uint32), id(offset=8, 1B, uint8)
    const memBlockType = new TypedefNode(undefined, 'mem_block_t', 9, 9);
    memBlockType.addMember('next', 0, 4, 'uint32_t', true);
    memBlockType.addMember('len', 4, 4, 'uint32_t');
    memBlockType.addMember('id', 8, 1, 'uint8_t');

    // osRtxThread_t: size=80, virtualSize=129 (80 + 49 bytes for 13 vars)
    const threadType = new TypedefNode(undefined, 'osRtxThread_t', 80, 129);
    threadType.addMember('id', 0, 1, 'uint8_t');
    threadType.addMember('state', 1, 1, 'uint8_t');
    threadType.addMember('flags', 2, 1, 'uint8_t');
    threadType.addMember('attr', 3, 1, 'uint8_t');
    threadType.addMember('name', 4, 4, 'uint32_t', true);
    threadType.addMember('thread_next', 8, 4, 'uint32_t', true);
    threadType.addMember('thread_prev', 12, 4, 'uint32_t', true);
    threadType.addMember('delay_next', 16, 4, 'uint32_t', true);
    threadType.addMember('delay_prev', 20, 4, 'uint32_t', true);
    threadType.addMember('thread_join', 24, 4, 'uint32_t', true);
    threadType.addMember('delay', 28, 4, 'uint32_t');
    threadType.addMember('priority', 32, 1, 'int8_t');
    threadType.addMember('priority_base', 33, 1, 'int8_t');
    threadType.addMember('stack_frame', 34, 1, 'uint8_t');
    threadType.addMember('flags_options', 35, 1, 'uint8_t');
    threadType.addMember('wait_flags', 36, 4, 'int32_t');
    threadType.addMember('thread_flags', 40, 4, 'int32_t');
    threadType.addMember('mutex_list', 44, 4, 'uint32_t', true);
    threadType.addMember('stack_mem', 48, 4, 'uint32_t');
    threadType.addMember('stack_size', 52, 4, 'uint32_t');
    threadType.addMember('sp', 56, 4, 'uint32_t');
    threadType.addMember('thread_addr', 60, 4, 'uint32_t');
    threadType.addMember('tz_memory', 64, 4, 'uint32_t');
    threadType.addMember('zone', 68, 1, 'uint8_t');

    // Register symbols on root
    root.addSymbol('mem_list_com', memBlockType);
    root.addSymbol('TCB', threadType);

    // --- Also add simple scalar variables accessible by name ---
    // 'addr' and 'i' are local SCVD variables used in the loop
    const addrType = new TypedefNode(undefined, 'addr_t', 4, 4);
    addrType.addMember('value', 0, 4, 'uint32_t');
    root.addSymbol('addr', addrType);

    const iType = new TypedefNode(undefined, 'i_t', 4, 4);
    iType.addMember('value', 0, 4, 'uint32_t');
    root.addSymbol('i', iType);

    // --- MemoryHost ---
    const memHost = new MemoryHost();

    // Populate mem_list_com: 12 blocks appended via setVariable(-1)
    for (const block of MEM_LIST_COM_BLOCKS) {
        const data = makeBlock9(block.next, block.len, block.id);
        memHost.setVariable('mem_list_com', 9, data, -1, block.addr, 9);
    }

    // Populate TCB: 5 threads appended via setVariable(-1)
    for (const tcb of TCB_DATA) {
        const data = makeTCB(tcb.fields);
        memHost.setVariable('TCB', 80, data, -1, tcb.targetBase, 129);
    }

    // --- ScvdEvalInterface ---
    const regCache = { read: jest.fn(), write: jest.fn() } as unknown as RegisterHost;
    const debugTarget = {
        findSymbolAddress: jest.fn(),
        findSymbolNameAtAddress: jest.fn(),
        calculateMemoryUsage: jest.fn(),
        getSymbolSize: jest.fn(),
        getNumArrayElements: jest.fn(),
        getTargetIsRunning: jest.fn().mockResolvedValue(false),
        readUint8ArrayStrFromPointer: jest.fn(),
        readMemory: jest.fn(),
        readRegister: jest.fn(),
    } as unknown as ScvdDebugTarget;

    const host = new ScvdEvalInterface(memHost, regCache, debugTarget, new ScvdFormatSpecifier());
    const ctx = new EvalContext({ data: host, container: root });

    return { root, memHost, host, ctx, debugTarget };
}

/** Evaluate an expression string and return the result. */
async function evalExpr(ctx: EvalContext, expr: string): Promise<number | bigint | string | boolean | Uint8Array | undefined> {
    const pr = parseExpression(expr, false);
    return evaluator.evaluateParseResult(pr, ctx);
}

// =============================================================================
// TESTS
// =============================================================================

describe('Full-chain: mem_list_com linked-list walk (real Part1 data)', () => {
    let ctx: EvalContext;

    beforeEach(() => {
        const env = setupTestEnvironment();
        ctx = env.ctx;
    });

    it('_count returns 12 (total linked-list nodes)', async () => {
        const count = await evalExpr(ctx, 'mem_list_com._count');
        expect(count).toBe(12);
    });

    it('_addr for each element returns the correct target address', async () => {
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length; i++) {
            // We need to write 'i' as a variable first, then use mem_list_com[i]._addr
            // But the evaluator expects numeric literals in the index, so use them directly
            const addr = await evalExpr(ctx, `mem_list_com[${i}]._addr`);
            const expectedBlock = MEM_LIST_COM_BLOCKS.at(i);
            expect(addr).toBe(expectedBlock?.addr);
        }
    });

    it('reads next pointer (offset 0, 4 bytes) for each block', async () => {
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length; i++) {
            const next = await evalExpr(ctx, `mem_list_com[${i}].next`);
            const expectedBlock = MEM_LIST_COM_BLOCKS.at(i);
            expect(next).toBe(expectedBlock?.next);
        }
    });

    it('reads len field (offset 4, 4 bytes) for each block', async () => {
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length; i++) {
            const len = await evalExpr(ctx, `mem_list_com[${i}].len`);
            const expectedBlock = MEM_LIST_COM_BLOCKS.at(i);
            expect(len).toBe(expectedBlock?.len);
        }
    });

    it('reads id field (offset 8, 1 byte) for each block', async () => {
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length; i++) {
            const id = await evalExpr(ctx, `mem_list_com[${i}].id`);
            const expectedBlock = MEM_LIST_COM_BLOCKS.at(i);
            expect(id).toBe(expectedBlock?.id);
        }
    });

    it('sentinel (last block) has len=9720 and next=0', async () => {
        const lastIdx = MEM_LIST_COM_BLOCKS.length - 1;
        const len = await evalExpr(ctx, `mem_list_com[${lastIdx}].len`);
        expect(len).toBe(9720);
        const next = await evalExpr(ctx, `mem_list_com[${lastIdx}].next`);
        expect(next).toBe(0);
    });

    it('evaluates mem_head_com.max_used = mem_list_com[_count-1].len', async () => {
        // This is the SCVD expression: mem_list_com[mem_list_com._count-1].len
        const maxUsed = await evalExpr(ctx, 'mem_list_com[mem_list_com._count - 1].len');
        expect(maxUsed).toBe(9720);
    });

    it('identifies TCB blocks: (len & 1) && (id == 0xF1)', async () => {
        const tcbBlockIndices: number[] = [];
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length - 1; i++) {
            const len = await evalExpr(ctx, `mem_list_com[${i}].len`) as number;
            const id = await evalExpr(ctx, `mem_list_com[${i}].id`) as number;
            if ((len & 1) && id === 0xF1) {
                tcbBlockIndices.push(i);
            }
        }
        // Blocks 5, 7, 9 are TCBs (id=0xF1, len odd)
        expect(tcbBlockIndices).toEqual([5, 7, 9]);
    });

    it('identifies MCB blocks: (len & 1) && (id == 0xF5)', async () => {
        const mcbBlockIndices: number[] = [];
        for (let i = 0; i < MEM_LIST_COM_BLOCKS.length - 1; i++) {
            const len = await evalExpr(ctx, `mem_list_com[${i}].len`) as number;
            const id = await evalExpr(ctx, `mem_list_com[${i}].id`) as number;
            if ((len & 1) && id === 0xF5) {
                mcbBlockIndices.push(i);
            }
        }
        // Blocks 0-4 are MCBs
        expect(mcbBlockIndices).toEqual([0, 1, 2, 3, 4]);
    });

    it('computes addr = mem_list_com[i]._addr + 8 for TCB blocks', async () => {
        const tcbAddresses: number[] = [];
        for (const i of [5, 7, 9]) {
            const blockAddr = await evalExpr(ctx, `mem_list_com[${i}]._addr`) as number;
            tcbAddresses.push(blockAddr + 8);
        }
        expect(tcbAddresses).toEqual([0x20010df8, 0x20011a58, 0x200126b8]);
    });
});

describe('Full-chain: TCB array with stride=129 (real Part1 data)', () => {
    let ctx: EvalContext;

    beforeEach(() => {
        const env = setupTestEnvironment();
        ctx = env.ctx;
    });

    it('_count returns 5 (total TCBs)', async () => {
        const count = await evalExpr(ctx, 'TCB._count');
        expect(count).toBe(5);
    });

    it('_addr for each TCB returns the correct target base', async () => {
        for (let i = 0; i < TCB_DATA.length; i++) {
            const addr = await evalExpr(ctx, `TCB[${i}]._addr`);
            const expected = TCB_DATA.at(i);
            expect(addr).toBe(expected?.targetBase);
        }
    });

    it('reads TCB[i].id = 0xF1 for all 5 threads', async () => {
        for (let i = 0; i < 5; i++) {
            const id = await evalExpr(ctx, `TCB[${i}].id`);
            expect(id).toBe(0xF1);
        }
    });

    it('reads TCB[i].state correctly for each thread', async () => {
        const expectedStates = [1, 3, 2, 3, 3]; // idle=Ready, timer=Blocked, app_main=Running, led=Blocked, button=Blocked
        for (let i = 0; i < 5; i++) {
            const state = await evalExpr(ctx, `TCB[${i}].state`);
            expect(state).toBe(expectedStates.at(i));
        }
    });

    it('reads TCB[i].sp correctly for each thread', async () => {
        const expectedSps = [
            0x200191F8,  // idle: 536973816
            0x200193D8,  // timer: 536974296
            0x20011A10,  // app_main: 536943120
            0x20012698,  // led: 536946280
            0x200131C0,  // button: 536949312
        ];
        for (let i = 0; i < 5; i++) {
            const sp = await evalExpr(ctx, `TCB[${i}].sp`);
            expect(sp).toBe(expectedSps.at(i));
        }
    });

    it('reads TCB[i].delay correctly', async () => {
        const expectedDelays = [0, 0xFFFFFFFF, 3, 90, 0];
        for (let i = 0; i < 5; i++) {
            const delay = await evalExpr(ctx, `TCB[${i}].delay`);
            expect(delay).toBe(expectedDelays.at(i));
        }
    });

    it('reads TCB[i].priority correctly', async () => {
        const expectedPriorities = [1, 40, 24, 24, 24];
        for (let i = 0; i < 5; i++) {
            const prio = await evalExpr(ctx, `TCB[${i}].priority`);
            expect(prio).toBe(expectedPriorities.at(i));
        }
    });

    it('reads TCB[i].stack_mem and stack_size correctly', async () => {
        for (let i = 0; i < 5; i++) {
            const stackMem = await evalExpr(ctx, `TCB[${i}].stack_mem`);
            const expected = TCB_DATA.at(i);
            expect(stackMem).toBe(expected?.fields.stack_mem);

            const stackSize = await evalExpr(ctx, `TCB[${i}].stack_size`);
            expect(stackSize).toBe(expected?.fields.stack_size);
        }
    });

    it('evaluates cb_valid = (TCB[i].id == 0xF1) && (TCB[i].state != 0) && (TCB[i].sp != 0)', async () => {
        for (let i = 0; i < 5; i++) {
            const cbValid = await evalExpr(
                ctx,
                `(TCB[${i}].id == 0xF1) && (TCB[${i}].state != 0) && (TCB[${i}].sp != 0)`
            );
            expect(cbValid).toBe(1);
        }
    });
});

describe('Full-chain: SCVD expression patterns from RTX5.scvd', () => {
    let ctx: EvalContext;

    beforeEach(() => {
        const env = setupTestEnvironment();
        ctx = env.ctx;
    });

    it('evaluates stack_curb = TCB[i].stack_mem + TCB[i].stack_size - TCB[i].sp', async () => {
        // From SCVD: stack_curb = TCB[i].stack_mem + TCB[i].stack_size - sp
        // TCB[0] idle: 0x20019038 + 512 - 0x200191F8 = 0x20019238 - 0x200191F8 = 64
        const curb0 = await evalExpr(ctx, 'TCB[0].stack_mem + TCB[0].stack_size - TCB[0].sp');
        expect(curb0).toBe(64);

        // TCB[1] timer: 0x20019238 + 512 - 0x200193D8 = 0x20019438 - 0x200193D8 = 96
        const curb1 = await evalExpr(ctx, 'TCB[1].stack_mem + TCB[1].stack_size - TCB[1].sp');
        expect(curb1).toBe(96);

        // TCB[2] app_main: 0x20010e50 + 3072 - 0x20011A10 = 0x20011a50 - 0x20011A10 = 64
        const curb2 = await evalExpr(ctx, 'TCB[2].stack_mem + TCB[2].stack_size - TCB[2].sp');
        expect(curb2).toBe(64);

        // TCB[3] led: 0x20011ab0 + 0xC00 - 0x20012698 = 0x200126b0 - 0x20012698 = 0x18 = 24
        const curb3 = await evalExpr(ctx, 'TCB[3].stack_mem + TCB[3].stack_size - TCB[3].sp');
        expect(curb3).toBe(24);

        // TCB[4] button: 0x20012710 + 0xCD0 - 0x200131C0 = 0x200133E0 - 0x200131C0 = 0x220 = 544
        const curb4 = await evalExpr(ctx, 'TCB[4].stack_mem + TCB[4].stack_size - TCB[4].sp');
        expect(curb4).toBe(544);
    });

    it('evaluates stack_curp = stack_curb * 100 / TCB[i].stack_size', async () => {
        // TCB[0]: 64 * 100 / 512 = 12
        const curp0 = await evalExpr(ctx, '(TCB[0].stack_mem + TCB[0].stack_size - TCB[0].sp) * 100 / TCB[0].stack_size');
        expect(Math.trunc(curp0 as number)).toBe(12);

        // TCB[1]: 96 * 100 / 512 = 18
        const curp1 = await evalExpr(ctx, '(TCB[1].stack_mem + TCB[1].stack_size - TCB[1].sp) * 100 / TCB[1].stack_size');
        expect(Math.trunc(curp1 as number)).toBe(18);
    });

    it('evaluates compound condition: (mem_list_com[5].len & 1) && (mem_list_com[5].id == 0xF1)', async () => {
        // Block 5 is a TCB block: len=89 (odd, allocated), id=0xF1
        const cond = await evalExpr(ctx, '(mem_list_com[5].len & 1) && (mem_list_com[5].id == 0xF1)');
        expect(cond).toBe(1);
    });

    it('evaluates compound condition: (mem_list_com[6].len & 1) && (mem_list_com[6].id == 0xF1) = false', async () => {
        // Block 6 is an unmatched stack region: id=0x00
        const cond = await evalExpr(ctx, '(mem_list_com[6].len & 1) && (mem_list_com[6].id == 0xF1)');
        expect(cond).toBe(0);
    });

    it('evaluates the full TCB discovery loop as the SCVD would', async () => {
        // Simulate the SCVD list iterator:
        //   for i = 0 to mem_list_com._count - 2:
        //     if (mem_list_com[i].len & 1) && (mem_list_com[i].id == 0xF1):
        //       addr = mem_list_com[i]._addr + 8
        //       → this addr is the TCB target address
        const count = await evalExpr(ctx, 'mem_list_com._count') as number;
        expect(count).toBe(12);

        const discoveredTCBAddresses: number[] = [];
        for (let i = 0; i < count - 1; i++) {
            const len = await evalExpr(ctx, `mem_list_com[${i}].len`) as number;
            const id = await evalExpr(ctx, `mem_list_com[${i}].id`) as number;

            if ((len & 1) && id === 0xF1) {
                const blockAddr = await evalExpr(ctx, `mem_list_com[${i}]._addr`) as number;
                discoveredTCBAddresses.push(blockAddr + 8);
            }
        }

        // Should discover exactly 3 TCB addresses from mem_list_com
        expect(discoveredTCBAddresses).toEqual([
            0x20010df8,  // TCB[2] = app_main
            0x20011a58,  // TCB[3] = led
            0x200126b8,  // TCB[4] = button
        ]);

        // Verify these match the TCB target bases (excluding sections TCBs 0,1)
        expect(discoveredTCBAddresses[0]).toBe(TCB_DATA[2].targetBase);
        expect(discoveredTCBAddresses[1]).toBe(TCB_DATA[3].targetBase);
        expect(discoveredTCBAddresses[2]).toBe(TCB_DATA[4].targetBase);
    });

    it('all 5 TCBs have distinct sp values (no "2x app_main" bug)', async () => {
        const spValues: number[] = [];
        for (let i = 0; i < 5; i++) {
            const sp = await evalExpr(ctx, `TCB[${i}].sp`) as number;
            spValues.push(sp);
        }

        // All sp values must be unique (if stride is wrong, two TCBs would overlap)
        const uniqueSps = new Set(spValues);
        expect(uniqueSps.size).toBe(5);

        // Verify actual values
        expect(spValues).toEqual([
            0x200191F8,  // idle
            0x200193D8,  // timer
            0x20011A10,  // app_main
            0x20012698,  // led
            0x200131C0,  // button
        ]);
    });
});

describe('Full-chain: stride correctness for TCB[i] with virtualSize=129', () => {
    let ctx: EvalContext;

    beforeEach(() => {
        const env = setupTestEnvironment();
        ctx = env.ctx;
    });

    it('TCB[0] and TCB[1] do not share any field values', async () => {
        // If stride were wrong (e.g., 80 instead of 129), TCB[1].sp would read
        // from the wrong offset and might return TCB[0]'s data or garbage
        const sp0 = await evalExpr(ctx, 'TCB[0].sp');
        const sp1 = await evalExpr(ctx, 'TCB[1].sp');
        expect(sp0).not.toBe(sp1);
        expect(sp0).toBe(0x200191F8);
        expect(sp1).toBe(0x200193D8);
    });

    it('TCB[4] fields are correct (last element, most sensitive to cumulative stride drift)', async () => {
        // If there's a +/-1 error per element, it compounds: by TCB[4] the offset
        // is wrong by 4-5 bytes, corrupting all field reads
        expect(await evalExpr(ctx, 'TCB[4].id')).toBe(0xF1);
        expect(await evalExpr(ctx, 'TCB[4].state')).toBe(3);
        expect(await evalExpr(ctx, 'TCB[4].sp')).toBe(0x200131C0);
        expect(await evalExpr(ctx, 'TCB[4].stack_mem')).toBe(0x20012710);
        expect(await evalExpr(ctx, 'TCB[4].stack_size')).toBe(3280);
        expect(await evalExpr(ctx, 'TCB[4].delay')).toBe(0);
    });

    it('back-to-back reads of the same field across all TCBs return expected values', async () => {
        // This catches "reading from wrong element" bugs where TCB[i].field
        // accidentally reads TCB[j].field due to stride errors
        const ids = [];
        for (let i = 0; i < 5; i++) {
            ids.push(await evalExpr(ctx, `TCB[${i}].id`));
        }
        expect(ids).toEqual([0xF1, 0xF1, 0xF1, 0xF1, 0xF1]);

        const states = [];
        for (let i = 0; i < 5; i++) {
            states.push(await evalExpr(ctx, `TCB[${i}].state`));
        }
        expect(states).toEqual([1, 3, 2, 3, 3]);
    });
});
