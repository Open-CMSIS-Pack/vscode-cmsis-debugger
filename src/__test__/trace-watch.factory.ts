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
// generated with AI

import * as vscode from 'vscode';
import { FileWatchManager } from '../desktop/filesystem/file-watch-manager';
import { ENABLE_TRACE_GENERATION_VIEW_SETTING } from '../manifest';

export interface TraceWatchFixture {
    readonly fileWatchManager: FileWatchManager;
    readonly addWatch: jest.Mock;
    readonly removeWatch: jest.Mock;
    setTraceEnabled(enabled: boolean): void;
    fireTraceConfigurationChange(): void;
}

export function traceWatchFactory(): TraceWatchFixture {
    let traceEnabled = false;
    let configurationChangeHandler: ((event: vscode.ConfigurationChangeEvent) => void) | undefined;
    const configuration = {
        get: jest.fn(() => traceEnabled),
    } as unknown as vscode.WorkspaceConfiguration;
    const addWatch = jest.fn();
    const removeWatch = jest.fn();
    const fileWatchManager = { addWatch, removeWatch } as unknown as FileWatchManager;
    const traceConfigurationChange = {
        affectsConfiguration: (setting: string) => setting === ENABLE_TRACE_GENERATION_VIEW_SETTING,
    } as vscode.ConfigurationChangeEvent;

    (vscode.workspace.getConfiguration as jest.Mock)
        .mockReturnValueOnce(configuration)
        .mockReturnValueOnce(configuration)
        .mockReturnValueOnce(configuration);
    (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementationOnce((handler: (event: vscode.ConfigurationChangeEvent) => void) => {
        configurationChangeHandler = handler;
        return { dispose: jest.fn() };
    });

    return {
        fileWatchManager,
        addWatch,
        removeWatch,
        setTraceEnabled: enabled => {
            traceEnabled = enabled;
        },
        fireTraceConfigurationChange: () => configurationChangeHandler?.(traceConfigurationChange),
    };
}
