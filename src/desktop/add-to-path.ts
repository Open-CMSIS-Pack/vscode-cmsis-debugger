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
    //get PATH variable
    const pathVariable = process.env.PATH;
    if (!pathVariable) {
        logger.debug('pyOCD is not available');
        return;
    }
    const delimiter = isWindows ? ';' : ':';
    const updatePath = pathPyOCD.concat(delimiter, pathVariable);
    //add updated path to PATH variable, but only for the terminal inside of vscode
    context.environmentVariableCollection.replace('PATH', updatePath);
}
