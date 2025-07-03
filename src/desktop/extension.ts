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
import { addToolToPath } from './add-to-path';
import { EXTENSION_NAME } from '../manifest';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const PYOCD_BUILTIN_PATH = 'tools/pyocd/pyocd';

type CodeType = number | NodeJS.Signals | null;

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();

    addToolToPath(context, PYOCD_BUILTIN_PATH);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context);

    const runExecSpawn = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        const execArgs = args;
        const { stdout, stderr, exitCode } = await new Promise<{ stdout: string, stderr: string, exitCode: CodeType }>((resolve, reject) => {
            const childProcess = spawn(
                execPath,
                execArgs,
                {
                    cwd: process.cwd(),
                    env: process.env,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell,
                    windowsHide: shell
                },
            );

            if (!childProcess || !childProcess.stdout || !childProcess.stderr) {
                reject('Cannot properly launch child process');
                return;
            }
            let stdout = '', stderr = '';
            let exitCode: CodeType = null;
            childProcess.stdout.on('data', data => {
                stdout += data.toString();
            });
            childProcess.stderr.on('data', data => {
                stderr += data.toString();
            });
            childProcess.on('error', err => reject(`Error: ${(err as Error).message}`));
            childProcess.on('exit', (code, signal) => {
                exitCode = code !== null ? code : signal;
                logger.warn(`\t Killed: ${childProcess.killed}`);
                logger.warn(`\t stdout errored?: ${childProcess.stdout.errored === null ? '' : (childProcess.stdout.errored as Error).message}`);
                logger.warn(`\t stderr errored?: ${childProcess.stderr.errored === null ? '' : (childProcess.stderr.errored as Error).message}`);
                resolve({ stdout, stderr, exitCode });
            });

            logger.warn(`Spawned ${extHeadline}'${execPath} ${execArgs.join(' ')}'`);
            logger.warn(`\t spawnfile: ${childProcess.spawnfile}`);
            logger.warn(`\t spawnargs: ${childProcess.spawnargs}`);
        });
        logger.warn(`\t Exited with ${typeof exitCode === 'number' ? 'exit code' : 'signal'} ${exitCode}`);
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    };

    const runExecExecFile = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        const execArgs = args;
        const { stdout, stderr } = await promisify(execFile)(
            execPath,
            execArgs,
            { cwd: process.cwd(), env: process.env, shell }
        );
        logger.warn(`ExecFiled ${extHeadline}'${execPath} ${execArgs.join(' ')}'`);
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    };


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionSpawn`, async () => {
        await runExecSpawn('arm-none-eabi-gdb', '', ['--version']);
        await runExecSpawn('cbuild', '', ['--version']);
        // await runExecSpawn('pyocd', '', ['--version']);
        await runExecSpawn('where', '', ['arm-none-eabi-gdb']);
        await runExecSpawn('where', '', ['cbuild']);
        // await runExecSpawn('where', '', ['pyocd']);
    });


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShellSpawn`, async () => {
        await runExecSpawn('arm-none-eabi-gdb', '(via shell) ', ['--version'], true);
        await runExecSpawn('cbuild', '(via shell) ', ['--version'], true);
        // await runExecSpawn('pyocd', '(via shell) ', ['--version'], true);
        await runExecSpawn('where', '(via shell) ', ['arm-none-eabi-gdb'], true);
        await runExecSpawn('where', '(via shell) ', ['cbuild'], true);
        // await runExecSpawn('where', '(via shell) ', ['pyocd'], true);
    });

    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionExecFile`, async () => {
        await runExecExecFile('arm-none-eabi-gdb', '', ['--version']);
        await runExecExecFile('cbuild', '', ['--version']);
        // await runExecExecFile('pyocd', '', ['--version']);
        await runExecExecFile('where', '', ['arm-none-eabi-gdb']);
        await runExecExecFile('where', '', ['cbuild']);
        // await runExecExecFile('where', '', ['pyocd']);
    });


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShellExecFile`, async () => {
        await runExecExecFile('arm-none-eabi-gdb', '(via shell) ', ['--version'], true);
        await runExecExecFile('cbuild', '(via shell) ', ['--version'], true);
        // await runExecExecFile('pyocd', '(via shell) ', ['--version'], true);
        await runExecExecFile('where', '(via shell) ', ['arm-none-eabi-gdb'], true);
        await runExecExecFile('where', '(via shell) ', ['cbuild'], true);
        // await runExecExecFile('where', '(via shell) ', ['pyocd'], true);
    });

    logger.debug('Extension Pack activated');
};
