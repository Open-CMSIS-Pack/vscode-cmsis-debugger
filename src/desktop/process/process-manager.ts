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
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { waitForMs } from '../../utils';

export interface ProcessOutput {
   append(value: string): void;
   appendLine(value: string): void;
}

export interface ProcessManagerOptions {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string | URL;
    readonly env?: NodeJS.ProcessEnv;
    readonly windowsHide?: boolean;
    readonly name: string;
    readonly output?: ProcessOutput;
    // TODO: Check if really needed
    readonly onSpawn?: (process: ProcessManager) => void;
    readonly onError?: (error: Error, process: ProcessManager) => void;
    readonly onExit?: (code: number | null, signal: NodeJS.Signals | null, process: ProcessManager) => void;
}

export interface StopProcessOptions {
  readonly timeout: number;
  readonly forceTimeout?: number;
  readonly onForce?: () => void;
}

/**
 * Handles common process launch, stdout forwarding, exit observation, and termination
 * mechanics for extension child processes. Product-specific lifecycle state and
 * user messages remain with the caller.
 */
export class ProcessManager {
    private static readonly DEFAULT_FORCE_TIMEOUT_MS = 2_000;
    private static readonly WAIT_INTERVAL_MS = 250;

    private child: ChildProcessWithoutNullStreams | undefined;
    private exitPromise: Promise<void> | undefined;
    private resolveExit: (() => void) | undefined;
    private isStarted = false;
    private didExit = false;

    public constructor(private readonly options: ProcessManagerOptions) {}

    public launch(): void {
        if (this.isStarted) {
            throw new Error(`${this.options.name} process has already been launched.`);
        }

        const output = this.options.output;
        if (output !== undefined) {
            output.appendLine(`Launching ${this.options.name} with command: ${this.options.command} ${this.options.args?.join(' ')}`);
        }

        // Launch the process with stdio streams piped for output forwarding and termination.
        this.child = spawn(this.options.command, [...(this.options.args ?? [])], {
            cwd: this.options.cwd,
            env: this.options.env,
            windowsHide: this.options.windowsHide,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.isStarted = true;
        this.exitPromise = new Promise((resolve) => {
            this.resolveExit = resolve;
        });

        // Attach listeners to forward stdout and stderr to the output channel, if provided.
        if (output !== undefined) {
            this.child.stdout.on('data', (chunk: Buffer) => output.append(chunk.toString('utf8')));
            this.child.stderr.on('data', (chunk: Buffer) => output.append(chunk.toString('utf8')));
        } else {
            this.child.stdout.resume();
            this.child.stderr.resume();
        }
        // Attach listeners to handle process lifecycle events and invoke callbacks.
        this.child.once('spawn', () => this.options.onSpawn?.(this));
        this.child.once('error', (error) => {
            this.handleExited();
            this.options.output?.appendLine(`${this.options.name} process error: ${error.message}`);
            this.options.onError?.(error, this);
        });
        this.child.once('exit', (code, signal) => {
            this.handleExited();
            this.options.output?.appendLine(`${this.options.name} exited with code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}.`);
            this.options.onExit?.(code, signal, this);
        });
    }

    public get pid(): number | undefined {
        return this.child?.pid;
    }

    public get hasExited(): boolean {
        return this.didExit || (this.child !== undefined &&
            (this.child.exitCode !== null || this.child.signalCode !== null));
    }

    public get isRunning(): boolean {
        return this.isStarted && !this.hasExited;
    }

    public signal(signal: NodeJS.Signals): boolean {
        return this.child === undefined || this.hasExited ? false : this.child.kill(signal);
    }

    public waitForExit(): Promise<void> {
        if (this.exitPromise === undefined) {
            throw new Error(`${this.options.name} process has not been launched.`);
        }
        return this.exitPromise;
    }

    public async stop(options: StopProcessOptions): Promise<void> {
        if (this.child === undefined) {
            return;
        }
        this.signal('SIGTERM');
        if (await this.waitUntilStopped(options.timeout)) {
            return;
        }

        options.onForce?.();
        this.signal('SIGKILL');
        await this.waitUntilStopped(options.forceTimeout ?? ProcessManager.DEFAULT_FORCE_TIMEOUT_MS);
    }

    private handleExited(): void {
        if (this.didExit) {
            return;
        }
        this.didExit = true;
        this.resolveExit?.();
    }

    private async waitUntilStopped(timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (this.hasExited) {
                return true;
            }
            await Promise.race([
                this.waitForExit(),
                waitForMs(Math.min(ProcessManager.WAIT_INTERVAL_MS, deadline - Date.now()))
            ]);
        }
        return this.hasExited;
    }
}
