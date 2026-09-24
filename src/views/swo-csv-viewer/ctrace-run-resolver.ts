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

import * as path from 'path';
import * as vscode from 'vscode';
import { parse } from 'yaml';

import type { SwoCsvRow } from './swo-csv-table';

interface CTraceRunReference {
    readonly 'ctrace-ref'?: unknown;
    readonly type?: unknown;
    readonly stream?: unknown;
    readonly source?: unknown;
}


interface CTraceRunFile {
    readonly 'ctrace-run'?: {
        readonly 'ctrace-refs'?: unknown;
    };
}

export interface CTraceRunMatch {
    readonly solutionSet: string;
    readonly ctraceRef: string;
}

const NON_NAVIGABLE_TYPES = new Set(['error', 'overflow']);
const SOURCE_MATCHED_TYPES = new Set(['dwt', 'itm']);

export async function resolveCTraceRunReference(
    csvUri: vscode.Uri,
    columns: readonly string[],
    row: SwoCsvRow
): Promise<CTraceRunMatch | undefined> {
    if (csvUri.scheme !== 'file') {
        return undefined;
    }
    const solutionSet = getSolutionSet(csvUri.fsPath);
    const type = getCell(columns, row, 'type')?.toLowerCase();
    if (!solutionSet || !type || NON_NAVIGABLE_TYPES.has(type)) {
        return undefined;
    }

    const stream = parseOptionalNumber(getCell(columns, row, 'stream'));
    const source = parseOptionalNumber(getCell(columns, row, 'source'));
    const runFileUri = vscode.Uri.file(path.join(path.dirname(csvUri.fsPath), `${solutionSet}.ctrace-run.yml`));
    const content = await vscode.workspace.fs.readFile(runFileUri);
    const parsed = parse(new TextDecoder().decode(content)) as CTraceRunFile;
    const references = parsed['ctrace-run']?.['ctrace-refs'];
    if (!Array.isArray(references)) {
        return undefined;
    }

    for (const candidate of references as CTraceRunReference[]) {
        if (candidate.type !== type || typeof candidate['ctrace-ref'] !== 'string') {
            continue;
        }
        if (stream !== undefined && parseRunNumber(candidate.stream) !== stream) {
            continue;
        }
        if (SOURCE_MATCHED_TYPES.has(type) && (source === undefined || !matchesSource(candidate.source, source))) {
            continue;
        }
        return { solutionSet, ctraceRef: candidate['ctrace-ref'] };
    }
    return undefined;
}

function getSolutionSet(csvFilePath: string): string | undefined {
    const match = /^(?<solutionSet>.+)\.[^.]+\.csv$/i.exec(path.basename(csvFilePath));
    return match?.groups?.solutionSet;
}

function getCell(columns: readonly string[], row: SwoCsvRow, name: string): string | undefined {
    const index = columns.findIndex(column => column.toLowerCase() === name);
    return index < 0 ? undefined : row.cells.at(index)?.trim();
}

function parseOptionalNumber(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRunNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return value;
    }
    return typeof value === 'string' ? parseOptionalNumber(value) : undefined;
}

function matchesSource(value: unknown, expected: number): boolean {
    const sources = Array.isArray(value) ? value : [value];
    return sources.some(source => parseRunNumber(source) === expected);
}
