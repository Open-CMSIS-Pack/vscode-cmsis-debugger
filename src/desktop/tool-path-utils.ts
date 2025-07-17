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
import { BuiltinToolPath } from './builtin-tool-path';

export const resolveToolPath = (toolpath: string | undefined, toolName: string, toolRegexp: RegExp, builtInTool: BuiltinToolPath): string => {
    const useBuiltin = !toolpath || toolRegexp.test(toolpath);
    if (!useBuiltin) {
        // Leave as is
        return toolpath;
    }
    const updateUri = builtInTool.getAbsolutePath();
    if (!updateUri) {
        const warnMessage =
            `Cannot find './${builtInTool.toolPath}' in CMSIS Debugger extension installation.\n`
            + `Using ${toolName} from PATH instead.`;
        vscode.window.showWarningMessage(warnMessage);
        return toolName;
    }
    return updateUri.fsPath;
};
