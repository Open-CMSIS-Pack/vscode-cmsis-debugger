/**
 * Copyright 2025-2026 Arm Limited
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

import { Asset, ArchiveFileAsset, WebFileAsset } from '@open-cmsis-pack/vsce-helper';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { WorkflowArchiveAsset } from './workflow-assets.js';

/** Promise-based process runner used for system tar extraction. */
const execFile = promisify(execFileCallback);

/** Extracts Arm GDB archives and removes documentation incompatible with VSIX ZIP entries. */
export class GDBArchiveFileAsset extends ArchiveFileAsset {
    /** Uses system tar for XZ archives, with the helper extractor as a fallback. */
    protected async extractArchive(archiveFile: string, dest?: string, options: { strip?: number; force?: boolean } = {}): Promise<string> {
        if (!archiveFile.toLowerCase().endsWith('.tar.xz')) {
            return super.extractArchive(archiveFile, dest, options);
        }

        const effDest = await this.mkDest(dest);
        const strip = options.strip ?? this.strip;
        const args = ['-xJf', archiveFile, '-C', effDest];
        if (strip > 0) {
            args.push(`--strip-components=${strip}`);
        }

        try {
            // Some GNU Arm tarballs include large numeric headers the JS tar parser rejects.
            await execFile('tar', args);
            return effDest;
        } catch {
            console.warn('System tar extraction failed, falling back to built-in archive extractor.');
            return super.extractArchive(archiveFile, effDest, options);
        }
    }

    /** Extracts GDB and removes documentation containing case-only duplicate names. */
    public async copyTo(dest?: string) {
        dest = await super.copyTo(dest);
        // Remove doc directory as it contains duplicate files (names differ only in case)
        // which are not supported by ZIP (VSIX) archives.
        await fs.rm(path.join(dest, 'share', 'doc'), { recursive: true, force: true });
        return dest;
    }
}

/** Normalizes workflow archive formats, internal symlinks and executable permissions. */
export class ArchiveFileAssetEx extends ArchiveFileAsset {
    /** Wraps an archive with optional path stripping and executable permission restoration. */
    public constructor(subject: Asset, strip?: number, private readonly executablePath?: string) {
        super(subject, strip);
    }

    /** Extracts files, materializes symlinks and restores the configured executable mode. */
    public async copyTo(dest?: string): Promise<string> {
        dest = await super.copyTo(dest);
        await this.normalizeSymlinks(dest);
        if (this.executablePath) await fs.chmod(path.join(dest, this.executablePath), 0o755);
        return dest;
    }

    /** Detects ZIP uploads whose artifact names suggest a different archive format. */
    protected override async extractArchive(archiveFile: string, dest?: string, options: { strip?: number; force?: boolean } = {}): Promise<string> {
        // Workflow uploads can be raw tarballs or ZIP-wrapped tarballs with the same name.
        const handle = await fs.open(archiveFile, 'r');
        const signature = Buffer.alloc(4);
        try { await handle.read(signature, 0, signature.length, 0); } finally { await handle.close(); }
        if (signature.readUInt32LE(0) !== 0x04034b50 || archiveFile.endsWith('.zip')) {
            return super.extractArchive(archiveFile, dest, options);
        }
        const alias = `${archiveFile}.zip`;
        await fs.link(archiveFile, alias);
        try { return await super.extractArchive(alias, dest, options); }
        finally { await fs.rm(alias, { force: true }); }
    }

    /** Starts symlink normalization with a canonical archive root and cycle tracking. */
    private async normalizeSymlinks(rootPath: string): Promise<void> {
        console.log(`Normalizing symlinks in directory: ${rootPath}`);
        const resolvedRootPath = await fs.realpath(rootPath);
        await this.normalizeDirectory(resolvedRootPath, resolvedRootPath, new Set<string>());
    }

    /** Walks extracted directories and replaces symlinks while rejecting unsupported entries. */
    private async normalizeDirectory(
        directoryPath: string,
        rootPath: string,
        activeDirectoryPaths: Set<string>
    ): Promise<void> {

        const resolvedDirectoryPath = await fs.realpath(directoryPath);
        this.assertNoDirectoryCycle(resolvedDirectoryPath, activeDirectoryPaths);
        activeDirectoryPaths.add(resolvedDirectoryPath);

        try {
            const entries = await fs.readdir(directoryPath);
            for (const entry of entries) {
                const entryPath = path.join(directoryPath, entry);
                const entryStats = await fs.lstat(entryPath);

                if (entryStats.isSymbolicLink()) {
                    await this.materializeSymlink(entryPath, entryPath, rootPath, activeDirectoryPaths);
                } else if (entryStats.isDirectory()) {
                    await this.normalizeDirectory(entryPath, rootPath, activeDirectoryPaths);
                } else if (!entryStats.isFile()) {
                    throw new Error(`Unsupported filesystem entry in downloaded archive: ${entryPath}`);
                }
            }
        } finally {
            activeDirectoryPaths.delete(resolvedDirectoryPath);
        }
    }

    /** Replaces an internal symlink with a hard-linked file or materialized directory. */
    private async materializeSymlink(
        symlinkPath: string,
        destinationPath: string,
        rootPath: string,
        activeDirectoryPaths: Set<string>
    ): Promise<void> {

        const targetPath = await this.resolveSymlinkTarget(symlinkPath, rootPath);
        const targetStats = await fs.stat(targetPath);

        if (symlinkPath === destinationPath) {
            await fs.unlink(symlinkPath);
        }

        if (targetStats.isFile()) {
            await this.createHardLink(targetPath, destinationPath);
        } else if (targetStats.isDirectory()) {
            await this.materializeDirectory(targetPath, destinationPath, rootPath, activeDirectoryPaths);
        } else {
            throw new Error(`Unsupported symbolic link target in downloaded archive: ${symlinkPath} -> ${targetPath}`);
        }
    }

    /** Copies a linked directory using hard links while preserving modes and detecting cycles. */
    private async materializeDirectory(
        sourcePath: string,
        destinationPath: string,
        rootPath: string,
        activeDirectoryPaths: Set<string>
    ): Promise<void> {

        const resolvedSourcePath = await fs.realpath(sourcePath);
        this.assertNoDirectoryCycle(resolvedSourcePath, activeDirectoryPaths);
        activeDirectoryPaths.add(resolvedSourcePath);

        try {
            const sourceStats = await fs.stat(resolvedSourcePath);
            await fs.mkdir(destinationPath, { mode: sourceStats.mode & 0o7777 });

            const entries = await fs.readdir(resolvedSourcePath);
            for (const entry of entries) {
                const sourceEntryPath = path.join(resolvedSourcePath, entry);
                const destinationEntryPath = path.join(destinationPath, entry);
                const entryStats = await fs.lstat(sourceEntryPath);

                if (entryStats.isSymbolicLink()) {
                    await this.materializeSymlink(
                        sourceEntryPath,
                        destinationEntryPath,
                        rootPath,
                        activeDirectoryPaths
                    );
                } else if (entryStats.isDirectory()) {
                    await this.materializeDirectory(
                        sourceEntryPath,
                        destinationEntryPath,
                        rootPath,
                        activeDirectoryPaths
                    );
                } else if (entryStats.isFile()) {
                    await this.createHardLink(sourceEntryPath, destinationEntryPath);
                } else {
                    throw new Error(`Unsupported filesystem entry in symbolic link target: ${sourceEntryPath}`);
                }
            }

            await fs.chmod(destinationPath, sourceStats.mode & 0o7777);
        } finally {
            activeDirectoryPaths.delete(resolvedSourcePath);
        }
    }

    /** Resolves a symlink and rejects targets outside the extracted archive. */
    private async resolveSymlinkTarget(symlinkPath: string, rootPath: string): Promise<string> {

        let targetPath: string;
        try {
            targetPath = await fs.realpath(symlinkPath);
        } catch (error) {
            throw new Error(`Failed to resolve symbolic link in downloaded archive: ${symlinkPath}`, { cause: error });
        }

        const relativeTargetPath = path.relative(rootPath, targetPath);
        const isOutsideRoot = relativeTargetPath === '..' ||
            relativeTargetPath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativeTargetPath);
        if (isOutsideRoot) {
            throw new Error(`Symbolic link target is outside the downloaded archive: ${symlinkPath} -> ${targetPath}`);
        }

        return targetPath;
    }

    /** Rejects directories already being traversed through the current symlink chain. */
    private assertNoDirectoryCycle(directoryPath: string, activeDirectoryPaths: Set<string>): void {
        if (activeDirectoryPaths.has(directoryPath)) {
            throw new Error(`Symbolic link directory cycle detected in downloaded archive: ${directoryPath}`);
        }
    }

    /** Creates a hard link with source and destination context on failure. */
    private async createHardLink(sourcePath: string, destinationPath: string): Promise<void> {
        try {
            await fs.link(sourcePath, destinationPath);
        } catch (error) {
            throw new Error(`Failed to create hard link ${destinationPath} -> ${sourcePath}`, { cause: error });
        }
    }
}

/** Supports both raw pyTS archives and workflow ZIP uploads containing a single archive. */
export class PyTSArchiveFileAsset extends ArchiveFileAssetEx {
    /** Unwraps a nested pyTS archive when the upload contains exactly that one file. */
    protected override async extractArchive(archiveFile: string, dest?: string, options: { strip?: number; force?: boolean } = {}): Promise<string> {
        const directory = await super.extractArchive(archiveFile, dest, options);
        const entries = await fs.readdir(directory);
        if (entries.length === 1 && /^pyTS-[^/\\]+\.(tar\.gz|zip)$/.test(entries[0])) {
            const inner = path.join(directory, entries[0]);
            await super.extractArchive(inner, directory);
            await fs.rm(inner);
        }
        return directory;
    }
}

/** Required ctrace license files and their source repositories or pinned submodules. */
const CTRACE_LICENSES = [
    { repository: 'Open-CMSIS-Pack/devtools', path: 'LICENSE', destination: 'LICENSE.txt', submodule: '' },
    { repository: 'Open-CMSIS-Pack/devtools', path: 'tools/ctrace/docs/THIRD_PARTY_NOTICES.md', destination: 'THIRD_PARTY_NOTICES.md', submodule: '' },
    { repository: 'Open-CMSIS-Pack/devtools', path: 'tools/ctrace/docs/OpenCSD-NOTICE.txt', destination: 'THIRD_PARTY_LICENSES/OpenCSD-NOTICE.txt', submodule: '' },
    { repository: 'jarro2783/cxxopts', path: 'LICENSE', destination: 'THIRD_PARTY_LICENSES/cxxopts.txt', submodule: 'cxxopts' },
    { repository: 'jbeder/yaml-cpp', path: 'LICENSE', destination: 'THIRD_PARTY_LICENSES/yaml-cpp.txt', submodule: 'yaml-cpp' },
    { repository: 'Linaro/OpenCSD', path: 'LICENSE', destination: 'THIRD_PARTY_LICENSES/OpenCSD.txt', submodule: 'OpenCSD' },
];

/** Adds source-matched license files to ctrace workflow artifacts. */
export class CTraceWorkflowAsset extends WorkflowArchiveAsset {
    /** Fetches licenses at the selected run's commit and its recorded submodule commits. */
    public async copyLicenses(destination: string): Promise<void> {
        const { run } = await this.lastWorkflowRunArtifact;
        const octokit = await this.getOctokit();
        for (const license of CTRACE_LICENSES) {
            let ref = run.head_sha;
            if (license.submodule) {
                const { data } = await octokit.rest.repos.getContent({ ...this.repoAndOwner,
                    path: `external/${license.submodule}`, ref });
                if (Array.isArray(data) || !('submodule_git_url' in data) ||
                    data.submodule_git_url?.replace(/\.git$/, '') !== `https://github.com/${license.repository}`) {
                    throw new Error(`Unexpected ctrace license submodule ${license.submodule}`);
                }
                ref = data.sha;
            }
            const asset = new WebFileAsset(new URL(`https://raw.githubusercontent.com/${license.repository}/${ref}/${license.path}`),
                path.basename(license.destination), ref);
            try { await asset.copyTo(path.join(destination, path.dirname(license.destination))); }
            finally { await asset.dispose(); }
        }
    }
}

/** Produces a common ctrace executable and license layout for releases and workflow builds. */
export class CTraceArchiveFileAsset extends ArchiveFileAssetEx {
    /** Records the executable location within the multi-platform release archive. */
    public constructor(subject: Asset, private readonly releaseExecutablePath: string) { super(subject); }

    /** Adds workflow licenses or flattens the release layout, then marks ctrace executable. */
    public override async copyTo(dest?: string): Promise<string> {
        const directory = await super.copyTo(dest);
        if (this.subject instanceof CTraceWorkflowAsset) {
            await this.subject.copyLicenses(directory);
        } else {
            await fs.rename(path.join(directory, this.releaseExecutablePath), path.join(directory, path.basename(this.releaseExecutablePath)));
            await fs.rm(path.join(directory, 'bin'), { recursive: true, force: true });
        }
        await fs.chmod(path.join(directory, path.basename(this.releaseExecutablePath)), 0o755);
        return directory;
    }
}
