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

const PYOCD_BUILTIN_PATH = 'tools/pyocd/pyocd';

export function addPyocdToPath(context: vscode.ExtensionContext): void {
    //get pyOCD path from tools folder
    const builtinPyocd = new BuiltinToolPath(PYOCD_BUILTIN_PATH);
    const pathPyOCD = builtinPyocd.getAbsolutePathDir();
    if (!pathPyOCD) {
        logger.debug('pyOCD is not available');
        return;
    }
    const delimiter = isWindows ? ';' : ':';
    const updatePath = `${pathPyOCD}${delimiter}`;
    //get current environment variable collection
    const mutator = context.environmentVariableCollection.get('PATH');
    // Path included and previously used type was 'Prepend'. Change mutator
    // if other type (we previously used 'Replace' which caused trouble).
    if (mutator?.type === vscode.EnvironmentVariableMutatorType.Prepend && mutator?.value.includes(updatePath)) {
        // Nothing to update
        return;
    }
    //add updated path to PATH variable, but only for the terminal inside of vscode
    context.environmentVariableCollection.prepend('PATH', updatePath);
}
