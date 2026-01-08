/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as vscode from 'vscode';
import { ComponentViewerController } from './component-viewer-controller';
import { GDBTargetDebugTracker } from '../../debug-session';
export class ComponentViewer {
    private componentViewerController: ComponentViewerController;

    public constructor( context: vscode.ExtensionContext
    ) {
        this.componentViewerController = new ComponentViewerController(context);
    }

    public activate(tracker: GDBTargetDebugTracker) {
        return this.componentViewerController.activate(tracker);
    }
}
