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
import { GDBTargetDebugTracker } from '../debug-configuration/gdbtarget-debug-tracker';
import { GDBTargetConfigurationProvider } from '../debug-configuration';
import { logger } from '../logger';
import { addPyocdToPath } from './add-to-path';
import { EXTENSION_NAME } from '../manifest';
import { promisify } from 'util';
import { execFile } from 'child_process';

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();

    addPyocdToPath(context);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context);


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersion`, async () => {
        const execPath = 'arm-none-eabi-gdb';
        const execArgs = ['--version'];
        const { stdout, stderr } = await promisify(execFile)(
            execPath,
            execArgs,
            { cwd: process.cwd(), env: process.env }
        );
        logger.warn(`Called '${execPath} ${execArgs.join(' ')}'`);
        logger.warn(`\t stdout: ${stdout}`);
        logger.warn(`\t stderr: ${stderr}`);
    });

    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShell`, async () => {
        const execPath = 'arm-none-eabi-gdb';
        const execArgs = ['--version'];
        const { stdout, stderr } = await promisify(execFile)(
            execPath,
            execArgs,
            { cwd: process.cwd(), env: process.env, shell: true }
        );
        logger.warn(`Called (via shell) '${execPath} ${execArgs.join(' ')}'`);
        logger.warn(`\t stdout: ${stdout}`);
        logger.warn(`\t stderr: ${stderr}`);
    });

    logger.debug('Extension Pack activated');
};
