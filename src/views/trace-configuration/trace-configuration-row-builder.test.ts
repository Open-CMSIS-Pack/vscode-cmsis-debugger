/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
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

import { CTraceYamlDocument, CTraceYamlFile } from '../../generic';
import { TraceConfigurationRow, TraceConfigurationState } from './trace-configuration-protocol';
import { TraceConfigurationRowBuilder } from './trace-configuration-row-builder';
import * as TraceConfigurationTypes from './trace-configuration-types';

/**
 * createCapabilities builds a realistic Cortex-M33 capability map for row
 * builder tests. The row builder filters optional feature rows by pname, so
 * tests need a capability entry that matches the synthetic ctrace.yml content.
 */
function createCapabilities(pname = 'cm33'): Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities> {
    return new Map([
        [
            pname,
            {
                pname,
                core: 'CM33',
                ...TraceConfigurationTypes.CORTEX_M_DWT_4_TRACE_CAPABILITIES
            }
        ]
    ]);
}

/**
 * createStateFromYaml parses a ctrace document through the same generic YAML
 * DOM used by the extension and asks the row builder to produce webview state.
 * Keeping this helper small makes each test focus on the schema row contract.
 */
function createStateFromYaml(text: string): TraceConfigurationState {
    const file = new CTraceYamlFile('target.ctrace.yml');
    file.document = CTraceYamlDocument.parse(text);
    file.document.assignCTraceRefs();
    return new TraceConfigurationRowBuilder(
        () => file,
        () => false,
        () => false,
        () => undefined,
        new Set<string>(),
        createCapabilities()
    ).createState();
}

/**
 * findRow returns the webview row for one YAML path. Paths are encoded the same
 * way the host sends them to the browser, so the assertion failures point at
 * the exact ctrace node whose projection changed.
 */
function findRow(state: TraceConfigurationState, path: (string | number)[]): TraceConfigurationRow {
    const row = state.rows.find(candidate => JSON.stringify(candidate.path) === JSON.stringify(path));
    expect(row).toBeDefined();
    return row as TraceConfigurationRow;
}

describe('TraceConfigurationRowBuilder', () => {
    it('checks processor rows when trace is enabled and unchecks them when disable is present', () => {
        const enabledState = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            ''
        ].join('\n'));
        const disabledState = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      disable:',
            ''
        ].join('\n'));

        expect(findRow(enabledState, ['ctrace', 'setup', 0]).checked).toBe(true);
        expect(findRow(disabledState, ['ctrace', 'setup', 0]).checked).toBe(false);
    });

    it('renders schema optional fields for DWT data trace items without writing defaults', () => {
        const state = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchSymbol',
            ''
        ].join('\n'));

        const dataRow = findRow(state, ['ctrace', 'setup', 0, 'data']);
        expect(dataRow.label).toBe('DWT Data Trace');
        expect(dataRow.addChildKind).toBe('data');

        const accessRow = findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'access']);
        expect(accessRow.options).toEqual(TraceConfigurationTypes.DATA_ACCESS_OPTIONS);
        expect(accessRow.options).not.toContain('Execute');

        expect(findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'label']).label).toBe('Label');
        expect(findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'size']).label).toBe('Size');
        expect(findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'output']).options).toEqual(TraceConfigurationTypes.DATA_OUTPUT_OPTIONS);
        expect(findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'match']).label).toBe('Match');
        expect(findRow(state, ['ctrace', 'setup', 0, 'data', 0, 'match', 'size']).options).toEqual(TraceConfigurationTypes.MATCH_SIZE_OPTIONS);
    });

    it('renders condition access options for instruction and tracehalt conditions', () => {
        const state = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      instructions:',
            '        start:',
            '          - location: main',
            '      tracehalt:',
            '        - location: stopTrace',
            ''
        ].join('\n'));

        const startRow = findRow(state, ['ctrace', 'setup', 0, 'instructions', 'start']);
        expect(startRow.addChildKind).toBe('condition');

        const traceHaltRow = findRow(state, ['ctrace', 'setup', 0, 'tracehalt']);
        expect(traceHaltRow.label).toBe('Trace Halt');
        expect(traceHaltRow.addChildKind).toBe('condition');

        expect(findRow(state, ['ctrace', 'setup', 0, 'instructions', 'start', 0, 'access']).options).toEqual(TraceConfigurationTypes.CONDITION_ACCESS_OPTIONS);
        expect(findRow(state, ['ctrace', 'setup', 0, 'tracehalt', 0, 'access']).options).toEqual(TraceConfigurationTypes.CONDITION_ACCESS_OPTIONS);
    });

    it('renders current schema values for PC sampling and DWT synchronization', () => {
        const state = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      pcsampling:',
            '      synchronization:',
            '        - DWT: 64M',
            ''
        ].join('\n'));

        const pcSamplingRow = findRow(state, ['ctrace', 'setup', 0, 'pcsampling']);
        expect(pcSamplingRow.label).toBe('PC Sampling');
        expect(pcSamplingRow.value).toBe('off');
        expect(pcSamplingRow.options).toEqual(TraceConfigurationTypes.PC_SAMPLING_PERIOD_OPTIONS);
        expect(pcSamplingRow.options).not.toContain('64*1');
        expect(pcSamplingRow.options?.filter(option => option === '1024')).toHaveLength(1);

        expect(state.rows.some(row => row.label === 'Advanced Settings')).toBe(true);
        const dwtSyncRow = findRow(state, ['ctrace', 'setup', 0, 'synchronization', 'dwt-sync-period']);
        expect(dwtSyncRow.value).toBe('64M');
        expect(dwtSyncRow.options).toEqual(TraceConfigurationTypes.STREAM_SYNC_PERIOD_OPTIONS);
    });

    it('shows schema children for nullable object shorthand sections', () => {
        const state = createStateFromYaml([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '      instructions:',
            ''
        ].join('\n'));

        const timestampsRow = findRow(state, ['ctrace', 'setup', 0, 'timestamps']);
        expect(timestampsRow.checked).toBe(true);
        expect(timestampsRow.hasChildren).toBe(true);
        expect(findRow(state, ['ctrace', 'setup', 0, 'timestamps', 'clock']).label).toBe('Clock');
        expect(findRow(state, ['ctrace', 'setup', 0, 'timestamps', 'itm-prescaler']).options).toEqual(['', '1', '4', '16', '64']);

        const instructionsRow = findRow(state, ['ctrace', 'setup', 0, 'instructions']);
        expect(instructionsRow.checked).toBe(true);
        expect(instructionsRow.hasChildren).toBe(true);
        expect(findRow(state, ['ctrace', 'setup', 0, 'instructions', 'start']).addChildKind).toBe('condition');
        expect(findRow(state, ['ctrace', 'setup', 0, 'instructions', 'stop']).addChildKind).toBe('condition');
    });
});
