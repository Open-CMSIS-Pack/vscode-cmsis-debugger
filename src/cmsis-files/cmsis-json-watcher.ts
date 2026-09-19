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
import { logger } from '../logger';
import { CMSIS_JSON_FILE_GLOB } from '../manifest';
import { normalizeFsPath } from '../utils';
import { ActiveSolutionPathReadResult, CBuildRunFileLocator } from '../cbuild-run/cbuild-run-file-locator';

const CMSIS_JSON_WATCH_ID = 'workspace.cmsis-json';

export interface ActiveSolutionChangeEvent {
    readonly previousActiveSolutionPath: string | undefined;
    readonly activeSolutionPath: string | undefined;
    readonly generation: number;
}

/**
 * CmsisJsonWatcher owns workspace cmsis.json observation and reports
 * only changes to its resolved activeSolution path.
 */
export class CmsisJsonWatcher implements vscode.Disposable {
    private fileWatchManager: FileWatchManager | undefined;
    private activeSolutionPath: string | undefined;
    private activeSolutionGeneration = 0;
    private activeSolutionReadVersion = 0;
    private readonly onDidChangeActiveSolutionEmitter = new vscode.EventEmitter<ActiveSolutionChangeEvent>();

    public get onDidChangeActiveSolution(): vscode.Event<ActiveSolutionChangeEvent> {
        return this.onDidChangeActiveSolutionEmitter.event;
    }

    public constructor(private readonly cbuildRunFileLocator: CBuildRunFileLocator = new CBuildRunFileLocator()) {}

    /**
     * activate starts observing cmsis.json through the shared watch manager.
     */
    public async activate(context: vscode.ExtensionContext, fileWatchManager: FileWatchManager): Promise<void> {
        if (this.fileWatchManager === fileWatchManager) {
            return;
        }
        if (this.fileWatchManager !== undefined) {
            throw new Error('Active solution watcher has already been activated.');
        }

        this.fileWatchManager = fileWatchManager;
        const result = await this.readObservedActiveSolutionPath();
        if (result.successful) {
            this.activeSolutionPath = normalizeFsPath(result.activeSolutionPath);
        }
        const workspaceFolder = this.cbuildRunFileLocator.getWorkspaceFolder();
        if (workspaceFolder) {
            fileWatchManager.addWatch({
                id: CMSIS_JSON_WATCH_ID,
                globPattern: new vscode.RelativePattern(workspaceFolder, CMSIS_JSON_FILE_GLOB),
                onDidCreate: () => this.handleCmsisJsonFileChanged(),
                onDidChange: () => this.handleCmsisJsonFileChanged(),
                onDidDelete: () => this.handleCmsisJsonFileChanged()
            });
        }
        context.subscriptions.push(this);
    }

    public dispose(): void {
        this.fileWatchManager?.removeWatch(CMSIS_JSON_WATCH_ID);
        this.fileWatchManager = undefined;
        this.onDidChangeActiveSolutionEmitter.dispose();
    }

    private async handleCmsisJsonFileChanged(): Promise<void> {
        const readVersion = ++this.activeSolutionReadVersion;
        const result = await this.readObservedActiveSolutionPath();
        if (!result.successful || readVersion !== this.activeSolutionReadVersion || this.fileWatchManager === undefined) {
            return;
        }

        const activeSolutionPath = normalizeFsPath(result.activeSolutionPath);
        if (activeSolutionPath === this.activeSolutionPath) {
            return;
        }

        const previousActiveSolutionPath = this.activeSolutionPath;
        this.activeSolutionPath = activeSolutionPath;
        this.activeSolutionGeneration += 1;
        this.onDidChangeActiveSolutionEmitter.fire({
            previousActiveSolutionPath,
            activeSolutionPath,
            generation: this.activeSolutionGeneration
        });
    }

    private async readObservedActiveSolutionPath(): Promise<ActiveSolutionPathReadResult> {
        try {
            const cmsisJsonFile = await this.cbuildRunFileLocator.findCmsisJsonFile();
            if (!cmsisJsonFile) {
                return { successful: true, activeSolutionPath: undefined };
            }
            return this.cbuildRunFileLocator.readActiveSolutionPathWithStatus(cmsisJsonFile);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug(`Failed to find CMSIS JSON file: ${errorMessage}`);
            return { successful: false, activeSolutionPath: undefined };
        }
    }
}
