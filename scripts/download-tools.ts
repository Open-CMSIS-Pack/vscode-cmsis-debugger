#!/usr/bin/env npx tsx

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

import { ArchiveFileAsset, Downloadable, Downloader, GitHubReleaseAsset, GitHubWorkflowAsset, WebFileAsset  } from '@open-cmsis-pack/vsce-helper';
import { PackageJson } from 'type-fest';
import process from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

type CmsisPackageJson = PackageJson & {
    cmsis: {
        pyocd?: string;
        pyocdNightly?: string;
        pyocdTrace?: string;
        gdb?: string;
        pyts?: string;
        ctrace?: string;
    };                                                                                                                                                                                                                                                                                
};

function splitGitReference(reference: string, owner: string, repo: string) {
    if (reference.includes('@')) {
        const parts = reference.split('@');
        reference = parts[1];
        const repoAndOwner = parts[0].split('/');
        repo = repoAndOwner[1]
        owner = repoAndOwner[0];
    }
    return { repo, owner, reference };
}

const pyocd : Downloadable = new Downloadable(
    'pyOCD', 'pyocd',
    async (target) => {
        const { os, arch } = {
            'win32-x64': { os: 'windows', arch: '' },
            'win32-arm64': { os: 'windows', arch: '' },
            'linux-x64': { os: 'linux', arch: '' },
            'linux-arm64': { os: 'linux', arch: '-arm64' },
            'darwin-x64': { os: 'macos', arch: '' },
            'darwin-arm64': { os: 'macos', arch: '' },
        }[target];
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const reqVersion = json?.cmsis?.pyocd;
        if (reqVersion === undefined) {
            console.warn('No pyOCD version specified in package.json');
            return undefined;
        }
        // Here, reference is expected to be a release asset version
        const { repo, owner, reference } = splitGitReference(reqVersion, 'pyocd', 'pyOCD');
        const releaseAsset = new GitHubReleaseAsset(
            owner, repo, reference,
            `pyocd-${os}${arch}-${reference}.zip`, 
            { token: process.env.GITHUB_TOKEN });
        const asset = new ArchiveFileAsset(releaseAsset);
        return asset;
    },
)


const pyocdNightly : Downloadable = new Downloadable(
    'pyOCD', 'pyocd',
    async (target) => {
        const { os, arch } = {
            'win32-x64': { os: 'windows', arch: '' },
            'win32-arm64': { os: 'windows', arch: '' },
            'linux-x64': { os: 'linux', arch: '' },
            'linux-arm64': { os: 'linux', arch: '-arm64' },
            'darwin-x64': { os: 'macos', arch: '' },
            'darwin-arm64': { os: 'macos', arch: '' },
        }[target];
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const workflow = json?.cmsis?.pyocdNightly;
        if (workflow === undefined) {
            console.warn('No pyOCD \'Nightly\' workflow specified in package.json (<repo>@<workflowname>)');
            return undefined;
        }
        // Here, reference is expected to be the name of the workflow yaml file without file ending
        const { repo, owner, reference } = splitGitReference(workflow, 'pyocd', 'pyOCD');
        const assetPattern = (`pyocd-${os}${arch}-\\d+\\.\\d+\\.\\d+.*`);
        const asset = new GitHubWorkflowAsset(
            owner, repo, `${reference}.yaml`,
            assetPattern, 
            { token: process.env.GITHUB_TOKEN });
        return asset;
    },
)

class BranchGitHubWorkflowAsset extends GitHubWorkflowAsset {
    private branchWorkflowRunPromise: Promise<Awaited<ReturnType<typeof this.findLatestWorkflowRun>>> | undefined;

    public constructor(
        owner: string,
        repo: string,
        workflow: string,
        artifactName: string | RegExp,
        private readonly branch: string,
        token?: string
    ) {
        super(owner, repo, workflow, artifactName, { token });
    }

    protected override get lastWorkflowRun() {
        this.branchWorkflowRunPromise ??= this.findLatestWorkflowRun();
        return this.branchWorkflowRunPromise;
    }

    private async findLatestWorkflowRun() {
        const octokit = await this.getOctokit();
        const response = await octokit.rest.actions.listWorkflowRuns({
            owner: this.owner,
            repo: this.repo,
            workflow_id: this.workflow,
            branch: this.branch,
            per_page: 100,
            status: 'success'
        });
        for (const run of response.data.workflow_runs) {
            const artifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
                owner: this.owner,
                repo: this.repo,
                run_id: run.id,
            });
            if (artifacts.data.artifacts.some(artifact => !artifact.expired && artifact.name.match(this.artifactName))) {
                return run;
            }
        }
        throw new Error(`No successful ${this.workflow} run on branch ${this.branch} has a non-expired ${this.artifactName} artifact.`);
    }
}

const pyocdTrace : Downloadable = new Downloadable(
    'pyOCD Trace', 'pyocd',
    async (target) => {
        const { os, arch } = {
            'win32-x64': { os: 'windows', arch: '' },
            'win32-arm64': { os: 'windows', arch: '' },
            'linux-x64': { os: 'linux', arch: '' },
            'linux-arm64': { os: 'linux', arch: '-arm64' },
            'darwin-x64': { os: 'macos', arch: '' },
            'darwin-arm64': { os: 'macos', arch: '' },
        }[target];
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const branch = json?.cmsis?.pyocdTrace;
        if (branch === undefined) {
            console.warn('No pyOCD Trace branch specified in package.json (<repo>@<branch>)');
            return undefined;
        }
        const { repo, owner, reference } = splitGitReference(branch, 'pyocd', 'pyOCD');
        const assetPattern = `pyocd-${os}${arch}-\\d+\\.\\d+\\.\\d+.*`;
        return new BranchGitHubWorkflowAsset(
            owner, repo, 'release_builds.yaml', assetPattern, reference, process.env.GITHUB_TOKEN
        );
    },
);

class GDBArchiveFileAsset extends ArchiveFileAsset {
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

    public async copyTo(dest?: string) {
        dest = await super.copyTo(dest);
        // Remove doc directory as it contains duplicate files (names differ only in case)
        // which are not supported by ZIP (VSIX) archives.
        await fs.rm(path.join(dest, 'share', 'doc'), { recursive: true, force: true });
        return dest;
    }
}

const gdb : Downloadable = new Downloadable(
    'GNU Debugger for Arm', 'gdb',
    async (target) => {
        const { build, ext, strip }  = {
            'win32-x64': { build: 'mingw-w64-x86_64', ext: 'zip', strip: 0 },
            'win32-arm64': { build: 'mingw-w64-x86_64', ext: 'zip', strip: 0 },
            'linux-x64': { build: 'x86_64', ext: 'tar.xz', strip: 1 },
            'linux-arm64': { build: 'aarch64', ext: 'tar.xz', strip: 1 },
            'darwin-x64': { build: 'darwin-arm64', ext: 'tar.xz', strip: 1 },
            'darwin-arm64': { build: 'darwin-arm64', ext: 'tar.xz', strip: 1 },
        }[target];
    
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const version = json?.cmsis?.gdb;
        const asset_name = `arm-gnu-toolchain-${build}-arm-none-eabi-gdb.${ext}`;
        const url = new URL(`https://artifacts.tools.arm.com/arm-none-eabi-gdb/${version}/${asset_name}`);
        const dlAsset = new WebFileAsset(url, asset_name, version);
        const asset = new GDBArchiveFileAsset(dlAsset, strip);
        return asset;
    },
);

const pyts : Downloadable = new Downloadable(
    'pyTS', 'pyts',
    async (target) => {
        const { os, arch, ext } = {
            'win32-x64': { os: 'windows', arch: 'amd64', ext: 'zip' },
            'win32-arm64': { os: 'windows', arch: 'arm64', ext: 'zip' },
            'linux-x64': { os: 'linux', arch: 'amd64', ext: 'tar.gz' },
            'linux-arm64': { os: 'linux', arch: 'arm64', ext: 'tar.gz' },
            'darwin-x64': { os: 'darwin', arch: 'amd64', ext: 'tar.gz' },
            'darwin-arm64': { os: 'darwin', arch: 'arm64', ext: 'tar.gz' },
        }[target];
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const reqVersion = json?.cmsis?.pyts;
        if (reqVersion === undefined) {
            console.warn('No pyTS version specified in package.json');
            return undefined;
        }
        const { repo, owner, reference } = splitGitReference(reqVersion, 'Open-CMSIS-Pack', 'pyTS');
        const releaseAsset = new GitHubReleaseAsset(
            owner, repo, reference,
            `pyTS-${reference}-${os}-${arch}.${ext}`,
            { token: process.env.GITHUB_TOKEN });
        return new ArchiveFileAsset(releaseAsset);
    },
);

class CTraceArchiveFileAsset extends ArchiveFileAsset {
    public constructor(subject: GitHubReleaseAsset, private readonly executablePath: string) {
        super(subject);
    }

    public async copyTo(dest?: string): Promise<string> {
        dest = await super.copyTo(dest);
        await fs.rename(path.join(dest, this.executablePath), path.join(dest, path.basename(this.executablePath)));
        await fs.rm(path.join(dest, 'bin'), { recursive: true, force: true });
        return dest;
    }
}

const ctrace : Downloadable = new Downloadable(
    'ctrace', 'ctrace',
    async (target) => {
        const platform = {
            'win32-x64': { directory: 'windows-amd64', ext: '.exe' },
            'win32-arm64': { directory: 'windows-arm64', ext: '.exe' },
            'linux-x64': { directory: 'linux-amd64', ext: '' },
            'linux-arm64': { directory: 'linux-arm64', ext: '' },
            'darwin-x64': undefined,
            'darwin-arm64': { directory: 'darwin-arm64', ext: '' },
        }[target];
        if (platform === undefined) {
            console.warn(`No ctrace release binary is available for target ${target}`);
            return undefined;
        }
        const json = await downloader.getPackageJson<CmsisPackageJson>();
        const reqVersion = json?.cmsis?.ctrace;
        if (reqVersion === undefined) {
            console.warn('No ctrace version specified in package.json');
            return undefined;
        }
        const { repo, owner, reference } = splitGitReference(reqVersion, 'Open-CMSIS-Pack', 'devtools');
        const releaseAsset = new GitHubReleaseAsset(
            owner, repo, `tools/ctrace/${reference}`,
            'ctrace.zip',
            { token: process.env.GITHUB_TOKEN });
        return new CTraceArchiveFileAsset(releaseAsset, path.join('bin', platform.directory, `ctrace${platform.ext}`));
    },
);

// If no arguments are provided to the downloader script, all assets are downloaded
// in the order they are listed. In that case, 'pyocd' will overwrite 'pyocdNightly'.
const downloader = new Downloader({
    pyocdTrace,
    pyocdNightly,
    pyocd,
    gdb,
    pyts,
    ctrace,
});

downloader
    .withCacheDir(await downloader.defaultCacheDir())
    .run();
