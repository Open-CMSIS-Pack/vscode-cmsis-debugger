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

interface TargetEnvironmentConfiguration {
    CMSIS_PACK_ROOT?: string;
};

interface ImageAndSymbolsConfiguration {
    symbolFileName?: string;
    symbolOffset?: string;
    imageFileName?: string;
    imageOffset?: string;
};

interface UARTConfiguration {
    serialPort?: string;
    socketPort?: string;
    baudRate?: number;
    characterSize?: number;
    parity?: string;
    stopBits?: number;
    handshakingMethod?: string;
    eolCharacter?: string;
};

export interface TargetConfiguration {
    type?: string;
    parameters?: string[];
    host?: string;
    port?: string;
    cwd?: string;
    environment?: TargetEnvironmentConfiguration;
    server?: string;
    serverParameters?: string[];
    serverPortRegExp?: string;
    serverStartupDelay?: number;
    automaticallyKillServer?: boolean;
    uart?: UARTConfiguration;
};

interface CMSISConfiguration {
    cbuildRunFile?: string;
}

export interface GDBTargetConfiguration extends vscode.DebugConfiguration {
    program?: string; // required as per 'gdbtarget' debugger contribution, but can be omitted anyway
    gdb?: string;
    cwd?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    environment?: any;
    gdbAsync?: boolean;
    gdbNonStop?: boolean;
    verbose?: boolean;
    logFile?: string;
    openGdbConsole?: boolean;
    initCommands?: string[];
    customResetCommands?: string[];
    preRunCommands?: string[];
    imageAndSymbols?: ImageAndSymbolsConfiguration;
    target?: TargetConfiguration;
    cmsis?: CMSISConfiguration;
};

export interface ExtendedGDBTargetConfiguration extends GDBTargetConfiguration {
    // For additional configuration items not part of GDBTargetConfiguration but known to other extensions
    definitionPath?: string;  // Default SVD path setting for Peripheral Inspector
};
