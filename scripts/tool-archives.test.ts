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
/** Workflow module used to supply a local ctrace workflow archive. */
const WORKFLOW_URL = pathToFileURL(path.resolve('scripts/workflow-assets.ts')).href;
/** License and notice files that ctrace archives must supply. */
const CTRACE_LICENSE_FILES = [
    'LICENSE.txt',
    'THIRD_PARTY_NOTICES.md',
    'THIRD_PARTY_LICENSES/cxxopts.txt',
    'THIRD_PARTY_LICENSES/yaml-cpp.txt',
    'THIRD_PARTY_LICENSES/OpenCSD.txt',
    'THIRD_PARTY_LICENSES/OpenCSD-NOTICE.txt',
];

/** Extracts a local fixture through the selected wrapper without network access or executing tools. */
async function extract(archive: string, destination: string, tool: 'pyts' | 'ctrace-release' | 'ctrace-workflow' = 'pyts'): Promise<void> {
    // Load the actual ESM helper in Node; no dependency executable is run by these tests.
    const driver = `
        const { PyTSArchiveFileAsset, CTraceArchiveFileAsset } = await import(${JSON.stringify(MODULE_URL)});
        const { WorkflowArchiveAsset } = await import(${JSON.stringify(WORKFLOW_URL)});
        class FixtureWorkflowAsset extends WorkflowArchiveAsset {
            /** Supplies a local archive in place of a workflow artifact download. */
            async copyTo() {
                return process.argv[1];
            }

            /** Rejects additional GitHub requests during archive installation. */
            async getOctokit() {
                throw new Error('Unexpected GitHub request');
            }
        }
        let subject = {
            version: undefined,
            cacheId: undefined,
            withCacheDir() {
                return this;
            },
            dispose() {},
            async copyTo() {
                return process.argv[1];
            }
        };
        if (process.argv[3] === 'ctrace-workflow') {
            subject = new FixtureWorkflowAsset('org', 'repo', 'ci.yml', 'ctrace-linux-amd64');
        }
        let asset;
        if (process.argv[3] === 'pyts') {
            asset = new PyTSArchiveFileAsset(subject);
        } else {
            asset = new CTraceArchiveFileAsset(subject, 'bin/linux-amd64/ctrace');
        }
        try {
            await asset.copyTo(process.argv[2]);
        } catch (error) {
            process.stderr.write(error.message + ': ' + (error.cause?.message ?? ''));
            process.exitCode = 1;
        } finally {
            await asset.dispose();
        }
    `;
    await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', driver, archive, destination, tool]);
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
            await extract(archive, destination);
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
            await extract(wrapped, destination);
            expect(await fs.readFile(path.join(destination, 'pyTS'), 'utf8')).toBe('binary fixture');
            expect(await fs.readdir(destination)).not.toContain(path.basename(archive));
        });
    });
    it('handles a raw ZIP upload without inventing an extra extraction layer', async () => {
        await withArchive(async (root, source) => {
            const archive = path.join(root, 'raw.zip');
            await execFile('zip', ['-r', archive, '.'], { cwd: source });
            const destination = path.join(root, 'dest');
            await extract(archive, destination);
            expect(await fs.readFile(path.join(destination, 'pyTS'), 'utf8')).toBe('binary fixture');
        });
    });
    it('materializes internal symlinks while retaining the target file', async () => {
        await withArchive(async (root, source) => {
            await fs.symlink('_internal/LICENSE', path.join(source, 'license-link'));
            const destination = path.join(root, 'dest');
            await extract(await tar(root, source), destination);
            expect((await fs.lstat(path.join(destination, 'license-link'))).isFile()).toBe(true);
            expect(await fs.readFile(path.join(destination, 'license-link'), 'utf8')).toBe('license fixture');
        });
    });
    it('rejects an escaping symlink without reading outside the archive', async () => {
        await withArchive(async (root, source) => {
            await fs.writeFile(path.join(root, 'outside'), 'outside');
            await fs.symlink('../outside', path.join(source, 'escape'));
            await expect(extract(await tar(root, source), path.join(root, 'dest'))).rejects.toThrow(/escapes extraction directory|outside the downloaded archive/);
        });
    });
    it('rejects directory cycles instead of recursively materializing them', async () => {
        await withArchive(async (root, source) => {
            await fs.symlink('.', path.join(source, 'cycle'));
            await expect(extract(await tar(root, source), path.join(root, 'dest'))).rejects.toThrow('cycle');
        });
    });
    it.each(['ctrace-release', 'ctrace-workflow'] as const)('preserves bundled ctrace licenses and executable mode for %s', async tool => {
        await withArchive(async (root, source) => {
            let executablePath = path.join(source, 'ctrace');
            if (tool === 'ctrace-release') {
                const binaryDirectory = path.join(source, 'bin', 'linux-amd64');
                await fs.mkdir(binaryDirectory, { recursive: true });
                executablePath = path.join(binaryDirectory, 'ctrace');
            }
            await fs.rename(path.join(source, 'pyTS'), executablePath);
            await fs.chmod(executablePath, 0o644);

            for (const file of CTRACE_LICENSE_FILES) {
                const licensePath = path.join(source, file);
                await fs.mkdir(path.dirname(licensePath), { recursive: true });
                await fs.writeFile(licensePath, `Bundled ${file}`);
            }

            const archive = path.join(root, 'ctrace.zip');
            await execFile('zip', ['-r', archive, '.'], { cwd: source });
            const destination = path.join(root, 'dest');
            await extract(archive, destination, tool);

            expect(await fs.readFile(path.join(destination, 'ctrace'), 'utf8')).toBe('binary fixture');
            expect((await fs.stat(path.join(destination, 'ctrace'))).mode & 0o111).not.toBe(0);
            expect(await fs.readdir(destination)).not.toContain('bin');
            for (const file of CTRACE_LICENSE_FILES) {
                expect(await fs.readFile(path.join(destination, file), 'utf8')).toBe(`Bundled ${file}`);
            }
        });
    });
});
