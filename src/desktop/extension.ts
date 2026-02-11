/**
 * Copyright 2025-2026 Arm Limited
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
import { GenericCommands } from '../features/generic-commands';
import { ComponentViewer } from '../views/component-viewer/component-viewer-main';
import { ComponentViewerTreeDataProvider } from '../views/component-viewer/component-viewer-tree-view';

const BUILTIN_TOOLS_PATHS = [
    'tools/pyocd/pyocd',
    'tools/gdb/bin/arm-none-eabi-gdb'
];

let liveWatchTreeDataProvider: LiveWatchTreeDataProvider;
let componentViewerTreeDataProvider: ComponentViewerTreeDataProvider;

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const genericCommands = new GenericCommands();
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();
    const cpuStates = new CpuStates();
    const cpuStatesCommands = new CpuStatesCommands();
    const cpuStatesStatusBarItem = new CpuStatesStatusBarItem();
    // Register the Tree View under the id from package.json
    liveWatchTreeDataProvider = new LiveWatchTreeDataProvider(context);
    componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
    const componentViewer = new ComponentViewer(context, componentViewerTreeDataProvider);

    addToolsToPath(context, BUILTIN_TOOLS_PATHS);
    // Activate generic commands
    genericCommands.activate(context);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context, gdbtargetDebugTracker);
    // CPU States features
    cpuStates.activate(gdbtargetDebugTracker);
    cpuStatesCommands.activate(context, cpuStates);
    cpuStatesStatusBarItem.activate(context, cpuStates);
    // Live Watch view
    console.debug('Activating Live Watch Tree Data Provider');
    liveWatchTreeDataProvider.activate(gdbtargetDebugTracker);
    // Component Viewer
    console.debug('Activating Component Viewer');
    componentViewer.activate(gdbtargetDebugTracker);
    console.debug('CMSIS Debugger activated');

    logger.debug('Extension Pack activated');
};

export const deactivate = async (): Promise<void> => {
    // Call deactivate of Live Watch to save its state
    if (liveWatchTreeDataProvider) {
        await liveWatchTreeDataProvider.deactivate();
    }
    logger.debug('Extension Pack deactivated');
};
