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
import { readDynamicViewState, writeDynamicViewState } from '../../dynamic-view-settings';

const SETTINGS_KEY = 'test.viewState';
const CONFIG_KEY = 'My-Target::Debug';

describe('dynamic-view-settings', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('readDynamicViewState', () => {
        it('returns user-level state when only the user level has an entry', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                inspect: jest.fn().mockReturnValue({
                    globalValue: { [CONFIG_KEY]: { periodicUpdateEnabled: false } },
                    workspaceValue: {},
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            expect(readDynamicViewState(SETTINGS_KEY, CONFIG_KEY)).toEqual({ periodicUpdateEnabled: false });
        });

        it('merges both levels with workspace taking precedence over user', () => {
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                inspect: jest.fn().mockReturnValue({
                    globalValue: { [CONFIG_KEY]: { periodicUpdateEnabled: false, filterPattern: 'user-filter' } },
                    workspaceValue: { [CONFIG_KEY]: { periodicUpdateEnabled: true } },
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            expect(readDynamicViewState(SETTINGS_KEY, CONFIG_KEY)).toEqual({
                periodicUpdateEnabled: true,
                filterPattern: 'user-filter',
            });
        });
    });

    describe('writeDynamicViewState', () => {
        it('writes only to workspaceValue and does not pull in user-level keys', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            const foreignKey = 'OtherProject::OtherConfig';
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({
                    globalValue: { [foreignKey]: { periodicUpdateEnabled: true } },
                    workspaceValue: {},
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            await writeDynamicViewState(SETTINGS_KEY, CONFIG_KEY, { periodicUpdateEnabled: false });

            const written = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
            expect(written).not.toHaveProperty(foreignKey);
            expect(written).toHaveProperty(CONFIG_KEY, { periodicUpdateEnabled: false });
        });

        it('preserves other configuration keys when writing a new entry', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            const existingKey = 'OtherTarget::OtherConfig';
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({
                    globalValue: {},
                    workspaceValue: { [existingKey]: { periodicUpdateEnabled: false } },
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            await writeDynamicViewState(SETTINGS_KEY, CONFIG_KEY, { filterPattern: 'word' });

            const written = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
            expect(written).toHaveProperty(existingKey);
            expect(written).toHaveProperty(CONFIG_KEY, { filterPattern: 'word' });
        });

        it('removes the key when state is empty and no keys remain', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({
                    globalValue: {},
                    workspaceValue: { [CONFIG_KEY]: { periodicUpdateEnabled: false } },
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            await writeDynamicViewState(SETTINGS_KEY, CONFIG_KEY, {});

            expect(updateMock).toHaveBeenCalledWith(SETTINGS_KEY, undefined, vscode.ConfigurationTarget.Workspace);
        });
    });
});
