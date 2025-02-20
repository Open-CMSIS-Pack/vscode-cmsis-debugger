#!npx ts-node

/*
 * Copyright (C) 2025 Arm Limited
 */

import nodeOs from 'os';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { downloadFile } from './file-download';
import yargs from 'yargs';
import extractZip from 'extract-zip';

// OS/architecture pairs from vsce --publish
type VsceTarget = 'win32-x64' | 'win32-arm64' | 'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64';
const VSCE_TARGETS = ['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'] as const;

const TOOLS = {
    'pyocd': downloadPyOCD,
};

const PACKAGE_JSON = path.resolve(__dirname, '../package.json');

function getVersionFromPackageJson(packageJsonPath: string, tool: keyof typeof TOOLS) {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    const cmsisConfig = packageJson.cmsis;

    return `${cmsisConfig[tool]}`;
}

function getVersionCore(version: string) {
    return version.split('-')[0];
}

async function createOktokit(auth?: string) {
    const { Octokit } = await import('octokit');

    const { default: nodeFetch } = await import('node-fetch');
    return new Octokit({ auth, request: { fetch: nodeFetch } });
}

async function downloadPyOCD(target: VsceTarget, dest: string) {
    const repoAndOwner = { owner: 'MatthiasHertel80', repo: 'pyOCD' } as const;
    const githubToken = process.env.GITHUB_TOKEN;
    const destPath = path.join(dest, 'pyocd');
    const versionFilePath = path.join(destPath, 'version.txt');
    const targetFilePath = path.join(destPath, 'target.txt');

    const version = getVersionFromPackageJson(PACKAGE_JSON, 'pyocd');
    const { os, arch } = {
        'win32-x64': { os: 'windows', arch: '' },
        'win32-arm64': { os: 'windows', arch: '' },
        'linux-x64': { os: 'linux', arch: '' },
        'linux-arm64': { os: 'linux', arch: '-arm64' },
        'darwin-x64': { os: 'macos', arch: '' },
        'darwin-arm64': { os: 'macos', arch: '' },
    }[target];

    if (existsSync(versionFilePath) && existsSync(targetFilePath)) {
        const hasVersion = readFileSync(versionFilePath, { encoding: 'utf8' });
        const hasTarget = readFileSync(targetFilePath, { encoding: 'utf8' });
        if (version === hasVersion && target === hasTarget) {
            console.log(`PyOCD version ${version} (${target}) already available.`);
            return;
        }
    }

    console.log(`Downloading PyOCD version ${version} (${target}) ...`);

    const octokit = await createOktokit(githubToken);

    const releases = (await octokit.rest.repos.listReleases(repoAndOwner)).data;
    const release = releases.find(r => r.tag_name === `v${version}` || r.tag_name === version);

    if (!release) {
        throw new Error(`Could not find release for version ${version}`);
    }

    const assets = (await octokit.rest.repos.listReleaseAssets({ ...repoAndOwner, release_id: release.id })).data;
    const asset = assets.find(a => a.name === `pyocd-${os}${arch}-${getVersionCore(version)}.zip`);

    if (!asset) {
        throw new Error(`Could not find release asset for version ${version} and target ${target}`);
    }

    const tempfile = await import('tempfile');
    const downloadFilePath = tempfile.default({ extension: '.zip' });
    await downloadFile(asset.url, downloadFilePath, githubToken).catch(error => {
        throw new Error(`Failed to download PyOCD: ${error}`);
    });

    const extractPath = downloadFilePath.replace('.zip', '');
    await extractZip(downloadFilePath, { dir: extractPath }).catch(error => {
        throw new Error(`Failed to extract PyOCD: ${error}`);
    });

    rmSync(downloadFilePath, { force: true });

    if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true });
    }
    renameSync(extractPath, destPath);

    writeFileSync(versionFilePath, version, { encoding: 'utf8' });
    writeFileSync(targetFilePath, target, { encoding: 'utf8' });
}

async function main() {
    const { target, dest, tools } = yargs
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
        .argv as unknown as { target: VsceTarget, dest: string, tools: (keyof typeof TOOLS)[] };

    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }

    for (const tool of new Set(tools)) {
        TOOLS[tool](target, dest);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
