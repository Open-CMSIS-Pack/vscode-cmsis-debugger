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

import { ITextFileSystem } from '@open-cmsis-pack/cmsis-common/text-file-system';

import { MemoryTextFileAdapter } from '../__test__/memory-text-file-adapter';
import { NodeTextFileAdapter, YamlDomFile } from './yaml-file';
import { YamlDomDocument } from './yaml-dom';

describe('YamlDomDocument', () => {
    it('creates nested maps and sequences and deletes paths safely', () => {
        const document = YamlDomDocument.create('ctrace');

        document.ensureSequence(['ctrace', 'setup']);
        document.set(['ctrace', 'setup', 0, 'pname'], 'cm33');
        document.set(['ctrace', 'setup', 0, 'data', 0, 'location'], 'watchSymbol');
        document.append(['ctrace', 'setup', 0, 'data'], {
            location: 'secondWatch',
            access: 'W'
        });

        expect(document.getKind()).toBe('map');
        expect(document.getKind(['ctrace', 'setup'])).toBe('sequence');
        expect(document.getString(['ctrace', 'setup', 0, 'pname'])).toBe('cm33');
        expect(document.getArray(['ctrace', 'setup', 0, 'data'])).toEqual([
            { location: 'watchSymbol' },
            { location: 'secondWatch', access: 'W' }
        ]);
        expect(document.delete(['ctrace', 'setup', 0, 'missing'])).toBe(false);
        expect(document.delete(['ctrace', 'setup', 0, 'data', 0, 'location'])).toBe(true);
        expect(document.getString(['ctrace', 'setup', 0, 'data', 0, 'location'])).toBeUndefined();
    });

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
    it('uses an injected text file system for node-backed reads and writes', async () => {
        const files = new Map<string, string>([['target.ctrace.yml', 'ctrace:\n']]);
        const fileSystem: ITextFileSystem = {
            exists: fileName => files.has(fileName),
            read: fileName => files.get(fileName) ?? '',
            write: (fileName, content) => files.set(fileName, content),
            unlink: fileName => {
                files.delete(fileName);
            },
            dirname: fileName => fileName.slice(0, fileName.lastIndexOf('/')),
            resolve: (...pathSegments) => pathSegments.join('/')
        };
        const adapter = new NodeTextFileAdapter(fileSystem);

        await expect(adapter.readTextFile('missing.ctrace.yml')).rejects.toMatchObject({
            code: 'ENOENT',
            path: 'missing.ctrace.yml'
        });
        await expect(adapter.readTextFile('target.ctrace.yml')).resolves.toBe('ctrace:\n');

        await adapter.writeTextFile('target.ctrace.yml', 'ctrace:\n  created-by: test\n');

        expect(files.get('target.ctrace.yml')).toBe('ctrace:\n  created-by: test\n');
    });

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

    it('tracks external file stamps and reloads from watchers', async () => {
        const adapter = new MemoryTextFileAdapter('ctrace:\n  created-by: initial\n');
        const file = new YamlDomFile('target.ctrace.yml', adapter);
        const onDidReload = jest.fn();

        await file.load();
        await expect(file.hasExternalFileChanged()).resolves.toBe(false);
        const watcher = file.watch(onDidReload);

        adapter.update('ctrace:\n  created-by: watched\n');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onDidReload).toHaveBeenCalledTimes(1);
        expect(file.document?.getString(['ctrace', 'created-by'])).toBe('watched');

        watcher.dispose();
        expect(adapter.listenerCount()).toBe(0);
    });
});
