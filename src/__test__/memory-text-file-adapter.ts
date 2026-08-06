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

import { Disposable, TextFileAdapter, TextFileStamp } from '../generic/yaml-file';

export class MemoryTextFileAdapter implements TextFileAdapter {
    public writeCount = 0;
    private version = 0;
    private readonly listeners: (() => void)[] = [];

    public constructor(public text: string) {}

    public async readTextFile(_fileName: string): Promise<string> {
        return this.text;
    }

    public async writeTextFile(_fileName: string, contents: string): Promise<void> {
        this.text = contents;
        this.writeCount++;
        this.version++;
        this.listeners.forEach(listener => listener());
    }

    public async stat(_fileName: string): Promise<TextFileStamp> {
        return {
            mtimeMs: this.version,
            size: this.text.length
        };
    }

    public watch(_fileName: string, onDidChange: () => void): Disposable {
        this.listeners.push(onDidChange);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(onDidChange);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    }

    public listenerCount(): number {
        return this.listeners.length;
    }

    public update(text: string): void {
        this.text = text;
        this.version++;
        this.listeners.forEach(listener => listener());
    }

    public simulateExternalChange(text: string): void {
        this.update(text);
    }
}
