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
import { childProcessFactory, MockChildProcess } from '../../__test__/child-process.factory';
import { ProcessManager } from './process-manager';

jest.mock('child_process');

describe('ProcessManager', () => {
    const mockSpawn = jest.mocked(spawn);
    let child: MockChildProcess;

    beforeEach(() => {
        child = childProcessFactory();
        mockSpawn.mockReturnValue(child);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('rejects lifecycle operations before launch and duplicate launches', async () => {
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process' });

        expect(processManager.pid).toBeUndefined();
        expect(processManager.isRunning).toBe(false);
        expect(processManager.hasExited).toBe(false);
        expect(processManager.getExitCode()).toBeUndefined();
        expect(processManager.signal('SIGTERM')).toBe(false);
        expect(() => processManager.waitForExit()).toThrow('test process process has not been launched.');
        await expect(processManager.stop({ timeout: 0 })).resolves.toBeUndefined();

        processManager.launch({ args: ['argument'], cwd: 'test-working-directory', env: { TEST_VALUE: 'enabled' } });

        expect(mockSpawn).toHaveBeenCalledWith('test-command', ['argument'], expect.objectContaining({
            cwd: 'test-working-directory',
            env: { TEST_VALUE: 'enabled' },
            stdio: ['pipe', 'pipe', 'pipe']
        }));
        expect(processManager.pid).toBe(1234);
        expect(processManager.isRunning).toBe(true);
        expect(processManager.getExitCode()).toBeUndefined();
        expect(() => processManager.launch({})).toThrow('test process process has already been launched.');

        child.emitExit(23);
        await expect(processManager.waitForExit()).resolves.toBe(23);

        expect(processManager.hasExited).toBe(true);
        expect(processManager.isRunning).toBe(false);
        expect(processManager.getExitCode()).toBe(23);
        expect(processManager.signal('SIGTERM')).toBe(false);
    });

    it('forwards output and lifecycle events', async () => {
        const output = { append: jest.fn(), appendLine: jest.fn() };
        const onSpawn = jest.fn();
        const onExit = jest.fn();
        const processManager = new ProcessManager({
            command: 'test-command',
            name: 'test process',
            output,
            onSpawn,
            onExit
        });

        processManager.launch({ args: ['argument'] });
        child.emit('spawn');
        child.stdout.write('standard output');
        child.stderr.write('standard error');
        child.emitExit(0);

        await expect(processManager.waitForExit()).resolves.toBe(0);

        expect(onSpawn).toHaveBeenCalledWith(processManager);
        expect(output.append).toHaveBeenCalledWith('standard output');
        expect(output.append).toHaveBeenCalledWith('standard error');
        expect(output.appendLine).toHaveBeenCalledWith('Launching test process with command: test-command argument');
        expect(output.appendLine).toHaveBeenCalledWith('test process exited with code 0.');
        expect(onExit).toHaveBeenCalledWith(0, null, processManager);
    });

    it('drains output streams when no output channel is configured', async () => {
        const stdoutResume = jest.spyOn(child.stdout, 'resume');
        const stderrResume = jest.spyOn(child.stderr, 'resume');
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process' });

        processManager.launch({});
        child.emitExit(0);
        await expect(processManager.waitForExit()).resolves.toBe(0);

        expect(stdoutResume).toHaveBeenCalledTimes(1);
        expect(stderrResume).toHaveBeenCalledTimes(1);
    });

    it('reports spawn errors and resolves waiting callers', async () => {
        const output = { append: jest.fn(), appendLine: jest.fn() };
        const onError = jest.fn();
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process', output, onError });
        const error = new Error('unable to start');

        processManager.launch({});
        child.emit('error', error);

        await expect(processManager.waitForExit()).resolves.toBeNull();

        expect(onError).toHaveBeenCalledWith(error, processManager);
        expect(output.appendLine).toHaveBeenCalledWith('test process process error: unable to start');
        expect(processManager.hasExited).toBe(true);
        expect(processManager.isRunning).toBe(false);
        expect(processManager.getExitCode()).toBeNull();
    });

    it('continues waiting for an exit after an error from a spawned process', async () => {
        const onError = jest.fn();
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process', onError });
        const error = new Error('unable to terminate');

        processManager.launch({});
        child.emit('spawn');
        child.emit('error', error);

        expect(onError).toHaveBeenCalledWith(error, processManager);
        expect(processManager.isRunning).toBe(true);
        expect(processManager.getExitCode()).toBeUndefined();

        child.emitExit(23);

        await expect(processManager.waitForExit()).resolves.toBe(23);
        expect(processManager.getExitCode()).toBe(23);
    });

    it('stops a running process with its graceful termination signal', async () => {
        const onForce = jest.fn();
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process' });

        processManager.launch({});
        await processManager.stop({ timeout: 1_000, onForce });

        expect(child.signals).toEqual(['SIGTERM']);
        expect(onForce).not.toHaveBeenCalled();
        expect(processManager.hasExited).toBe(true);
        expect(processManager.getExitCode()).toBeNull();
    });

    it('forces termination after the graceful timeout expires', async () => {
        const onForce = jest.fn();
        const processManager = new ProcessManager({ command: 'test-command', name: 'test process' });
        child.exitOnSignal = 'SIGKILL';

        processManager.launch({});
        await processManager.stop({ timeout: 0, onForce });

        expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
        expect(onForce).toHaveBeenCalledTimes(1);
        expect(processManager.hasExited).toBe(true);
    });
});
