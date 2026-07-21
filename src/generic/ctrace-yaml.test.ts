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

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { Disposable, TextFileAdapter, TextFileStamp } from './yaml-file';

class MemoryTextFileAdapter implements TextFileAdapter {
    private version = 0;
    private readonly listeners: (() => void)[] = [];

    constructor(public text: string) {}

    public async readTextFile(_fileName: string): Promise<string> {
        return this.text;
    }

    public async writeTextFile(_fileName: string, contents: string): Promise<void> {
        this.update(contents);
    }

    public async stat(_fileName: string): Promise<TextFileStamp> {
        return {
            mtimeMs: this.version,
            size: this.text.length
        };
    }

    public watch(_fileName: string, onDidChange: () => void): Disposable {
        this.listeners.push(onDidChange);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(onDidChange);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    }

    public update(text: string): void {
        this.text = text;
        this.version++;
        this.listeners.forEach(listener => listener());
    }
}

describe('CTraceYamlDocument', () => {
    it('reads and updates user-authored trace data entries', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  created-by: CMSIS-Debugger v1.4.0',
            '  data:',
            '    - location: mySymbol',
            '      access: rw',
            '      size: 8',
            '      pc: no',
            ''
        ].join('\n'));

        expect(document.getCreatedBy()).toBe('CMSIS-Debugger v1.4.0');
        expect(document.getDataTrace()).toEqual([
            {
                location: 'mySymbol',
                access: 'rw',
                size: '8',
                pc: 'no'
            }
        ]);

        document.upsertDataTrace({
            location: 'mySymbol',
            access: 'write',
            size: '4',
            pc: 'yes'
        });
        document.upsertDataTrace({
            location: 'otherSymbol',
            access: 'read'
        });

        expect(document.getDataTrace()).toHaveLength(2);
        expect(document.getDataTrace()[0]).toMatchObject({
            location: 'mySymbol',
            access: 'write',
            size: '4'
        });
        expect(document.removeDataTrace('otherSymbol')).toBe(true);
        expect(document.getDataTrace()).toHaveLength(1);
    });

    it('replaces generated ELF and register values while keeping plain hex output', () => {
        const document = CTraceYamlDocument.create('CMSIS-Debugger v1.7.0');

        document.replaceGeneratedValues(
            [
                {
                    file: 'program1.axf',
                    pname: 'Core0'
                }
            ],
            [
                {
                    pname: 'Core0',
                    ITM: {
                        TER: '0xFFFFFFFF',
                        TPR: '0x8'
                    },
                    DWT: {
                        COMP0: '0x20000000'
                    }
                }
            ]
        );

        expect(document.getElfFiles()).toEqual([
            {
                file: 'program1.axf',
                pname: 'Core0'
            }
        ]);
        expect(document.getRegisterValuesForPname('Core0')).toMatchObject({
            ITM: {
                TER: '0xFFFFFFFF',
                TPR: '0x8'
            }
        });

        const output = document.toString();
        expect(output).toContain('created-by: CMSIS-Debugger v1.7.0');
        expect(output).toContain('TER: 0xFFFFFFFF');
        expect(output).toContain('TPR: 0x8');
        expect(output).toContain('COMP0: 0x20000000');
    });

    it('can clear generated sections without removing user trace configuration', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  data:',
            '    - location: mySymbol',
            '  ELF-files:',
            '    - file: program.axf',
            '  register-values:',
            '    - pname: Core0',
            ''
        ].join('\n'));

        document.clearGeneratedValues();

        expect(document.getDataTrace()).toEqual([{ location: 'mySymbol' }]);
        expect(document.getElfFiles()).toEqual([]);
        expect(document.getRegisterValues()).toEqual([]);
        expect(document.toString()).toContain('data:');
        expect(document.toString()).not.toContain('ELF-files');
        expect(document.toString()).not.toContain('register-values');
    });

    it('assigns ctrace-ref values internally without writing them to YAML', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  ctrace-ref: stale-root',
            '  instructions:',
            '    ctrace-ref: stale-instructions',
            '    start:',
            '      - location: main',
            '        ctrace-ref: stale-start',
            '  setup:',
            '    - pname: Core0',
            '      ctrace-ref: stale-core',
            '      data:',
            '        - location: watchMe',
            '          ctrace-ref: stale-data',
            '          match:',
            '            value: 0x10',
            '            ctrace-ref: stale-match',
            '    - pname: Core1',
            '      events:',
            '        - event: Exception',
            ''
        ].join('\n'));

        document.assignCTraceRefs();

        expect(document.getCTraceRef(['ctrace'])).toBe('ctrace');
        expect(document.getCTraceRef(['ctrace', 'instructions'])).toBe('instructions');
        expect(document.getCTraceRef(['ctrace', 'instructions', 'start', 0])).toBe('instructions:start#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0])).toBe('Core0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0])).toBe('Core0/data#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0, 'match'])).toBe('Core0/data#0/match');
        expect(document.getCTraceRef(['ctrace', 'setup', 1, 'events', 0])).toBe('Core1/events#0');
        expect(document.toString()).not.toContain('ctrace-ref');
    });
});

describe('CTraceYamlFile', () => {
    it('reloads typed ctrace content after external edits', async () => {
        const adapter = new MemoryTextFileAdapter('ctrace:\n  data:\n    - location: oldSymbol\n');
        const file = new CTraceYamlFile('target.ctrace.yml', adapter);

        const loaded = await file.load();
        expect(loaded.getDataTrace()[0].location).toBe('oldSymbol');

        adapter.update('ctrace:\n  data:\n    - location: newSymbol\n');

        await expect(file.reloadIfChanged()).resolves.toBe(true);
        expect(file.document?.getDataTrace()[0].location).toBe('newSymbol');
    });
});
