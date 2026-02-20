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
import * as vscode from 'vscode';
import { ComponentViewerBase } from '../component-viewer/component-viewer-base';
import { ComponentViewerTreeDataProvider } from '../component-viewer/component-viewer-tree-view';
import { GDBTargetDebugSession } from '../../debug-session';
import { promisify } from 'util';

// Relative to dist folder at runtime
const CORE_PERIPHERAL_SCVD_BASE = path.join(__dirname, '..', 'configs', 'core-peripheral-viewer');

export class CorePeripheralViewer extends ComponentViewerBase {
    public constructor(
        context: vscode.ExtensionContext,
        componentViewerTreeDataProvider: ComponentViewerTreeDataProvider
    ) {
        super(context, componentViewerTreeDataProvider, 'Core Peripheral Viewer', 'corePeripheralViewer');
    }

    protected override async getScvdFilePaths(_session: GDBTargetDebugSession): Promise<string[]> {
        const filePaths = await promisify(fs.readdir)(CORE_PERIPHERAL_SCVD_BASE, {
            encoding: 'buffer',
            withFileTypes: true
        });
        const scvdFilePaths = filePaths
            .filter((file) => file.isFile() && file.name.toString().toLowerCase().endsWith('.scvd'))
            .map((file) => path.join(CORE_PERIPHERAL_SCVD_BASE, file.name.toString()));
        return scvdFilePaths;
    }

}
