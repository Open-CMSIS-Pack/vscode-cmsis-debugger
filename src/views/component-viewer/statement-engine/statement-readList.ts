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

import { componentViewerLogger } from '../../../logger';
import { ScvdNode } from '../model/scvd-node';
import { ScvdReadList } from '../model/scvd-readlist';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';
import { perf } from '../stats-config';

type ResolvedReadList = {
    itemName: string;
    targetSize: number;
    virtualSize: number;
    readBytes: number;
    virtualBytes: number;
    baseAddress: number | bigint;
    isConst: boolean;
    init: number;
    symbolName: string | undefined;
    isPointerArray: boolean;
    maxArraySize: number;
};

export class StatementReadList extends StatementBase {
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
        // Cortex-M: treat 0 or >= 0xFFFFFFF0 as invalid pointer addresses (stop readlist).
        if (typeof address === 'bigint') {
            return address === 0n || address >= BigInt(StatementReadList.INVALID_ADDR_MIN);
        }
        return address === 0 || address >= StatementReadList.INVALID_ADDR_MIN;
    }

    private async resolveReadList(
        scvdReadList: ScvdReadList,
        executionContext: ExecutionContext,
        logErrors: boolean,
        options?: { includeMaxArraySize?: boolean; count?: number }
    ): Promise<ResolvedReadList | undefined> {

        const itemName = scvdReadList.name;
        if (itemName === undefined) {
            if (logErrors) {
                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": no name defined`);
            }
            return undefined;
        }

        const targetSize = await scvdReadList.getTargetSize();
        if (targetSize === undefined) {
            if (logErrors) {
                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, type: ${scvdReadList.getDisplayLabel()}, could not determine target size`);
            }
            return undefined;
        }
        const virtualSize = (await scvdReadList.getVirtualSize()) ?? targetSize;

        const isPointerArray = scvdReadList.based === 1;
        const readBytes = isPointerArray ? 4 : targetSize;
        const virtualBytes = isPointerArray ? 4 : virtualSize;

        let baseAddress: number | bigint | undefined = undefined;
        const symbol = scvdReadList.symbol;
        const symbolName = symbol?.symbol;
        if (symbolName !== undefined) {
            const symAddr = await executionContext.debugTarget.findSymbolAddress(symbolName);
            if (symAddr === undefined) {
                if (logErrors) {
                    componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not find symbol address for symbol: ${symbolName}`);
                }
                return undefined;
            }
            baseAddress = typeof symAddr === 'bigint' ? symAddr : (symAddr >>> 0);
        }

        const offset = scvdReadList.offset ? await scvdReadList.offset.getValue() : undefined;
        if (offset !== undefined) {
            let offs: bigint | undefined;
            if (typeof offset === 'bigint') {
                offs = offset;
            } else if (typeof offset === 'number') {
                offs = BigInt(Math.trunc(offset));
            } else {
                if (logErrors) {
                    componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, offset is not numeric`);
                }
                return undefined;
            }
            baseAddress = baseAddress !== undefined
                ? (typeof baseAddress === 'bigint' ? baseAddress + offs : (BigInt(baseAddress >>> 0) + offs))
                : offs;
        }

        if (baseAddress === undefined) {
            if (logErrors) {
                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, offset evaluated to undefined`);
            }
            return undefined;
        }
        if (this.isInvalidAddress(baseAddress)) {
            return undefined;
        }

        let maxArraySize = ScvdReadList.READ_SIZE_MAX;
        if (options?.includeMaxArraySize && symbolName !== undefined) {
            const count = options.count;
            if (count === undefined || count > 1) {
                const resolvedCount = await executionContext.debugTarget.getNumArrayElements(symbolName);
                maxArraySize = resolvedCount ?? 1;
            }
        }

        return {
            itemName,
            targetSize,
            virtualSize,
            readBytes,
            virtualBytes,
            baseAddress,
            isConst: scvdReadList.const === true,
            init: scvdReadList.getInit(),
            symbolName,
            isPointerArray,
            maxArraySize
        };
    }

    protected override async onExecute(executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        const mustRead = this.scvdItem.mustRead;
        if (mustRead === false) {
            componentViewerLogger.debug(`Line: ${this.line}: Skipping "read" as already initialized: ${this.scvdItem.name}`);
            return;
        }

        const scvdReadList = this.scvdItem.castToDerived(ScvdReadList);
        if (scvdReadList === undefined) {
            componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": could not cast to ScvdReadList`);
            return;
        }

        const count = await scvdReadList.getCount();  // Number of list items to read, default is 1. Limited to 1..1024 in ScvdExpression.
        const resolveStart = perf?.start() ?? 0;
        const resolved = await this.resolveReadList(scvdReadList, executionContext, true, {
            includeMaxArraySize: count === undefined || count > 1,
            ...(count !== undefined ? { count } : {})
        });
        perf?.end(resolveStart, 'readListResolveMs', 'readListResolveCalls');
        if (!resolved) {
            return;
        }

        const symbol = scvdReadList.symbol;
        const {
            itemName,
            targetSize,
            virtualSize,
            readBytes,
            virtualBytes,
            baseAddress,
            isConst,
            init,
            isPointerArray
        } = resolved;
        const maxArraySize = resolved.maxArraySize;

        // ---- handle init ----
        if (init === 1) {
            executionContext.memoryHost.clearVariable(itemName);
        }

        // ---- prepare for linked list read if next member is defined ----
        let nextOffset: number | undefined = undefined;
        let nextTargetSize: number | undefined = undefined;

        const next = scvdReadList.getNext();    // Name of a member element in the list that is used as next pointer. This is used to read a linked list. <readlist> stops reading on a NULL pointer.
        if (next !== undefined) {
        // ---- fetch type info ----
            const typeItem = scvdReadList.type;
            if (typeItem === undefined) {
                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, no type defined`);
                return;
            }

            const nextMember = typeItem.getMember(next);
            if (nextMember !== undefined) {
                nextTargetSize = await nextMember.getTargetSize();
                nextOffset = await nextMember.getMemberOffset();
                if (nextTargetSize === undefined || nextOffset === undefined) {
                    componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not determine size/offset of next member: ${next} in type: ${typeItem.getDisplayLabel()}`);
                    return;
                }
                if (nextTargetSize > 4) {
                    componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, next member: ${next} size is larger than 4 bytes (${nextTargetSize} bytes)`);
                    return;
                }
            }
        }
        componentViewerLogger.debug(`Line: ${this.line}: Executing target readlist: ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes`);

        // ---- calculate next address ----
        let nextPtrAddr: number | bigint | undefined = typeof baseAddress === 'bigint' ? baseAddress : (baseAddress >>> 0);

        const shouldBatchRead = next === undefined
            && count !== undefined
            && count <= maxArraySize
            && count <= ScvdReadList.READ_SIZE_MAX;
        let didBatchRead = false;

        if (shouldBatchRead) {
            const batchStart = perf?.start() ?? 0;
            const baseNum = typeof baseAddress === 'bigint' ? baseAddress : BigInt(baseAddress >>> 0);
            const totalBytes = count * readBytes;
            const readData = await executionContext.debugTarget.readMemory(baseNum, totalBytes);
            if (readData === undefined) {
                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${totalBytes} bytes, read target memory failed`);
            } else {
                if (isPointerArray) {
                    const view = new DataView(readData.buffer, readData.byteOffset, readData.byteLength);
                    const requests: Array<{ key: string; address: number; size: number }> = [];
                    for (let readIdx = 0; readIdx < count; readIdx++) {
                        const ptrOffset = readIdx * 4;
                        if (ptrOffset + 4 > readData.length) {
                            break;
                        }
                        const addr = view.getUint32(ptrOffset, true);
                        if (this.isInvalidAddress(addr)) {
                            break;
                        }
                        const key = `${this.scvdItem.getLineNoStr()}:StatementReadList:${itemName}:ptr:${readIdx}`;
                        requests.push({ key, address: addr, size: targetSize });
                    }
                    if (requests.length > 0) {
                        const results = await executionContext.debugTarget.readMemoryBatch(requests);
                        const storeStart = perf?.start() ?? 0;
                        for (const req of requests) {
                            const itemData = results.get(req.key);
                            if (!itemData) {
                                componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${req.address}, size: ${targetSize} bytes, read target memory failed`);
                                break;
                            }
                            executionContext.memoryHost.setVariable(
                                itemName,
                                targetSize,
                                itemData,
                                -1,
                                req.address,
                                virtualSize,
                                isConst ? true : undefined
                            );
                        }
                        perf?.end(storeStart, 'readListStoreMs', 'readListStoreCalls');
                    }
                } else {
                    const storeStart = perf?.start() ?? 0;
                    for (let readIdx = 0; readIdx < count; readIdx++) {
                        const itemOffset = readIdx * readBytes;
                        const itemData = readData.subarray(itemOffset, itemOffset + readBytes);
                        const itemAddress = typeof baseAddress === 'bigint'
                            ? baseNum + BigInt(readIdx * targetSize)
                            : baseAddress + (readIdx * targetSize);
                        executionContext.memoryHost.setVariable(
                            itemName,
                            readBytes,
                            itemData,
                            -1,
                            typeof itemAddress === 'bigint' ? Number(itemAddress) : itemAddress,
                            virtualBytes,
                            isConst ? true : undefined
                        );
                    }
                    perf?.end(storeStart, 'readListStoreMs', 'readListStoreCalls');
                }
                didBatchRead = true;
            }
            perf?.end(batchStart, 'readListBatchMs', 'readListBatchCalls');
        }

        if (!didBatchRead) {
            const loopStart = perf?.start() ?? 0;
            let readIdx = 0;
            while (nextPtrAddr !== undefined) {
                const itemAddress: number | bigint | undefined = typeof nextPtrAddr === 'bigint' ? nextPtrAddr : (nextPtrAddr >>> 0);

                // Read data from target
                const readData = await executionContext.debugTarget.readMemory(itemAddress, readBytes);
                if (readData === undefined) {
                    componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${baseAddress}, size: ${readBytes} bytes, read target memory failed`);
                    break;
                }

                if (isPointerArray) {
                    const addr = (readData[0] | (readData[1] << 8) | (readData[2] << 16) | (readData[3] << 24)) >>> 0;
                    if (this.isInvalidAddress(addr)) {
                        break;
                    }
                    const itemData = await executionContext.debugTarget.readMemory(addr, targetSize);
                    if (itemData === undefined) {
                        componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, address: ${addr}, size: ${targetSize} bytes, read target memory failed`);
                        break;
                    }
                    const storeStart = perf?.start() ?? 0;
                    executionContext.memoryHost.setVariable(
                        itemName,
                        targetSize,
                        itemData,
                        -1,
                        addr,
                        virtualSize,
                        isConst ? true : undefined
                    );
                    perf?.end(storeStart, 'readListStoreMs', 'readListStoreCalls');
                } else {
                    // Store in memory host
                    const storeStart = perf?.start() ?? 0;
                    executionContext.memoryHost.setVariable(
                        itemName,
                        readBytes,
                        readData,
                        -1,
                        typeof itemAddress === 'bigint' ? Number(itemAddress) : itemAddress,
                        virtualBytes,
                        isConst ? true : undefined
                    );
                    perf?.end(storeStart, 'readListStoreMs', 'readListStoreCalls');
                }
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
                        componentViewerLogger.error(`Line: ${this.line}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, could not extract next pointer data from read data`);
                        break;
                    }
                    nextPtrAddr = (nextPtrUint8Arr[0] | (nextPtrUint8Arr[1] << 8) | (nextPtrUint8Arr[2] << 16) | (nextPtrUint8Arr[3] << 24)) >>> 0;
                } else {
                    const baseNum = typeof baseAddress === 'bigint' ? baseAddress : BigInt(baseAddress >>> 0);
                    const stride = BigInt(isPointerArray ? (readIdx * 4) : (readIdx * targetSize));
                    nextPtrAddr = baseNum + stride;
                }

                if (this.isInvalidAddress(nextPtrAddr)) { // NULL or invalid pointer, end of list
                    nextPtrAddr = undefined;
                } else if (nextPtrAddr === itemAddress) {    // loop detection
                    console.warn(`${this.scvdItem.getLineNoStr()}: Executing "readlist": ${scvdReadList.name}, symbol: ${symbol?.name}, detected loop in linked list at address: ${itemAddress.toString(16)}`);
                    break;
                }
            }
            perf?.end(loopStart, 'readListLoopMs', 'readListLoopCalls');
        }

        if (isConst) {   // Mark variable as already initialized
            scvdReadList.mustRead = false;
        }
    }
}
