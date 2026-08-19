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

import * as path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import * as vscode from 'vscode';

import { Disposable, TextFileAdapter, TextFileStamp } from '../../desktop/yaml-file';

/**
 * WorkspaceTextFileAdapter bridges the YAML file abstraction to VS Code's
 * workspace filesystem APIs.
 */
export class WorkspaceTextFileAdapter implements TextFileAdapter {
    private readonly decoder = new TextDecoder();
    private readonly encoder = new TextEncoder();

    public async readTextFile(fileName: string): Promise<string> {
        const contents = await vscode.workspace.fs.readFile(vscode.Uri.file(fileName));
        return this.decoder.decode(contents);
    }

    public async writeTextFile(fileName: string, contents: string): Promise<void> {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), this.encoder.encode(contents));
    }

    public async stat(fileName: string): Promise<TextFileStamp | undefined> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileName));
            return {
                mtimeMs: stat.mtime,
                size: stat.size
            };
        } catch (error) {
            if (this.isFileNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }

    public watch(fileName: string, onDidChange: () => void): Disposable {
        const pattern = new vscode.RelativePattern(path.dirname(fileName), path.basename(fileName));
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const subscriptions = [
            watcher.onDidCreate(onDidChange),
            watcher.onDidChange(onDidChange),
            watcher.onDidDelete(onDidChange)
        ];

        return {
            dispose: () => {
                subscriptions.forEach(subscription => subscription.dispose());
                watcher.dispose();
            }
        };
    }

    private isFileNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const errorWithCode = error as { code?: unknown };
        return errorWithCode.code === 'ENOENT' || errorWithCode.code === 'FileNotFound';
    }
}
