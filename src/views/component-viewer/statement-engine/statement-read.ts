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

import { ScvdNode } from '../model/scvd-node';
import { ScvdRead } from '../model/scvd-read';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementRead extends StatementBase {
    private static readonly INVALID_ADDR_MIN = 0xFFFFFFF0;

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected override async shouldExecute(_executionContext: ExecutionContext): Promise<boolean> {
        if (this.scvdItem.mustRead === false) {
            return false;
        }
        const conditionResult = await this.scvdItem.getConditionResult();
        return conditionResult !== false;
    }

    private isInvalidAddress(address: number | bigint): boolean {
        // Cortex-M: treat 0 or >= 0xFFFFFFF0 as invalid pointer addresses (skip read).
        if (typeof address === 'bigint') {
            return address === 0n || address >= BigInt(StatementRead.INVALID_ADDR_MIN);
        }
        return address === 0 || address >= StatementRead.INVALID_ADDR_MIN;
    }

    private async resolveRead(
        executionContext: ExecutionContext,
        logErrors: boolean
    ): Promise<{
        name: string;
        readBytes: number;
        fullVirtualStrideSize: number;
        baseAddress: number | bigint;
        isConst: boolean;
        symbolName: string | undefined;
    } | undefined> {
        const scvdRead = this.scvdItem.castToDerived(ScvdRead);
        if (scvdRead === undefined) {
            return undefined;
        }

        const name = scvdRead.name;
        if (name === undefined) {
            if (logErrors) {
                console.error(`${this.line}: Executing "read": no name defined`);
            }
            return undefined;
        }

        const targetSize = await scvdRead.getTargetSize(); // use size specified in SCVD
        if (targetSize === undefined) {
            if (logErrors) {
                console.error(`${this.line} Executing "read": ${scvdRead.name}, type: ${scvdRead.getDisplayLabel()}, could not determine target size`);
            }
            return undefined;
        }
        const virtualSize = (await scvdRead.getVirtualSize()) ?? targetSize;
        const sizeValue = await scvdRead.getArraySize();
        const numOfElements = sizeValue ?? 1;
        const readBytes = numOfElements * targetSize;
        const fullVirtualStrideSize = virtualSize * numOfElements;
        let baseAddress: number | bigint | undefined = undefined;

        const symbol = scvdRead.symbol;
        const symbolName = symbol?.symbol;
        if (symbolName !== undefined) {
            const symAddr = await executionContext.debugTarget.findSymbolAddress(symbolName);
            if (symAddr === undefined) {
                if (logErrors) {
                    console.error(`${this.line}: Executing "read": ${scvdRead.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbolName}`);
                }
                return undefined;
            }
            baseAddress = typeof symAddr === 'bigint' ? symAddr : (symAddr >>> 0);
        }

        const offset = scvdRead.offset ? await scvdRead.offset.getValue() : undefined;
        if (offset !== undefined) {
            let offs: bigint | undefined;
            if (typeof offset === 'bigint') {
                offs = offset;
            } else if (typeof offset === 'number') {
                offs = BigInt(Math.trunc(offset));
            } else {
                if (logErrors) {
                    console.error(`${this.line}: Executing "read": ${scvdRead.name}, offset is not numeric`);
                }
                return undefined;
            }
            if (offs !== undefined) {
                baseAddress = baseAddress !== undefined
                    ? (typeof baseAddress === 'bigint' ? baseAddress + offs : (BigInt(baseAddress >>> 0) + offs))
                    : offs;
            }
        }

        if (baseAddress === undefined) {
            if (logErrors) {
                console.error(`${this.line}: Executing "read": ${scvdRead.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbolName}`);
            }
            return undefined;
        }
        if (this.isInvalidAddress(baseAddress)) {
            return undefined;
        }

        return {
            name,
            readBytes,
            fullVirtualStrideSize,
            baseAddress,
            isConst: scvdRead.const === true,
            symbolName
        };
    }

    protected override async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        //console.log(`${this.line}: Executing read: ${this.scvdItem.getDisplayLabel()}`);
        const mustRead = this.scvdItem.mustRead;
        if (mustRead === false) {
            //console.log(`${this.scvdItem.getLineNoStr()}: Skipping "read" as already initialized: ${this.scvdItem.name}`);
            return;
        }

        const resolved = await this.resolveRead(executionContext, true);
        if (!resolved) {
            return;
        }

        // Read from target memory
        const readData = await executionContext.debugTarget.readMemory(resolved.baseAddress, resolved.readBytes);
        if (readData === undefined) {
            console.error(`${this.line}: Executing "read": ${resolved.name}, symbol: ${resolved.symbolName}, address: ${resolved.baseAddress}, size: ${resolved.readBytes} bytes, read target memory failed`);
            return;
        }

        // Write to local variable cache
        executionContext.memoryHost.setVariable(
            resolved.name,
            resolved.readBytes,
            readData,
            0,
            typeof resolved.baseAddress === 'bigint' ? Number(resolved.baseAddress) : (resolved.baseAddress >>> 0),
            resolved.fullVirtualStrideSize,
            resolved.isConst ? true : undefined
        );

        // TOIMPL: do not set if read failed, investigate
        if (resolved.isConst) {   // Mark variable as already initialized
            //this.scvdItem.mustRead = false;
        }
        return;
    }
}
