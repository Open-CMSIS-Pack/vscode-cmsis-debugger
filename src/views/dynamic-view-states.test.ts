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
    clearComponentViewerState,
    clearLiveWatchState,
    readComponentViewerState,
    readCpuStates,
    readLiveWatchState,
    writeComponentViewerState,
    writeCpuStates,
    writeLiveWatchState,
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

        it('clears only the requested component viewer state and preserves other view state', async () => {
            const otherConfigKey = 'Other-Target::Debug';
            const updateMock = mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            filterPattern: 'global-filter',
                        },
                        corePeripherals: {
                            periodicUpdateEnabled: false,
                        },
                    },
                    [otherConfigKey]: {
                        componentViewer: {
                            periodicUpdateEnabled: false,
                        },
                    },
                },
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            filterPattern: 'workspace-filter',
                        },
                        corePeripherals: {
                            filterPattern: 'workspace-core-filter',
                        },
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                    [otherConfigKey]: {
                        componentViewer: {
                            filterPattern: 'other-workspace-filter',
                        },
                        cpuStatesEnabled: true,
                    },
                }
            );
            await clearComponentViewerState('componentViewer');

            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        corePeripherals: {
                            filterPattern: 'workspace-core-filter',
                        },
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                    [otherConfigKey]: {
                        cpuStatesEnabled: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        corePeripherals: {
                            periodicUpdateEnabled: false,
                        },
                    },
                },
                vscode.ConfigurationTarget.Global
            );
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
                    cpuStatesEnabled: false,
                },
            });
            expect(readCpuStates(CONFIG_KEY)).toBe(false);
        });

        it('uses workspace value before user value when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        cpuStatesEnabled: false,
                    },
                },
                {
                    [CONFIG_KEY]: {
                        cpuStatesEnabled: true,
                    },
                }
            );
            expect(readCpuStates(CONFIG_KEY)).toBe(true);
        });

        it('writes explicit enabled value when user setting disables CPU states', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: {
                    cpuStatesEnabled: false,
                },
            });
            await writeCpuStates(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        cpuStatesEnabled: true,
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
                        cpuStatesEnabled: false,
                    },
                }
            );
            await writeCpuStates(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });
    });

    describe('Live Watch settings', () => {
        it('returns user-level state when workspace is empty', () => {
            mockGetConfiguration({
                [CONFIG_KEY]: {
                    liveWatchPeriodicUpdateEnabled: false,
                },
            });
            expect(readLiveWatchState(CONFIG_KEY)).toBe(false);
        });

        it('uses workspace value before user value when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                },
                {
                    [CONFIG_KEY]: {
                        liveWatchPeriodicUpdateEnabled: true,
                    },
                }
            );
            expect(readLiveWatchState(CONFIG_KEY)).toBe(true);
        });

        it('writes disabled periodic update state to workspace settings', async () => {
            const updateMock = mockGetConfiguration();
            await writeLiveWatchState(CONFIG_KEY, false);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes explicit enabled value when user setting disables periodic update', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: {
                    liveWatchPeriodicUpdateEnabled: false,
                },
            });
            await writeLiveWatchState(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        liveWatchPeriodicUpdateEnabled: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('does not write explicit enabled value when only workspace disables periodic update', async () => {
            const updateMock = mockGetConfiguration(
                {},
                {
                    [CONFIG_KEY]: {
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                }
            );
            await writeLiveWatchState(CONFIG_KEY, true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('clears only Live Watch state and preserves other view state', async () => {
            const otherConfigKey = 'Other-Target::Debug';
            const updateMock = mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            filterPattern: 'global-filter',
                        },
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                    [otherConfigKey]: {
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                },
                {
                    [CONFIG_KEY]: {
                        corePeripherals: {
                            periodicUpdateEnabled: false,
                        },
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                    [otherConfigKey]: {
                        cpuStatesEnabled: true,
                    },
                }
            );
            await clearLiveWatchState();

            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        corePeripherals: {
                            periodicUpdateEnabled: false,
                        },
                    },
                    [otherConfigKey]: {
                        cpuStatesEnabled: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [CONFIG_KEY]: {
                        componentViewer: {
                            filterPattern: 'global-filter',
                        },
                    },
                },
                vscode.ConfigurationTarget.Global
            );
        });
    });
});
