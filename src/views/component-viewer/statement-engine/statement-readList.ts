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
import { ScvdReadList } from '../model/scvd-readlist';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementReadList extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    protected override async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        const mustRead = this.scvdItem.mustRead;
        if (mustRead === false) {
            //console.log(`${this.scvdItem.getLineNoStr()}: Skipping "read" as already initialized: ${this.scvdItem.name}`);
            return;
        }

        const scvdReadList = this.scvdItem.castToDerived(ScvdReadList);
        if (scvdReadList === undefined) {
            console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": could not cast to ScvdReadList`);
            return;
        }

        // ---- fetch item name ----
        const itemName = scvdReadList.name;
        if (itemName === undefined) {
            console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": no name defined`);
            return;
        }

        // ---- handle init ----
        const init = scvdReadList.getInit();    // When init="1" previous read items in the list are discarded. Default value is 0.
        if (init === 1) {
            executionContext.memoryHost.clearVariable(itemName);
        }

        // ---- fetch type size ----
        const targetSize = scvdReadList.getTargetSize();
        if (targetSize === undefined) {
            console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, type: ${scvdReadList.getDisplayLabel()}, could not determine target size`);
            return;
        }
        const virtualSize = scvdReadList.getVirtualSize() ?? targetSize;    // if type has <var> members, include their size in the variable allocation

        // ---- calculate read size ----
        const isPointer = scvdReadList.getIsPointer();  // When based="1" the attribute symbol and attribute offset specifies a pointer (or pointer array). Default value is 0.
        const readBytes = (isPointer === true)? 4 : targetSize;
        const virtualBytes = (isPointer === true)? 4 : virtualSize;

        // ---- calculate base address from symbol and/or offset ----
        let baseAddress: number | bigint | undefined = undefined;
        let maxArraySize: number = 1024;

        // Check if symbol address is defined, use as base address
        const symbol = scvdReadList.symbol;
        if (symbol?.symbol !== undefined) {
            const symAddr = await executionContext.debugTarget.findSymbolAddress(symbol.symbol);
            if (symAddr === undefined) {
                console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbol?.symbol}`);
                return;
            }
            baseAddress = symAddr >>> 0;

            // fetch maximum existing array size
            const resolvedCount = await executionContext.debugTarget.getNumArrayElements(symbol.symbol);
            maxArraySize = resolvedCount ?? 1;
        }

        // Add offset to base address. If no symbol defined, offset is used as base address
        const offset = scvdReadList.offset ? await scvdReadList.offset.getValue() : undefined; // Offset is attr: size plus var symbols!
        if (offset !== undefined) {
            let offs: bigint | undefined;
            if (typeof offset === 'bigint') {
                offs = offset;
            } else if (typeof offset === 'number') {
                offs = BigInt(Math.trunc(offset));
            } else {
                console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, offset is not numeric`);
                return;
            }
            baseAddress = baseAddress !== undefined
                ? (typeof baseAddress === 'bigint' ? baseAddress + offs : (BigInt(baseAddress >>> 0) + offs))
                : offs;
        }

        // Check that base address is valid
        if (baseAddress === undefined) {
            console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbol?.symbol}`);
            return;
        }

        // ---- prepare for linked list read if next member is defined ----
        let nextOffset: number | undefined = undefined;
        let nextTargetSize: number | undefined = undefined;

        const next = scvdReadList.getNext();    // Name of a member element in the list that is used as next pointer. This is used to read a linked list. <readlist> stops reading on a NULL pointer.
        if (next !== undefined) {
        // ---- fetch type info ----
            const typeItem = scvdReadList.type;
            if (typeItem === undefined) {
                console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, no type defined`);
                return;
            }

            const nextMember = typeItem.getMember(next);
            if (nextMember !== undefined) {
                nextTargetSize = nextMember.getTargetSize();
                nextOffset = await nextMember.getMemberOffset();
                if (nextTargetSize === undefined || nextOffset === undefined) {
                    console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not determine size/offset of next member: ${next} in type: ${typeItem.getDisplayLabel()}`);
                    return;
                }
                if (nextTargetSize > 4) {
                    console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, next member: ${next} size is larger than 4 bytes (${nextTargetSize} bytes)`);
                    return;
                }
            }
        }
        //console.log(`${this.scvdItem.getLineNoStr()}: Executing target readlist: ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes`);

        // ---- fetch count of items to read. count is always 1..1024 ----
        const count = await scvdReadList.getCount();  // Number of list items to read, default is 1. Limited to 1..1024 in ScvdExpression.

        // ---- calculate next address ----
        let nextPtrAddr: number | bigint | undefined = typeof baseAddress === 'bigint' ? baseAddress : (baseAddress >>> 0);

        let readIdx = 0;
        while(nextPtrAddr !== undefined) {
            const itemAddress: number | bigint | undefined = typeof nextPtrAddr === 'bigint' ? nextPtrAddr : (nextPtrAddr >>> 0);

            // Read data from target
            const readData = await executionContext.debugTarget.readMemory(itemAddress, readBytes);
            if (readData === undefined) {
                console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes, read target memory failed`);
                break;
            }

            // Store in memory host
            executionContext.memoryHost.setVariable(itemName, readBytes, readData, -1, typeof itemAddress === 'bigint' ? Number(itemAddress) : itemAddress, virtualBytes);
            readIdx ++;

            // check count
            if (count !== undefined) {
                if (readIdx >= count) {
                    break;
                } else if (readIdx > maxArraySize) {
                    console.warn(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, reached maximum array size: ${maxArraySize} for variable: ${itemName}`);
                    break;
                }
            }
            // Check overall maximum read size
            if (readIdx >= ScvdReadList.READ_SIZE_MAX) {
                break;
            }
            // If neither count or next is defined, read only one item
            if (count === undefined && next === undefined) {
                break;
            }

            // calculate next address
            if (next) {
                if (nextTargetSize === undefined || nextOffset === undefined) {
                    break;
                }
                const nextPtrUint8Arr = readData.subarray(nextOffset, nextOffset + nextTargetSize);
                if (nextPtrUint8Arr.length !== nextTargetSize) {
                    console.error(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not extract next pointer data from read data`);
                    break;
                }
                nextPtrAddr = (nextPtrUint8Arr[0] | (nextPtrUint8Arr[1] << 8) | (nextPtrUint8Arr[2] << 16) | (nextPtrUint8Arr[3] << 24)) >>> 0;
            } else {
                const baseNum = typeof baseAddress === 'bigint' ? baseAddress : BigInt(baseAddress >>> 0);
                const stride = BigInt(isPointer ? (readIdx * 4) : (readIdx * targetSize));
                nextPtrAddr = baseNum + stride;
            }

            if (nextPtrAddr === 0 || nextPtrAddr === 0n) { // NULL pointer, end of linked list
                nextPtrAddr = undefined;
            } else if (nextPtrAddr === itemAddress) {    // loop detection
                console.warn(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, detected loop in linked list at address: ${itemAddress.toString(16)}`);
                break;
            }
        }

        if (scvdReadList.const === true) {   // Mark variable as already initialized
            scvdReadList.mustRead = false;
        }
    }
}
