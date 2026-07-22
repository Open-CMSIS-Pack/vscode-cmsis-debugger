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

import * as vscode from 'vscode';

export type FileWatchEventCallback = (uri: vscode.Uri) => void | Promise<void>;

export interface FileWatchRegistrationOptions {
    readonly globPattern: vscode.GlobPattern;
    readonly onDidCreate?: FileWatchEventCallback;
    readonly onDidChange?: FileWatchEventCallback;
    readonly onDidDelete?: FileWatchEventCallback;
}

interface FileWatchRegistration {
    readonly disposables: readonly vscode.Disposable[];
}

export class FileWatchManager implements vscode.Disposable {
    private context: vscode.ExtensionContext | undefined;
    private readonly registrations = new Map<vscode.FileSystemWatcher, FileWatchRegistration>();

    public activate(context: vscode.ExtensionContext): void {
        if (this.context === context) {
            return;
        }
        if (this.context !== undefined) {
            throw new Error('File watch manager has already been activated.');
        }
        this.context = context;
        context.subscriptions.push(this);
    }

    public addWatch(options: FileWatchRegistrationOptions): vscode.FileSystemWatcher {
        const watcher = vscode.workspace.createFileSystemWatcher(
            options.globPattern,
            options.onDidCreate === undefined,
            options.onDidChange === undefined,
            options.onDidDelete === undefined
        );
        const disposables: vscode.Disposable[] = [watcher];
        if (options.onDidCreate !== undefined) {
            disposables.push(watcher.onDidCreate(options.onDidCreate));
        }
        if (options.onDidChange !== undefined) {
            disposables.push(watcher.onDidChange(options.onDidChange));
        }
        if (options.onDidDelete !== undefined) {
            disposables.push(watcher.onDidDelete(options.onDidDelete));
        }
        this.registrations.set(watcher, { disposables });
        return watcher;
    }

    public removeWatch(watcher: vscode.FileSystemWatcher): boolean {
        const registration = this.registrations.get(watcher);
        if (registration === undefined) {
            return false;
        }
        this.registrations.delete(watcher);
        registration.disposables.forEach(disposable => disposable.dispose());
        return true;
    }

    public dispose(): void {
        [...this.registrations.keys()].forEach(watcher => this.removeWatch(watcher));
        this.context = undefined;
    }
}
