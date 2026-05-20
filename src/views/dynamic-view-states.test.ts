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

import * as vscode from 'vscode';
import {
    clearAllViewState,
    readComponentViewerState,
    readCpuStatesEnabled,
    writeComponentViewerState,
    writeCpuStatesEnabled,
} from './dynamic-view-states';

const CONFIG_KEY = 'My-Target::Debug';

function mockGetConfiguration(globalValue: Record<string, unknown> = {}, workspaceValue: Record<string, unknown> = {}): jest.Mock {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        update: updateMock,
        inspect: jest.fn().mockReturnValue({ globalValue, workspaceValue }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return updateMock;
}

describe('dynamic-view-states', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Component Viewer state', () => {
        it('returns user-level state when workspace is empty', () => {
            mockGetConfiguration({
                [CONFIG_KEY]: {
                    componentViewer: {
                        periodicUpdateEnabled: false,
                    },
                },
            });
            expect(readComponentViewerState('componentViewer', CONFIG_KEY)).toEqual({
                periodicUpdateEnabled: false,
            });
        });

        it('merges user and workspace state when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                            filterPattern: 'user-filter',
                        },
                    },
                },
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            periodicUpdateEnabled: true,
                        },
                    },
                }
            );
            expect(readComponentViewerState('componentViewer', CONFIG_KEY)).toEqual({
                periodicUpdateEnabled: true,
                filterPattern: 'user-filter',
            });
        });

        it('writes disabled periodic update state to workspace settings', async () => {
            const updateMock = mockGetConfiguration();
            await writeComponentViewerState('componentViewer', CONFIG_KEY, false, undefined);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                        },
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('removes workspace state when periodic update is enabled', async () => {
            const updateMock = mockGetConfiguration();
            await writeComponentViewerState('componentViewer', CONFIG_KEY, true, undefined);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes explicit enabled state when user setting disables periodic update', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: {
                    componentViewer: {
                        periodicUpdateEnabled: false,
                    },
                },
            });
            await writeComponentViewerState('componentViewer', CONFIG_KEY, true, undefined);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            periodicUpdateEnabled: true,
                        },
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('does not write explicit enabled state when only workspace disables periodic update', async () => {
            const updateMock = mockGetConfiguration(
                {},
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                        },
                    },
                }
            );
            await writeComponentViewerState('componentViewer', CONFIG_KEY, true, undefined);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('preserves other workspace entries when writing state', async () => {
            const otherConfigKey = 'Other-Target::Debug';
            const updateMock = mockGetConfiguration(
                {},
                {
                    [otherConfigKey]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                        },
                    },
                }
            );
            await writeComponentViewerState('componentViewer', CONFIG_KEY, true, 'user-filter');
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [otherConfigKey]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                        },
                    },
                    [CONFIG_KEY]: {
                        componentViewer: {
                            filterPattern: 'user-filter',
                        },
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('ignores unsupported component viewer ids', async () => {
            const updateMock = mockGetConfiguration();
            expect(readComponentViewerState('wrongId', CONFIG_KEY)).toBeUndefined();

            await writeComponentViewerState('wrongId', CONFIG_KEY, false, undefined);
            expect(updateMock).not.toHaveBeenCalled();
        });

        it('clears both workspace and global levels', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            await clearAllViewState();
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Global
            );
        });
    });

    describe('CPU States settings', () => {
        it('returns user-level state when workspace is empty', () => {
            mockGetConfiguration({
                [CONFIG_KEY]: {
                    cpuStates: false,
                },
            });
            expect(readCpuStatesEnabled(CONFIG_KEY)).toBe(false);
        });

        it('uses workspace value before user value when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        cpuStates: false,
                    },
                },
                {
                    [CONFIG_KEY]: {
                        cpuStates: true,
                    },
                }
            );
            expect(readCpuStatesEnabled(CONFIG_KEY)).toBe(true);
        });

        it('writes explicit enabled value when user setting disables CPU states', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: {
                    cpuStates: false,
                },
            });
            await writeCpuStatesEnabled(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        cpuStates: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('does not write explicit enabled value when only workspace disables CPU states', async () => {
            const updateMock = mockGetConfiguration(
                {},
                {
                    [CONFIG_KEY]: {
                        cpuStates: false,
                    },
                }
            );
            await writeCpuStatesEnabled(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });
    });
});
