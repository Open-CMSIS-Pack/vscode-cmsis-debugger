/**
 * Copyright 2026 Arm Limited
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

import * as fs from 'fs';
import * as path from 'path';
import { GDBTargetDebugSession } from '../../debug-session';
import { ScvdCollector } from '../component-viewer/component-viewer-base';
import { componentViewerLogger } from '../../logger';

// Relative to dist folder at runtime
const CORE_PERIPHERAL_SCVD_BASE = path.join(__dirname, '..', 'configs', 'core-peripherals');

export class CorePeripheralsScvdCollector implements ScvdCollector {
    public constructor(private readonly basePath: string = CORE_PERIPHERAL_SCVD_BASE) {}

    public async getScvdFilePaths(_session: GDBTargetDebugSession): Promise<string[]> {
        const resolvedBasePath = path.resolve(this.basePath);
        const filePaths = [];
        try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const readFilePaths = await fs.promises.readdir(resolvedBasePath, {
                encoding: 'buffer',
                withFileTypes: true
            });
            filePaths.push(...readFilePaths);
        } catch (err) {
            // Log error and return empty list if directory cannot be read, e.g. because it does not exist
            componentViewerLogger.error(`Core Peripherals: Error reading SCVD files from ${resolvedBasePath}:`, err);
            return [];
        }
        const scvdFilePaths = filePaths
            .filter((file) => file.isFile() && file.name.toString().toLowerCase().endsWith('.scvd'))
            .map((file) => path.join(resolvedBasePath, file.name.toString()));
        return scvdFilePaths;
    }
}
