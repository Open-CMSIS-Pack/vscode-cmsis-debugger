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
import { logger } from '../logger';
import { isWindows } from '../utils';
import { BuiltinToolPath } from './builtin-tool-path';

export function addToolsToPath(context: vscode.ExtensionContext, toolsToAdd: string[]): void {
    const delimiter = isWindows ? ';' : ':';
    const absolutePaths = toolsToAdd.map((toolToAdd) => {
        // get gdb path from tools folder
        const builtinTool = new BuiltinToolPath(toolToAdd);
        const pathTool = builtinTool.getAbsolutePathDir();
        // check if path exists
        if (!pathTool) {
            logger.debug(`${toolToAdd} is not available`);
        }
        return pathTool;
    });
    const definedPaths = absolutePaths.filter(path => path !== undefined && path !== '');
    if (definedPaths.length === 0) {
        return;
    }
    // get current environment variable collection and extract list of set paths
    const mutator = context.environmentVariableCollection.get('PATH');
    const mutatorPaths = mutator?.value.split(delimiter);
    // All paths included and previously used type was 'Prepend'. Change mutator
    // if other type (we previously used 'Replace' which caused trouble).
    const allIncluded = mutatorPaths && definedPaths.every(path => path && mutatorPaths.includes(path));
    if (mutator?.type === vscode.EnvironmentVariableMutatorType.Prepend && allIncluded) {
        // Nothing to update
        return;
    }
    // create string to be added to PATH variable
    const updatePath = definedPaths.join(delimiter) + delimiter;
    // add updated path to PATH variable, but only for the terminal inside of vscode
    context.environmentVariableCollection.prepend('PATH', updatePath);
}

