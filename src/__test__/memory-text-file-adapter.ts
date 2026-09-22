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

import { TextFileAdapter, TextFileStamp } from '../desktop/yaml-file';

export class MemoryTextFileAdapter implements TextFileAdapter {
    public writeCount = 0;
    private version = 0;

    public constructor(public text: string) {}

    public async readTextFile(_fileName: string): Promise<string> {
        return this.text;
    }

    public async writeTextFile(_fileName: string, contents: string): Promise<void> {
        this.text = contents;
        this.writeCount++;
        this.version++;
    }

    public async stat(_fileName: string): Promise<TextFileStamp> {
        return {
            mtimeMs: this.version,
            size: this.text.length
        };
    }

    public update(text: string): void {
        this.text = text;
        this.version++;
    }

    public simulateExternalChange(text: string): void {
        this.update(text);
    }
}
