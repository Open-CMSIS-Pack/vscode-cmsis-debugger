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

import { TextFileAdapter } from '../../desktop/yaml-file';
import {
    CTraceRunValidationMessageReader,
    parseCTraceRunValidationMessages
} from './ctrace-run-validation-message-reader';
import { getTraceConfigurationArtifactFileNames } from './trace-configuration-file-names';

describe('parseCTraceRunValidationMessages', () => {
    it('keeps the first message at the highest severity for each ctrace-ref', () => {
        const messages = parseCTraceRunValidationMessages([
            'ctrace-run:',
            '  ctrace-refs:',
            '    - ctrace-ref: data#0',
            '      info: inferred type',
            '      warning: aligned range',
            '    - ctrace-ref: data#0',
            '      warning: later warning',
            '    - ctrace-ref: events#0',
            '      info: event info',
            '    - ctrace-ref: data#0',
            '      error: unsupported comparator',
            '    - ctrace-ref: data#0',
            '      error: later error',
            ''
        ].join('\n'));

        expect(messages).toEqual([
            { ctraceRef: 'data#0', severity: 'error', message: 'unsupported comparator' },
            { ctraceRef: 'events#0', severity: 'info', message: 'event info' }
        ]);
    });

    it('ignores invalid entries and empty or non-string messages', () => {
        const messages = parseCTraceRunValidationMessages([
            'ctrace-run:',
            '  ctrace-refs:',
            '    - invalid',
            '    - ctrace-ref: 17',
            '      error: ignored',
            '    - ctrace-ref: timestamps',
            '      error: "  "',
            '      warning: 3',
            '      info: usable',
            ''
        ].join('\n'));

        expect(messages).toEqual([
            { ctraceRef: 'timestamps', severity: 'info', message: 'usable' }
        ]);
    });

    it('rejects documents without a ctrace-ref sequence', () => {
        expect(() => parseCTraceRunValidationMessages('ctrace-run:\n  generated-by: pyTS\n'))
            .toThrow('expected ctrace-run.ctrace-refs to be a sequence');
    });
});

describe('CTraceRunValidationMessageReader', () => {
    it('does not read a missing file', async () => {
        const fileAdapter: jest.Mocked<TextFileAdapter> = {
            readTextFile: jest.fn(),
            writeTextFile: jest.fn(),
            stat: jest.fn().mockResolvedValue(undefined)
        };
        const reader = new CTraceRunValidationMessageReader(fileAdapter);

        await expect(reader.readIfExists('/workspace/.trace/target.ctrace-run.yml'))
            .resolves.toBeUndefined();
        expect(fileAdapter.readTextFile).not.toHaveBeenCalled();
    });
});

describe('getTraceConfigurationArtifactFileNames', () => {
    it('derives production and backup artifacts from the ctrace input', () => {
        const artifacts = getTraceConfigurationArtifactFileNames(
            path.join('/workspace', '.cmsis', 'demo+target.ctrace.yml')
        );

        expect(artifacts).toEqual({
            backupCTraceFileName: path.join('/workspace', '.cmsis', '~demo+target.ctrace.yml'),
            productionCTraceRunFileName: path.join('/workspace', '.trace', 'demo+target.ctrace-run.yml'),
            backupCTraceRunFileName: path.join('/workspace', '.trace', '~demo+target.ctrace-run.yml')
        });
    });
});
