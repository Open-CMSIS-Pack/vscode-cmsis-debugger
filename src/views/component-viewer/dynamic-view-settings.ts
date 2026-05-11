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

export interface DynamicViewState {
    periodicUpdateEnabled?: boolean;
    filterPattern?: string;
}

export type DynamicViewStateByConfig = Record<string, DynamicViewState>;

export function readDynamicViewState(settingsKey: string, configStateKey: string): DynamicViewState | undefined {
    const inspection = vscode.workspace.getConfiguration().inspect<DynamicViewStateByConfig>(settingsKey);
    const globalState = inspection?.globalValue?.[configStateKey];
    const workspaceState = inspection?.workspaceValue?.[configStateKey];
    if (globalState === undefined && workspaceState === undefined) {
        return undefined;
    }
    // User state provides defaults; Workspace state overrides only the properties it defines.
    return { ...globalState, ...workspaceState, };
}

export async function writeDynamicViewState(settingsKey: string, configStateKey: string, state: DynamicViewState): Promise<void> {
    const statesToStore = { ...(vscode.workspace.getConfiguration().get<DynamicViewStateByConfig>(settingsKey) ?? {}) };
    if (Object.keys(state).length === 0) {
        delete statesToStore[configStateKey];
    } else {
        statesToStore[configStateKey] = state;
    }
    const valueToStore = Object.keys(statesToStore).length === 0 ? undefined : statesToStore;
    await vscode.workspace.getConfiguration().update(settingsKey, valueToStore, vscode.ConfigurationTarget.Workspace);
}

export async function clearAllDynamicViewState(settingsKeys: string[]): Promise<void> {
    await Promise.all(settingsKeys.flatMap(key => [
        vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Workspace),
        vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global),
    ]));
}
