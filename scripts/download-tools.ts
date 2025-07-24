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

import { ArchiveFileAsset, Downloadable, Downloader, GitHubReleaseAsset, WebFileAsset  } from '@open-cmsis-pack/vsce-helper';
import { PackageJson } from 'type-fest';

type CmsisPackageJson = PackageJson & {
    cmsis: {
        pyocd?: string;
        gdb?: string;
    };                                                                                                                                                                                                                                                                                
};

function splitGitReleaseVersion(version: string, owner: string, repo: string) {
    if (version.includes('@')) {
        const parts = version.split('@');
        version = parts[1];
        const repoAndOwner = parts[0].split('/');
        repo = repoAndOwner[1]
        owner = repoAndOwner[0];
    }
    return { repo, owner, version };
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
        const { repo, owner, version } = splitGitReleaseVersion(reqVersion, 'pyocd', 'pyOCD');
        const releaseAsset = new GitHubReleaseAsset(
            owner, repo, version,
            `pyocd-${os}${arch}-${version}.zip`, 
            { token: process.env.GITHUB_TOKEN });
        const asset = new ArchiveFileAsset(releaseAsset);
        return asset;
    },
)

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
        const asset = new ArchiveFileAsset(dlAsset, strip);
        return asset;
    },
);

const downloader = new Downloader({ pyocd, gdb });

downloader
    .withCacheDir(await downloader.defaultCacheDir())
    .run();