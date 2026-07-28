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

import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { Disposable, TextFileAdapter, TextFileStamp } from '../../generic/yaml-file';
import { TraceConfigurationModel } from './trace-configuration-model';

interface TraceConfigurationModelPrivate {
    ctraceFile: CTraceYamlFile;
    setProcessorDisable(document: CTraceYamlDocument, processorPath: (string | number)[]): void;
}

class MemoryTextFileAdapter implements TextFileAdapter {
    public writeCount = 0;
    private version = 0;
    private readonly listeners: (() => void)[] = [];

    public constructor(public text: string) {}

    public async readTextFile(_fileName: string): Promise<string> {
        return this.text;
    }

    public async writeTextFile(_fileName: string, contents: string): Promise<void> {
        this.text = contents;
        this.writeCount++;
        this.version++;
        this.listeners.forEach(listener => listener());
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

    public listenerCount(): number {
        return this.listeners.length;
    }
}

async function createModelFromText(text: string): Promise<{ adapter: MemoryTextFileAdapter; model: TraceConfigurationModel }> {
    const adapter = new MemoryTextFileAdapter(text);
    const file = new CTraceYamlFile('target.ctrace.yml', adapter);
    const document = await file.load();
    document.assignCTraceRefs();
    const model = new TraceConfigurationModel();
    (model as unknown as TraceConfigurationModelPrivate).ctraceFile = file;
    return { adapter, model };
}

describe('TraceConfigurationModel', () => {
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
});
