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

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

export const TRACE_CONFIGURATION_BACKUP_DEBOUNCE_MS = 500;

export function getTraceConfigurationBackupFileName(fileName: string): string {
    return path.join(path.dirname(fileName), `~${path.basename(fileName)}`);
}

export function isTraceConfigurationBackupFileName(fileName: string): boolean {
    return path.basename(fileName).startsWith('~');
}

export interface TraceConfigurationBackupStore {
    restore(fileName: string): Promise<CTraceYamlDocument | undefined>;
    write(fileName: string, contents: string): Promise<void>;
    delete(fileName: string): Promise<void>;
}

/**
 * Stores recovery documents beside their active ctrace files. The store keeps
 * backup parsing separate from the active CTraceYamlFile so restoring a backup
 * cannot replace the active file name or its external-change stamp.
 */
export class WorkspaceTraceConfigurationBackupStore implements TraceConfigurationBackupStore {
    public constructor(private readonly fileAdapter = new WorkspaceTextFileAdapter()) {}

    public async restore(fileName: string): Promise<CTraceYamlDocument | undefined> {
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        if (!await this.fileAdapter.stat(backupFileName)) {
            return undefined;
        }

        try {
            const document = await new CTraceYamlFile(backupFileName, this.fileAdapter).load();
            if (!document.hasErrors) {
                return document;
            }
        } catch {
            // Invalid and unreadable backups follow the same discard path.
        }
        await this.delete(fileName);
        return undefined;
    }

    public async write(fileName: string, contents: string): Promise<void> {
        await this.fileAdapter.writeTextFile(getTraceConfigurationBackupFileName(fileName), contents);
    }

    public async delete(fileName: string): Promise<void> {
        await this.fileAdapter.deleteTextFile(getTraceConfigurationBackupFileName(fileName));
    }
}

interface BackupSnapshot {
    fileName: string;
    contents: string;
    revision: number;
}

/**
 * Coalesces recovery writes without delaying model edits. Workspace writes are
 * not cancellable once started, so revisions skip obsolete queued snapshots
 * while the promise chain guarantees that physical writes never overlap.
 */
export class DebouncedTraceConfigurationBackup {
    private pendingSnapshot: BackupSnapshot | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private writeQueue = Promise.resolve();
    private revision = 0;
    private disposePromise: Promise<void> | undefined;

    public constructor(
        private readonly store: TraceConfigurationBackupStore,
        private readonly onError: (error: unknown) => void,
        private readonly debounceMs = TRACE_CONFIGURATION_BACKUP_DEBOUNCE_MS
    ) {}

    public schedule(fileName: string, contents: string): void {
        if (this.disposePromise) {
            return;
        }

        this.revision += 1;
        this.pendingSnapshot = { fileName, contents, revision: this.revision };
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.enqueuePendingSnapshot();
        }, this.debounceMs);
    }

    public async flush(): Promise<void> {
        while (true) {
            this.clearTimer();
            this.enqueuePendingSnapshot();
            const currentQueue = this.writeQueue;
            await currentQueue;
            if (!this.pendingSnapshot && currentQueue === this.writeQueue) {
                return;
            }
        }
    }

    public async cancelAndWait(): Promise<void> {
        this.clearTimer();
        this.pendingSnapshot = undefined;
        this.revision += 1;
        await this.writeQueue;
    }

    public dispose(): Promise<void> {
        this.disposePromise ??= this.flush();
        return this.disposePromise;
    }

    private enqueuePendingSnapshot(): void {
        const snapshot = this.pendingSnapshot;
        if (!snapshot) {
            return;
        }
        this.pendingSnapshot = undefined;
        this.writeQueue = this.writeQueue.then(async () => {
            if (snapshot.revision !== this.revision) {
                return;
            }
            try {
                await this.store.write(snapshot.fileName, snapshot.contents);
            } catch (error) {
                this.onError(error);
            }
        });
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
