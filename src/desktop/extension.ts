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
import { GDBTargetDebugTracker } from '../debug-session';
import { GDBTargetConfigurationProvider } from '../debug-configuration';
import { logger } from '../logger';
import { addToolsToPath } from './add-to-path';
import { CpuStatesStatusBarItem } from '../features/cpu-states/cpu-states-statusbar-item';
import { CpuStates } from '../features/cpu-states/cpu-states';
import { CpuStatesCommands } from '../features/cpu-states/cpu-states-commands';
import { LiveWatchTreeDataProvider } from '../views/live-watch/live-watch';
import { EXTENSION_NAME } from '../manifest';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { BuiltinToolPath } from './builtin-tool-path';

const BUILTIN_TOOLS_PATHS = [
    'tools/pyocd/pyocd',
    'tools/gdb/bin/arm-none-eabi-gdb'
];

let liveWatchTreeDataProvider: LiveWatchTreeDataProvider;

type CodeType = number | NodeJS.Signals | null;

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();
    const cpuStates = new CpuStates();
    const cpuStatesCommands = new CpuStatesCommands();
    const cpuStatesStatusBarItem = new CpuStatesStatusBarItem();
    // Register the Tree View under the id from package.json
    liveWatchTreeDataProvider = new LiveWatchTreeDataProvider(context);

    addToolsToPath(context, BUILTIN_TOOLS_PATHS);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context);
    // CPU States features
    cpuStates.activate(gdbtargetDebugTracker);
    cpuStatesCommands.activate(context, cpuStates);
    cpuStatesStatusBarItem.activate(context, cpuStates);
    // Live Watch view
    liveWatchTreeDataProvider.activate(gdbtargetDebugTracker);

    const absolutePaths = BUILTIN_TOOLS_PATHS.map((path) => {
        // get gdb path from tools folder
        const builtinTool = new BuiltinToolPath(path);
        const pathTool = builtinTool.getAbsolutePath()?.fsPath;
        // check if path exists
        if (!pathTool) {
            logger.debug(`${path} is not available`);
        }
        return pathTool;
    });

    const doRunExecSpawn = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        const execArgs = args;
        logger.warn(`Spawned ${extHeadline}'${execPath} ${execArgs.join(' ')}'`);
        const { stdout, stderr, exitCode } = await new Promise<{ stdout: string, stderr: string, exitCode: CodeType }>((resolve, reject) => {
            let receivedData = false;
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
                if (data.length) {
                    receivedData = true;
                }
            });
            childProcess.stderr.on('data', data => {
                stderr += data.toString();
                if (data.length) {
                    receivedData = true;
                }
            });
            childProcess.on('error', err => reject(`Error: ${(err as Error).message}`));
            childProcess.on('exit', async (code, signal) => {
                exitCode = code !== null ? code : signal;
                logger.warn(`\t Killed: ${childProcess.killed}`);
                logger.warn(`\t stdout errored?: ${childProcess.stdout.errored === null ? '' : (childProcess.stdout.errored as Error).message}`);
                logger.warn(`\t stderr errored?: ${childProcess.stderr.errored === null ? '' : (childProcess.stderr.errored as Error).message}`);
                if (!receivedData) {
                    await new Promise<boolean>((resolve) => {
                        logger.warn('waiting for output...');
                        let timeout;
                        childProcess.on('data', () => {
                            clearTimeout(timeout);
                            logger.warn('received output data');
                            resolve(receivedData);
                        });
                        setTimeout(() => {
                            logger.warn('waiting for output timed out');
                            resolve(receivedData);
                        }, 10000);
                    });
                }
                resolve({ stdout, stderr, exitCode });
            });

            logger.warn(`\t spawnfile: ${childProcess.spawnfile}`);
            logger.warn(`\t spawnargs: ${childProcess.spawnargs}`);
        });
        logger.warn(`\t Exited with ${typeof exitCode === 'number' ? 'exit code' : 'signal'} ${exitCode}`);
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    };

    const doRunExecExecFile = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        const execArgs = args;
        logger.warn(`ExecFiled ${extHeadline}'${execPath} ${execArgs.join(' ')}'`);
        const { stdout, stderr } = await promisify(execFile)(
            execPath,
            execArgs,
            { cwd: process.cwd(), env: process.env, shell }
        );
        logger.warn(`\t stdout (${stdout.length}):`);
        logger.warn(`\t\t ${stdout}`);
        logger.warn(`\t stderr (${stderr.length}):`);
        logger.warn(`\t\t ${stderr}`);
    };

    const runExecSpawn = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        try {
            await doRunExecSpawn(execPath, extHeadline, args, shell);
        } catch (err) {
            logger.error(`Error running spawn for ${extHeadline}'${execPath} ${args.join(' ')}': ${(err as Error).message}`);
        }
    };

    const runExecExecFile = async (execPath: string, extHeadline: string, args: string[] = [], shell?: boolean) => {
        try {
            await doRunExecExecFile(execPath, extHeadline, args, shell);
        } catch (err) {
            logger.error(`Error running execFile for ${extHeadline}'${execPath} ${args.join(' ')}': ${(err as Error).message}`);
        }
    };

    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionSpawn`, async () => {
        for (const path of absolutePaths) {
            if (path) {
                await runExecSpawn(path, '', ['--version']);
            }
        }
        await runExecSpawn('arm-none-eabi-gdb', '', ['--version']);
        await runExecSpawn('cbuild', '', ['--version']);
        // await runExecSpawn('pyocd', '', ['--version']);
        await runExecSpawn('where', '', ['arm-none-eabi-gdb']);
        await runExecSpawn('where', '', ['cbuild']);
        // await runExecSpawn('where', '', ['pyocd']);
    });


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShellSpawn`, async () => {
        for (const path of absolutePaths) {
            if (path) {
                await runExecSpawn(path, '(via shell) ', ['--version'], true);
            }
        }
        await runExecSpawn('arm-none-eabi-gdb', '(via shell) ', ['--version'], true);
        await runExecSpawn('cbuild', '(via shell) ', ['--version'], true);
        // await runExecSpawn('pyocd', '(via shell) ', ['--version'], true);
        await runExecSpawn('where', '(via shell) ', ['arm-none-eabi-gdb'], true);
        await runExecSpawn('where', '(via shell) ', ['cbuild'], true);
        // await runExecSpawn('where', '(via shell) ', ['pyocd'], true);
    });

    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionExecFile`, async () => {
        for (const path of absolutePaths) {
            if (path) {
                await runExecExecFile(path, '', ['--version']);
            }
        }
        await runExecExecFile('arm-none-eabi-gdb', '', ['--version']);
        await runExecExecFile('cbuild', '', ['--version']);
        // await runExecExecFile('pyocd', '', ['--version']);
        await runExecExecFile('where', '', ['arm-none-eabi-gdb']);
        await runExecExecFile('where', '', ['cbuild']);
        // await runExecExecFile('where', '', ['pyocd']);
    });


    vscode.commands.registerCommand(`${EXTENSION_NAME}.getGdbVersionShellExecFile`, async () => {
        for (const path of absolutePaths) {
            if (path) {
                await runExecExecFile(path, '(via shell) ', ['--version'], true);
            }
        }
        await runExecExecFile('arm-none-eabi-gdb', '(via shell) ', ['--version'], true);
        await runExecExecFile('cbuild', '(via shell) ', ['--version'], true);
        // await runExecExecFile('pyocd', '(via shell) ', ['--version'], true);
        await runExecExecFile('where', '(via shell) ', ['arm-none-eabi-gdb'], true);
        await runExecExecFile('where', '(via shell) ', ['cbuild'], true);
        // await runExecExecFile('where', '(via shell) ', ['pyocd'], true);
    });

    logger.debug('Extension Pack activated');
};

export const deactivate = async (): Promise<void> => {
    // Call deactivate of Live Watch to save its state
    if (liveWatchTreeDataProvider) {
        await liveWatchTreeDataProvider.deactivate();
    }
    logger.debug('Extension Pack deactivated');
};
