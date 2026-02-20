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

import * as vscode from 'vscode';
import { ComponentViewerBase } from './component-viewer-base';
import { ComponentViewerTreeDataProvider } from './component-viewer-tree-view';
import { GDBTargetDebugSession } from '../../debug-session';

export class ComponentViewer extends ComponentViewerBase {
    public constructor(
        context: vscode.ExtensionContext,
        componentViewerTreeDataProvider: ComponentViewerTreeDataProvider
    ) {
        super(context, componentViewerTreeDataProvider, 'Component Viewer', 'componentViewer');
    }

    protected override async getScvdFilePaths(session: GDBTargetDebugSession): Promise<string[]> {
        const cbuildRunReader = await session.getCbuildRun();
        const pname = await session.getPname();
        if (!cbuildRunReader) {
            return [];
        }
        // Get SCVD file paths from cbuild-run reader
        const scvdFilesPaths: string [] = cbuildRunReader.getScvdFilePaths(undefined, pname);
        if (scvdFilesPaths.length === 0) {
            return [];
        }
        return scvdFilesPaths;
    }

}
