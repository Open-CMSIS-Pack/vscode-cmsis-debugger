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
import { extensionContextFactory } from '../__test__/vscode.factory';
import { logger } from '../logger';
import { activate, deactivate } from './extension';
import { ComponentViewerTreeDataProvider } from '../views/component-viewer/component-viewer-tree-view';
import { LiveWatchTreeDataProvider } from '../views/live-watch/live-watch';

describe('extension', () => {

    describe('activate', () => {

        it('activates extension without asking to reload', async () => {
            const loggerSpy = jest.spyOn(logger, 'debug');
            await activate(extensionContextFactory());
            expect(loggerSpy).toHaveBeenCalledWith('CMSIS Debugger activated');
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalledWith('Cannot activate all Arm CMSIS Debugger views. Please reload the window.', 'Reload Window');
        });

        it.each([
            { missingView: 'live watch view', availableCommands: [ 'cmsis-debugger.componentViewer.open', 'cmsis-debugger.componentViewer.focus'] },
            { missingView: 'component viewer', availableCommands: [ 'cmsis-debugger.liveWatch.open', 'cmsis-debugger.liveWatch.focus'] }
        ])('activates extension and asks to reload because $missingView is not loaded', async ({ availableCommands }) => {
            const loggerSpy = jest.spyOn(logger, 'debug');
            // Resolve once per each view in extension, do not permanently overload global mock
            (vscode.commands.getCommands as jest.Mock)
                .mockResolvedValueOnce(availableCommands)
                .mockResolvedValueOnce(availableCommands);
            await activate(extensionContextFactory());
            expect(loggerSpy).toHaveBeenCalledWith('CMSIS Debugger activation incomplete');
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Cannot activate all Arm CMSIS Debugger views. Please reload the window.', 'Reload Window');
        });

        it('reloads window if users clicks \'Reload Window\' button', async () => {
            (vscode.commands.getCommands as jest.Mock).mockResolvedValueOnce([]);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Reload Window');
            await activate(extensionContextFactory());
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
        });

        it('does not reload window if users clicks \'x\' button', async () => {
            (vscode.commands.getCommands as jest.Mock).mockResolvedValueOnce([]);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);
            await activate(extensionContextFactory());
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
        });

    });

    describe('deactivate', () => {
        const loggerSpy = jest.spyOn(logger, 'debug');
        const componentViewerClearSpy = jest.spyOn(ComponentViewerTreeDataProvider.prototype, 'clear');
        const liveWatchDeactivateSpy = jest.spyOn(LiveWatchTreeDataProvider.prototype, 'deactivate');

        beforeEach(() => {
            loggerSpy.mockClear();
            componentViewerClearSpy.mockClear();
            liveWatchDeactivateSpy.mockClear();
        });

        it('deactivates extension after activation', async () => {
            await activate(extensionContextFactory());
            await deactivate();
            expect(loggerSpy).toHaveBeenCalledWith('CMSIS Debugger deactivated');
            expect(componentViewerClearSpy).toHaveBeenCalled();
            expect(liveWatchDeactivateSpy).toHaveBeenCalled();
        });

        // Cannot test deactivation without activation due to global variables in
        // extension.ts that are set in other test cases after loading module.

    });
});

