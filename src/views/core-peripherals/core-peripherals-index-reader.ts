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


import * as path from 'path';
import * as yaml from 'yaml';
import { FileReader, VscodeFileReader } from '../../desktop/file-reader';
import { CorePeripheralEntryType, CorePeripheralsType } from './core-peripherals-index-types';

export class CorePeripheralsIndexReader {
    private isParsed = false;
    private contents: CorePeripheralsType | undefined;
    private filePath: string | undefined;
    private directory: string | undefined;

    constructor(private reader: FileReader = new VscodeFileReader()) {}

    public hasContents(): boolean {
        return !!this.contents;
    }

    public getContents(): CorePeripheralsType | undefined {
        return this.contents;
    }

    public async parse(filePath: string): Promise<void> {
        if (this.isParsed) {
            return;
        }
        this.filePath = filePath;
        this.directory = path.dirname(this.filePath);
        const fileContents = await this.reader.readFileToString(this.filePath);
        this.contents = yaml.parse(fileContents) as CorePeripheralsType;
        if (!this.contents) {
            throw new Error(`Invalid 'core-peripherals-index' file: ${this.filePath}`);
        }
        this.isParsed = true;
    }

    public getCorePeripherals(): CorePeripheralEntryType[] {
        const corePeripherals = this.contents?.['core-peripherals'];
        if (!corePeripherals) {
            return [];
        }
        const resolvedPeripherals = corePeripherals.map(
            entry => ({
                ...entry,
                file: this.directory ? path.resolve(this.directory, entry.file) : entry.file
            })
        );
        return resolvedPeripherals ?? [];
    }
}
