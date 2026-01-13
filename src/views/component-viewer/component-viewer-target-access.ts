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
import { createMockDebugSession } from './component-viewer-controller';


export class ComponentViewerTargetAccess {
    // Check if mocks shall be used from configuration
    private useMocks = vscode.workspace.getConfiguration('vscode-cmsis-debugger').get('useMocks');
    _activeSession: GDBTargetDebugSession | undefined;
    constructor () {
    }

    // Function to reset active session
    public setActiveSession(session: GDBTargetDebugSession): void {
        if (this.useMocks) {
            this._activeSession = createMockDebugSession();
            return;
        } else {
            this._activeSession = session;
            return;
        }
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
            //return errorMessage === 'custom request failed' ? 'No active session' : errorMessage;
            return undefined;
        }
    }

    private formatAddress(address: string): string {
        const trimmed = address.trim();
        if (trimmed.length === 0) {
            return trimmed;
        }
        if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
            return trimmed;
        }

        const numericAddress = Number(trimmed);
        if (Number.isNaN(numericAddress)) {
            return trimmed;
        }

        return `0x${numericAddress.toString(16)}`;
    }

    public async evaluateSymbolName(address: string, context = 'hover'): Promise<string | undefined> {
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
            const errorMessage = (error as Error)?.message;
            logger.debug(`Session '${this._activeSession?.session.name}': Failed to read memory at address '${address}' - '${errorMessage}'`);
            //return errorMessage === 'custom request failed' ? 'No active session' : errorMessage;
            return undefined;
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
}
