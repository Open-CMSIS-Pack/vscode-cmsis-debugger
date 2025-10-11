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

import * as vscode from 'vscode';
import { DebugProtocol } from '@vscode/debugprotocol';
import { logger } from '../logger';
import { CbuildRunReader } from '../cbuild-run';
import { PeriodicRefreshTimer } from './periodic-refresh-timer';

/**
 * GDBTargetDebugSession - Wrapper class to provide session state/details
 */
export class GDBTargetDebugSession {
    public readonly refreshTimer: PeriodicRefreshTimer<GDBTargetDebugSession>;
    private _cbuildRun: CbuildRunReader|undefined;
    private _cbuildRunParsePromise: Promise<void>|undefined;

    constructor(public session: vscode.DebugSession) {
        this.refreshTimer = new PeriodicRefreshTimer(this);
        if (this.session.configuration.type === 'gdbtarget') {
            this.refreshTimer.enabled = this.session.configuration['auxiliaryGdb'] === true;
        }
    }

    public async getCbuildRun(): Promise<CbuildRunReader|undefined> {
        if (!this._cbuildRun) {
            return;
        }
        if (this._cbuildRunParsePromise) {
            await this._cbuildRunParsePromise;
        }
        return this._cbuildRun.hasContents() ? this._cbuildRun : undefined;
    }

    public async parseCbuildRun(filePath: string): Promise<void> {
        if (!this._cbuildRun) {
            this._cbuildRun = new CbuildRunReader;
        }
        this._cbuildRunParsePromise = this._cbuildRun.parse(filePath);
        await this._cbuildRunParsePromise;
        this._cbuildRunParsePromise = undefined;
    }

    public async evaluateGlobalExpression(expression: string): Promise<string|undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression,
                frameId, // Currently required by CDT GDB Adapter
                context: 'hover'
            };
            const response = await this.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            return response.result.match(/\d+/) ? response.result : undefined;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this.session.name}': Failed to evaluate global expression '${expression}' - '${errorMessage}'`);
        }
        return undefined;
    }

    public async readMemory(address: number, length = 4): Promise<ArrayBuffer|undefined> {
        try {
            const args: DebugProtocol.ReadMemoryArguments = {
                memoryReference: `${address}`,
                count: length
            };
            const response = await this.session.customRequest('readMemory', args) as DebugProtocol.ReadMemoryResponse['body'];
            if (!response) {
                return undefined;
            }
            const respAddress = parseInt(response.address, response.address.startsWith('0x') ? 16 : 10);
            if (address !== respAddress || !response.data) {
                return undefined;
            }
            const responseLength = length - (response.unreadableBytes ?? 0);
            const decodedBuffer = Buffer.from(response.data, 'base64');
            return decodedBuffer.buffer.slice(decodedBuffer.byteOffset, decodedBuffer.byteOffset + responseLength);
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this.session.name}': Cannot read ${length} Bytes from address ${address} - '${errorMessage}'`);
        }
        return undefined;
    }

    public async readMemoryU32(address: number): Promise<number|undefined> {
        const data = await this.readMemory(address, 8 /* 4 */); // Temporary workaround for GDB servers with extra caching of 4 byte reads
        if (!data) {
            return undefined;
        }
        const dataView = new DataView(data);
        return dataView.getUint32(0, true);
    }
}
