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
import { OutputEventFilter } from './output-event-filter';
import { URI } from 'vscode-uri';
import { GDBTargetConfiguration } from '../debug-configuration';
import path from 'path';

/**
 * GDBTargetDebugSession - Wrapper class to provide session state/details
 */
export class GDBTargetDebugSession {
    public readonly refreshTimer: PeriodicRefreshTimer<GDBTargetDebugSession>;
    public readonly canAccessWhileRunning: boolean;
    private capabilities: DebugProtocol.Capabilities | undefined;
    private _cbuildRun: CbuildRunReader|undefined;
    private _cbuildRunParsePromise: Promise<void>|undefined;
    private outputEventFilter = new OutputEventFilter();

    constructor(public session: vscode.DebugSession) {
        this.refreshTimer = new PeriodicRefreshTimer(this);
        this.canAccessWhileRunning = this.session.configuration.type === 'gdbtarget' && this.session.configuration['auxiliaryGdb'] === true;
        this.refreshTimer.enabled = this.canAccessWhileRunning;
    }

    /**
     * Store capabilities for a session.
     *
     * @param capabilities Capabilities received from initialize response.
     */
    public setCapabilities(capabilities: DebugProtocol.Capabilities): void {
        this.capabilities = capabilities;
    }

    /**
     * Filters and renames specific output events, logs those events to 'Arm CMSIS Debugger' output channel.
     *
     * Renaming the events to 'cmsis-debugger-discarded' makes VS Code and loaded debug view
     * extensions ignore them.
     *
     * @param event The output event to process in the filter.
     */
    public filterOutputEvent(event: DebugProtocol.OutputEvent): void {
        if (this.outputEventFilter.filterOutputEvent(event)) {
            // Log original event properties for potential diagnostics purposes.
            logger.debug(`[Filtered output event]: category='${event.body.category}', seq='${event.seq}', session='${this.session.name}'`);
            logger.debug(`\t'${event.body.output}'`);
            event.event = 'cmsis-debugger-discarded'; // Discard the event by changing the event name
            return;
        }
    }

    public getCbuildRunPath(): string | undefined {
        const cbuildRunFile = (this.session.configuration as GDBTargetConfiguration)?.cmsis?.cbuildRunFile;
        if (!cbuildRunFile) {
            return undefined;
        }
        return path.normalize(URI.file(path.resolve(cbuildRunFile)).fsPath);
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

    /**
     * Check if first stop attempt for session is done by 'terminate' request.
     * Notes:
     *   'terminate' is in DAP terms softer than 'disconnect'
     *   'attach' sessions are always stopped with 'disconnect'
     * @returns true if first stop is by 'terminate' request, false otherwise
     */
    public canTerminate(): boolean {
        return this.session.configuration.request === 'launch' && this.capabilities?.supportsTerminateRequest === true;
    }

    /** Function returns string only in case of failure */
    public async evaluateGlobalExpression(expression: string, context = 'hover'): Promise<DebugProtocol.EvaluateResponse['body'] | string> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression,
                frameId, // Currently required by CDT GDB Adapter
                context: context
            };
            const response = await this.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            return response;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this.session.name}': Failed to evaluate global expression '${expression}' - '${errorMessage}'`);
            return errorMessage === 'custom request failed' ? 'No active session' : errorMessage;
        }
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
