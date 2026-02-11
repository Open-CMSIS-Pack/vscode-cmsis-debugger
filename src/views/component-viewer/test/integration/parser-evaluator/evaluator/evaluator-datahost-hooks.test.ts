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
 * Integration test for EvaluatorDatahostHooks.
 */

import { Evaluator, EvalContext } from '../../../../parser-evaluator/evaluator';
import type { RefContainer, EvalValue } from '../../../../parser-evaluator/model-host';
import type { FullDataHost } from '../../helpers/full-data-host';
import { parseExpressionForTest as parseExpression } from '../../../unit/helpers/parse-expression';
import { ScvdNode } from '../../../../model/scvd-node';
import { ScvdEvalInterface } from '../../../../scvd-eval-interface';
import { MemoryHost } from '../../../../data-host/memory-host';
import { ScvdFormatSpecifier } from '../../../../model/scvd-format-specifier';
import { RegisterHost } from '../../../../data-host/register-host';
import { ScvdDebugTarget } from '../../../../scvd-debug-target';
import { TargetReadCache } from '../../../../target-read-cache';

class BasicRef extends ScvdNode {
    constructor(parent?: ScvdNode) {
        super(parent);
    }
}

class HookHost implements FullDataHost {
    readonly root = new BasicRef();
    readonly arrRef = new BasicRef(this.root);
    readonly elemRef = new BasicRef(this.arrRef);
    readonly fieldRef = new BasicRef(this.elemRef);
    lastFormattingContainer: RefContainer | undefined;

    private readonly values = new Map<number, EvalValue>([
        [10, 99], // offsetBytes for arr[2].field
        [6, 0xab], // offsetBytes for arr[1].field in printf path
    ]);
    private readonly disablePrintfOverride: boolean;

    constructor(opts?: { disablePrintfOverride?: boolean }) {
        this.disablePrintfOverride = opts?.disablePrintfOverride ?? false;
    }

    public getSymbolRef = jest.fn(async (_container: RefContainer, name: string): Promise<BasicRef | undefined> => {
        if (name === 'arr') {
            return this.arrRef;
        }
        return undefined;
    });

    public getMemberRef = jest.fn(async (_container: RefContainer, property: string): Promise<BasicRef | undefined> => {
        if (property === 'field') {
            return this.fieldRef;
        }
        // allow colon-path anchor to succeed
        if (property === 'dummy') {
            return this.fieldRef;
        }
        return undefined;
    });

    public getElementStride = jest.fn(async (_ref: ScvdNode): Promise<number> => 4);

    public getMemberOffset = jest.fn(async (_base: ScvdNode, _member: ScvdNode): Promise<number | undefined> => 2);

    public getElementRef = jest.fn(async (): Promise<BasicRef | undefined> => this.elemRef);

    public getByteWidth = jest.fn(async (): Promise<number | undefined> => 4);

    public setValueAt(offset: number, value: EvalValue): void {
        this.values.set(offset, value);
    }

    public resolveColonPath = jest.fn(async (_container: RefContainer, parts: string[]): Promise<EvalValue> => {
        return parts.length * 100; // simple sentinel
    });

    public readValue = jest.fn(async (container: RefContainer): Promise<EvalValue | undefined> => {
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    });

    public writeValue = jest.fn(async (_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> => value);

    public _count = jest.fn(async (): Promise<number | undefined> => undefined);

    public _addr = jest.fn(async (): Promise<number | undefined> => undefined);

    public formatPrintf = jest.fn(async (spec: string, value: EvalValue, container: RefContainer): Promise<string | undefined> => {
        this.lastFormattingContainer = container;
        if (this.disablePrintfOverride) {
            if (value instanceof Uint8Array && spec === 'M') {
                return Array.from(value.subarray(0, 6))
                    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                    .join('-');
            }
            return undefined;
        }
        return `fmt-${spec}-${value}`;
    });

    public getValueType = jest.fn(async (): Promise<string | undefined> => undefined);

    public __GetRegVal = jest.fn(async (): Promise<number | bigint | undefined> => undefined);

    public __FindSymbol = jest.fn(async (): Promise<number | undefined> => undefined);

    public __CalcMemUsed = jest.fn(async (): Promise<number | undefined> => undefined);

    public __size_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Symbol_exists = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Offset_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Running = jest.fn(async (): Promise<number | undefined> => undefined);
}

const evaluator = new Evaluator();

class MacRoot extends ScvdNode {
    private readonly macRef: ScvdNode;

    constructor() {
        super(undefined);
        this.macRef = new MacNode(this);
        this.macRef.name = 'mac';
    }

    public override getSymbol(name: string): ScvdNode | undefined {
        if (name === 'mac') {
            return this.macRef;
        }
        return undefined;
    }
}

class MacNode extends ScvdNode {
    constructor(parent?: ScvdNode) {
        super(parent);
    }

    public override async getTargetSize(): Promise<number | undefined> {
        return 6;
    }

    public override getValueType(): string | undefined {
        return undefined;
    }
}

class NestedArrayHost implements FullDataHost {
    readonly root = new BasicRef();
    readonly objArrayRef = new BasicRef(this.root);
    readonly objElementRef = new BasicRef(this.objArrayRef);
    readonly memberArrayRef = new BasicRef(this.objElementRef);
    readonly varArrayRef = new BasicRef(this.objElementRef);
    readonly memberElementRef = new BasicRef(this.memberArrayRef);
    readonly varElementRef = new BasicRef(this.varArrayRef);

    private readonly values = new Map<number, EvalValue>([
        [28, 111], // obj[1].member[2] => 1*16 + 8 + 2*2
        [36, 222], // obj[1].var[2] => 1*16 + 12 + 2*4
    ]);

    public getSymbolRef = jest.fn(async (_container: RefContainer, name: string): Promise<BasicRef | undefined> => {
        if (name === 'obj') {
            return this.objArrayRef;
        }
        return undefined;
    });

    public getMemberRef = jest.fn(async (container: RefContainer, property: string): Promise<BasicRef | undefined> => {
        if (container.current === this.objElementRef) {
            if (property === 'member') {
                return this.memberArrayRef;
            }
            if (property === 'var') {
                return this.varArrayRef;
            }
        }
        return undefined;
    });

    public getElementStride = jest.fn(async (ref: ScvdNode): Promise<number> => {
        if (ref === this.objArrayRef) {
            return 16;
        }
        if (ref === this.memberArrayRef) {
            return 2;
        }
        if (ref === this.varArrayRef) {
            return 4;
        }
        return 1;
    });

    public getMemberOffset = jest.fn(async (_base: ScvdNode, member: ScvdNode): Promise<number | undefined> => {
        if (member === this.memberArrayRef) {
            return 8;
        }
        if (member === this.varArrayRef) {
            return 12;
        }
        return 0;
    });

    public getElementRef = jest.fn(async (ref: ScvdNode): Promise<BasicRef | undefined> => {
        if (ref === this.objArrayRef) {
            return this.objElementRef;
        }
        if (ref === this.memberArrayRef) {
            return this.memberElementRef;
        }
        if (ref === this.varArrayRef) {
            return this.varElementRef;
        }
        return undefined;
    });

    public getByteWidth = jest.fn(async (): Promise<number | undefined> => 4);

    public resolveColonPath = jest.fn(async (): Promise<EvalValue> => undefined);

    public readValue = jest.fn(async (container: RefContainer): Promise<EvalValue | undefined> => {
        const off = container.offsetBytes ?? 0;
        return this.values.get(off);
    });

    public writeValue = jest.fn(async (_container: RefContainer, value: EvalValue): Promise<EvalValue | undefined> => value);

    public _count = jest.fn(async (): Promise<number | undefined> => undefined);

    public _addr = jest.fn(async (): Promise<number | undefined> => undefined);

    public formatPrintf = jest.fn(async (): Promise<string | undefined> => undefined);

    public getValueType = jest.fn(async (): Promise<string | undefined> => undefined);

    public __GetRegVal = jest.fn(async (): Promise<number | bigint | undefined> => undefined);

    public __FindSymbol = jest.fn(async (): Promise<number | undefined> => undefined);

    public __CalcMemUsed = jest.fn(async (): Promise<number | undefined> => undefined);

    public __size_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Symbol_exists = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Offset_of = jest.fn(async (): Promise<number | undefined> => undefined);

    public __Running = jest.fn(async (): Promise<number | undefined> => undefined);
}

describe('evaluator data host hooks', () => {
    it('uses stride/offset/element helpers for array member reads', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('arr[2].field', false);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe(99);
        expect(host.getElementStride).toHaveBeenCalledTimes(1);
        expect(host.getElementRef).toHaveBeenCalledTimes(1);
        expect(host.getMemberOffset).toHaveBeenCalledTimes(1);
        expect(host.getByteWidth).toHaveBeenCalled();
    });

    it('calls resolveColonPath for colon expressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('foo:bar:baz', false);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe(300); // 3 parts * 100
        expect(host.resolveColonPath).toHaveBeenCalledTimes(1);
    });

    it('honors printf formatting override', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field]', true);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe('val=fmt-x-171');
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
    });

    it('recovers reference containers for printf subexpressions', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[arr[1].field + 1]', true);

        await evaluator.evaluateParseResult(pr, ctx);
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('does not recover containers for constant-only branches', async () => {
        const host = new HookHost();
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('val=%x[false ? arr[1].field : 5]', true);

        await evaluator.evaluateParseResult(pr, ctx);
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBeUndefined();
    });

    it('passes cached Uint8Array values to printf', async () => {
        const host = new HookHost({ disablePrintfOverride: true });
        // Override the value at offset 6 (arr[1].field) with a 6-byte MAC
        host.setValueAt(6, new Uint8Array([0x1e, 0x30, 0x6c, 0xa2, 0x45, 0x5f]));
        const ctx = new EvalContext({ data: host, container: host.root });
        const pr = parseExpression('mac=%M[arr[1].field]', true);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe('mac=1E-30-6C-A2-45-5F');
        expect(host.formatPrintf).toHaveBeenCalledTimes(1);
        expect(host.lastFormattingContainer?.current).toBe(host.fieldRef);
    });

    it('formats %M using memhost-backed bytes', async () => {
        const memHost = new MemoryHost();
        memHost.setVariable('mac', 6, new Uint8Array([0x1e, 0x30, 0x6c, 0xa2, 0x45, 0x5f]), 0);
        const debugTarget = {
            readMemory: jest.fn(async () => undefined),
            findSymbolNameAtAddress: jest.fn(async () => undefined),
            findSymbolContextAtAddress: jest.fn(async () => undefined),
            readUint8ArrayStrFromPointer: jest.fn(async () => undefined),
            findSymbolAddress: jest.fn(async () => undefined),
            getTargetIsRunning: jest.fn(async () => false),
        } as unknown as ScvdDebugTarget;
        const scvd = new ScvdEvalInterface(
            memHost,
            {} as RegisterHost,
            debugTarget,
            new ScvdFormatSpecifier()
        );
        const root = new MacRoot();
        const ctx = new EvalContext({ data: scvd, container: root });
        const pr = parseExpression('mac=%M[mac]', true);

        const out = await evaluator.evaluateParseResult(pr, ctx);
        expect(out).toBe('mac=1E-30-6C-A2-45-5F');
    });

    it('evaluates __CalcMemUsed with varied stack usage and uses the readMemory cache', async () => {
        const packWords = (...words: number[]) => {
            const bytes = new Uint8Array(words.length * 4);
            const view = new DataView(bytes.buffer);
            words.forEach((word, index) => view.setUint32(index * 4, word >>> 0, true));
            return bytes;
        };

        const makeFreeBytesData = (freeBytes: number, corruptMagicBytes = 0): Uint8Array => {
            const bytes = new Uint8Array(12);
            bytes.fill(0xcc);
            const view = new DataView(bytes.buffer);
            view.setUint32(0, magic >>> 0, true);
            if (corruptMagicBytes > 0) {
                const magicCorruptLen = Math.min(magicBytes, corruptMagicBytes);
                const start = magicBytes - magicCorruptLen;
                bytes.set(corruptBytes.subarray(0, magicCorruptLen), start);
            }
            if (freeBytes < 8) {
                bytes.set(corruptBytes.subarray(0, 8 - freeBytes), 4 + freeBytes);
            }
            return bytes;
        };

        const fill = 0xCCCCCCCC;
        const magic = 0xE25A2EA5;
        const magicBytes = 4;
        const corruptBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]);
        const cases = [
            { name: 'free 0 bytes', size: 12, data: makeFreeBytesData(0), usedBytes: 8, overflow: 0 },
            { name: 'free 1 bytes', size: 12, data: makeFreeBytesData(1), usedBytes: 8, overflow: 0 },
            { name: 'free 2 bytes', size: 12, data: makeFreeBytesData(2), usedBytes: 8, overflow: 0 },
            { name: 'free 3 bytes', size: 12, data: makeFreeBytesData(3), usedBytes: 8, overflow: 0 },
            { name: 'free 4 bytes', size: 12, data: makeFreeBytesData(4), usedBytes: 4, overflow: 0 },
            { name: 'free 5 bytes', size: 12, data: makeFreeBytesData(5), usedBytes: 4, overflow: 0 },
            { name: 'magic partially corrupted', size: 12, data: makeFreeBytesData(4, 1), usedBytes: 12, overflow: 1 },
            { name: 'all free', size: 8, data: packWords(magic, fill), usedBytes: 0, overflow: 0 },
            { name: 'all used', size: 8, data: packWords(magic, 0x11111111), usedBytes: 4, overflow: 0 },
            { name: 'overflow', size: 8, data: packWords(0xDEADBEEF, fill), usedBytes: 8, overflow: 1 },
            { name: 'magic corrupted with usage', size: 8, data: packWords(0xDEADBEEF, 0x11111111), usedBytes: 8, overflow: 1 },
            { name: 'fill equals magic', size: 8, data: packWords(0x11111111, magic), usedBytes: 8, overflow: 0, fillOverride: magic },
            { name: 'non-multiple size', size: 10, data: packWords(magic, fill, fill), usedBytes: 0, overflow: 0 },
        ];

        for (const testCase of cases) {
            const readMemoryFromTarget = jest.fn().mockResolvedValue(testCase.data);
            const debugTarget = new ScvdDebugTarget();
            (debugTarget as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = new TargetReadCache();
            (debugTarget as unknown as { readMemoryFromTarget: (addr: number | bigint, size: number) => Promise<Uint8Array | undefined> })
                .readMemoryFromTarget = readMemoryFromTarget;

            const evalIf = new ScvdEvalInterface(
                new MemoryHost(),
                {} as RegisterHost,
                debugTarget,
                new ScvdFormatSpecifier()
            );
            const ctx = new EvalContext({ data: evalIf, container: new BasicRef() });
            const pr = parseExpression(
                `__CalcMemUsed(0x1000, ${testCase.size}, 0x${(testCase.fillOverride ?? fill).toString(16).toUpperCase()}, 0x${magic.toString(16).toUpperCase()})`,
                false
            );

            const out1 = await evaluator.evaluateParseResult(pr, ctx);
            const out2 = await evaluator.evaluateParseResult(pr, ctx);

            const usedPercent = Math.trunc((testCase.usedBytes * 100) / testCase.size);
            const expected = ((testCase.usedBytes & 0xfffff) | ((usedPercent & 0xff) << 20) | (testCase.overflow ? 1 << 31 : 0)) >>> 0;
            expect(out1).toBe(expected);
            expect(out2).toBe(expected);
            expect(readMemoryFromTarget).toHaveBeenCalledTimes(1);
        }

        const readMemoryFromTarget = jest.fn();
        const debugTarget = new ScvdDebugTarget();
        (debugTarget as unknown as { targetReadCache: TargetReadCache | undefined }).targetReadCache = new TargetReadCache();
        (debugTarget as unknown as { readMemoryFromTarget: (addr: number | bigint, size: number) => Promise<Uint8Array | undefined> })
            .readMemoryFromTarget = readMemoryFromTarget;
        const evalIf = new ScvdEvalInterface(
            new MemoryHost(),
            {} as RegisterHost,
            debugTarget,
            new ScvdFormatSpecifier()
        );
        const ctx = new EvalContext({ data: evalIf, container: new BasicRef() });
        const addrZero = parseExpression(
            `__CalcMemUsed(0, 8, 0x${fill.toString(16).toUpperCase()}, 0x${magic.toString(16).toUpperCase()})`,
            false
        );
        await expect(evaluator.evaluateParseResult(addrZero, ctx)).resolves.toBe(0);
        const sizeZero = parseExpression(
            `__CalcMemUsed(0x1000, 0, 0x${fill.toString(16).toUpperCase()}, 0x${magic.toString(16).toUpperCase()})`,
            false
        );
        await expect(evaluator.evaluateParseResult(sizeZero, ctx)).resolves.toBe(0);
        expect(readMemoryFromTarget).not.toHaveBeenCalled();
    });

    it('computes nested array offsets for member and var arrays', async () => {
        const host = new NestedArrayHost();
        const ctx = new EvalContext({ data: host, container: host.root });

        const memberExpr = parseExpression('obj[1].member[2]', false);
        const memberOut = await evaluator.evaluateParseResult(memberExpr, ctx);
        expect(memberOut).toBe(111);

        const varExpr = parseExpression('obj[1].var[2]', false);
        const varOut = await evaluator.evaluateParseResult(varExpr, ctx);
        expect(varOut).toBe(222);
    });
});
