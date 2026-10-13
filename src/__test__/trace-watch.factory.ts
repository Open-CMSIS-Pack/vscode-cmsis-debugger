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

import { FileWatchManager, FileWatchRegistrationOptions } from '../desktop/filesystem/file-watch-manager';

export interface TraceWatchFixture {
    readonly fileWatchManager: FileWatchManager;
    readonly addWatch: jest.Mock;
    readonly removeWatch: jest.Mock;
    getLatestWatch(): FileWatchRegistrationOptions | undefined;
}

export function traceWatchFactory(): TraceWatchFixture {
    let latestWatch: FileWatchRegistrationOptions | undefined;
    const addWatch = jest.fn((options: FileWatchRegistrationOptions) => {
        latestWatch = options;
    });
    const removeWatch = jest.fn();
    const fileWatchManager = { addWatch, removeWatch } as unknown as FileWatchManager;

    return {
        fileWatchManager,
        addWatch,
        removeWatch,
        getLatestWatch: () => latestWatch,
    };
}
