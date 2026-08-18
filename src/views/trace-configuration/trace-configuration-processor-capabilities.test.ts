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
import { logger } from '../../logger';
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

    it('loads processor capabilities from cbuild-run cores by pname and keeps ctrace.yml display names', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue('project.cbuild-run.yml');
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue([
            { pname: 'cm33', core: 'Cortex-M3' },
            { pname: 'Core0', core: 'Cortex-M55' },
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
        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'Core0',
            core: 'Cortex-M55',
            pmuEvents: true,
            dwtComparators: 8
        });
        expect(capabilities.capabilities.get('1')).toMatchObject({
            displayName: 'cm33',
            core: 'Cortex-M3',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.has('Core0')).toBe(false);
        expect(capabilities.capabilities.has('Cortex-M55')).toBe(false);
    });

    it('does not match multi-core cbuild-run processors by position when pname is missing', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue('project.cbuild-run.yml');
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
        jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue([
            { pname: 'Core0', core: 'Cortex-M55' },
            { pname: 'Core1', core: 'Cortex-M3' },
        ] as ProcessorType[]);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - disable:',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'Processor 1',
            core: undefined,
            supportsTrace: false,
            dwtComparators: 0
        });
        expect(warnSpy).toHaveBeenCalledWith('Unable to identify trace processor setup entry 1: multi-core projects require pname.');
    });

    it('warns when multi-core cbuild-run processor entries are missing pname', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue('project.cbuild-run.yml');
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
        jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue([
            { pname: 'Core0', core: 'Cortex-M55' },
            { core: 'Cortex-M3' },
        ] as ProcessorType[]);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: Core0',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'Core0',
            core: 'Cortex-M55',
            supportsTrace: true,
            dwtComparators: 8
        });
        expect(warnSpy).toHaveBeenCalledWith('Invalid multi-core cbuild-run processor data: processor entries 2 are missing pname.');
    });

    it('falls back to ctrace.yml core values when cbuild-run data is unavailable', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse');
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: DisplayCore',
            '      core: Cortex-M0+',
            '    - core: Cortex-M33',
            '    - pname: unknown-core',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(parseSpy).not.toHaveBeenCalled();
        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'DisplayCore',
            core: 'Cortex-M0+',
            supportsTrace: true,
            instructionTrace: true,
            dwtComparators: 0
        });
        expect(capabilities.capabilities.get('1')).toMatchObject({
            displayName: 'Cortex-M33',
            core: 'Cortex-M33',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.getProcessorNameForPath(['ctrace', 'setup', 1])).toBe('Cortex-M33');
        expect(capabilities.capabilities.get('2')).toMatchObject({
            displayName: 'unknown-core',
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
            '      core: Cortex-M4',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'cm4',
            core: 'Cortex-M4',
            supportsTrace: true,
            dwtComparators: 4
        });
    });

    it('supports non-Cortex-A/R Dcore aliases with Cortex-M trace capability equivalents', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - core: SC000',
            '    - core: SC300',
            '    - core: Star-MC1',
            '    - core: Star-MC3',
            '    - core: ARMV8MBL',
            '    - core: ARMV8MML',
            '    - core: ARMV81MML',
            '    - core: Cortex-A53',
            '    - core: Cortex-R5',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.capabilities.get('0')).toMatchObject({
            displayName: 'SC000',
            core: 'SC000',
            supportsTrace: false,
            dwtComparators: 0
        });
        expect(capabilities.capabilities.get('1')).toMatchObject({
            displayName: 'SC300',
            core: 'SC300',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.get('2')).toMatchObject({
            displayName: 'Star-MC1',
            core: 'Star-MC1',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.get('3')).toMatchObject({
            displayName: 'Star-MC3',
            core: 'Star-MC3',
            supportsTrace: true,
            pmuEvents: true,
            dwtComparators: 8
        });
        expect(capabilities.capabilities.get('4')).toMatchObject({
            displayName: 'ARMV8MBL',
            core: 'ARMV8MBL',
            supportsTrace: true,
            dwtComparators: 0
        });
        expect(capabilities.capabilities.get('5')).toMatchObject({
            displayName: 'ARMV8MML',
            core: 'ARMV8MML',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.get('6')).toMatchObject({
            displayName: 'ARMV81MML',
            core: 'ARMV81MML',
            supportsTrace: true,
            dwtComparators: 4
        });
        expect(capabilities.capabilities.get('7')).toMatchObject({
            displayName: 'Cortex-A53',
            core: 'Cortex-A53',
            supportsTrace: false,
            dwtComparators: 0
        });
        expect(capabilities.capabilities.get('8')).toMatchObject({
            displayName: 'Cortex-R5',
            core: 'Cortex-R5',
            supportsTrace: false,
            dwtComparators: 0
        });
    });

    it('resolves capabilities for setup descendants and ignores paths outside setup', async () => {
        jest.spyOn(FileLocationManager.prototype, 'getCBuildRunFileName').mockResolvedValue(undefined);
        const ctraceFile = createCTraceFile([
            'ctrace:',
            '  setup:',
            '    - pname: cm52',
            '      core: Cortex-M52',
            '      data:',
            '        - location: watchedValue',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);

        await capabilities.load();

        expect(capabilities.getSetupIndexForPath(['ctrace', 'setup', 0, 'data', 0])).toBe(0);
        expect(capabilities.getProcessorNameForPath(['ctrace', 'setup', 0, 'data', 0])).toBe('cm52');
        expect(capabilities.getForPath(['ctrace', 'setup', 0, 'data', 0])).toMatchObject({
            displayName: 'cm52',
            core: 'Cortex-M52',
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
            '      core: Cortex-M7',
            ''
        ].join('\n'));
        const capabilities = new TraceConfigurationProcessorCapabilities(() => ctraceFile);
        await capabilities.load();

        capabilities.clear();

        expect(capabilities.capabilities.size).toBe(0);
    });
});
