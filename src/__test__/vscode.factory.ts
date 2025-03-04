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

export function extensionContextFactory(): jest.Mocked<vscode.ExtensionContext> {
    return {
        subscriptions: [],
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
        } as unknown as vscode.Memento,
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            setKeysForSync: jest.fn(),
        } as unknown as vscode.Memento & { setKeysForSync(keys: readonly string[]): void } ,
        secrets: {
            store: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
        } as unknown as vscode.SecretStorage,
        extensionUri: vscode.Uri.file('/mock/uri'),
        extensionPath: '/mock/path',
        environmentVariableCollection: {
            persistent: true,
            replace: jest.fn(),
            append: jest.fn(),
            prepend: jest.fn(),
            get: jest.fn(),
            forEach: jest.fn(),
            getScoped: jest.fn(),
        } as unknown as vscode.GlobalEnvironmentVariableCollection,
        storageUri: vscode.Uri.file('/mock/storageUri'),
        globalStorageUri: vscode.Uri.file('/mock/globalStorageUri'),
        logUri: vscode.Uri.file('/mock/logUri'),
        storagePath: '/mock/storagePath',
        globalStoragePath: '/mock/globalStoragePath',
        logPath: '/mock/logPath',
        asAbsolutePath: jest.fn((relativePath: string) => `/mock/path/${relativePath}`),
        extensionMode: 3,
        extension: {
            id: 'mock.extension',
            extensionUri: vscode.Uri.file('/mock/uri'),
            extensionPath: '/mock/path',
            isActive: true,
            packageJSON: {},
            activate: jest.fn(),
            exports: {},
            extensionKind: 2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as unknown as vscode.Extension<any>,
        languageModelAccessInformation: {
            getLanguageModel: jest.fn(),
        } as unknown as vscode.LanguageModelAccessInformation,
    };
};
