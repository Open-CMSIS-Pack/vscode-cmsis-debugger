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
    clearAllComponentViewerState,
    readComponentViewerState,
    readCpuStatesEnabled,
    writeComponentViewerState,
    writeCpuStatesEnabled,
} from './dynamic-view-states';

const SETTINGS_KEY = 'test.viewState';
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
                    periodicUpdateEnabled: false,
                },
            });
            expect(readComponentViewerState(SETTINGS_KEY, CONFIG_KEY)).toEqual({
                periodicUpdateEnabled: false,
            });
        });

        it('merges user and workspace state when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: {
                        periodicUpdateEnabled: false,
                        filterPattern: 'user-filter',
                    },
                }, {
                    [CONFIG_KEY]: {
                        periodicUpdateEnabled: true,
                    },
                }
            );
            expect(readComponentViewerState(SETTINGS_KEY, CONFIG_KEY)).toEqual({
                periodicUpdateEnabled: true,
                filterPattern: 'user-filter',
            });
        });

        it('writes disabled periodic update state to workspace settings', async () => {
            const updateMock = mockGetConfiguration();
            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, false, undefined);
            expect(updateMock).toHaveBeenCalledWith( SETTINGS_KEY,
                {
                    [CONFIG_KEY]: {
                        periodicUpdateEnabled: false,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('removes workspace state when periodic update is enabled and user setting does not conflict', async () => {
            const updateMock = mockGetConfiguration();

            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, true, undefined);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes explicit enabled state when user setting disables periodic update', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: {
                    periodicUpdateEnabled: false,
                },
            });

            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, true, undefined);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [CONFIG_KEY]: {
                        periodicUpdateEnabled: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes active filter pattern to workspace settings', async () => {
            const updateMock = mockGetConfiguration();

            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, true, 'uart');

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [CONFIG_KEY]: {
                        filterPattern: 'uart',
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes filter pattern together with disabled periodic update state', async () => {
            const updateMock = mockGetConfiguration();

            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, false, 'uart');

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [CONFIG_KEY]: {
                        periodicUpdateEnabled: false,
                        filterPattern: 'uart',
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('preserves other workspace entries when writing state', async () => {
            const otherConfigKey = 'Other-Target::Debug';
            const updateMock = mockGetConfiguration(
                {},
                {
                    [otherConfigKey]: {
                        periodicUpdateEnabled: false,
                    },
                }
            );

            await writeComponentViewerState(SETTINGS_KEY, CONFIG_KEY, true, 'uart');

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [otherConfigKey]: {
                        periodicUpdateEnabled: false,
                    },
                    [CONFIG_KEY]: {
                        filterPattern: 'uart',
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('clears both workspace and global levels', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            await clearAllComponentViewerState([SETTINGS_KEY]);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                undefined,
                vscode.ConfigurationTarget.Global
            );
        });
    });

    describe('CPU States settings', () => {
        it('returns user-level value when workspace is empty', () => {
            mockGetConfiguration({
                [CONFIG_KEY]: false,
            });

            expect(readCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY)).toBe(false);
        });

        it('uses workspace value before user value when reading', () => {
            mockGetConfiguration(
                {
                    [CONFIG_KEY]: false,
                },
                {
                    [CONFIG_KEY]: true,
                }
            );

            expect(readCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY)).toBe(true);
        });

        it('writes disabled CPU states value to workspace settings', async () => {
            const updateMock = mockGetConfiguration();

            await writeCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY, false);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [CONFIG_KEY]: false,
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('removes workspace state when CPU states are enabled and user setting does not conflict', async () => {
            const updateMock = mockGetConfiguration();

            await writeCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY, true);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                undefined,
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('writes explicit enabled value when user setting disables CPU states', async () => {
            const updateMock = mockGetConfiguration({
                [CONFIG_KEY]: false,
            });

            await writeCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY, true);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [CONFIG_KEY]: true,
                },
                vscode.ConfigurationTarget.Workspace
            );
        });

        it('preserves other workspace entries when writing CPU states value', async () => {
            const otherConfigKey = 'Other-Target::Debug';
            const updateMock = mockGetConfiguration(
                {},
                {
                    [otherConfigKey]: false,
                }
            );

            await writeCpuStatesEnabled(SETTINGS_KEY, CONFIG_KEY, false);

            expect(updateMock).toHaveBeenCalledWith(
                SETTINGS_KEY,
                {
                    [otherConfigKey]: false,
                    [CONFIG_KEY]: false,
                },
                vscode.ConfigurationTarget.Workspace
            );
        });
    });
});