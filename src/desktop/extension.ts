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
import { spawn } from 'child_process';

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
        const { stdout, stderr } = await new Promise<{ stdout: string, stderr: string}>((resolve, reject) => {
            const childProcess = spawn(
                execPath,
                execArgs,
                {
                    cwd: process.cwd(),
                    env: process.env,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            );

            if (!childProcess || !childProcess.stdout || !childProcess.stderr) {
                reject('Cannot properly launch child process');
                return;
            }
            let stdout = '', stderr = '';
            childProcess.stdout.on('data', data => stdout += data.toString());
            childProcess.stderr.on('data', data => stderr += data.toString());
            childProcess.on('error', err => reject(`Error: ${(err as Error).message}`));
            childProcess.on('exit', (_code, _signal) => resolve({ stdout, stderr }));
        });
        logger.warn(`Spawned '${execPath} ${execArgs.join(' ')}'`);
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    });


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShell`, async () => {
        const execPath = 'arm-none-eabi-gdb';
        const execArgs = ['--version'];
        const { stdout, stderr } = await new Promise<{ stdout: string, stderr: string}>((resolve, reject) => {
            const childProcess = spawn(
                execPath,
                execArgs,
                {
                    cwd: process.cwd(),
                    env: process.env,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell: true,
                    windowsHide: true
                }
            );

            if (!childProcess || !childProcess.stdout || !childProcess.stderr) {
                reject('Cannot properly launch child process');
                return;
            }
            let stdout = '', stderr = '';
            childProcess.stdout.on('data', data => stdout += data.toString());
            childProcess.stderr.on('data', data => stderr += data.toString());
            childProcess.on('error', err => reject(`Error: ${(err as Error).message}`));
            childProcess.on('exit', (_code, _signal) => resolve({ stdout, stderr }));
        });
        logger.warn(`Spawned (with shell) '${execPath} ${execArgs.join(' ')}'`);
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    });

    logger.debug('Extension Pack activated');
};
