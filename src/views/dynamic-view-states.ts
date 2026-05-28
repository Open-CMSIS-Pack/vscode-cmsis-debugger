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

import * as vscode from 'vscode';

const SETTINGS_KEY = 'vscode-cmsis-debugger.viewState';

type ViewStateEntry = {
    componentViewer: ComponentViewerState;
    corePeripherals: ComponentViewerState;
    cpuStatesEnabled: boolean;
    liveWatchPeriodicUpdateEnabled: boolean;
};
type ViewStateByConfigKey = Record<string, Partial<ViewStateEntry>>;

interface ComponentViewerState {
    periodicUpdateEnabled?: boolean;
    filterPattern?: string;
}

/* eslint-disable security/detect-object-injection */
function readDynamicViewState<T extends keyof ViewStateEntry>(configStateKey: string, dynamicView: T, mode: 'global' | 'merged' = 'merged'): ViewStateEntry[T] | undefined {
    const inspection = vscode.workspace.getConfiguration().inspect<ViewStateByConfigKey>(SETTINGS_KEY);
    const globalEntry = inspection?.globalValue?.[configStateKey];
    const workspaceEntry = inspection?.workspaceValue?.[configStateKey];
    const globalViewState = globalEntry?.[dynamicView] as ViewStateEntry[T] | undefined;
    const workspaceViewState = workspaceEntry?.[dynamicView] as ViewStateEntry[T] | undefined;

    if (mode === 'global') return globalViewState;
    // 'User' state provides defaults; 'Workspace' state overrides only the properties it defines.
    if (typeof globalViewState === 'object' && globalViewState !== null && typeof workspaceViewState === 'object' && workspaceViewState !== null) {
        return { ...globalViewState, ...workspaceViewState } as ViewStateEntry[T];
    }
    return workspaceViewState ?? globalViewState;
}

async function writeWorkspaceDynamicViewState<T extends keyof ViewStateEntry>(configStateKey: string, dynamicView: T, state: ViewStateEntry[T] | undefined): Promise<void> {
    const inspection = vscode.workspace.getConfiguration().inspect<ViewStateByConfigKey>(SETTINGS_KEY);
    const entriesToStore: ViewStateByConfigKey = { ...(inspection?.workspaceValue ?? {}) };
    const entryToStore: Partial<ViewStateEntry> = { ...(entriesToStore[configStateKey] ?? {}) };
    if (state === undefined) {
        // Undefined means this dynamic view has no workspace override, so remove it from the stored entry.
        delete entryToStore[dynamicView];
    } else {
        entryToStore[dynamicView] = state;
    }
    if (Object.keys(entryToStore).length === 0) {
        // Drop empty debug configuration entries instead of leaving empty objects in settings.json.
        delete entriesToStore[configStateKey];
    } else {
        entriesToStore[configStateKey] = entryToStore;
    }
    // VS Code removes the entire setting when the updated value is undefined.
    const valueToStore = Object.keys(entriesToStore).length === 0 ? undefined : entriesToStore;
    await vscode.workspace.getConfiguration().update(SETTINGS_KEY, valueToStore, vscode.ConfigurationTarget.Workspace);
}
/* eslint-enable security/detect-object-injection */

export async function clearAllViewState(): Promise<void> {
    await Promise.all([
        vscode.workspace.getConfiguration().update(SETTINGS_KEY, undefined, vscode.ConfigurationTarget.Workspace),
        vscode.workspace.getConfiguration().update(SETTINGS_KEY, undefined, vscode.ConfigurationTarget.Global),
    ]);
}

// -------------------------------------------------------------------------------------------------
// Component Viewer and Core Peripherals
// -------------------------------------------------------------------------------------------------

export function readComponentViewerState(viewId: string, configStateKey: string): ComponentViewerState | undefined {
    if (viewId !== 'componentViewer' && viewId !== 'corePeripherals') {
        return undefined;
    }
    return readDynamicViewState(configStateKey, viewId, 'merged');
}

export async function writeComponentViewerState(viewId: string, configStateKey: string, refreshTimerEnabled: boolean, filterPattern: string | undefined): Promise<void> {
    if (viewId !== 'componentViewer' && viewId !== 'corePeripherals') {
        return;
    }
    const userState = readDynamicViewState(configStateKey, viewId, 'global');
    // If 'User' settings disable periodicUpdateEnabled but this 'Workspace' enables it,
    // write true explicitly so the 'User' value does not bleed through.
    const needsExplicitPeriodicUpdate = refreshTimerEnabled && userState?.periodicUpdateEnabled === false;
    const state: ComponentViewerState = {
        ...(!refreshTimerEnabled || needsExplicitPeriodicUpdate ? { periodicUpdateEnabled: refreshTimerEnabled } : {}),
        ...(filterPattern !== undefined ? { filterPattern } : {}),
    };
    await writeWorkspaceDynamicViewState(configStateKey, viewId, Object.keys(state).length === 0 ? undefined : state);
}

// -------------------------------------------------------------------------------------------------
// CPU States
// -------------------------------------------------------------------------------------------------

export function readCpuStates(configStateKey: string): boolean | undefined {
    return readDynamicViewState(configStateKey, 'cpuStatesEnabled', 'merged');
}

export async function writeCpuStates(configStateKey: string, enabled: boolean): Promise<void> {
    const userState = readDynamicViewState(configStateKey, 'cpuStatesEnabled', 'global');
    // If 'User' settings disable cpuStatesEnabled but this 'Workspace' enables it,
    // write true explicitly so the 'User' value does not bleed through.
    const stateToStore = enabled ? userState === false ? true : undefined : false;
    await writeWorkspaceDynamicViewState(configStateKey, 'cpuStatesEnabled', stateToStore);
}

// -------------------------------------------------------------------------------------------------
// Live Watch
// -------------------------------------------------------------------------------------------------

export function readLiveWatchState(configStateKey: string): boolean | undefined {
    return readDynamicViewState(configStateKey, 'liveWatchPeriodicUpdateEnabled', 'merged');
}

export async function writeLiveWatchState(configStateKey: string, periodicUpdateEnabled: boolean): Promise<void> {
    const userState = readDynamicViewState(configStateKey, 'liveWatchPeriodicUpdateEnabled', 'global');
    // If 'User' settings disable liveWatchPeriodicUpdateEnabled but this 'Workspace' enables it,
    // write true explicitly so the 'User' value does not bleed through.
    const stateToStore = periodicUpdateEnabled ? userState === false ? true : undefined : false;
    await writeWorkspaceDynamicViewState(configStateKey, 'liveWatchPeriodicUpdateEnabled', stateToStore);
}
