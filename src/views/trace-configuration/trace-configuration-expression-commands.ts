/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

import * as vscode from 'vscode';

import { getDebugExpression, getEditorExpression } from '../debug-expression';
import type { LiveWatchNode } from '../live-watch/live-watch';

/** Adapts editor and debug view context menus to the shared Data Trace operation. */
export class TraceConfigurationExpressionCommands {
    /** Stores the asynchronous operation that edits and reveals Trace Generation. */
    public constructor(private readonly addExpression: (expression: string) => Promise<void>) {}

    /** Registers context-only commands for the editor, Watch, and Live Watch. */
    public activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('vscode-cmsis-debugger.traceConfiguration.addFromEditor', async () => {
                await this.add(getEditorExpression(vscode.window.activeTextEditor));
            }),
            vscode.commands.registerCommand('vscode-cmsis-debugger.traceConfiguration.addFromDebugView', async (payload: unknown) => {
                await this.add(getDebugExpression(payload));
            }),
            vscode.commands.registerCommand('vscode-cmsis-debugger.traceConfiguration.addFromLiveWatch', async (node?: LiveWatchNode) => {
                const expression = node?.value.evaluateName?.trim() || (node?.parent ? undefined : node?.expression.trim());
                await this.add(expression);
            })
        );
    }

    /** Explains unavailable expressions without substituting an ambiguous child display name. */
    private async add(expression: string | undefined): Promise<void> {
        if (!expression) {
            await vscode.window.showWarningMessage('No evaluatable expression is available. Select an expression in the source editor and try again.');
            return;
        }

        await this.addExpression(expression);
    }
}
