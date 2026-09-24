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
import * as path from 'node:path';

import { InMemorySwoCsvRowStore, type SwoCsvRowStore } from './swo-csv-row-store';
import { SwoCsvEditorProvider } from './swo-csv-editor-provider';
import type { SwoCsvWebviewMessage } from './swo-csv-protocol';

interface TestableSwoCsvEditorProvider {
    handleCellSelection(
        uri: vscode.Uri,
        message: Extract<SwoCsvWebviewMessage, { type: 'cellSelected' }>,
        rowStore: SwoCsvRowStore
    ): Promise<void>;
}

describe('SwoCsvEditorProvider', () => {
    afterEach(() => jest.restoreAllMocks());

    it('focuses the first trace configuration reference matching a selected CSV row', async () => {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(Buffer.from([
            'ctrace-run:',
            '  ctrace-refs:',
            '    - ctrace-ref: data#0',
            '      type: dwt',
            '      stream: 1',
            '      source: 0',
            '    - ctrace-ref: data#1',
            '      type: dwt',
            '      stream: 1',
            '      source: 0',
            ''
        ].join('\n')));
        const focusCTraceReference = jest.fn().mockResolvedValue(true);
        const provider = new SwoCsvEditorProvider(vscode.Uri.file('/extension'), focusCTraceReference);
        const rowStore = new InMemorySwoCsvRowStore({
            columns: ['cycles', 'stream', 'type', 'source'],
            rows: [{ sourceRowIndex: 0, cells: ['1', '1', 'dwt', '0'] }],
            malformedRowCount: 0
        });
        const message: Extract<SwoCsvWebviewMessage, { type: 'cellSelected' }> = {
            type: 'cellSelected',
            sourceRowIndex: 0,
            columnIndex: 2,
            columnName: 'type',
            cellValue: 'dwt'
        };

        await (provider as unknown as TestableSwoCsvEditorProvider).handleCellSelection(
            vscode.Uri.file('/workspace/.trace/demo+target.SWO.csv'),
            message,
            rowStore
        );

        expect(focusCTraceReference).toHaveBeenCalledWith(
            'demo+target',
            'data#0',
            path.join('/workspace', '.cmsis', 'demo+target.ctrace.yml')
        );
    });
});
