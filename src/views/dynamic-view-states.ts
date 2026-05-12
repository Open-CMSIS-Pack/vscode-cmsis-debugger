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

type ConfigStateByKey<T> = Record<string, T>;

function readConfigState<T>(settingsKey: string, configStateKey: string): T | undefined {
    const inspection = vscode.workspace.getConfiguration().inspect<ConfigStateByKey<T>>(settingsKey);
    const globalState = inspection?.globalValue?.[configStateKey];
    const workspaceState = inspection?.workspaceValue?.[configStateKey];
    return workspaceState ?? globalState;
}

function readMergedConfigState<T extends object>(settingsKey: string, configStateKey: string): T | undefined {
    const inspection = vscode.workspace.getConfiguration().inspect<ConfigStateByKey<Partial<T>>>(settingsKey);
    const globalState = inspection?.globalValue?.[configStateKey];
    const workspaceState = inspection?.workspaceValue?.[configStateKey];
    if (globalState === undefined && workspaceState === undefined) {
        return undefined;
    }
    // 'User' state provides defaults; 'Workspace' state overrides only the properties it defines.
    return { ...(globalState ?? {}), ...(workspaceState ?? {}) } as T;
}

async function writeConfigState<T>(settingsKey: string, configStateKey: string, state: T | undefined): Promise<void> {
    const inspection = vscode.workspace.getConfiguration().inspect<ConfigStateByKey<T>>(settingsKey);
    const statesToStore = { ...(inspection?.workspaceValue ?? {}) };
    if (state === undefined) {
        delete statesToStore[configStateKey];
    } else {
        statesToStore[configStateKey] = state;
    }
    const valueToStore = Object.keys(statesToStore).length === 0 ? undefined : statesToStore;
    await vscode.workspace.getConfiguration().update(settingsKey, valueToStore, vscode.ConfigurationTarget.Workspace);
}

async function clearAllConfigState(settingsKeys: string[]): Promise<void> {
    await Promise.all(settingsKeys.flatMap(key => [
        vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Workspace),
        vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global),
    ]));
}

// -------------------------------------------------------------------------------------------------
// Component Viewer settings
// -------------------------------------------------------------------------------------------------

export interface ComponentViewerState {
    periodicUpdateEnabled?: boolean;
    filterPattern?: string;
}

type ComponentViewerStateByConfig = ConfigStateByKey<ComponentViewerState>;

export function readComponentViewerState(settingsKey: string, configStateKey: string): ComponentViewerState | undefined {
    return readMergedConfigState<ComponentViewerState>(settingsKey, configStateKey);
}

export async function writeComponentViewerState(settingsKey: string, configStateKey: string, refreshTimerEnabled: boolean, filterPattern: string | undefined
): Promise<void> {
    const inspection = vscode.workspace.getConfiguration().inspect<ComponentViewerStateByConfig>(settingsKey);
    const userState = inspection?.globalValue?.[configStateKey];
    // If 'User' settings disable periodicUpdate but this 'Workspace' enables it,
    // write true explicitly so the 'User' value does not bleed through.
    const needsExplicitPeriodicUpdate = refreshTimerEnabled && userState?.periodicUpdateEnabled === false;
    const state: ComponentViewerState = {
        ...(!refreshTimerEnabled || needsExplicitPeriodicUpdate ? { periodicUpdateEnabled: refreshTimerEnabled } : {}),
        ...(filterPattern !== undefined ? { filterPattern } : {}),
    };
    await writeConfigState(settingsKey, configStateKey, Object.keys(state).length === 0 ? undefined : state);
}

export async function clearAllComponentViewerState(settingsKeys: string[]): Promise<void> {
    await clearAllConfigState(settingsKeys);
}

// -------------------------------------------------------------------------------------------------
// CPU States settings
// -------------------------------------------------------------------------------------------------

export function readCpuStatesEnabled(settingsKey: string, configStateKey: string): boolean | undefined {
    return readConfigState<boolean>(settingsKey, configStateKey);
}

export async function writeCpuStatesEnabled(settingsKey: string, configStateKey: string, enabled: boolean): Promise<void> {
    const inspection = vscode.workspace.getConfiguration().inspect<ConfigStateByKey<boolean>>(settingsKey);
    const userState = inspection?.globalValue?.[configStateKey];
    // If 'User' settings disable periodicUpdate but this 'Workspace' enables it,
    // write true explicitly so the 'User' value does not bleed through.
    const stateToStore = enabled ? userState === false ? true : undefined : false;
    await writeConfigState(settingsKey, configStateKey, stateToStore);
}

export async function clearAllCpuStatesState(settingsKeys: string[]): Promise<void> {
    await clearAllConfigState(settingsKeys);
}
