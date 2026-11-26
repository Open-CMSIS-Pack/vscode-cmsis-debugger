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

import { spawn } from 'child_process';
import { GDBBackend } from 'cdt-gdb-adapter/dist/gdb/GDBBackend';
import { GDBError } from 'cdt-gdb-adapter/dist/gdb/errors';
import { childProcessFactory } from '../../__test__/child-process.factory';
import { CdtGdbSymbolSession } from './cdt-gdb-symbol-session';

jest.mock('cdt-gdb-adapter/dist/gdb/GDBBackend');
jest.mock('child_process');

describe('CdtGdbSymbolSession', () => {
    let session: CdtGdbSymbolSession;
    let backend: jest.MockedObjectDeep<GDBBackend>;

    beforeEach(() => {
        session = new CdtGdbSymbolSession('/tools/gdb');
        backend = jest.mocked(jest.mocked(GDBBackend).mock.instances.at(-1)!);
        backend.standardEscape.mockImplementation(value => JSON.stringify(value));
        backend.sendCommand.mockResolvedValue({ value: '0x001AbC' });
    });

    afterEach(async () => {
        await session.dispose();
    });

    it('spawns an offline synchronous interpreter', async () => {
        await session.start();
        expect(backend.spawn).toHaveBeenCalledWith({ gdbAsync: false, gdbNonStop: false });
    });

    it('starts a shell-free process with initialization, downloads and execution disabled', async () => {
        const child = childProcessFactory();
        jest.mocked(spawn).mockReturnValueOnce(child);
        const manager = jest.mocked(GDBBackend).mock.calls.at(-1)?.[0];
        expect(manager).toBeDefined();
        const process = await manager!.start({});
        expect(process.getPID()).toBe(child.pid);
        expect(spawn).toHaveBeenCalledWith('/tools/gdb', [
            '--nx', '--quiet', '--interpreter=mi2',
            '-iex', 'set auto-load off',
            '-iex', 'set debuginfod enabled off',
            '-iex', 'set may-call-functions off',
            '-iex', 'set auto-connect-native-target off',
            '-iex', 'set history save off',
            '-iex', 'set pagination off',
            '-iex', 'set confirm off',
            '-iex', 'set print symbol off'
        ], expect.objectContaining({ windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }));
        await session.dispose();
        expect(child.signals).toEqual(['SIGTERM']);
        await expect(manager!.start({})).rejects.toThrow('disposed');
    });

    it('loads only symbols with complete-set replacement and section relocation for every image', async () => {
        await session.loadImages([
            { path: '/build/first file.axf', offset: 0x1000n },
            { path: '/build/second.elf', offset: -32n }
        ]);
        const commands = backend.sendCommand.mock.calls.map(([command]) => command);
        expect(commands).toEqual([
            '-interpreter-exec console "symbol-file"',
            `-interpreter-exec console ${JSON.stringify('symbol-file -o 0x1000 "/build/first file.axf"')}`,
            `-interpreter-exec console ${JSON.stringify('add-symbol-file -o -0x20 "/build/second.elf"')}`
        ]);
        expect(backend.sendFileExecAndSymbols).not.toHaveBeenCalled();
        expect(backend.sendAddSymbolFile).not.toHaveBeenCalled();
    });

    it('normalizes complete hexadecimal results and preserves zero', async () => {
        await expect(session.resolveSymbol('object.items[2].value')).resolves.toBe('0x1abc');
        expect(backend.sendCommand).toHaveBeenCalledWith('-data-evaluate-expression "(void *)&(object.items[2].value)"');
        backend.sendCommand.mockResolvedValueOnce({ value: '0x0' });
        await expect(session.resolveSymbol('zero')).resolves.toBe('0x0');
    });

    it.each(['1234', '0x12 junk', '0x12 <symbol>', '', undefined, 1234])('does not accept ambiguous address output %s', async value => {
        backend.sendCommand.mockResolvedValueOnce({ value });
        await expect(session.resolveSymbol('main')).resolves.toBeUndefined();
    });

    it('treats symbol errors as misses while propagating transport failures', async () => {
        backend.sendCommand.mockRejectedValueOnce(new GDBError(new Error('No symbol')));
        await expect(session.resolveSymbol('unknown')).resolves.toBeUndefined();
        backend.sendCommand.mockRejectedValueOnce(new Error('pipe closed'));
        await expect(session.resolveSymbol('main')).rejects.toThrow('pipe closed');
    });

    it('refuses commands disguised as expressions and rejects operations after disposal', async () => {
        await expect(session.resolveSymbol('main()')).resolves.toBeUndefined();
        await expect(session.resolveSymbol('a\n.b')).resolves.toBeUndefined();
        expect(backend.sendCommand).not.toHaveBeenCalled();
        await expect(session.loadImages([{ path: '/file\nquit' }])).rejects.toThrow('Invalid symbol image path');
        await session.dispose();
        await expect(session.start()).rejects.toThrow('disposed');
        await expect(session.resolveSymbol('main')).rejects.toThrow('disposed');
    });
});
