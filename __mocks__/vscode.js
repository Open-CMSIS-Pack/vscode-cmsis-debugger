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
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        })),
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn(),
        })),
        fs: {
            readFile: jest.fn(),
        }
    },
    extensions: {
        getExtension: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    debug: {
        registerDebugConfigurationProvider: jest.fn(),
        registerDebugAdapterTrackerFactory: jest.fn(),
    },
};
