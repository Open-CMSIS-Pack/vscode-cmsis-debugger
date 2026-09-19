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

import { FileWatchManager, FileWatchRegistrationOptions } from '../desktop/filesystem/file-watch-manager';
import { ActiveSolutionChangeEvent, CmsisJsonWatcher } from '../cmsis-files';
import { makeFactory } from './test-data-factory';

export interface ActiveSolutionWatchFixture {
    readonly fileWatchManager: FileWatchManager;
    readonly addWatch: jest.Mock;
    readonly removeWatch: jest.Mock;
    readonly activeSolutionChangeEmitter: vscode.EventEmitter<ActiveSolutionChangeEvent>;
    readonly cmsisJsonWatcher: CmsisJsonWatcher;
    getWatch(): FileWatchRegistrationOptions;
    fireActiveSolutionChange(event: ActiveSolutionChangeEvent): void;
}

export const activeSolutionWatchFactory = makeFactory<ActiveSolutionWatchFixture>({
    addWatch: () => jest.fn(),
    removeWatch: () => jest.fn(),
    activeSolutionChangeEmitter: () => new vscode.EventEmitter<ActiveSolutionChangeEvent>(),
    fileWatchManager: result => ({
        addWatch: result.addWatch,
        removeWatch: result.removeWatch
    } as unknown as FileWatchManager),
    cmsisJsonWatcher: result => ({
        onDidChangeActiveSolution: result.activeSolutionChangeEmitter?.event
    } as unknown as CmsisJsonWatcher),
    getWatch: result => (): FileWatchRegistrationOptions => {
        const watch = result.addWatch?.mock.calls.at(-1)?.[0] as FileWatchRegistrationOptions | undefined;
        if (!watch) {
            throw new Error('No active-solution watch has been registered.');
        }
        return watch;
    },
    fireActiveSolutionChange: result => event => {
        result.activeSolutionChangeEmitter?.fire(event);
    }
});
