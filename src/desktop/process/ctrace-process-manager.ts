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

import {
    ProcessManager,
    ProcessManagerOptions,
    ProcessOutput
} from './process-manager';

// TODO: Update when the bundled ctrace location is known.
export const DEFAULT_CTRACE_PATH = 'ctrace';

export interface CTraceProcessManagerOptions {
    readonly cTracePath?: string;
    readonly output?: ProcessOutput;
}

export class CTraceProcessManager {
    private readonly processManager: ProcessManager;

    public constructor(options: CTraceProcessManagerOptions = {}) {
        const processOptions: ProcessManagerOptions = {
            command: options.cTracePath ?? DEFAULT_CTRACE_PATH,
            name: 'ctrace',
            ...(options.output === undefined ? {} : { output: options.output })
        };
        this.processManager = new ProcessManager(processOptions);
    }

    public launch(): void {
        this.processManager.launch();
    }

    public waitForExit(): Promise<void> {
        return this.processManager.waitForExit();
    }
}
