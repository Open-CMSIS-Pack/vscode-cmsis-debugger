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

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

/** Promise-based runner for archive utilities and isolated ESM test processes. */
const execFile = promisify(execFileCallback);
/** Archive module loaded by the child process to exercise the actual helper wrappers. */
const MODULE_URL = pathToFileURL(path.resolve('scripts/tool-archives.ts')).href;

/** Extracts a fixture through the pyTS wrapper without running any bundled executable. */
async function extract(archive: string, destination: string, artifactName: string): Promise<void> {
    // Load the actual ESM helper in Node; no dependency executable is run by these tests.
    await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
        `const { PyTSArchiveFileAsset } = await import(${JSON.stringify(MODULE_URL)}); const subject = { version: undefined, cacheId: undefined, withCacheDir() { return this; }, dispose() {}, async copyTo() { return process.argv[1]; } }; const asset = new PyTSArchiveFileAsset(subject); try { await asset.copyTo(process.argv[2]); } catch (error) { process.stderr.write(error.message + ': ' + (error.cause?.message ?? '')); process.exitCode = 1; } finally { await asset.dispose(); }`,
        archive, destination, artifactName]);
}
/** Creates a temporary executable and license fixture, then cleans up after the test. */
async function withArchive(test: (root: string, source: string) => Promise<void>): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-archive-'));
    const source = path.join(root, 'source');
    try {
        await fs.mkdir(source);
        await fs.writeFile(path.join(source, 'pyTS'), 'binary fixture');
        await fs.chmod(path.join(source, 'pyTS'), 0o755);
        await fs.mkdir(path.join(source, '_internal'));
        await fs.writeFile(path.join(source, '_internal', 'LICENSE'), 'license fixture');
        await test(root, source);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}
/** Packs the source fixture into a tarball matching upstream pyTS artifact names. */
async function tar(root: string, source: string): Promise<string> {
    const archive = path.join(root, 'pyTS-1.0.1.dev1-linux-amd64.tar.gz');
    await execFile('tar', ['-czf', archive, '-C', source, '.']);
    return archive;
}

/** Skips fixtures on Windows because they require POSIX modes, symlinks and tar/zip utilities. */
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('upstream executable archive formats', () => {
    it('extracts a raw archive:false tar upload and retains licenses and executable mode', async () => {
        await withArchive(async (root, source) => {
            const archive = await tar(root, source);
            const destination = path.join(root, 'dest');
            await extract(archive, destination, path.basename(archive));
            expect(await fs.readFile(path.join(destination, '_internal', 'LICENSE'), 'utf8')).toBe('license fixture');
            expect((await fs.stat(path.join(destination, 'pyTS'))).mode & 0o111).not.toBe(0);
        });
    });
    it('distinguishes a traditional outer ZIP from its named inner tar archive', async () => {
        await withArchive(async (root, source) => {
            const archive = await tar(root, source);
            const wrapped = path.join(root, 'wrapped.tar.gz');
            await execFile('zip', [wrapped, path.basename(archive)], { cwd: root });
            const destination = path.join(root, 'dest');
            await extract(wrapped, destination, path.basename(archive));
            expect(await fs.readFile(path.join(destination, 'pyTS'), 'utf8')).toBe('binary fixture');
            expect(await fs.readdir(destination)).not.toContain(path.basename(archive));
        });
    });
    it('handles a raw ZIP upload without inventing an extra extraction layer', async () => {
        await withArchive(async (root, source) => {
            const archive = path.join(root, 'raw.zip');
            await execFile('zip', ['-r', archive, '.'], { cwd: source });
            const destination = path.join(root, 'dest');
            await extract(archive, destination, 'pyTS-1.0.1-windows-amd64.zip');
            expect(await fs.readFile(path.join(destination, 'pyTS'), 'utf8')).toBe('binary fixture');
        });
    });
    it('materializes internal symlinks while retaining the target file', async () => {
        await withArchive(async (root, source) => {
            await fs.symlink('_internal/LICENSE', path.join(source, 'license-link'));
            const destination = path.join(root, 'dest');
            await extract(await tar(root, source), destination, 'irrelevant.tar.gz');
            expect((await fs.lstat(path.join(destination, 'license-link'))).isFile()).toBe(true);
            expect(await fs.readFile(path.join(destination, 'license-link'), 'utf8')).toBe('license fixture');
        });
    });
    it('rejects an escaping symlink without reading outside the archive', async () => {
        await withArchive(async (root, source) => {
            await fs.writeFile(path.join(root, 'outside'), 'outside');
            await fs.symlink('../outside', path.join(source, 'escape'));
            await expect(extract(await tar(root, source), path.join(root, 'dest'), 'archive.tar.gz')).rejects.toThrow(/escapes extraction directory|outside the downloaded archive/);
        });
    });
    it('rejects directory cycles instead of recursively materializing them', async () => {
        await withArchive(async (root, source) => {
            await fs.symlink('.', path.join(source, 'cycle'));
            await expect(extract(await tar(root, source), path.join(root, 'dest'), 'archive.tar.gz')).rejects.toThrow('cycle');
        });
    });
});
