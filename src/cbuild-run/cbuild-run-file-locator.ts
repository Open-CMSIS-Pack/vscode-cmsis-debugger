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

import * as path from 'node:path';

import * as vscode from 'vscode';
import { parse } from 'yaml';

import { logger } from '../logger';
import { CBUILD_INDEX_FILE_GLOB } from '../manifest';
import { fileExists } from '../utils';

/**
 * Locates cbuild-run files for functionality that is not directly tied to a
 * debug session. Debug sessions receive the cbuild-run file path directly as
 * a launch or attach configuration argument.
 */
export class CBuildRunFileLocator {
    private static readonly CMSIS_SOLUTION_GET_CBUILD_RUN_FILE_COMMAND = 'cmsis-csolution.getCbuildRunFile';
    private static readonly CMSIS_SOLUTION_GET_ACTIVE_TARGET_SET_COMMAND = 'cmsis-csolution.getActiveTargetSet';

    /**
     * Finds a pre-existing cbuild index in the main workspace. This covers
     * projects whose index was generated before a filesystem watcher started.
     */
    public async findExistingCBuildIndexFile(): Promise<vscode.Uri | undefined> {
        const mainWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!mainWorkspaceFolder) {
            return undefined;
        }
        const pattern = new vscode.RelativePattern(mainWorkspaceFolder, CBUILD_INDEX_FILE_GLOB);
        const files = await vscode.workspace.findFiles(pattern, null, 1);
        return files.at(0);
    }

    /**
     * Resolves the generated cbuild-run path recorded by a cbuild index. The
     * YAML is external data, so each property is checked before use.
     */
    public async readCBuildRunFileNameFromIndex(cbuildIndexFile: vscode.Uri): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(cbuildIndexFile);
            const root: unknown = parse(new TextDecoder().decode(bytes));
            const buildIndex = this.getObjectProperty(root, 'build-idx');
            const cbuildRunFileName = this.getObjectProperty(buildIndex, 'cbuild-run');
            if (typeof cbuildRunFileName !== 'string' || !cbuildRunFileName.trim()) {
                return undefined;
            }
            return path.resolve(path.dirname(cbuildIndexFile.fsPath), cbuildRunFileName.trim());
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug(`Trace Configuration: Failed to read generated cbuild index file: ${errorMessage}`);
            return undefined;
        }
    }

    /**
     * getCBuildRunFileNameFromCommand asks the CMSIS Solution extension for the active
     * target's generated cbuild-run file. Empty results and command failures are
     * treated as "not available" so the trace view can still fall back to the
     * processor names already present in ctrace.yml.
     */
    public async getCBuildRunFileNameFromCommand(): Promise<string | undefined> {
        try {
            const fileName = await vscode.commands.executeCommand<string | undefined>(CBuildRunFileLocator.CMSIS_SOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
            return fileName?.trim() ? fileName : undefined;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug(`Failed to get active cbuild-run file from CMSIS Solution: ${errorMessage}`);
            return undefined;
        }
    }

    /**
     * Gets the active cbuild-run file name from CMSIS Solution, falling back to
     * the cbuild index while CMSIS Solution is still loading its build data.
     */
    public async getCBuildRunFileName(
        cbuildIndexFile?: vscode.Uri,
        findExistingCBuildIndex = false
    ): Promise<string | undefined> {
        const cbuildRunFileName = await this.getCBuildRunFileNameFromCommand();
        if (cbuildRunFileName && await fileExists(vscode.Uri.file(cbuildRunFileName))) {
            return cbuildRunFileName;
        }

        const indexFile = cbuildIndexFile ?? (findExistingCBuildIndex
            ? await this.findExistingCBuildIndexFile()
            : undefined);
        const indexedCBuildRunFileName = indexFile
            ? await this.readCBuildRunFileNameFromIndex(indexFile)
            : undefined;
        return indexedCBuildRunFileName ?? cbuildRunFileName;
    }

    public async getDefaultSolutionSet(cbuildRunFilePath: string | undefined): Promise<string> {
        const resolvedCbuildRunFilePath = cbuildRunFilePath ??
            await vscode.commands.executeCommand<string | undefined>(CBuildRunFileLocator.CMSIS_SOLUTION_GET_CBUILD_RUN_FILE_COMMAND);
        const trimmedPath = resolvedCbuildRunFilePath?.trim();
        if (!trimmedPath) {
            throw new Error('No cbuild run file path provided.');
        }
        const solutionName = trimmedPath.match(/.*[\\/](.*)\+.*\.cbuild-run\.yml$/)?.[1];
        if (!solutionName) {
            throw new Error('Failed to extract solution name from cbuild run file path.');
        }
        const activeSet = await vscode.commands.executeCommand<string | undefined>(CBuildRunFileLocator.CMSIS_SOLUTION_GET_ACTIVE_TARGET_SET_COMMAND);
        const trimmedActiveSet = activeSet?.trim();
        const targetSet = trimmedActiveSet ? `+${trimmedActiveSet}` : '';
        return `${solutionName}${targetSet}`;
    }

    private getObjectProperty(value: unknown, key: string): unknown {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return Reflect.get(value, key);
    }
}
