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

/**
 * GDBTargetDebugSession - Wrapper class to provide session state/details
 */
export class GDBTargetDebugSession {

    constructor(public session: vscode.DebugSession) {}

    public async evaluateGlobalExpression(expression: string): Promise<string|undefined> {
        try {
            const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame)?.frameId ?? 0;
            const args: DebugProtocol.EvaluateArguments = {
                expression,
                frameId, // Currently required by CDT GDB Adapter // TODO: track frameId
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
}
