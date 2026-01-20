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
 *
 * Unit test for ComponentViewer.
 */
// generated with AI

jest.mock('vscode', () => ({}));

const activateSpy = jest.fn();
const controllerCtor = jest.fn((_context: unknown) => ({ activate: activateSpy }));

jest.mock('../../component-viewer-controller', () => ({
    ComponentViewerController: jest.fn((context: unknown) => controllerCtor(context)),
}));

import type { ExtensionContext } from 'vscode';
import type { GDBTargetDebugTracker } from '../../../../debug-session';
import { ComponentViewer } from '../../component-viewer-main';
import { ComponentViewerController } from '../../component-viewer-controller';

describe('ComponentViewer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        activateSpy.mockReset();
    });

    it('constructs with a controller instance', () => {
        const context = {} as ExtensionContext;

        const viewer = new ComponentViewer(context);

        expect(viewer).toBeInstanceOf(ComponentViewer);
        expect(ComponentViewerController).toHaveBeenCalledWith(context);
        expect(activateSpy).not.toHaveBeenCalled();
    });

    it('forwards activation to the controller', () => {
        const context = {} as ExtensionContext;
        const tracker = {} as GDBTargetDebugTracker;
        const viewer = new ComponentViewer(context);
        activateSpy.mockReturnValue('ok');

        const result = viewer.activate(tracker);

        expect(result).toBe('ok');
        expect(activateSpy).toHaveBeenCalledWith(tracker);
    });
});
