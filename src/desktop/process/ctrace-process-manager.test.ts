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
import { BuiltinToolPath } from '../builtin-tool-path';
import { CTraceProcessManager } from './ctrace-process-manager';

jest.mock('child_process');

describe('CTraceProcessManager', () => {
    const mockSpawn = jest.mocked(spawn);

    beforeEach(() => {
        mockSpawn.mockReturnValue(childProcessFactory());
        jest.mocked(vscode.commands.executeCommand).mockReset();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('launches with caller-provided arguments', async () => {
        const processManager = new CTraceProcessManager({ cTracePath: 'ctrace-path' });

        await processManager.launch({ args: ['custom', 'arguments'] });

        expect(mockSpawn).toHaveBeenCalledWith('ctrace-path', ['custom', 'arguments'], expect.any(Object));
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('creates trace arguments from the provided trace directory and solution set', async () => {
        const processManager = new CTraceProcessManager({ cTracePath: 'ctrace-path' });

        await processManager.launch({ traceDir: '/workspace/trace', solutionSet: 'solution+target' });

        expect(mockSpawn).toHaveBeenCalledWith(
            'ctrace-path',
            ['/workspace/trace', '-t', 'solution+target', '--csv'],
            expect.any(Object)
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('derives the solution set from a cbuild run file', async () => {
        jest.mocked(vscode.commands.executeCommand).mockResolvedValue('active-target');
        const processManager = new CTraceProcessManager({ cTracePath: 'ctrace-path' });

        await processManager.launch({ cbuildRunFilePath: '/workspace/example+debug.cbuild-run.yml' });

        expect(mockSpawn).toHaveBeenCalledWith(
            'ctrace-path',
            [expect.stringContaining('.trace'), '-t', 'example+active-target', '--csv'],
            expect.any(Object)
        );
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getActiveTargetSet');
    });

    it('rejects construction when the bundled ctrace path cannot be resolved', () => {
        jest.spyOn(BuiltinToolPath.prototype, 'getAbsolutePath').mockReturnValue(undefined);

        expect(() => new CTraceProcessManager()).toThrow('Failed to resolve the absolute path for ctrace.');
    });

    it('rejects launch when no workspace is open', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { configurable: true, value: undefined });
        const processManager = new CTraceProcessManager({ cTracePath: 'ctrace-path' });

        try {
            await expect(processManager.launch()).rejects.toThrow('No workspace folder is open.');
        } finally {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                configurable: true,
                value: workspaceFolders
            });
        }
    });
});
