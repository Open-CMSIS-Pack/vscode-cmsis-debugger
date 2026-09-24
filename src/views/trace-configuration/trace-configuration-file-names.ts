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

const CTRACE_FILE_SUFFIX = /\.ctrace\.ya?ml$/i;

export interface TraceConfigurationArtifactFileNames {
    readonly backupCTraceFileName: string;
    readonly productionCTraceRunFileName: string;
    readonly backupCTraceRunFileName: string;
}

export function getTraceConfigurationBackupFileName(fileName: string): string {
    return path.join(path.dirname(fileName), `~${path.basename(fileName)}`);
}

/**
 * Maps one .cmsis ctrace input to the production and temporary outputs pyTS
 * writes below the sibling .trace directory.
 */
export function getTraceConfigurationArtifactFileNames(fileName: string): TraceConfigurationArtifactFileNames {
    const baseName = path.basename(fileName);
    if (!CTRACE_FILE_SUFFIX.test(baseName)) {
        throw new Error(`Invalid ctrace file name: ${fileName}`);
    }
    const solutionSet = baseName.replace(CTRACE_FILE_SUFFIX, '');
    const traceDirectory = path.join(path.dirname(path.dirname(fileName)), '.trace');
    return {
        backupCTraceFileName: getTraceConfigurationBackupFileName(fileName),
        productionCTraceRunFileName: path.join(traceDirectory, `${solutionSet}.ctrace-run.yml`),
        backupCTraceRunFileName: path.join(traceDirectory, `~${solutionSet}.ctrace-run.yml`)
    };
}
