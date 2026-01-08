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

import { DebugTargetMock } from './debug-target-mock';
import { ComponentViewerTargetAccess } from './component-viewer-target-access';
import { GDBTargetDebugSession } from '../../debug-session/gdbtarget-debug-session';
import { createMockDebugSession } from './component-viewer-controller';

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

export class ScvdDebugTarget {
    private mock = new DebugTargetMock();
    private activeSession: GDBTargetDebugSession = createMockDebugSession();
    private targetAccess: ComponentViewerTargetAccess;

    constructor(
    ) {
        this.targetAccess = new ComponentViewerTargetAccess();
    }

    // -------------  Interface to debugger  -----------------
    public init(session: GDBTargetDebugSession): void {
        this.activeSession = session;
        this.targetAccess.setActiveSession(session);
    }
    public async getSymbolInfo(symbol: string): Promise<SymbolInfo | undefined> {
        if(symbol === undefined) {
            return undefined;
        }
        // if the session is a mock session, return mock data. if it's not a mock session, use the target access to get real data
        if(this.activeSession.session.id.startsWith('mock-session-')) {
            return this.mock.getMockSymbolInfo(symbol);
        } else {
            const symbolName = symbol;
            const symbolAddressStr = await this.targetAccess.evaluateSymbolAddress(symbol);
            if(symbolAddressStr !== undefined) {
                const symbolInfo : SymbolInfo = {
                    name: symbolName,
                    address: parseInt(symbolAddressStr as unknown as string, 16)
                };
                return symbolInfo;
            }
            return undefined;
        }
    }

    public async findSymbolNameAtAddress(address: number): Promise<string | undefined> {
        // TODO For real sessions, this functionality is not implemented yet
        if(this.activeSession.session.id.startsWith('mock-session-')) {
            return Promise.resolve(undefined);
        } else {
            return await this.targetAccess.evaluateSymbolName(address.toString());
        }
    }

    public getNumArrayElements(symbol: string): number | undefined {
        if(symbol === undefined) {
            return undefined;
        }
        // if the session is a mock session, return mock data. if it's not a mock session, use the target access to get real data
        if(this.activeSession.session.id.startsWith('mock-session-')) {
            const symbolInfo = this.mock.getMockSymbolInfo(symbol);
            if(symbolInfo !== undefined) {
                return symbolInfo?.member?.length ?? 1;
            }
        } else {
            // TODO For real sessions, this functionality is not implemented yet
        }
        return undefined;
    }

    public async getTargetIsRunning(): Promise<boolean> {
        // if the session is a mock session, return mock data. if it's not a mock session, use the target access to get real data
        if(this.activeSession.session.id.startsWith('mock-session-')) {
            return true; // mock session is always running
        } else {
            // TODO For real sessions, this functionality is not implemented yet
            const runningState = true; //await this.targetAccess.evaluateTargetRunningState();
            return runningState;
        }
    }

    public async findSymbolAddress(symbol: string): Promise<number | undefined> {
        const symbolInfo = await this.getSymbolInfo(symbol);
        if(symbolInfo === undefined) {
            return undefined;
        }
        return symbolInfo.address;
    }

    /**
     * Decode a (possibly unpadded) base64 string from GDB into bytes.
     */
    public decodeGdbData(data: string): Uint8Array {
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
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return bytes;
        }

        throw new Error('No base64 decoder available in this environment');
    }

    public async readMemory(address: number, size: number): Promise<Uint8Array | undefined> {
        // If the session is a mock session, return mock data. If it's not a mock session, use the target access to get real data
        if(this.activeSession.session.id.startsWith('mock-session-')) {
            return this.mock.getMockMemoryData(address, size);
        } else {
            const dataAsString = await this.targetAccess.evaluateMemory(address.toString(), size, 0);
            if(typeof dataAsString !== 'string') {
                return undefined;
            }
            // Convert String data to Uint8Array
            const byteArray = this.decodeGdbData(dataAsString);

            /*for(let i = 0; i < size; i++) {
                byteArray[i] = dataAsString.charCodeAt(i);
            }*/
            if(byteArray.length !== size) {
                return byteArray;
            }
            return byteArray;
        }
    }

    public readUint8ArrayStrFromPointer(address: number, bytesPerChar: number, maxLength: number): Promise<Uint8Array | undefined> {
        if(address === 0) {
            return Promise.resolve(undefined);
        }
        return this.readMemory(address, maxLength * bytesPerChar);
    }

    public calculateMemoryUsage(startAddress: number, size: number, FillPattern: number, MagicValue: number): number | undefined {
        const memData = this.mock.getMockMemoryData(startAddress, size);
        if(memData !== undefined) {
            let usedBytes = 0;
            const patternBytes1 = new Uint8Array(4);
            const patternBytes2 = new Uint8Array(4);
            // Use FillPattern for the fill pattern bytes (little-endian)
            patternBytes1[0] = (FillPattern & 0xFF);
            patternBytes1[1] = (FillPattern >> 8) & 0xFF;
            patternBytes1[2] = (FillPattern >> 16) & 0xFF;
            patternBytes1[3] = (FillPattern >> 24) & 0xFF;
            // Use MagicValue for the magic value bytes (little-endian)
            patternBytes2[0] = (MagicValue & 0xFF);
            patternBytes2[1] = (MagicValue >> 8) & 0xFF;
            patternBytes2[2] = (MagicValue >> 16) & 0xFF;
            patternBytes2[3] = (MagicValue >> 24) & 0xFF;

            for(let i = 0; i < memData.length; i += 4) {
                const chunk = memData.slice(i, i + 4);
                let match = true;
                for(let j = 0; j < chunk.length; j++) {
                    if(chunk[j] !== patternBytes1[j]) {
                        match = false;
                        break;
                    }
                }
                if(!match) {
                    match = true;
                    for(let j = 0; j < chunk.length; j++) {
                        if(chunk[j] !== patternBytes2[j]) {
                            match = false;
                            break;
                        }
                    }
                }
                if(!match) {
                    usedBytes += chunk.length;
                }
            }

            const usedPercent = Math.floor((usedBytes / size) * 100) & 0x1FF;
            let result = usedBytes & 0xFFFFF; // bits 0..19
            result |= (usedPercent << 20); // bits 20..28

            // Check for overflow (MagicValue overwritten)
            const magicBytes = new Uint8Array(4);
            magicBytes[0] = (MagicValue & 0xFF);
            magicBytes[1] = (MagicValue >> 8) & 0xFF;
            magicBytes[2] = (MagicValue >> 16) & 0xFF;
            magicBytes[3] = (MagicValue >> 24) & 0xFF;

            let overflow = true;
            for(let i = memData.length - 4; i < memData.length; i++) {
                if(memData[i] !== magicBytes[i - (memData.length - 4)]) {
                    overflow = false;
                    break;
                }
            }
            if(overflow) {
                result |= (1 << 31); // set overflow bit
            }

            return result;
        }

        return undefined;
    }

}
