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

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { FileLocationManager } from '../../utils';
import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';

function createCTraceFile(text: string): CTraceYamlFile {
    return {
        document: CTraceYamlDocument.parse(text)
    } as CTraceYamlFile;
}

describe('TraceConfigurationProcessorCapabilities', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('loads processor capabilities from cbuild-run data and supplements ctrace.yml processor names', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue('project.cbuild-run.yml');
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue([
            { pname: 'Core0', core: 'Cortex-M55' },
            { core: 'Cortex M3' },
        ] as ProcessorType[]);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: Core0',
            '    - pname: cm33',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(parseSpy).toHaveBeenCalledWith('project.cbuild-run.yml');
        expect(capabilities.capabilities.get('Core0')).toMatchObject({
            pname: 'Core0',
            core: 'CM55',
            pmuEvents: true,
            dwtComparators: 8
        });
        expect(capabilities.capabilities.get('Cortex M3')).toMatchObject({
            pname: 'Cortex M3',
            core: 'CM3',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.get('cm33')).toMatchObject({
            pname: 'cm33',
            core: 'CM33',
            supportsTrace: true
        });
    });

    it('falls back to ctrace.yml processor names when cbuild-run data is unavailable', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse');
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: Cortex-M0+',
            '    - pname: unknown-core',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(parseSpy).not.toHaveBeenCalled();
        expect(capabilities.capabilities.get('Cortex-M0+')).toMatchObject({
            core: 'CM0PLUS',
            supportsTrace: true,
            instructionTrace: true,
            dwtComparators: 0
        });
        expect(capabilities.capabilities.get('unknown-core')).toMatchObject({
            core: undefined,
            supportsTrace: false,
            dwtComparators: 0
        });
    });

    it('keeps ctrace.yml fallback names when parsing the active cbuild-run file fails', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue('broken.cbuild-run.yml');
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockRejectedValue(new Error('bad yaml'));
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: cm4',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.capabilities.get('cm4')).toMatchObject({
            core: 'CM4',
            supportsTrace: true,
            dwtComparators: 4
        });
    });

    it('resolves capabilities for setup descendants and ignores paths outside setup', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: cm52',
            '      data:',
            '        - location: watchedValue',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.getSetupIndexForPath(['ctrace', 'setup', 0, 'data', 0])).toBe(0);
        expect(capabilities.getProcessorNameForPath(['ctrace', 'setup', 0, 'data', 0])).toBe('cm52');
        expect(capabilities.getForPath(['ctrace', 'setup', 0, 'data', 0])).toMatchObject({
            core: 'CM52',
            pmuEvents: true
        });
        expect(capabilities.getForPath(['ctrace', 'data', 0])).toBeUndefined();
    });

    it('clears cached capabilities', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: cm7',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);
        await capabilities.load();

        capabilities.clear();

        expect(capabilities.capabilities.size).toBe(0);
    });
});
