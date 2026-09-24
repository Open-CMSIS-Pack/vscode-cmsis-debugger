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
import { getTraceConfigurationBackupFileName } from './trace-configuration-file-names';
import {
    TraceConfigurationReferenceValidationMessage,
    TraceConfigurationValidationState
} from './trace-configuration-protocol';
import {
    TraceConfigurationPrevalidationResult,
    TraceConfigurationPrevalidator
} from './trace-configuration-prevalidator';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

export const TRACE_CONFIGURATION_BACKUP_DEBOUNCE_MS = 500;

export { getTraceConfigurationBackupFileName } from './trace-configuration-file-names';

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

export interface DebouncedTraceConfigurationBackupOptions {
    readonly prevalidator?: TraceConfigurationPrevalidator;
    readonly onValidationStateChanged?: (
        state: TraceConfigurationValidationState,
        details?: TraceConfigurationValidationDetails
    ) => void;
    readonly debounceMs?: number;
}

export interface TraceConfigurationValidationDetails {
    readonly message?: string;
    readonly referenceMessages?: readonly TraceConfigurationReferenceValidationMessage[];
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
    private disposing = false;
    private readonly prevalidator: TraceConfigurationPrevalidator | undefined;
    private readonly onValidationStateChanged: (
        state: TraceConfigurationValidationState,
        details?: TraceConfigurationValidationDetails
    ) => void;
    private readonly debounceMs: number;

    public constructor(
        private readonly store: TraceConfigurationBackupStore,
        private readonly onError: (error: unknown) => void,
        options: DebouncedTraceConfigurationBackupOptions = {}
    ) {
        this.prevalidator = options.prevalidator;
        this.onValidationStateChanged = options.onValidationStateChanged ?? (() => {});
        this.debounceMs = options.debounceMs ?? TRACE_CONFIGURATION_BACKUP_DEBOUNCE_MS;
    }

    public schedule(fileName: string, contents: string): void {
        if (this.disposePromise) {
            return;
        }

        this.revision += 1;
        this.pendingSnapshot = { fileName, contents, revision: this.revision };
        this.onValidationStateChanged('pending');
        this.cancelValidation();
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
        this.onValidationStateChanged('idle');
        await Promise.all([this.writeQueue, this.prevalidator?.cancel()]);
    }

    /** Cancels active validation before flushing a backup needed by a file transition. */
    public async cancelValidationAndFlush(): Promise<void> {
        await this.prevalidator?.cancel();
        await this.flush();
    }

    /** Runs validation for a restored backup without rewriting the file. */
    public validateExisting(fileName: string): void {
        if (this.disposePromise || !this.prevalidator) {
            return;
        }
        this.revision += 1;
        const revision = this.revision;
        this.onValidationStateChanged('pending');
        this.cancelValidation();
        this.writeQueue = this.writeQueue.then(async () => {
            if (revision === this.revision) {
                await this.validate(fileName, revision);
            }
        });
    }

    public dispose(): Promise<void> {
        if (!this.disposePromise) {
            this.disposing = true;
            this.clearTimer();
            this.enqueuePendingSnapshot();
            this.disposePromise = this.finishDisposal();
        }
        return this.disposePromise;
    }

    private async finishDisposal(): Promise<void> {
        try {
            await Promise.all([this.writeQueue, this.prevalidator?.cancel()]);
        } finally {
            this.onValidationStateChanged('idle');
        }
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
                if (snapshot.revision === this.revision) {
                    this.onValidationStateChanged('failed', { message: this.errorToString(error) });
                }
                this.onError(error);
                return;
            }
            if (snapshot.revision === this.revision && !this.disposing) {
                await this.validate(snapshot.fileName, snapshot.revision);
            }
        });
    }

    private async validate(fileName: string, revision: number): Promise<void> {
        const prevalidator = this.prevalidator;
        if (!prevalidator) {
            return;
        }
        this.onValidationStateChanged('running');
        const result = await prevalidator.validate(fileName);
        if (revision !== this.revision || result.status === 'cancelled') {
            return;
        }
        this.acceptValidationResult(result);
    }

    private acceptValidationResult(result: Exclude<TraceConfigurationPrevalidationResult, { status: 'cancelled' }>): void {
        switch (result.status) {
            case 'passed':
                if (result.referenceMessages?.length) {
                    this.onValidationStateChanged('passed', { referenceMessages: result.referenceMessages });
                } else {
                    this.onValidationStateChanged('passed');
                }
                break;
            case 'failed':
            case 'unavailable':
                this.onValidationStateChanged(result.status, { message: result.message });
                break;
        }
    }

    private cancelValidation(): void {
        void this.prevalidator?.cancel().catch(error => this.onError(error));
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    private errorToString(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
