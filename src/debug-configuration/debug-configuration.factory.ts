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
import { makeFactory } from '../__test__/test-data-factory';
import { GDBTargetConfiguration, TargetConfiguration } from './gdbtarget-configuration';

export const debugConfigurationFactory = makeFactory<vscode.DebugConfiguration>({
    type: () => 'mydebug',
    name: () => 'Debug',
    request: () => 'launch',
});

export const targetConfigurationFactory = makeFactory<TargetConfiguration>({
    type: () => undefined,
    parameters: () => undefined,
    host: () => undefined,
    port: () => undefined,
    cwd: () => undefined,
    environment: () => undefined,
    server: () => undefined,
    serverParameters: () => undefined,
    serverPortRegExp: () => undefined,
    serverStartupDelay: () => undefined,
    automaticallyKillServer: () => false,
    uart: () => undefined,
});

export const gdbTargetConfiguration = makeFactory<GDBTargetConfiguration>({
    type: () => 'gdbtarget',
    name: () => 'Debug',
    request: () => 'launch',
    program: () => undefined,
    gdb: () => undefined,
    cwd: () => undefined,
    environment: () => undefined,
    gdbAsync: () => undefined,
    gdbNonStop: () => undefined,
    verbose: () => undefined,
    logFile: () => undefined,
    openGdbConsole: () => undefined,
    initCommands: () => undefined,
    preRunCommands: () => undefined,
    imageAndSymbols: () => undefined,
    target: () => undefined,
    cmsis: () => undefined,
});
