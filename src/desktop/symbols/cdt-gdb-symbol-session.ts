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

import { ChildProcess, execFile } from 'node:child_process';
import { GDBBackend } from 'cdt-gdb-adapter/dist/gdb/GDBBackend';
import { parseGdbVersionOutput } from 'cdt-gdb-adapter/dist/util/parseGdbVersionOutput';
import { GDBError } from 'cdt-gdb-adapter/dist/gdb/errors';
import type { IGDBProcessManager, IStdioProcess } from 'cdt-gdb-adapter/dist/types/gdb';
import { SymbolSession } from '../../symbols/symbol-backend';
import { SymbolAddress, SymbolImage } from '../../symbols/symbol-service';
import { withSymbolTimeout } from '../../symbols/symbol-operations';
import { isStaticSymbolExpression } from '../../symbols/static-symbol-expression';
import { ProcessManager } from '../process/process-manager';

/** Disables initialization files, auto-loaded code, target execution and network symbol downloads. */
const OFFLINE_GDB_ARGUMENTS: readonly string[] = [
    '--nx', '--quiet', '--interpreter=mi2',
    '-iex', 'set auto-load off',
    '-iex', 'set debuginfod enabled off',
    '-iex', 'set may-call-functions off',
    '-iex', 'set auto-connect-native-target off',
    '-iex', 'set history save off',
    '-iex', 'set pagination off',
    '-iex', 'set confirm off',
    '-iex', 'set print symbol off'
];

/** Adapts the shared process owner to CDT without importing the full debug adapter. */
class OfflineGdbProcessManager implements IGDBProcessManager {
    private process: ProcessManager | undefined;
    private disposed = false;
    private versionProcess: ChildProcess | undefined;
    private versionFinished: Promise<void> = Promise.resolve();

    /** Retains the executable path without launching it. */
    public constructor(private readonly gdbPath: string) {}

    /** Reads the GDB version with a bounded, shell-free invocation. */
    public getVersion(): Promise<string> {
        if (this.disposed) {
            return Promise.reject(new Error('Offline GDB has been disposed.'));
        }
        let finishVersion!: () => void;
        this.versionFinished = new Promise(resolve => {
            finishVersion = resolve;
        });
        return new Promise((resolve, reject) => {
            this.versionProcess = execFile(this.gdbPath, ['--nx', '--version'], { timeout: 5000, windowsHide: true }, (error, stdout) => {
                this.versionProcess = undefined;
                finishVersion();
                const version = parseGdbVersionOutput(stdout);
                if (error) {
                    reject(error);
                } else if (!version) {
                    reject(new Error('Cannot determine offline GDB version.'));
                } else {
                    resolve(version);
                }
            });
        });
    }

    /** Starts only an MI interpreter; no executable, inferior or remote target is configured. */
    public async start(): Promise<IStdioProcess> {
        if (this.disposed) {
            throw new Error('Offline GDB has been disposed.');
        }
        const manager = new ProcessManager({
            command: this.gdbPath,
            name: 'Offline symbol GDB',
            windowsHide: true,
            preserveStdio: true
        });
        this.process = manager;
        manager.launch({ args: OFFLINE_GDB_ARGUMENTS, env: { ...process.env, LC_ALL: 'C' } });
        const child = manager.stdioProcess;
        return Object.assign(child, { getPID: () => child.pid });
    }

    /** Stops the process even when startup or a command never replies. */
    public async stop(): Promise<void> {
        this.disposed = true;
        this.versionProcess?.kill('SIGKILL');
        await Promise.all([
            withSymbolTimeout(this.versionFinished, 1000),
            this.process?.stop({ timeout: 1000, forceTimeout: 1000 })
        ]);
    }
}

/** Uses CDT's MI parser and command queue behind a target-independent symbol session. */
export class CdtGdbSymbolSession implements SymbolSession {
    private readonly manager: OfflineGdbProcessManager;
    private readonly backend: GDBBackend;
    private disposed = false;

    /** Creates a private CDT backend while leaving process startup lazy. */
    public constructor(gdbPath: string) {
        this.manager = new OfflineGdbProcessManager(gdbPath);
        this.backend = new GDBBackend(this.manager, 'Offline symbols');
    }

    /** Initializes MI without configuring a debug session or an executable target. */
    public async start(): Promise<void> {
        this.assertOpen();
        await this.backend.spawn({ gdbAsync: false, gdbNonStop: false });
    }

    /** Loads symbols only; -o relocates every section rather than setting a text address. */
    public async loadImages(images: readonly SymbolImage[]): Promise<void> {
        this.assertOpen();
        await this.consoleCommand('symbol-file');
        for (const [index, image] of images.entries()) {
            this.assertOpen();
            if (/[\r\n\0]/.test(image.path)) {
                throw new Error('Invalid symbol image path.');
            }
            const file = this.backend.standardEscape(image.path, true);
            const offset = image.offset ?? 0n;
            const relocation = offset < 0n ? `-0x${(-offset).toString(16)}` : `0x${offset.toString(16)}`;
            await this.consoleCommand(`${index === 0 ? 'symbol-file' : 'add-symbol-file'} -o ${relocation} ${file}`);
        }
    }

    /** Converts only a complete hexadecimal address; GDB symbol errors are ordinary misses. */
    public async resolveSymbol(expression: string): Promise<SymbolAddress | undefined> {
        this.assertOpen();
        if (!isStaticSymbolExpression(expression)) {
            return undefined;
        }
        try {
            const result = await this.backend.sendCommand<{ value?: unknown }>(
                `-data-evaluate-expression ${this.backend.standardEscape(`(void *)&(${expression})`, true)}`
            );
            if (typeof result.value !== 'string' || !/^0x[0-9a-f]+$/i.test(result.value)) {
                return undefined;
            }
            return `0x${BigInt(result.value).toString(16)}`;
        } catch (error) {
            if (error instanceof GDBError) {
                return undefined;
            }
            throw error;
        }
    }

    /** Terminates the owned process without waiting for an MI reply. */
    public async dispose(): Promise<void> {
        this.disposed = true;
        await this.manager.stop();
    }

    /** Escapes the complete CLI command as one MI string. */
    private async consoleCommand(command: string): Promise<void> {
        this.assertOpen();
        await this.backend.sendCommand(`-interpreter-exec console ${this.backend.standardEscape(command, true)}`);
    }

    /** Prevents delayed startup work from reviving a disposed session. */
    private assertOpen(): void {
        if (this.disposed) {
            throw new Error('Offline GDB symbol session has been disposed.');
        }
    }
}
