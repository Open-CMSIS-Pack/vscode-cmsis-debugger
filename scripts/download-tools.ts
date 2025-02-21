#!npx ts-node

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

import nodeOs from 'os';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { downloadFile } from './file-download';
import yargs from 'yargs';
import extractZip from 'extract-zip';
import { execSync } from 'child_process';

// OS/architecture pairs from vsce --publish
type VsceTarget = 'win32-x64' | 'win32-arm64' | 'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64';
const VSCE_TARGETS = ['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const;

type Repo = { repo: string };
type Owner = { owner: string };
type Token = { token: string };

type ToolOptions = { 
    token?: string,
    cache?: string,
    force?: boolean
};

const TOOLS = {
    'pyocd': downloadPyOCD,
};

const PACKAGE_JSON = path.resolve(__dirname, '../package.json');

function getVersionFromPackageJson(packageJsonPath: string, tool: keyof typeof TOOLS) {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson?.cmsis[tool] as string | undefined;
}

function splitGitReleaseVersion(releaseVersion: string, repoAndOwnerDefault: Repo & Owner) {
    if (releaseVersion.includes('@')) {
        const parts = releaseVersion.split('@');
        const version = parts[1];
        const repoAndOwner = parts[0].split('/');
        return { repoAndOwner: { owner: repoAndOwner[0], repo: repoAndOwner[1] }, version };
    }
    return { repoAndOwner: repoAndOwnerDefault, version: releaseVersion };
}


async function createOktokit(auth?: string) {
    const { Octokit } = await import('octokit');

    const { default: nodeFetch } = await import('node-fetch');
    return new Octokit({ auth, request: { fetch: nodeFetch } });
}

async function findGithubReleaseAsset(repo: Repo & Owner & Partial<Token>, version: string, asset_name: string) {
    const repoAndOwner = { owner: repo.owner, repo: repo.repo };
    const octokit = await createOktokit(repo.token);

    const releases = (await octokit.rest.repos.listReleases({ ...repoAndOwner })).data;
    const release = releases.find(r => r.tag_name === `v${version}` || r.tag_name === version);

    if (!release) {
        throw new Error(`Could not find release for version ${version}`);
    }

    const assets = (await octokit.rest.repos.listReleaseAssets({ ...repoAndOwner, release_id: release.id })).data;
    const asset = assets.find(a => a.name === asset_name);

    if (!asset) {
        throw new Error(`Could not find release asset for version ${version}`);
    }

    const asset_sha256 = assets.find(a => a.name === `${asset_name}.sha256`);

    return { asset, sha256: asset_sha256 };
}

async function retrieveSha256(url?: string, token?: string) {
    if (url) {
        const tempfile = await import('tempfile');
        const downloadFilePath = tempfile.default({ extension: '.sha256' });
        console.debug(`Downloading ${url} ...`);
        await downloadFile(url, downloadFilePath, token);
        const sha256 = readFileSync(downloadFilePath, { encoding: 'utf8' }).trim();
        rmSync(downloadFilePath, { force: true });
        return sha256;
    }
    return undefined;
}

async function download(url: string, options?: ToolOptions & { cache_key?: string }) {
    const cachePath = (options?.cache && options?.cache_key) ? path.join(options.cache, options.cache_key) : undefined;
    if (cachePath && existsSync(cachePath)) {
        console.debug(`Found asset in cache ${cachePath} ...`);
        return { mode: 'cache', path: cachePath};
    }

    const tempfile = await import('tempfile');
    const downloadFilePath = tempfile.default({ extension: '.zip' });
    console.debug(`Downloading ${url} ...`);
    await downloadFile(url, downloadFilePath, options?.token).catch(error => {
        throw new Error(`Failed to download ${url}`, { cause: error });
    });

    const extractPath = cachePath ?? downloadFilePath.replace('.zip', '');
    console.debug(`Extracting to ${extractPath} ...`);
    await extractZip(downloadFilePath, { dir: extractPath }).catch(error => {
        throw new Error(`Failed to extract ${url}`, { cause: error });
    });

    rmSync(downloadFilePath, { force: true });
    return { mode: cachePath ? 'cache' : 'temp', path: extractPath };
}

async function downloadPyOCD(target: VsceTarget, dest: string, options?: ToolOptions) {
    const repoAndOwnerDefault = { owner: 'MatthiasHertel80', repo: 'pyOCD' } as const;
    const jsonVersion = getVersionFromPackageJson(PACKAGE_JSON, 'pyocd');

    if (!jsonVersion) {
        throw new Error('PyOCD version not found in package.json');
    }

    console.log(`Looking up PyOCD version ${jsonVersion} (${target}) ...`);

    const { repoAndOwner, version } = splitGitReleaseVersion(jsonVersion, repoAndOwnerDefault);

    const githubToken = process.env.GITHUB_TOKEN;
    const destPath = path.join(dest, 'pyocd');
    const versionFilePath = path.join(destPath, 'version.txt');
    const targetFilePath = path.join(destPath, 'target.txt');
    const sha256FilePath = path.join(destPath, 'sha256.txt');

    const { os, arch } = {
        'win32-x64': { os: 'windows', arch: '' },
        'win32-arm64': { os: 'windows', arch: '' },
        'linux-x64': { os: 'linux', arch: '' },
        'linux-arm64': { os: 'linux', arch: '-arm64' },
        'darwin-x64': { os: 'macos', arch: '' },
        'darwin-arm64': { os: 'macos', arch: '' },
    }[target];

    const asset_name = `pyocd-${os}${arch}-${version}.zip`;
    console.debug(`Looking up GitHub release asset ${repoAndOwner.owner}/${repoAndOwner.repo}/${version}/${asset_name} ...`);
    const { asset, sha256 } = await findGithubReleaseAsset({ ...repoAndOwner, token: githubToken }, version, asset_name);
    const sha256sum = await retrieveSha256(sha256?.url, githubToken).catch(error => {
        console.warn(`Failed to retrieve sha256 sum: ${error}`);
        return undefined;
    });

    if (!options?.force && existsSync(versionFilePath) && existsSync(targetFilePath)) {
        const hasVersion = readFileSync(versionFilePath, { encoding: 'utf8' });
        const hasTarget = readFileSync(targetFilePath, { encoding: 'utf8' });
        const hasSha256Sum = existsSync(sha256FilePath) ? readFileSync(sha256FilePath, { encoding: 'utf8' }) : undefined;

        if (jsonVersion === hasVersion && target === hasTarget && ((sha256sum === undefined) || (sha256sum === hasSha256Sum))) {
            console.log(`PyOCD version ${jsonVersion} (${target}) already available.`);
            return;
        }
    }

    const dloptions = { 
        token: githubToken, 
        cache: options?.cache, 
        cache_key: sha256sum ? `cmsis-pyocd-${version}-${sha256sum}` : undefined
    };
    const { mode, path: extractPath } = await download(asset.url, dloptions);

    if (existsSync(destPath)) {
        console.debug(`Removing existing ${destPath} ...`);
        rmSync(destPath, { recursive: true, force: true });
    }

    console.debug(`Copying ${extractPath} to ${destPath} ...`);
    cpSync(extractPath, destPath, { recursive: true, force: true });

    if (mode === 'temp') {
        console.debug(`Removing temporary ${extractPath} ...`);
        rmSync(extractPath, { recursive: true, force: true });
    }

    writeFileSync(versionFilePath, jsonVersion, { encoding: 'utf8' });
    writeFileSync(targetFilePath, target, { encoding: 'utf8' });
    if (sha256sum) {
        writeFileSync(sha256FilePath, sha256sum, { encoding: 'utf8' });
    }
}

async function main() {
    // Get Yarn cache directory
    const yarnCacheDir = execSync('yarn cache dir').toString().trim();
    console.debug(`Yarn cache directory: ${yarnCacheDir}`);

    const { target, dest, cache, force, tools } = yargs
        .option('t', {
            alias: 'target',
            description: 'VS Code extension target, defaults to system',
            choices: VSCE_TARGETS,
            default: `${nodeOs.platform()}-${nodeOs.arch()}`
        })
        .option('d', {
            alias: 'dest',
            description: 'Destination directory for the tools',
            default: path.join(__dirname, '..', 'tools')
        })
        .option('c', {
            alias: 'cache',
            description: 'Directory for caching tool downloads',
            default: yarnCacheDir
        })
        .option('f', {
            alias: 'force',
            description: 'Force download of tools',
            type: 'boolean',
            default: false
        })
        .version(false)
        .strict()
        .command('$0 [<tools> ...]', 'Downloads the tool(s) for the given architecture and OS', y => {
            y.positional('tools', {
                description: 'Dependency to be fetched',
                choices: Object.keys(TOOLS),
                array: true,
                default: Object.keys(TOOLS)
            });
        })
        .argv as unknown as { target: VsceTarget, dest: string, cache: string | boolean, force: boolean, tools: (keyof typeof TOOLS)[] };

    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }

    const cacheFolder = (cache: string | boolean) => {
        if (typeof cache === 'string') {
            return cache;
        } else if(cache === true) {
            return yarnCacheDir;
        }
        return undefined;
    }

    for (const tool of new Set(tools)) {
        TOOLS[tool](target, dest, { cache: cacheFolder(cache), force });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
