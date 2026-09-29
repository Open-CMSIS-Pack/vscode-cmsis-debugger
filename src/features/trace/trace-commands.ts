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
import { EXTENSION_NAME } from '../../manifest';
import { PyTsController } from './pyts-controller';
import { CTraceController } from './ctrace-controller';
import { CapturedTraceResolver } from './captured-trace-resolver';
import { logger } from '../..';

/**
 * Registers commands related to trace functionality.
 */
export class TraceCommands {
    public static readonly launchPyTsID = `${EXTENSION_NAME}.launchPyTs`;
    public static readonly launchCTraceID = `${EXTENSION_NAME}.launchCTrace`;
    public static readonly reloadCTraceID = `${EXTENSION_NAME}.reloadCTrace`;
    public static readonly showCapturedTraceID = `${EXTENSION_NAME}.showCapturedTrace`;

    public constructor(
        private readonly pyTsController: PyTsController,
        private readonly cTraceController: CTraceController,
        private readonly capturedTraceResolver: CapturedTraceResolver = new CapturedTraceResolver()
    ) {}

    public activate(context: vscode.ExtensionContext): void {
        // Register trace commands
        context.subscriptions.push(
            vscode.commands.registerCommand(TraceCommands.launchPyTsID, () => this.handleLaunchPyTs()),
            vscode.commands.registerCommand(TraceCommands.launchCTraceID, () => this.handleLaunchCTrace()),
            vscode.commands.registerCommand(TraceCommands.reloadCTraceID, () => this.handleReloadCTrace()),
            vscode.commands.registerCommand(TraceCommands.showCapturedTraceID, () => this.handleShowCapturedTrace()),
        );
    }

    protected async handleLaunchPyTs(): Promise<void> {
        try {
            const exitCode = await this.pyTsController.run();
            if (exitCode !== 0) {
                logger.error(`pyTS process exited with code ${exitCode}`);
            }
        } catch (error) {
            logger.error('Failed to launch pyTS process:', error);
        }
    }

    protected async handleLaunchCTrace(): Promise<void> {
        try {
            const exitCode = await this.cTraceController.run();
            if (exitCode !== 0) {
                logger.error(`ctrace process exited with code ${exitCode}`);
            }
        } catch (error) {
            logger.error('Failed to launch ctrace process:', error);
        }
    }

    protected async handleReloadCTrace(): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        if (session) {
            await session.customRequest('evaluate', {
                expression: '> monitor ctrace reload',
                context: 'repl'
            });
        }
    }

    protected async handleShowCapturedTrace(): Promise<void> {
        try {
            await this.capturedTraceResolver.open(this.cTraceController.getActiveCbuildRunFilePath());
        } catch (error) {
            logger.error('Failed to open captured trace:', error);
        }
    }

}
