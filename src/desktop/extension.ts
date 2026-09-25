/**
 * Copyright 2025-2026 Arm Limited
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
import { ComponentViewer } from '../views/component-viewer/component-viewer';
import { ComponentViewerTreeDataProvider } from '../views/component-viewer/component-viewer-tree-view';
import { CorePeripherals } from '../views/core-peripherals/core-peripherals';
import { clearAllViewState } from '../views/dynamic-view-states';
import { TraceConfigurationWebviewProvider } from '../views/trace-configuration/trace-configuration-webview-provider';
import { TraceConfigurationCommands } from '../views/trace-configuration/trace-configuration-commands';
import { TraceCommands } from '../features/trace/trace-commands';
import { PyTsController } from '../features/trace/pyts-controller';
import { CTraceController } from '../features/trace/ctrace-controller';
import { CBuildRunFileLocator } from '../cbuild-run';
import { CmsisJsonWatcher } from '../cmsis-files';
import { FileWatchManager } from './filesystem/file-watch-manager';
import { CsvTableEditorProvider } from '../views/csv-table-viewer/csv-table-editor-provider';

const BUILTIN_TOOLS_PATHS = [
    'tools/pyocd/pyocd',
    'tools/gdb/bin/arm-none-eabi-gdb',
    // Temporary, these tools are expected to ship separately in future
    'tools/ctrace/ctrace',
    'tools/pyts/pyTS'
];

let liveWatchTreeDataProvider: LiveWatchTreeDataProvider;
let componentViewerTreeDataProvider: ComponentViewerTreeDataProvider;
let corePeripheralsTreeDataProvider: ComponentViewerTreeDataProvider;
let traceConfiguration: TraceConfigurationWebviewProvider | undefined;

const askForReload = async (): Promise<void> => {
    const result = await vscode.window.showWarningMessage('Cannot activate all Arm CMSIS Debugger views. Please reload the window.', 'Reload Window');
    if (result === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
};

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    let canCompleteActivation = true;
    const genericCommands = new GenericCommands();
    const gdbtargetDebugTracker = new GDBTargetDebugTracker();
    const fileWatchManager = new FileWatchManager();
    const cbuildRunFileLocator = new CBuildRunFileLocator();
    const cmsisJsonWatcher = new CmsisJsonWatcher(cbuildRunFileLocator);
    const pyTsController = new PyTsController({}, cbuildRunFileLocator, cmsisJsonWatcher);
    const cTraceController = new CTraceController({}, Date.now, cbuildRunFileLocator, cmsisJsonWatcher);
    const traceCommands = new TraceCommands(pyTsController, cTraceController);
    const gdbtargetConfigurationProvider = new GDBTargetConfigurationProvider();
    const cpuStates = new CpuStates();
    const cpuStatesCommands = new CpuStatesCommands();
    const cpuStatesStatusBarItem = new CpuStatesStatusBarItem();
    // Register the Tree View under the id from package.json
    liveWatchTreeDataProvider = new LiveWatchTreeDataProvider(context);
    componentViewerTreeDataProvider = new ComponentViewerTreeDataProvider();
    corePeripheralsTreeDataProvider = new ComponentViewerTreeDataProvider();
    const componentViewer = new ComponentViewer(context, componentViewerTreeDataProvider);
    const corePeripherals = new CorePeripherals(context, corePeripheralsTreeDataProvider);
    traceConfiguration = new TraceConfigurationWebviewProvider(
        context.extensionUri,
        undefined,
        fileWatchManager,
        cbuildRunFileLocator,
        cmsisJsonWatcher
    );
    const traceConfigurationCommands = new TraceConfigurationCommands();
    const csvTableEditorProvider = new CsvTableEditorProvider(
        context.extensionUri,
        (solutionSet, ctraceRef, ctraceFilePath) =>
            traceConfiguration?.focusCTraceReference(solutionSet, ctraceRef, ctraceFilePath)
            ?? Promise.resolve(false)
    );

    addToolsToPath(context, BUILTIN_TOOLS_PATHS);
    fileWatchManager.activate(context);
    await cmsisJsonWatcher.activate(context, fileWatchManager);
    // Activate generic commands
    genericCommands.activate(context);
    await pyTsController.activate(context, gdbtargetDebugTracker, fileWatchManager);
    await cTraceController.activate(context, gdbtargetDebugTracker, fileWatchManager);
    // Activate trace commands
    traceCommands.activate(context);
    // Activate components
    gdbtargetDebugTracker.activate(context);
    gdbtargetConfigurationProvider.activate(context, gdbtargetDebugTracker);
    // CPU States features
    cpuStates.activate(gdbtargetDebugTracker);
    cpuStatesCommands.activate(context, cpuStates);
    cpuStatesStatusBarItem.activate(context, cpuStates);
    // Live Watch view
    logger.debug('Activating Live Watch Tree Data Provider');
    if (!await liveWatchTreeDataProvider.activate(gdbtargetDebugTracker)) {
        canCompleteActivation = false;
    }
    // Component Viewer
    logger.debug('Activating Component Viewer');
    if (!await componentViewer.activate(gdbtargetDebugTracker)) {
        canCompleteActivation = false;
    }
    // Core Peripherals
    logger.debug('Activating Core Peripherals');
    if (!await corePeripherals.activate(gdbtargetDebugTracker)) {
        canCompleteActivation = false;
    }
    // Trace Configuration
    logger.debug('Activating CMSIS Trace Configuration');
    await traceConfiguration.activate(context);
    traceConfigurationCommands.activate(context);
    csvTableEditorProvider.activate(context);

    // Register reset dynamic view state command
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-cmsis-debugger.resetDynamicViewState', async () => {
            await clearAllViewState();
            await Promise.all([
                cpuStates.resetViewState(),
                componentViewer.resetRuntimeViewState(),
                corePeripherals.resetRuntimeViewState(),
                liveWatchTreeDataProvider.resetRuntimeViewState(),
            ]);
        })
    );

    if (!canCompleteActivation) {
        logger.debug('CMSIS Debugger activation incomplete');
        // Let promise float, we reload the window.
        askForReload()
            .catch(error => logger.error(`Error while asking user to reload window: ${error instanceof Error ? error.message : error}`));
        return;
    }

    logger.debug('CMSIS Debugger activated');
};

export const deactivate = async (): Promise<void> => {
    // Call deactivate of Live Watch to save its state
    if (liveWatchTreeDataProvider) {
        await liveWatchTreeDataProvider.deactivate();
    }
    if (componentViewerTreeDataProvider) {
        componentViewerTreeDataProvider.clear();
    }
    if (corePeripheralsTreeDataProvider) {
        corePeripheralsTreeDataProvider.clear();
    }
    if (traceConfiguration) {
        await traceConfiguration.deactivate();
    }
    logger.debug('CMSIS Debugger deactivated');
};
