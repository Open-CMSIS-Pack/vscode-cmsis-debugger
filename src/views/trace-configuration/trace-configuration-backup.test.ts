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

import {
    DebouncedTraceConfigurationBackup,
    getTraceConfigurationBackupFileName,
    TraceConfigurationBackupStore,
    WorkspaceTraceConfigurationBackupStore
} from './trace-configuration-backup';

function createStore(): jest.Mocked<TraceConfigurationBackupStore> {
    return {
        restore: jest.fn().mockResolvedValue(undefined),
        write: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
    };
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function expectFileMissing(fileName: string): Promise<void> {
    // Test paths are created under this suite's temporary directory.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(fsPromises.stat(fileName)).rejects.toMatchObject({ code: 'ENOENT' });
}

async function writeTemporaryFile(fileName: string, contents: string): Promise<void> {
    // Test paths are created under this suite's temporary directory.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fsPromises.writeFile(fileName, contents);
}

describe('DebouncedTraceConfigurationBackup', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('waits 500 ms and coalesces rapid changes into the latest snapshot', async () => {
        const store = createStore();
        const backup = new DebouncedTraceConfigurationBackup(store, jest.fn());

        backup.schedule('/workspace/target.ctrace.yml', 'first');
        jest.advanceTimersByTime(250);
        backup.schedule('/workspace/target.ctrace.yml', 'second');
        jest.advanceTimersByTime(499);
        await flushPromises();
        expect(store.write).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await backup.flush();

        expect(store.write).toHaveBeenCalledTimes(1);
        expect(store.write).toHaveBeenCalledWith('/workspace/target.ctrace.yml', 'second');
    });

    it('serializes writes and skips an obsolete queued snapshot', async () => {
        const store = createStore();
        let completeFirstWrite: (() => void) | undefined;
        store.write.mockImplementationOnce(() => new Promise<void>(resolve => {
            completeFirstWrite = resolve;
        }));
        const backup = new DebouncedTraceConfigurationBackup(store, jest.fn());

        backup.schedule('/workspace/target.ctrace.yml', 'first');
        jest.advanceTimersByTime(500);
        await flushPromises();
        expect(store.write).toHaveBeenCalledWith('/workspace/target.ctrace.yml', 'first');

        backup.schedule('/workspace/target.ctrace.yml', 'obsolete');
        jest.advanceTimersByTime(500);
        backup.schedule('/workspace/target.ctrace.yml', 'latest');
        completeFirstWrite?.();
        await flushPromises();
        expect(store.write).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(500);
        await backup.flush();
        expect(store.write).toHaveBeenCalledTimes(2);
        expect(store.write).toHaveBeenLastCalledWith('/workspace/target.ctrace.yml', 'latest');
    });

    it('cancels pending and queued snapshots while awaiting an active write', async () => {
        const store = createStore();
        let completeFirstWrite: (() => void) | undefined;
        store.write.mockImplementationOnce(() => new Promise<void>(resolve => {
            completeFirstWrite = resolve;
        }));
        const backup = new DebouncedTraceConfigurationBackup(store, jest.fn());

        backup.schedule('/workspace/target.ctrace.yml', 'started');
        jest.advanceTimersByTime(500);
        await flushPromises();
        backup.schedule('/workspace/target.ctrace.yml', 'pending');

        const cancelled = backup.cancelAndWait();
        completeFirstWrite?.();
        await cancelled;
        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(store.write).toHaveBeenCalledTimes(1);
    });

    it('reports background write failures without rejecting flush', async () => {
        const store = createStore();
        const error = new Error('backup failed');
        store.write.mockRejectedValueOnce(error);
        const onError = jest.fn();
        const backup = new DebouncedTraceConfigurationBackup(store, onError);

        backup.schedule('/workspace/target.ctrace.yml', 'contents');

        await expect(backup.flush()).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith(error);
    });

    it('flushes the latest snapshot when disposed', async () => {
        const store = createStore();
        const backup = new DebouncedTraceConfigurationBackup(store, jest.fn());
        backup.schedule('/workspace/target.ctrace.yml', 'latest');

        await backup.dispose();

        expect(store.write).toHaveBeenCalledWith('/workspace/target.ctrace.yml', 'latest');
        backup.schedule('/workspace/target.ctrace.yml', 'after dispose');
        jest.advanceTimersByTime(500);
        await flushPromises();
        expect(store.write).toHaveBeenCalledTimes(1);
    });
});

describe('WorkspaceTraceConfigurationBackupStore', () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(temporaryDirectories.splice(0).map(directory =>
            fsPromises.rm(directory, { recursive: true, force: true })));
    });

    async function createTemporaryFileName(): Promise<string> {
        const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'trace-configuration-backup-'));
        temporaryDirectories.push(directory);
        return path.join(directory, 'target.ctrace.yml');
    }

    it('derives the backup name beside the active file', () => {
        expect(getTraceConfigurationBackupFileName(path.join('/workspace', '.cmsis', 'target.ctrace.yml')))
            .toBe(path.join('/workspace', '.cmsis', '~target.ctrace.yml'));
    });

    it('writes, restores, and deletes a recovery document', async () => {
        const fileName = await createTemporaryFileName();
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        const store = new WorkspaceTraceConfigurationBackupStore();

        await store.write(fileName, 'ctrace:\n  created-by: backup\n');
        const restored = await store.restore(fileName);
        expect(restored?.toString()).toContain('created-by: backup');

        await store.delete(fileName);
        await expectFileMissing(backupFileName);
        await expect(store.delete(fileName)).resolves.toBeUndefined();
    });

    it('discards a syntactically invalid recovery document', async () => {
        const fileName = await createTemporaryFileName();
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        await writeTemporaryFile(backupFileName, 'ctrace:\n  setup: [unterminated\n');
        const store = new WorkspaceTraceConfigurationBackupStore();

        await expect(store.restore(fileName)).resolves.toBeUndefined();
        await expectFileMissing(backupFileName);
    });
});
