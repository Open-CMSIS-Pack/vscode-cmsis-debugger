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

import { resolveCTraceRunReference } from './ctrace-run-resolver';
import type { CsvTableRow } from './csv-table';

describe('resolveCTraceRunReference', () => {
    const columns = ['cycles', 'stream', 'type', 'source'];
    const csvUri = vscode.Uri.file('/workspace/.trace/demo+target.SWO.csv');

    function row(stream: string, type: string, source: string): CsvTableRow {
        return { sourceRowIndex: 0, cells: ['1', stream, type, source] };
    }

    function mockRunFile(references: string): void {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from([
            'ctrace-run:',
            '  ctrace-refs:',
            references,
            ''
        ].join('\n')));
    }

    afterEach(() => jest.restoreAllMocks());

    it('returns the first matching reference in file order', async () => {
        mockRunFile([
            '    - ctrace-ref: data#0',
            '      type: dwt',
            '      stream: 1',
            '      source: [0, 1]',
            '    - ctrace-ref: data#1',
            '      type: dwt',
            '      stream: 1',
            '      source: 1'
        ].join('\n'));

        await expect(resolveCTraceRunReference(csvUri, columns, row('1', 'dwt', '1')))
            .resolves.toEqual({ solutionSet: 'demo+target', ctraceRef: 'data#0' });
    });

    it('does not filter by stream when the CSV stream is empty', async () => {
        mockRunFile([
            '    - ctrace-ref: itm',
            '      type: itm',
            '      stream: 7',
            '      source: 3'
        ].join('\n'));

        await expect(resolveCTraceRunReference(csvUri, columns, row('', 'itm', '3')))
            .resolves.toEqual({ solutionSet: 'demo+target', ctraceRef: 'itm' });
    });

    it('ignores source for exception records', async () => {
        mockRunFile([
            '    - ctrace-ref: exceptions',
            '      type: exception',
            '      stream: 1'
        ].join('\n'));

        await expect(resolveCTraceRunReference(csvUri, columns, row('1', 'exception', '11')))
            .resolves.toEqual({ solutionSet: 'demo+target', ctraceRef: 'exceptions' });
    });

    it.each(['overflow', 'error'])('does not resolve %s records', async type => {
        const readFile = jest.spyOn(vscode.workspace.fs, 'readFile');

        await expect(resolveCTraceRunReference(csvUri, columns, row('', type, ''))).resolves.toBeUndefined();
        expect(readFile).not.toHaveBeenCalled();
    });
});
