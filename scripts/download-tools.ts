#!/usr/bin/env npx tsx

/**
 * Copyright 2025 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ArchiveFileAsset, Downloadable, Downloader, GitHubReleaseAsset, GitHubWorkflowAsset, WebFileAsset  } from '@open-cmsis-pack/vsce-helper';
import { PackageJson } from 'type-fest';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

type CmsisPackageJson = PackageJson & {
    cmsis: {
        pyocd?: string;
        pyocdNightly?: string;
        gdb?: string;
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
        const assetPattern = (`pyocd-${os}${arch}-*`);
        const asset = new GitHubWorkflowAsset(
            owner, repo, `${reference}.yaml`,
            assetPattern, 
            { token: process.env.GITHUB_TOKEN });
        return asset;
    },
)

class GDBArchiveFileAsset extends ArchiveFileAsset {
    public async copyTo(dest?: string) {
        dest = await super.copyTo(dest);
        // Remove doc directory as it contains duplicate files (names differ only in case)
        // which are not supported by ZIP (VSIX) archives
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

// If no arguments are provided to the downloader script, all assets are downloaded
// in the order they are listed. In that case, 'pyocd' will overwrite 'pyocdNightly'.
const downloader = new Downloader({
    pyocdNightly,
    pyocd,
    gdb
});

downloader
    .withCacheDir(await downloader.defaultCacheDir())
    .run();