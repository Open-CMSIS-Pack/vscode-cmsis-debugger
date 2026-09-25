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

import { parse } from 'yaml';

import { TextFileAdapter } from '../../desktop/yaml-file';
import {
    TraceConfigurationReferenceValidationMessage,
    TraceConfigurationValidationSeverity
} from './trace-configuration-protocol';
import { WorkspaceTextFileAdapter } from './workspace-text-file-adapter';

export interface TraceConfigurationRunMessageReader {
    exists(fileName: string): Promise<boolean>;
    readIfExists(fileName: string): Promise<readonly TraceConfigurationReferenceValidationMessage[] | undefined>;
}

/** Reads and reduces validator messages embedded in pyTS ctrace-ref entries. */
export class CTraceRunValidationMessageReader implements TraceConfigurationRunMessageReader {
    public constructor(private readonly fileAdapter: TextFileAdapter = new WorkspaceTextFileAdapter()) {}

    public async exists(fileName: string): Promise<boolean> {
        return await this.fileAdapter.stat(fileName) !== undefined;
    }

    public async readIfExists(fileName: string): Promise<readonly TraceConfigurationReferenceValidationMessage[] | undefined> {
        if (!await this.exists(fileName)) {
            return undefined;
        }
        return parseCTraceRunValidationMessages(await this.fileAdapter.readTextFile(fileName));
    }
}

/**
 * Selects the highest-severity message for each ctrace-ref. Equal severities
 * keep the first entry in file order.
 */
export function parseCTraceRunValidationMessages(text: string): readonly TraceConfigurationReferenceValidationMessage[] {
    const parsed: unknown = parse(text);
    if (!isObject(parsed)) {
        throw new Error('Invalid ctrace-run file: expected a YAML mapping.');
    }
    const run = parsed['ctrace-run'];
    if (!isObject(run) || !Array.isArray(run['ctrace-refs'])) {
        throw new Error('Invalid ctrace-run file: expected ctrace-run.ctrace-refs to be a sequence.');
    }

    const selected = new Map<string, TraceConfigurationReferenceValidationMessage>();
    run['ctrace-refs'].forEach(candidate => {
        if (!isObject(candidate) || typeof candidate['ctrace-ref'] !== 'string') {
            return;
        }
        const ctraceRef = candidate['ctrace-ref'].trim();
        if (!ctraceRef) {
            return;
        }
        const candidateMessages: readonly {
            readonly severity: TraceConfigurationValidationSeverity;
            readonly rawMessage: unknown;
        }[] = [
            { severity: 'error', rawMessage: candidate.error },
            { severity: 'warning', rawMessage: candidate.warning },
            { severity: 'info', rawMessage: candidate.info }
        ];
        candidateMessages.forEach(({ severity, rawMessage }) => {
            if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
                return;
            }
            const existing = selected.get(ctraceRef);
            if (existing && severityPriority(existing.severity) >= severityPriority(severity)) {
                return;
            }
            selected.set(ctraceRef, { ctraceRef, severity, message: rawMessage.trim() });
        });
    });
    return [...selected.values()];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function severityPriority(severity: TraceConfigurationValidationSeverity): number {
    switch (severity) {
        case 'error':
            return 2;
        case 'warning':
            return 1;
        case 'info':
            return 0;
    }
}
