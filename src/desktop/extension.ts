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
import { addToolsToPath } from './add-to-path';
import { StatesStatusBarItem } from '../features/states-display/states-statusbar-item';

const BUILTIN_TOOLS_PATHS = [
    'tools/pyocd/pyocd',
    'tools/gdb/bin/arm-none-eabi-gdb'
];

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();
    const statesStatusBarItem = new StatesStatusBarItem();

    addToolsToPath(context, BUILTIN_TOOLS_PATHS);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context);

    statesStatusBarItem.activate(context, gdbtargetDebugTracker);

    logger.debug('Extension Pack activated');
};
