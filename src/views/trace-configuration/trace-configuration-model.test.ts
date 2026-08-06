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
// generated with AI

import * as vscode from 'vscode';

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { MemoryTextFileAdapter } from '../../__test__/memory-text-file-adapter';
import { TraceConfigurationModel } from './trace-configuration-model';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';
import * as TraceConfigurationTypes from './trace-configuration-types';

interface TraceConfigurationModelPrivate {
    ctraceFile: CTraceYamlFile | undefined;
    setProcessorDisable(document: CTraceYamlDocument, processorPath: (string | number)[]): void;
}

interface TraceConfigurationProcessorCapabilitiesPrivate {
    processorCapabilities: Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities>;
}

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

async function createModelFromText(
    text: string,
    capabilities?: Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities>
): Promise<{ adapter: MemoryTextFileAdapter; model: TraceConfigurationModel }> {
    const adapter = new MemoryTextFileAdapter(text);
    const file = new CTraceYamlFile('target.ctrace.yml', adapter);
    const document = await file.load();
    document.assignCTraceRefs();
    const processorCapabilities = capabilities ? new TraceConfigurationProcessorCapabilities(() => file) : undefined;
    if (processorCapabilities) {
        const privateCapabilities = processorCapabilities as unknown as TraceConfigurationProcessorCapabilitiesPrivate;
        capabilities?.forEach((value, key) => privateCapabilities.processorCapabilities.set(key, value));
    }
    const model = new TraceConfigurationModel(() => {}, processorCapabilities);
    (model as unknown as TraceConfigurationModelPrivate).ctraceFile = file;
    return { adapter, model };
}

describe('TraceConfigurationModel', () => {
    it.each([
        { fileName: 'ctrace.yml', expected: true },
        { fileName: 'ctrace.yaml', expected: true },
        { fileName: 'board.ctrace.yml', expected: true },
        { fileName: 'board.ctrace.yaml', expected: true },
        { fileName: 'trace.yml', expected: false },
        { fileName: 'ctrace.json', expected: false },
    ])('recognizes ctrace file names: $fileName', ({ fileName, expected }) => {
        expect(TraceConfigurationModel.isCTraceFileName(fileName)).toBe(expected);
    });

    it('creates an empty state before a ctrace file is loaded', () => {
        const model = new TraceConfigurationModel();

        expect(model.createState()).toMatchObject({
            rows: [],
            loading: false,
            dirty: false,
            emptyMessage: 'Open a ctrace.yml file to edit trace configuration.'
        });
    });

    it('writes processor disable directly after pname', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            ''
        ].join('\n'));
        const model = new TraceConfigurationModel() as unknown as TraceConfigurationModelPrivate;

        model.setProcessorDisable(document, ['ctrace', 'setup', 0]);

        expect(document.toString()).toContain([
            '    - pname: cm33',
            '      disable:',
            '      timestamps:',
            ''
        ].join('\n'));
    });

    it('keeps webview edits in memory until the user saves', async () => {
        const originalText = [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '      instructions:',
            '        start:',
            '        stop:',
            ''
        ].join('\n');
        const { adapter, model } = await createModelFromText(originalText);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'start'], 'start');
        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'stop'], 'stop');

        expect(adapter.text).toBe(originalText);
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(true);

        await model.saveCurrentDocument();

        expect(adapter.writeCount).toBe(1);
        expect(adapter.text).toContain('access: W');
        expect(adapter.text.match(/access: X/g) ?? []).toHaveLength(2);
        expect(model.createState().dirty).toBe(false);
    });

    it('serializes emptied editable sequences as bare keys', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchSymbol',
            '          access: W',
            '      instructions:',
            '        start:',
            '          - location: main',
            '            access: X',
            '        stop:',
            '          - location: endTrace',
            '            access: X',
            ''
        ].join('\n'));

        await model.removeItem(['ctrace', 'setup', 0, 'data', 0]);
        await model.removeItem(['ctrace', 'setup', 0, 'instructions', 'start', 0]);
        await model.removeItem(['ctrace', 'setup', 0, 'instructions', 'stop', 0]);

        expect(adapter.writeCount).toBe(0);

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      data:\n');
        expect(adapter.text).toContain('        start:\n');
        expect(adapter.text).toContain('        stop:\n');
        expect(adapter.text).not.toContain('data: []');
        expect(adapter.text).not.toContain('start: []');
        expect(adapter.text).not.toContain('stop: []');
    });

    it('normalizes already empty DWT data trace lists to bare keys on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data: []',
            ''
        ].join('\n'));

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      data:\n');
        expect(adapter.text).not.toContain('data: []');
        expect(adapter.text).not.toContain('data: {}');
    });

    it('rejects direct add attempts when shared DWT comparators are already used', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchOne',
            '        - location: watchTwo',
            '      instructions:',
            '        start:',
            '          - location: main',
            '        stop:',
            '      tracehalt:',
            '        - location: stopTrace',
            ''
        ].join('\n'), createCapabilities());

        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'stop'], 'stop');

        const document = (model as unknown as TraceConfigurationModelPrivate).ctraceFile?.document;
        expect(document?.yaml.getItem(['ctrace', 'setup', 0, 'instructions', 'stop', 0])).toBeUndefined();
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
        expect(model.createState().errorMessage).toContain('already use 4 of 4');
    });

    it('drops legacy ctrace ELF metadata on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '  ELF-files:',
            '    - file: program.axf',
            '      pname: cm33',
            ''
        ].join('\n'));

        await model.saveCurrentDocument();

        expect(adapter.text).not.toContain('ELF-files');
        expect(adapter.text).not.toContain('program.axf');
    });

    it('refresh discards unsaved webview edits and resumes file watching', async () => {
        const originalText = [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n');
        const { adapter, model } = await createModelFromText(originalText);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        expect(model.createState().dirty).toBe(true);
        expect(adapter.listenerCount()).toBe(0);

        await model.refreshFile();

        expect(adapter.text).toBe(originalText);
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
        expect(adapter.listenerCount()).toBe(1);
    });

    it('updates specialized trace controls in memory and saves their YAML shapes', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '      exceptions:',
            '      events:',
            '      itm:',
            '        enable: 0x00000000',
            '      data:',
            '        - location: watchSymbol',
            '          match:',
            '            value: 0x10',
            '      instructions:',
            '      pcsampling:',
            '      synchronization:',
            '        - DWT: off',
            '      timesync:',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0], false);
        await model.updateValue(['ctrace', 'setup', 0], true);
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'events'], ['CYCCNT', 'EXCCNT']);
        await model.updateValue(['ctrace', 'setup', 0, 'itm'], ['0', '31']);
        await model.updateValue(['ctrace', 'setup', 0, 'itm', 'privileged'], ['8-15', '24-31']);
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'access'], 'Read Write');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'size'], '4');
        await model.updateValue(['ctrace', 'setup', 0, 'instructions'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'instructions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'exceptions'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'exceptions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'timesync'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'timesync'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'pcsampling'], '64 * 16');
        await model.updateValue(['ctrace', 'setup', 0, 'synchronization', 'dwt-sync-period'], '256M');

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(true);

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      timestamps: {}\n');
        expect(adapter.text).toContain('      exceptions:\n');
        expect(adapter.text).toContain('      events:\n        - event: CYCCNT\n        - event: EXCCNT\n');
        expect(adapter.text).toContain('      itm:\n        enable: 0x80000001\n        privileged: 0xa\n');
        expect(adapter.text).toContain('          access: RW\n');
        expect(adapter.text).toContain('            size: 4\n');
        expect(adapter.text).toContain('      instructions: {}\n');
        expect(adapter.text).toContain('      pcsampling:\n        period: 1024\n');
        expect(adapter.text).toContain('      synchronization:\n        - DWT: 256M\n');
        expect(adapter.text).toContain('      timesync:\n');
        expect(adapter.text).not.toContain('disable:');
    });

    it('does not create optional match size when match value is absent', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchSymbol',
            ''
        ].join('\n'), createCapabilities());
        const onDidChange = jest.fn();
        model.setOnDidChange(onDidChange);

        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'size'], '4');

        expect(model.createState().dirty).toBe(false);
        expect(onDidChange).toHaveBeenCalled();
        await model.saveCurrentDocument();
        expect(adapter.text).not.toContain('match:');
    });

    it('deletes optional values and prunes empty match parents', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            '        itm-prescaler: 4',
            '      itm:',
            '        enable: 0x00000001',
            '        privileged: 0xf',
            '      data:',
            '        - location: watchSymbol',
            '          label: Watch label',
            '          output: value',
            '          match:',
            '            value: 0x10',
            '            size: 4',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'clock'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'itm-prescaler'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'itm', 'privileged'], []);
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'label'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'output'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'value'], '');
        await model.saveCurrentDocument();

        expect(adapter.text).not.toContain('clock:');
        expect(adapter.text).not.toContain('itm-prescaler:');
        expect(adapter.text).not.toContain('privileged:');
        expect(adapter.text).not.toContain('Watch label');
        expect(adapter.text).not.toContain('output:');
        expect(adapter.text).not.toContain('match:');
    });

    it('reloads externally changed clean files before applying webview edits and ignores the stale edit', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'), createCapabilities());
        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 200000000',
            ''
        ].join('\n'));

        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'clock'], '300000000');
        await model.saveCurrentDocument();

        expect(adapter.text).toContain('clock: 200000000');
        expect(adapter.text).not.toContain('300000000');
    });

    it('supports save options for external disk changes', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'), createCapabilities());
        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 200000000',
            ''
        ].join('\n'));

        await model.saveCurrentDocument({ reloadBeforeSave: true, skipWhenReloaded: true });

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);

        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 300000000',
            ''
        ].join('\n'));

        await model.saveCurrentDocument({ abortIfDiskChanged: true });

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
    });

    it('loads initial files from the active editor or workspace search and reports load failures', async () => {
        const onDidChange = jest.fn();
        const model = new TraceConfigurationModel(onDidChange);
        const activeUri = { fsPath: '/workspace/active.ctrace.yml' };
        (vscode.window as unknown as { activeTextEditor: { document: { uri: { fsPath: string } } } | undefined }).activeTextEditor = {
            document: {
                uri: activeUri
            }
        };

        await model.loadInitialFile();

        expect(model.createState().loading).toBe(false);
        expect(model.createState().errorMessage).toContain('ENOENT');
        expect(onDidChange).toHaveBeenCalled();

        (vscode.window as unknown as { activeTextEditor: undefined }).activeTextEditor = undefined;
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValueOnce([]);

        await model.loadInitialFile();

        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(TraceConfigurationTypes.CTRACE_FILE_GLOB, '**/{node_modules,dist,coverage}/**', 10);
        expect(model.createState().emptyMessage).toBe('Open a ctrace.yml file to edit trace configuration.');
    });

    it('validates explicitly opened ctrace file names before loading', async () => {
        const model = new TraceConfigurationModel();

        await expect(model.openFile('trace.yml')).rejects.toThrow('Please select ctrace.yml, ctrace.yaml, or a *.ctrace.yml file.');
    });

    it('throws clear errors when actions require a loaded document', async () => {
        const model = new TraceConfigurationModel();

        await expect(model.saveCurrentDocument()).rejects.toThrow('No ctrace.yml file is loaded.');
        await expect(model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true)).rejects.toThrow('No ctrace.yml file is loaded.');

        (model as unknown as TraceConfigurationModelPrivate).ctraceFile = new CTraceYamlFile('target.ctrace.yml');

        await expect(model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true)).rejects.toThrow('No ctrace.yml document is loaded.');
    });

    it('stores reported errors in state and notifies listeners', () => {
        const onDidChange = jest.fn();
        const model = new TraceConfigurationModel(onDidChange);

        model.reportError('failed badly', 'Trace Configuration');

        expect(model.createState().errorMessage).toBe('failed badly');
        expect(onDidChange).toHaveBeenCalledTimes(1);
    });
});
