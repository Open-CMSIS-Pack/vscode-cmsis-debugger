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
import { componentViewerLogger } from '../../logger';


/**
 * Provides access to debug target information for the component viewer.
 *
 * Symbol resolution methods (address, name, context, size, array count) use
 * the DAP evaluate request with 'hover' context and no frameId. This sends
 * GDB/MI {@link https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Data-Manipulation.html -data-evaluate-expression}
 * commands that query DWARF/symbol table information for globally-visible
 * symbols without requiring a stack frame or stopped target. Results are
 * returned silently via DAP without echoing to the Debug Console.
 *
 * Memory reads use the DAP readMemory request which the debug adapter
 * routes to an auxiliary GDB connection while the target is running.
 *
 * Register reads require the target to be stopped and a valid stack frame.
 */
export class ComponentViewerTargetAccess {
    _activeSession: GDBTargetDebugSession | undefined;

    constructor () {
    }

    // Function to reset active session
    public setActiveSession(session: GDBTargetDebugSession): void {
        this._activeSession = session;
    }

    /**
     * Evaluate a C expression via DAP evaluate with 'hover' context and no
     * frameId. The adapter translates this to a GDB/MI
     * -data-evaluate-expression command. Using 'hover' (not 'repl') ensures
     * the command and its response are not echoed to the Debug Console.
     * Omitting frameId works for globally-visible symbols that do not require
     * stack frame context.
     */
    private async evaluateExpression(expression: string): Promise<string | undefined> {
        const args: DebugProtocol.EvaluateArguments = {
            expression,
            context: 'hover'
        };
        const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
        return response?.result;
    }

    /**
     * Resolve a global symbol name to its address using a C address-of expression.
     * Sends '&symbol' via -data-evaluate-expression (no frameId, no console echo).
     *
     * @param symbol The symbol name (may use GDB qualified syntax like 'file.c'::sym)
     * @param existCheck When true, silently returns undefined on failure (no logging)
     * @returns The hex address string (e.g. "0x20001234") or undefined
     */
    public async evaluateSymbolAddress(symbol: string, existCheck: boolean = false): Promise<string | undefined> {
        try {
            const result = await this.evaluateExpression(`&${symbol}`);
            if (!result || result.startsWith('Error')) {
                return undefined;
            }
            return result.split(' ')[0]; // Return only the address part
        } catch (error: unknown) {
            if (!existCheck) {
                const errorMessage = (error as Error)?.message;
                componentViewerLogger.error(`Session '${this._activeSession?.session.name}': Failed to evaluate address '${symbol}' - '${errorMessage}'`);
            }
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

    /**
     * Resolve an address to a symbol name using a cast expression.
     * Sends '(unsigned int*)0xADDR' via -data-evaluate-expression.
     * GDB annotates the result with the symbol name in angle brackets
     * (e.g. "0x20000000 \<myVar\>").
     *
     * @returns The symbol name or undefined
     */
    public async evaluateSymbolName(address: string | number | bigint): Promise<string | undefined> {
        try {
            const formattedAddress = this.formatAddress(address);
            const result = await this.evaluateExpression(`(unsigned int*)${formattedAddress}`);
            const resultText = result?.split('<')[1]?.split('>')[0].trim();
            if (!resultText || resultText.startsWith('No symbol matches')) {
                return undefined;
            }
            return resultText;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate name '${address}' - '${errorMessage}'`);
            return undefined;
        }
    }

    /**
     * Resolve file/line context for an address.
     * Sends 'info line *0xADDR' via -data-evaluate-expression.
     *
     * @returns The file/line context string or undefined
     */
    public async evaluateSymbolContext(address: string): Promise<string | undefined> {
        try {
            const formattedAddress = this.formatAddress(address);
            const result = await this.evaluateExpression(`info line *${formattedAddress}`);
            if (!result || result.startsWith('No line')) {
                return undefined;
            }
            return result.trim();
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate context for '${address}' - '${errorMessage}'`);
            return undefined;
        }
    }

    /**
     * Get the size of a symbol using DWARF type information.
     * Sends 'sizeof(symbol)' via -data-evaluate-expression.
     *
     * @returns The size in bytes or undefined
     */
    public async evaluateSymbolSize(symbol: string): Promise<number | undefined> {
        try {
            const result = await this.evaluateExpression(`sizeof(${symbol})`);
            const parsed = Number(result);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
            return undefined;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate size of '${symbol}' - '${errorMessage}'`);
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
            const hexAddress = `0x${Number(address).toString(16).toUpperCase()}`;
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to read memory at address '${hexAddress}' - '${errorMessage}'`);
            return undefined;
        }
    }

    /**
     * Get the number of elements in an array using DWARF type information.
     * Sends 'sizeof(symbol)/sizeof(symbol[0])' via -data-evaluate-expression.
     *
     * @returns The number of array elements or undefined
     */
    public async evaluateNumberOfArrayElements(symbol: string): Promise<number | undefined> {
        try {
            const result = await this.evaluateExpression(`sizeof(${symbol})/sizeof(${symbol}[0])`);
            const resultText = result?.trim();
            const numElements = Number(resultText);
            if (Number.isNaN(numElements)) {
                return undefined;
            }
            return numElements;
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate number of elements for array '${symbol}' - '${errorMessage}'`);
            return undefined;
        }
    }

    /**
     * Read a register value. Requires the target to be stopped and a valid frame.
     * Returns undefined when the target is running or no frame is available.
     */
    public async evaluateRegisterValue(register: string): Promise<string | undefined> {
        // Register reads require the target to be stopped
        if (this._activeSession?.targetState === 'running') {
            componentViewerLogger.debug(`Session '${this._activeSession.session.name}': Skipping register read for '${register}' - target is running`);
            return undefined;
        }
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId;
            // if FrameId is undefined, evaluation is not possible as cdt-adapter doesn't accept it
            if (frameId === undefined) {
                return undefined;
            }
            const args: DebugProtocol.EvaluateArguments = {
                expression: `(void*)$${register}`,
                frameId, // Required by CDT GDB Adapter for register reads
                context: 'hover'
            };
            const response = await this._activeSession?.session.customRequest('evaluate', args) as DebugProtocol.EvaluateResponse['body'];
            // Strip GDB symbol annotations, e.g. '0x20000420 <os_mem+424>' → '0x20000420'
            return response.result.split(' ')[0];
        } catch (error: unknown) {
            const errorMessage = (error as Error)?.message;
            componentViewerLogger.debug(`Session '${this._activeSession?.session.name}': Failed to evaluate register value for '${register}' - '${errorMessage}'`);
            return undefined;
        }
    }
}
