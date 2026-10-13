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

import { ChildProcess } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { PassThrough } from 'stream';

export class MockChildProcess extends ChildProcess implements ChildProcessWithoutNullStreams {
    public override stdin = new PassThrough();
    public override stdout = new PassThrough();
    public override stderr = new PassThrough();
    public override readonly stdio: [PassThrough, PassThrough, PassThrough, null, null] = [
        this.stdin,
        this.stdout,
        this.stderr,
        null,
        null
    ];
    public override pid = 1234;
    public override exitCode: number | null = null;
    public override signalCode: NodeJS.Signals | null = null;
    public exitOnSignal: NodeJS.Signals | undefined = 'SIGTERM';
    public readonly signals: (NodeJS.Signals | number | undefined)[] = [];

    public override kill(signal?: NodeJS.Signals | number): boolean {
        this.signals.push(signal);
        if (signal === this.exitOnSignal) {
            this.emitExit(null, signal);
        }
        return true;
    }

    public emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
        this.exitCode = code;
        this.signalCode = signal;
        this.emit('exit', code, signal);
    }
}

export function childProcessFactory(): MockChildProcess {
    return new MockChildProcess();
}
