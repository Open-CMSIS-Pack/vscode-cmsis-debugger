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

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected override async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        //console.log(`${this.line}: Executing read: ${this.scvdItem.getDisplayLabel()}`);
        const mustRead = this.scvdItem.mustRead;
        if (mustRead === false) {
            //console.log(`${this.scvdItem.getLineNoStr()}: Skipping "read" as already initialized: ${this.scvdItem.name}`);
            return;
        }

        const scvdRead = this.scvdItem.castToDerived(ScvdRead);
        if (scvdRead === undefined) {
            return;
        }

        const name = scvdRead.name;
        if (name === undefined) {
            console.error(`${this.line}: Executing "read": no name defined`);
            return;
        }

        const targetSize = await scvdRead.getTargetSize(); // use size specified in SCVD
        if (targetSize === undefined) {
            console.error(`${this.line} Executing "read": ${scvdRead.name}, type: ${scvdRead.getDisplayLabel()}, could not determine target size`);
            return;
        }
        const virtualSize = (await scvdRead.getVirtualSize()) ?? targetSize;
        const sizeValue = await scvdRead.getArraySize();
        const numOfElements = sizeValue ?? 1;
        const readBytes = numOfElements * targetSize; // Is an Expressions representing the array size or the number of values to read from target. The maximum array size is limited to 512. Default value is 1.
        const fullVirtualStrideSize = virtualSize * numOfElements;
        let baseAddress: number | bigint | undefined = undefined;

        // Check if symbol address is defined
        const symbol = scvdRead.symbol;
        if (symbol?.symbol !== undefined) {
            const symAddr = await executionContext.debugTarget.findSymbolAddress(symbol.symbol);
            if (symAddr === undefined) {
                console.error(`${this.line}: Executing "read": ${scvdRead.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbol?.symbol}`);
                return;
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
                console.error(`${this.line}: Executing "read": ${scvdRead.name}, offset is not numeric`);
                return;
            }
            if (offs !== undefined) {
                baseAddress = baseAddress !== undefined
                    ? (typeof baseAddress === 'bigint' ? baseAddress + offs : (BigInt(baseAddress >>> 0) + offs))
                    : offs;
            }
        }

        if (baseAddress === undefined) {
            console.error(`${this.line}: Executing "read": ${scvdRead.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbol?.symbol}`);
            return;
        }
        //console.log(`${this.line}: Executing target read: ${scvdRead.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes`);

        // Read from target memory
        const readData = await executionContext.debugTarget.readMemory(baseAddress, readBytes);
        if (readData === undefined) {
            console.error(`${this.line}: Executing "read": ${scvdRead.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes, read target memory failed`);
            return;
        }

        // Write to local variable cache
        executionContext.memoryHost.setVariable(name, readBytes, readData, 0, typeof baseAddress === 'bigint' ? Number(baseAddress) : (baseAddress >>> 0), fullVirtualStrideSize);

        // TOIMPL: do not set if read failed, investigate
        if (scvdRead.const === true) {   // Mark variable as initialized if some data has been read
            if (readData.some((byte) => byte !== 0x00)) {
                ; //scvdRead.mustRead = false; // TOIMPL: Re-enable once target updates are consistent
            }
        }
        return;
    }
}
