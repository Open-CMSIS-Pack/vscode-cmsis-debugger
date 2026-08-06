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

import { MemoryTextFileAdapter } from '../__test__/memory-text-file-adapter';
import { YamlDomFile } from './yaml-file';
import { YamlDomDocument } from './yaml-dom';

describe('YamlDomDocument', () => {
    it('reads scalar source text and updates YAML without quoting hex strings', () => {
        const input = [
            '# Trace settings',
            'ctrace:',
            '  register-values:',
            '    - pname: Core0',
            '      ITM:',
            '        TER: 0xFFFFFFFF',
            ''
        ].join('\n');
        const document = YamlDomDocument.parse(input, 'target.ctrace.yml');

        expect(document.hasErrors).toBe(false);
        expect(document.getKind(['ctrace'])).toBe('map');
        expect(document.getScalarSource(['ctrace', 'register-values', 0, 'ITM', 'TER'])).toBe('0xFFFFFFFF');

        document.set(['ctrace', 'register-values', 0, 'ITM', 'TPR'], '0x8');
        document.append(['ctrace', 'data'], {
            location: 'mySymbol',
            access: 'rw',
            pc: 'no'
        });

        const output = document.toString();
        expect(output).toContain('TER: 0xFFFFFFFF');
        expect(output).toContain('TPR: 0x8');
        expect(output).toContain('pc: no');
        expect(output).toContain('# Trace settings');
    });

    it('reports YAML diagnostics with file name and position', () => {
        const document = YamlDomDocument.parse('ctrace:\n- one\ntwo\n', 'bad.ctrace.yml');

        expect(document.hasErrors).toBe(true);
        expect(document.diagnostics[0]).toMatchObject({
            fileName: 'bad.ctrace.yml',
            line: 3,
            column: 1
        });
    });
});

describe('YamlDomFile', () => {
    it('reloads when the underlying file changes and saves the current document', async () => {
        const adapter = new MemoryTextFileAdapter('ctrace:\n  created-by: old\n');
        const file = new YamlDomFile('target.ctrace.yml', adapter);

        const loaded = await file.load();
        expect(loaded.getString(['ctrace', 'created-by'])).toBe('old');

        adapter.update('ctrace:\n  created-by: new\n');
        await expect(file.reloadIfChanged()).resolves.toBe(true);
        expect(file.document?.getString(['ctrace', 'created-by'])).toBe('new');

        file.document?.set(['ctrace', 'created-by'], 'saved');
        await file.save();
        expect(adapter.text).toContain('created-by: saved');
    });
});
