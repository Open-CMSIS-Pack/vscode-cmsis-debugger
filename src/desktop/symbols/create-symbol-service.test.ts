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
import * as vscode from 'vscode';
import { createSymbolService } from './create-symbol-service';
import { CdtGdbSymbolSession } from './cdt-gdb-symbol-session';
import { SymbolService } from '../../symbols/symbol-service';

jest.mock('./cdt-gdb-symbol-session');

/** An absolute build path also exercises literal glob characters in filenames. */
const BUILD_FILE = path.resolve('out/build[1].cbuild-run.yml');

/** Encodes a fresh build snapshot without accessing the host filesystem. */
function contents(metadata: string): Uint8Array {
    return new TextEncoder().encode(`cbuild-run:\n${metadata}`);
}

/** Delivers a change through the real FileWatchManager registration boundary. */
function changeWatch(index: number, file: string): void {
    const watcher = jest.mocked(vscode.workspace.createFileSystemWatcher).mock.results.at(index)?.value;
    if (!watcher) {
        throw new Error('Expected an owned file watcher.');
    }
    const callback = jest.mocked(watcher.onDidChange).mock.calls.at(0)?.[0];
    if (!callback) {
        throw new Error('Expected a change callback.');
    }
    callback(vscode.Uri.file(file));
}

describe('desktop symbol service composition', () => {
    let service: SymbolService;

    beforeEach(() => {
        service = createSymbolService({ gdbPath: '/tools/offline-gdb' });
        jest.spyOn(vscode.workspace.fs, 'stat').mockResolvedValue({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 });
        jest.mocked(CdtGdbSymbolSession.prototype.resolveSymbol).mockResolvedValue('0x1234');
    });

    afterEach(async () => {
        await service.dispose();
        jest.restoreAllMocks();
    });

    it('uses only topology processors and shares unqualified images', async () => {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(contents([
            '  debug-topology:',
            '    processors: [{pname: HP}, {pname: HE}]',
            '  system-resources:',
            '    processors: [{pname: HP}, {pname: HE}, {pname: UNUSED}]',
            '  output:',
            '    - {file: hp.axf, type: elf, pname: HP, load: symbols, load-offset: 4096}',
            '    - {file: shared.elf, type: elf}',
            '    - {file: ignored.elf, type: elf, load: image}'
        ].join('\n')));
        await service.setBuildFile(BUILD_FILE);
        expect(CdtGdbSymbolSession).not.toHaveBeenCalled();
        await expect(service.resolveSymbol('main')).resolves.toEqual([['HP', '0x1234'], ['HE', '0x1234']]);
        expect(CdtGdbSymbolSession).toHaveBeenCalledTimes(2);
        expect(CdtGdbSymbolSession).toHaveBeenCalledWith('/tools/offline-gdb');
        const workers = jest.mocked(CdtGdbSymbolSession).mock.instances;
        expect(workers.at(0)?.loadImages).toHaveBeenCalledWith([
            { path: path.resolve('out/hp.axf'), offset: 4096n },
            { path: path.resolve('out/shared.elf') }
        ]);
        expect(workers.at(1)?.loadImages).toHaveBeenCalledWith([{ path: path.resolve('out/shared.elf') }]);
    });

    it.each([
        ['  system-resources:\n    processors: [{pname: CORE}]', 'CORE'],
        ['  output: [{file: app.elf, type: elf, pname: IMAGE_CORE}]', 'IMAGE_CORE'],
        ['  output: [{file: app.elf, type: elf}]', undefined]
    ])('falls back to system metadata, image ownership or an unnamed single core', async (metadata, pname) => {
        const output = metadata.includes('output:') ? '' : '\n  output: [{file: app.elf, type: elf}]';
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(contents(metadata + output));
        await service.setBuildFile(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([[pname, '0x1234']]);
    });

    it('filters unrelated folder events and reloads the selected build file', async () => {
        const read = jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(contents('  output: [{file: app.elf, type: elf}]'));
        await service.setBuildFile(BUILD_FILE);
        expect(read).toHaveBeenCalledTimes(1);
        changeWatch(0, path.resolve('out/unrelated.yml'));
        await service.resolveSymbol('main');
        expect(read).toHaveBeenCalledTimes(1);
        read.mockResolvedValue(contents('  output: [{file: new.elf, type: elf, pname: NEW}]'));
        changeWatch(0, BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([['NEW', '0x1234']]);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('does not treat missing ELF images as loaded workers', async () => {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(contents('  output: [{file: missing.elf, type: elf}]'));
        jest.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('not found'));
        await service.setBuildFile(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([]);
        expect(CdtGdbSymbolSession).not.toHaveBeenCalled();
    });

    it.each([
        '  debug-topology: {processors: invalid}',
        '  system-resources: {processors: [{pname: 42}]}',
        '  output: [{file: app.elf, type: elf, load-offset: invalid}]',
        '  output: invalid'
    ])('returns no stale metadata for invalid build inputs', async metadata => {
        jest.spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(contents(metadata));
        await service.setBuildFile(BUILD_FILE);
        await expect(service.resolveSymbol('main')).resolves.toEqual([]);
        expect(CdtGdbSymbolSession).not.toHaveBeenCalled();
    });
});
