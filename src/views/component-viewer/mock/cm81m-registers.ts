/**
 * Copyright 2025 Arm Limited
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

import { ReadRegFn, registerAlias, registerNorm } from '../memory-host/register-host';

/** Wide mock covering typical Armv8.1-M core + FP regs. */
export function createMockCm81MRegisterReader(): ReadRegFn {
    const gen: Record<string, number> = {};
    for (let i = 0; i <= 12; i++) gen[`R${i}`] = 0x1000 + i;
    gen.SP = 0x20001000;
    gen.MSP = 0x20001000;
    gen.PSP = 0x20002000;
    gen.LR = 0x08000123;
    gen.PC = 0x08001234;
    gen.XPSR = 0x01000000;
    gen.APSR = 0x00000000;
    gen.IPSR = 0x00000011;
    gen.EPSR = 0x01000000;
    gen.CONTROL = 0x00000002; // SPSEL=1 -> PSP
    gen.PRIMASK = 0x00000000;
    gen.BASEPRI = 0x00000000;
    gen.FAULTMASK = 0x00000000;
    gen.MSPLIM = 0x20000000;
    gen.PSPLIM = 0x20000000;

    for (let s = 0; s <= 31; s++) gen[`S${s}`] = (0x3f800000 + s) >>> 0;
    gen.FPSCR = 0x00000000;
    gen.FPCCR = 0xC0000000;
    gen.FPCAR = 0x20003000;
    gen.FPDSCR = 0x00000000;

    return (name: string) => {
        const a = registerAlias(name);
        const n = registerNorm(name);
        return gen[n] ?? gen[a] ?? undefined;
    };
}
