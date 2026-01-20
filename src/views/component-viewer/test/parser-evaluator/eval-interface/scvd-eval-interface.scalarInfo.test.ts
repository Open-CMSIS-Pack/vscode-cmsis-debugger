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
 *
 * Tests for scalar info derivation (padding/bit-width) in ScvdEvalInterface.
 */
// generated with AI

import { ScvdEvalInterface } from '../../../scvd-eval-interface';
import { FormatTypeInfo } from '../../../model/scvd-format-specifier';
import { ScvdFormatSpecifier } from '../../../model/scvd-format-specifier';
import { RefContainer } from '../../../parser-evaluator/model-host';
import { MemoryHost } from '../../../data-host/memory-host';
import { RegisterHost } from '../../../data-host/register-host';
import { ScvdDebugTarget } from '../../../scvd-debug-target';
import { ScvdNode } from '../../../model/scvd-node';

class ScalarBase extends ScvdNode {
    constructor(private readonly typeName?: string, private readonly size?: number, private readonly arrayCount?: number) {
        super(undefined);
    }
    public override getValueType(): string | undefined {
        return this.typeName;
    }
    public override getTargetSize(): number | undefined {
        return this.size;
    }
    public override async getArraySize(): Promise<number | undefined> {
        return this.arrayCount;
    }
}

function makeEval() {
    const memHost = {} as unknown as MemoryHost;
    const regHost = {} as unknown as RegisterHost;
    const debugTarget = {} as unknown as ScvdDebugTarget;
    const formatter = new ScvdFormatSpecifier();
    return new ScvdEvalInterface(memHost, regHost, debugTarget, formatter);
}

describe('ScvdEvalInterface.getScalarInfo padding rules', () => {
    it('pads single scalars using target size when no bits provided', async () => {
        const ev = makeEval();
        const base = new ScalarBase('uint32_t', 4, undefined);
        const info = await (ev as unknown as { getScalarInfo(c: RefContainer): Promise<FormatTypeInfo | undefined> })
            .getScalarInfo({ base, current: base, valueType: undefined } as RefContainer);
        expect(info).toBeDefined();
        expect(info!.bits).toBe(32);
    });

    it('does not inflate bits by array length and uses 32-bit default for arrays', async () => {
        const ev = makeEval();
        const base = new ScalarBase('uint8_t', 1, 128); // array length 128, element 1 byte
        const info = await (ev as unknown as { getScalarInfo(c: RefContainer): Promise<FormatTypeInfo | undefined> })
            .getScalarInfo({ base, current: base, valueType: undefined } as RefContainer);
        expect(info).toBeDefined();
        expect(info!.bits).toBe(32); // default array padding
    });

    it('respects explicit 64-bit scalar widths but caps extremely large sizes', async () => {
        const ev = makeEval();
        const base = new ScalarBase('uint64_t', 16, undefined); // pretend 128-bit size
        const info = await (ev as unknown as { getScalarInfo(c: RefContainer): Promise<FormatTypeInfo | undefined> })
            .getScalarInfo({ base, current: base, valueType: undefined } as RefContainer);
        expect(info).toBeDefined();
        expect(info!.bits).toBe(64);
    });

    it('defaults unknown wide types to 32-bit padding', async () => {
        const ev = makeEval();
        const base = new ScalarBase(undefined, 8, undefined); // unknown type, 8-byte size
        const info = await (ev as unknown as { getScalarInfo(c: RefContainer): Promise<FormatTypeInfo | undefined> })
            .getScalarInfo({ base, current: base, valueType: undefined } as RefContainer);
        expect(info).toBeDefined();
        expect(info!.bits).toBe(32);
    });
});
