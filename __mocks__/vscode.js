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

require('domain');
const { URI } = require('vscode-uri');
const path = require('path');
const fs = require('fs');

const EnvironmentVariableMutatorType = {
    Replace: 1,
    Append: 2,
    Prepend: 3
};

const StatusBarAlignment = {
    Left: 1,
    Right: 2
};

const MockTreeItemCollapsibleState = { 
    None: 0, 
    Collapsed: 1, 
    Expanded: 2 
};

class MockTreeItem {
    label;
    description;
    contextValue;
    collapsibleState;
    constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

module.exports = {
    EventEmitter: jest.fn(() => {
        const callbacks = [];
        return {
            dispose: jest.fn(),
            event: (callback, thisArg) => {
                callbacks.push(thisArg ? callback.bind(thisArg) : callback);
                return { dispose: jest.fn() };
            },
            fire: event => callbacks.forEach(callback => callback(event))
        };
    }),
    Uri: URI,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: MockTreeItemCollapsibleState,
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        })),
        registerTreeDataProvider: jest.fn(() => ({ dispose: jest.fn() })),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
        showWarningMessage: jest.fn(),
        createStatusBarItem: jest.fn(),
        showQuickPick: jest.fn(),
    },
    env: {
        clipboard: {
            readText: jest.fn(),
            writeText: jest.fn()
        }
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn(),
        })),
        fs: {
            readFile: jest.fn(uri => {
                const buffer = fs.readFileSync(uri.fsPath);
                return new Promise(resolve => resolve(new Uint8Array(buffer)));
            })
        },
        workspaceFolders: [
            {
                uri: URI.file(path.join(__dirname, '..')),
                name: 'folderName',
                index: 0
            }
        ]
    },
    extensions: {
        getExtension: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
        registerCommand: jest.fn(),
    },
    debug: {
        registerDebugConfigurationProvider: jest.fn(),
        registerDebugAdapterTrackerFactory: jest.fn(),
        onDidChangeActiveDebugSession: jest.fn(),
        onDidChangeActiveStackItem: jest.fn(),
        activeStackItem: undefined,
        activeDebugConsole: {
            append: jest.fn(),
            appendLine: jest.fn()
        }
    },
    EnvironmentVariableMutatorType,
    StatusBarAlignment,
};
