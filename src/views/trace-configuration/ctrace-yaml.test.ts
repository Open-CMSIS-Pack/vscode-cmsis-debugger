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

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { MemoryTextFileAdapter } from '../../__test__/memory-text-file-adapter';

describe('CTraceYamlDocument', () => {
    it('reads and updates user-authored trace data entries', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  created-by: CMSIS-Debugger v1.4.0',
            '  data:',
            '    - location: mySymbol',
            '      access: RW',
            '      size: 8',
            '      pc: no',
            ''
        ].join('\n'));

        expect(document.getCreatedBy()).toBe('CMSIS-Debugger v1.4.0');
        expect(document.getDataTrace()).toEqual([
            {
                location: 'mySymbol',
                access: 'RW',
                size: 8,
                pc: 'no'
            }
        ]);

        document.upsertDataTrace({
            location: 'mySymbol',
            access: 'W',
            size: '4',
            pc: 'yes'
        });
        document.upsertDataTrace({
            location: 'otherSymbol',
            access: 'R'
        });

        expect(document.getDataTrace()).toHaveLength(2);
        expect(document.getDataTrace()[0]).toMatchObject({
            location: 'mySymbol',
            access: 'W',
            size: '4'
        });
        expect(document.removeDataTrace('otherSymbol')).toBe(true);
        expect(document.getDataTrace()).toHaveLength(1);
    });

    it('writes register values while keeping plain hex output', () => {
        const document = CTraceYamlDocument.create('CMSIS-Debugger v1.7.0');

        document.setRegisterValues([
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

    it('can clear register values without removing user trace configuration', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  data:',
            '    - location: mySymbol',
            '  register-values:',
            '    - pname: Core0',
            ''
        ].join('\n'));

        document.setRegisterValues([]);

        expect(document.getDataTrace()).toEqual([{ location: 'mySymbol' }]);
        expect(document.getRegisterValues()).toEqual([]);
        expect(document.toString()).toContain('data:');
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
            '      instructions:',
            '        start:',
            '          - location: coreZeroStart',
            '    - pname: Core1',
            '      events:',
            '        - event: Exception',
            '      tracehalt:',
            '        - location: coreOneHalt',
            ''
        ].join('\n'));

        document.assignCTraceRefs();

        expect(document.getCTraceRef(['ctrace'])).toBe('ctrace');
        expect(document.getCTraceRef(['ctrace', 'instructions'])).toBe('instructions');
        expect(document.getCTraceRef(['ctrace', 'instructions', 'start'])).toBe('instructions/start');
        expect(document.getCTraceRef(['ctrace', 'instructions', 'start', 0])).toBe('instructions:start#0');
        expect(document.getCTraceRef(['ctrace', 'setup'])).toBe('setup');
        expect(document.getCTraceRef(['ctrace', 'setup', 0])).toBe('Core0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'pname'])).toBe('Core0/pname');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data'])).toBe('Core0/data');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0])).toBe('Core0/data#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0, 'location'])).toBe('Core0/data#0/location');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0, 'match'])).toBe('Core0/data#0/match');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0, 'match', 'value'])).toBe('Core0/data#0/match/value');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'instructions', 'start', 0])).toBe('Core0/instructions:start#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 1, 'events'])).toBe('Core1/events');
        expect(document.getCTraceRef(['ctrace', 'setup', 1, 'events', 0])).toBe('Core1/events#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 1, 'tracehalt', 0])).toBe('Core1/tracehalt#0');
        expect(document.toString()).not.toContain('ctrace-ref');
    });

    it('omits the pname prefix from ctrace-ref values in a single-core configuration', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            '      timesync:',
            '      data:',
            '        - location: watchMe',
            '      instructions:',
            '        start:',
            '          - location: main',
            '      tracehalt:',
            '        - location: stopTrace',
            ''
        ].join('\n'));

        document.assignCTraceRefs();

        expect(document.getCTraceRef(['ctrace', 'setup', 0])).toBe('cm33');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'timestamps'])).toBe('timestamps');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'timestamps', 'clock'])).toBe('timestamps/clock');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'timesync'])).toBe('timesync');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data'])).toBe('data');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'data', 0])).toBe('data#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'instructions', 'start', 0])).toBe('instructions:start#0');
        expect(document.getCTraceRef(['ctrace', 'setup', 0, 'tracehalt', 0])).toBe('tracehalt#0');
    });

    it('normalizes maps to the documented ctrace.yml order', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  setup:',
            '    - tracehalt:',
            '        - match:',
            '            size: 2',
            '            value: 0x20',
            '          size: 4',
            '          access: X',
            '          location: stopTrace',
            '      synchronization:',
            '        DWT: 16M',
            '      pcsampling:',
            '        period: 64',
            '      instructions:',
            '        stop:',
            '          - match:',
            '              size: 4',
            '              value: 0x10',
            '            access: X',
            '            location: stopHere',
            '        start:',
            '          - size: 4',
            '            location: main',
            '      itm:',
            '        privileged: 0x0',
            '        enable: 0x1',
            '      events:',
            '        - pname: cm33',
            '          event: CYCCNT',
            '      exceptions:',
            '      data:',
            '        - match:',
            '            size: 4',
            '            value: 0x30',
            '          output: PC',
            '          size: 4',
            '          access: R',
            '          label: Watch',
            '          location: watchedValue',
            '      timesync:',
            '      timestamps:',
            '        itm-prescaler: 4',
            '        clock: 100000000',
            '      disable:',
            '      pname: cm33',
            '  created-by: CMSIS-Debugger',
            ''
        ].join('\n'));

        document.normalizeDocumentOrder();

        expect(document.toString()).toMatchSnapshot();
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
