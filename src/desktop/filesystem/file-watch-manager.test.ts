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
import { extensionContextFactory } from '../../__test__/vscode.factory';
import { FileWatchManager } from './file-watch-manager';

type WatchEventName = 'create' | 'change' | 'delete';

const createWatcher = () => {
    const callbacks: Partial<Record<WatchEventName, (uri: vscode.Uri) => void | Promise<void>>> = {};
    const listenerDisposables = {
        create: { dispose: jest.fn() },
        change: { dispose: jest.fn() },
        delete: { dispose: jest.fn() }
    };
    const watcher = {
        dispose: jest.fn(),
        onDidCreate: jest.fn(callback => {
            callbacks.create = callback;
            return listenerDisposables.create;
        }),
        onDidChange: jest.fn(callback => {
            callbacks.change = callback;
            return listenerDisposables.change;
        }),
        onDidDelete: jest.fn(callback => {
            callbacks.delete = callback;
            return listenerDisposables.delete;
        })
    } as unknown as jest.Mocked<vscode.FileSystemWatcher>;
    return { callbacks, listenerDisposables, watcher };
};

describe('FileWatchManager', () => {
    const globPattern = '**/*.raw';
    const WATCH_ID = 'test-watch';
    let createFileSystemWatcher: jest.Mock;

    beforeEach(() => {
        createFileSystemWatcher = jest.fn();
        (vscode.workspace as unknown as { createFileSystemWatcher: jest.Mock }).createFileSystemWatcher = createFileSystemWatcher;
    });

    it('registers itself with the extension context on activation', () => {
        const context = extensionContextFactory();
        const manager = new FileWatchManager();

        manager.activate(context);

        expect(context.subscriptions).toContain(manager);
    });

    it('ignores repeated activation with the same context', () => {
        const context = extensionContextFactory();
        const manager = new FileWatchManager();

        manager.activate(context);
        manager.activate(context);

        expect(context.subscriptions).toEqual([manager]);
    });

    it('rejects activation with a different context', () => {
        const manager = new FileWatchManager();

        manager.activate(extensionContextFactory());

        expect(() => manager.activate(extensionContextFactory())).toThrow('File watch manager has already been activated.');
    });

    it('registers the supplied callbacks and forwards events', async () => {
        const { callbacks, watcher } = createWatcher();
        createFileSystemWatcher.mockReturnValue(watcher);
        const onDidCreate = jest.fn();
        const onDidChange = jest.fn();
        const onDidDelete = jest.fn();
        const manager = new FileWatchManager();
        const uri = vscode.Uri.file('trace.raw');

        manager.addWatch({ id: WATCH_ID, globPattern, onDidCreate, onDidChange, onDidDelete });
        await callbacks.create?.(uri);
        await callbacks.change?.(uri);
        await callbacks.delete?.(uri);

        expect(createFileSystemWatcher).toHaveBeenCalledWith(globPattern, false, false, false);
        expect(onDidCreate).toHaveBeenCalledWith(uri);
        expect(onDidChange).toHaveBeenCalledWith(uri);
        expect(onDidDelete).toHaveBeenCalledWith(uri);
    });

    it('ignores events without callbacks', () => {
        const { watcher } = createWatcher();
        createFileSystemWatcher.mockReturnValue(watcher);
        const manager = new FileWatchManager();

        manager.addWatch({ id: WATCH_ID, globPattern });

        expect(createFileSystemWatcher).toHaveBeenCalledWith(globPattern, true, true, true);
        expect(watcher.onDidCreate).not.toHaveBeenCalled();
        expect(watcher.onDidChange).not.toHaveBeenCalled();
        expect(watcher.onDidDelete).not.toHaveBeenCalled();
    });

    it('removes and disposes a registered watch', () => {
        const { listenerDisposables, watcher } = createWatcher();
        createFileSystemWatcher.mockReturnValue(watcher);
        const manager = new FileWatchManager();
        manager.addWatch({ id: WATCH_ID, globPattern, onDidChange: jest.fn() });

        expect(manager.removeWatch(WATCH_ID)).toBe(true);
        expect(manager.removeWatch(WATCH_ID)).toBe(false);
        expect(watcher.dispose).toHaveBeenCalledTimes(1);
        expect(listenerDisposables.change.dispose).toHaveBeenCalledTimes(1);
    });

    it('does not create a duplicate watch for an existing ID', () => {
        const { watcher } = createWatcher();
        createFileSystemWatcher.mockReturnValue(watcher);
        const manager = new FileWatchManager();

        manager.addWatch({ id: WATCH_ID, globPattern });
        manager.addWatch({ id: WATCH_ID, globPattern });

        expect(createFileSystemWatcher).toHaveBeenCalledTimes(1);
    });

    it('disposes every watch and can be activated again', () => {
        const firstWatch = createWatcher();
        const secondWatch = createWatcher();
        createFileSystemWatcher
            .mockReturnValueOnce(firstWatch.watcher)
            .mockReturnValueOnce(secondWatch.watcher);
        const manager = new FileWatchManager();

        manager.activate(extensionContextFactory());
        manager.addWatch({ id: 'first-watch', globPattern });
        manager.addWatch({ id: 'second-watch', globPattern });
        manager.dispose();

        expect(firstWatch.watcher.dispose).toHaveBeenCalledTimes(1);
        expect(secondWatch.watcher.dispose).toHaveBeenCalledTimes(1);
        expect(() => manager.activate(extensionContextFactory())).not.toThrow();
    });
});
