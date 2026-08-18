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

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

interface MockFileSystemWatcher {
    dispose: jest.Mock;
    onDidCreate: jest.Mock;
    onDidChange: jest.Mock;
    onDidDelete: jest.Mock;
    _handlers: {
        create: Array<(uri: vscode.Uri) => void>;
        change: Array<(uri: vscode.Uri) => void>;
        delete: Array<(uri: vscode.Uri) => void>;
    };
}

const temporaryWorkspaceRoots: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
    const workspaceRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-text-file-adapter-'));
    temporaryWorkspaceRoots.push(workspaceRoot);
    return workspaceRoot;
}

function getLastCreatedFileSystemWatcher(): MockFileSystemWatcher {
    const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.at(-1)?.value as MockFileSystemWatcher | undefined;
    expect(watcher).toBeDefined();
    return watcher as MockFileSystemWatcher;
}

function getLastWorkspaceFsUri(method: 'readFile' | 'writeFile' | 'stat'): vscode.Uri | undefined {
    const calls = getWorkspaceFsMock(method).mock.calls;
    return calls.at(-1)?.[0] as vscode.Uri | undefined;
}

function getWorkspaceFsMock(method: 'readFile' | 'writeFile' | 'stat'): jest.Mock {
    switch (method) {
        case 'readFile':
            return vscode.workspace.fs.readFile as jest.Mock;
        case 'writeFile':
            return vscode.workspace.fs.writeFile as jest.Mock;
        case 'stat':
            return vscode.workspace.fs.stat as jest.Mock;
    }
}

function createCodedError(message: string, code: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
}

describe('WorkspaceTextFileAdapter', () => {
    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(temporaryWorkspaceRoots.splice(0).map(workspaceRoot => {
            // Test paths are created under this suite's temporary workspace root.
            return fsPromises.rm(workspaceRoot, { recursive: true, force: true });
        }));
    });

    it('reads and writes text through VS Code workspace fs', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const fileName = path.join(workspaceRoot, 'target.ctrace.yaml');
        const text = [
            'ctrace:',
            '  setup:',
            '    - pname: core0',
            ''
        ].join('\n');
        const adapter = new WorkspaceTextFileAdapter();

        await adapter.writeTextFile(fileName, text);
        await expect(adapter.readTextFile(fileName)).resolves.toBe(text);

        expect(getLastWorkspaceFsUri('writeFile')?.fsPath).toBe(fileName);
        expect(getLastWorkspaceFsUri('readFile')?.fsPath).toBe(fileName);
    });

    it('returns file stamps from VS Code workspace fs stat', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const fileName = path.join(workspaceRoot, 'target.ctrace.yaml');
        const text = 'ctrace:\n';
        const adapter = new WorkspaceTextFileAdapter();

        await adapter.writeTextFile(fileName, text);
        const stamp = await adapter.stat(fileName);

        expect(stamp).toMatchObject({
            size: Buffer.byteLength(text)
        });
        expect(stamp?.mtimeMs).toEqual(expect.any(Number));
        expect(getLastWorkspaceFsUri('stat')?.fsPath).toBe(fileName);
    });

    it('returns undefined when stat reports a missing file', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const fileName = path.join(workspaceRoot, 'missing.ctrace.yaml');
        const adapter = new WorkspaceTextFileAdapter();

        await expect(adapter.stat(fileName)).resolves.toBeUndefined();
    });

    it('rethrows stat failures that are not missing-file errors', async () => {
        const adapter = new WorkspaceTextFileAdapter();
        (vscode.workspace.fs.stat as jest.Mock).mockRejectedValueOnce(createCodedError('permission denied', 'EACCES'));

        await expect(adapter.stat('/workspace/target.ctrace.yaml')).rejects.toThrow('permission denied');
    });

    it('watches create, change, and delete events through a VS Code file system watcher', () => {
        const fileName = path.join('/workspace', '.cmsis', 'target.ctrace.yaml');
        const onDidChange = jest.fn();
        const adapter = new WorkspaceTextFileAdapter();

        const disposable = adapter.watch(fileName, onDidChange);
        const watcher = getLastCreatedFileSystemWatcher();
        const pattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.at(-1)?.[0] as { base: string; pattern: string };

        expect(pattern.base).toBe(path.dirname(fileName));
        expect(pattern.pattern).toBe(path.basename(fileName));

        watcher._handlers.create[0]?.(vscode.Uri.file(fileName));
        watcher._handlers.change[0]?.(vscode.Uri.file(fileName));
        watcher._handlers.delete[0]?.(vscode.Uri.file(fileName));

        expect(onDidChange).toHaveBeenCalledTimes(3);

        const createSubscription = watcher.onDidCreate.mock.results[0]?.value as { dispose: jest.Mock };
        const changeSubscription = watcher.onDidChange.mock.results[0]?.value as { dispose: jest.Mock };
        const deleteSubscription = watcher.onDidDelete.mock.results[0]?.value as { dispose: jest.Mock };

        disposable.dispose();

        expect(createSubscription.dispose).toHaveBeenCalledTimes(1);
        expect(changeSubscription.dispose).toHaveBeenCalledTimes(1);
        expect(deleteSubscription.dispose).toHaveBeenCalledTimes(1);
        expect(watcher.dispose).toHaveBeenCalledTimes(1);
    });
});
