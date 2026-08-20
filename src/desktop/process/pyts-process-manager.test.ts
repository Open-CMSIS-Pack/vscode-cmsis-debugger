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
// generated with AI

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { childProcessFactory } from '../../__test__/child-process.factory';
import { PyTsProcessManager } from './pyts-process-manager';

jest.mock('child_process');

describe('PyTsProcessManager', () => {
    const mockSpawn = jest.mocked(spawn);

    beforeEach(() => {
        mockSpawn.mockReturnValue(childProcessFactory());
        jest.mocked(vscode.commands.executeCommand).mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('launches with caller-provided arguments', async () => {
        const processManager = new PyTsProcessManager({ pyTsPath: 'pyts-path' });

        await processManager.launch({ args: ['custom', 'arguments'] });

        expect(mockSpawn).toHaveBeenCalledWith('pyts-path', ['custom', 'arguments'], expect.any(Object));
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('uses and trims the provided cbuild run file path', async () => {
        const processManager = new PyTsProcessManager({ pyTsPath: 'pyts-path' });

        await processManager.launch({ cbuildRunFilePath: ' /workspace/example.cbuild-run.yml ' });

        expect(mockSpawn).toHaveBeenCalledWith(
            'pyts-path',
            ['/workspace/example.cbuild-run.yml', '--allow-missing'],
            expect.any(Object)
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('uses the active cbuild run file when no path is provided', async () => {
        jest.mocked(vscode.commands.executeCommand).mockResolvedValue(' /workspace/example.cbuild-run.yml ');
        const processManager = new PyTsProcessManager({ pyTsPath: 'pyts-path' });

        await processManager.launch();

        expect(mockSpawn).toHaveBeenCalledWith(
            'pyts-path',
            ['/workspace/example.cbuild-run.yml', '--allow-missing'],
            expect.any(Object)
        );
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
    });

    it('rejects launch when no cbuild run file is available', async () => {
        const processManager = new PyTsProcessManager({ pyTsPath: 'pyts-path' });

        await expect(processManager.launch()).rejects.toThrow('No cbuild run file path provided.');

        expect(mockSpawn).not.toHaveBeenCalled();
    });
});
