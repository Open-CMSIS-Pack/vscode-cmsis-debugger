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

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { YamlDomDocument } from './yaml-dom';

export interface Disposable {
    dispose(): void;
}

export interface TextFileStamp {
    mtimeMs: number;
    size: number;
}

export interface TextFileAdapter {
    readTextFile(fileName: string): Promise<string>;
    writeTextFile(fileName: string, contents: string): Promise<void>;
    stat(fileName: string): Promise<TextFileStamp | undefined>;
    watch(fileName: string, onDidChange: () => void): Disposable;
}

export class NodeTextFileAdapter implements TextFileAdapter {
    public async readTextFile(fileName: string): Promise<string> {
        // File names come from workspace/user-selected trace configuration paths.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        return fsPromises.readFile(fileName, 'utf8');
    }

    public async writeTextFile(fileName: string, contents: string): Promise<void> {
        // File names come from workspace/user-selected trace configuration paths.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await fsPromises.writeFile(fileName, contents, 'utf8');
    }

    public async stat(fileName: string): Promise<TextFileStamp | undefined> {
        try {
            // File names come from workspace/user-selected trace configuration paths.
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const stats = await fsPromises.stat(fileName);
            return {
                mtimeMs: stats.mtimeMs,
                size: stats.size
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    public watch(fileName: string, onDidChange: () => void): Disposable {
        // File names come from workspace/user-selected trace configuration paths.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const watcher = fs.watch(fileName, { persistent: false }, onDidChange);
        return {
            dispose: () => watcher.close()
        };
    }
}

export class YamlDomFile {
    private currentDocument: YamlDomDocument | undefined;
    private externalStamp: TextFileStamp | undefined;

    constructor(
        public fileName: string = '',
        private readonly fileAdapter: TextFileAdapter = new NodeTextFileAdapter()
    ) {}

    public get document(): YamlDomDocument | undefined {
        return this.currentDocument;
    }

    public set document(document: YamlDomDocument | undefined) {
        this.currentDocument = document;
    }

    public async load(fileName = this.fileName): Promise<YamlDomDocument> {
        this.fileName = fileName;
        const text = await this.fileAdapter.readTextFile(this.fileName);
        this.currentDocument = YamlDomDocument.parse(text, this.fileName);
        await this.refreshExternalStamp();
        return this.currentDocument;
    }

    public async save(fileName = this.fileName): Promise<void> {
        if (!this.currentDocument) {
            throw new Error('Cannot save YAML before a document is loaded or assigned.');
        }
        this.fileName = fileName;
        await this.fileAdapter.writeTextFile(this.fileName, this.currentDocument.toString());
        await this.refreshExternalStamp();
    }

    public async refreshExternalStamp(): Promise<void> {
        this.externalStamp = await this.fileAdapter.stat(this.fileName);
    }

    public async hasExternalFileChanged(): Promise<boolean> {
        const stamp = await this.fileAdapter.stat(this.fileName);
        if (!stamp && !this.externalStamp) {
            return false;
        }
        if (!stamp || !this.externalStamp) {
            return true;
        }
        return stamp.mtimeMs !== this.externalStamp.mtimeMs || stamp.size !== this.externalStamp.size;
    }

    public async reloadIfChanged(): Promise<boolean> {
        if (!await this.hasExternalFileChanged()) {
            return false;
        }
        await this.load();
        return true;
    }

    public watch(
        onDidReload: (document: YamlDomDocument) => void,
        onError: (error: unknown) => void = () => {}
    ): Disposable {
        return this.fileAdapter.watch(this.fileName, () => {
            void this.reloadIfChanged()
                .then(changed => {
                    if (changed && this.currentDocument) {
                        onDidReload(this.currentDocument);
                    }
                })
                .catch(onError);
        });
    }
}
