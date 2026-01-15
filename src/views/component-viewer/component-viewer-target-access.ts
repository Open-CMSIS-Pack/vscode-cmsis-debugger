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

import * as vscode from 'vscode';
import { DebugProtocol } from '@vscode/debugprotocol';
import { GDBTargetDebugSession } from '../../debug-session';
import { logger } from '../../logger';


export class ComponentViewerTargetAccess {
    _activeSession: GDBTargetDebugSession | undefined;
    constructor () {
        if (vscode.debug.activeDebugSession) {
            this._activeSession = new GDBTargetDebugSession(vscode.debug.activeDebugSession);
        }
    }

    // Function to reset active session
    public setActiveSession(session: GDBTargetDebugSession): void {
        this._activeSession = session;
    }

    public async evaluateSymbolAddress(address: string, context = 'hover'): Promise<string | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression: `&${address}`,
                frameId, // Currently required by CDT GDB Adapter
                context: context
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            return response.result.split(' ')[0]; // Return only the address part
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate address '${address}' - '${errorMessage}'`);
            return undefined;
        }
    }

    private formatAddress(address: string | number | bigint): string {
        const raw = typeof address === 'string' ? address.trim() : address.toString();
        if (raw.length === 0) {
            return raw;
        }
        if (raw.startsWith('0x') || raw.startsWith('0X')) {
            return raw;
        }

        const numericAddress = typeof address === 'bigint' ? address : Number(raw);
        if (typeof numericAddress === 'number' && Number.isNaN(numericAddress)) {
            return raw;
        }

        const asHex = typeof numericAddress === 'bigint' ? numericAddress.toString(16) : numericAddress.toString(16);
        return `0x${asHex}`;
    }

    public async evaluateSymbolName(address: string | number | bigint, context = 'hover'): Promise<string | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const formattedAddress = this.formatAddress(address);
            const args: DebugProtocol.EvaluateArguments = {
                expression: `(unsigned int*)${formattedAddress}`,
                frameId, // Currently required by CDT GDB Adapter
                context: context
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            const resultText = response?.result.split('<')[1]?.split('>')[0].trim();
            if (!resultText || resultText.startsWith('No symbol matches')) {
                return undefined;
            }

            return resultText;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate name '${address}' - '${errorMessage}'`);
            //return errorMessage === 'custom request failed' ? 'No active session' : errorMessage;
            return undefined;
        }
    }

    public async evaluateSymbolContext(address: string, context = 'hover'): Promise<string | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const formattedAddress = this.formatAddress(address);
            // Ask GDB for file/line context of the address.
            const args: DebugProtocol.EvaluateArguments = {
                expression: `info line *${formattedAddress}`,
                frameId,
                context
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            const resultText = response?.result;
            if (!resultText || resultText.startsWith('No line information')) {
                return undefined;
            }
            return resultText.trim();
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate context for '${address}' - '${errorMessage}'`);
            return undefined;
        }
    }

    public async evaluateSymbolSize(symbol: string, context = 'hover'): Promise<number | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression: `sizeof(${symbol})`,
                frameId,
                context
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            const raw = response?.result;
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
            return undefined;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate size of '${symbol}' - '${errorMessage}'`);
            return undefined;
        }
    }



    public async evaluateMemory(address: string, length: number, offset: number): Promise<string | undefined> {
        try {
            const args: DebugProtocol.ReadMemoryArguments = {
                memoryReference: `${address}`,
                count: length,
                offset: offset
            };
            const response = await this._activeSession?.session.customRequest('readMemory', args) as DebugProtocol.ReadMemoryResponse['body'];
            return response?.data;
        } catch (error: unknown) {
            // Change address to hex format for better logging
            const hexAddress = `0x${Number(address).toString(16)}`;
            const errorMessage = (error as Error)?.message + ` at address ${hexAddress}`;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to read memory at address '${hexAddress}' - '${errorMessage}'`);
            return errorMessage === 'custom request failed' ? 'No active session' : errorMessage;
        }
    }

    public async doesSymbolExist(symbol: string): Promise<boolean> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression: `&${symbol}`,
                frameId, // Currently required by CDT GDB Adapter
                context: 'hover'
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            const symbolInfo = response.result;
            const doesExist = symbolInfo.includes(symbol);
            return doesExist;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to know if symbol ${symbol} exists - '${errorMessage}'`);
            return false;
        }
    }

    public async evaluateNumberOfArrayElements(symbol: string): Promise<number | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression: `sizeof(${symbol})/sizeof(${symbol}[0])`,
                frameId, // Currently required by CDT GDB Adapter
                context: 'hover'
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            const resultText = response?.result.trim();
            const numElements = Number(resultText);
            if(Number.isNaN(numElements)) {
                return undefined;
            }
            return numElements;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate number of elements for array '${symbol}' - '${errorMessage}'`);
            return undefined;
        }
    }

    public async evaluateRegisterValue(register: string): Promise<string | undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression: `$${register}`,
                frameId, // Currently required by CDT GDB Adapter
                context: 'hover'
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            return response.result;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate register value for '${register}' - '${errorMessage}'`);
            return undefined;
        }
    }
}
