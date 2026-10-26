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

import { Asset, Downloadable, Downloader, GitHubReleaseAsset, VSCE_TARGETS, WebFileAsset } from '@open-cmsis-pack/vsce-helper';
import { PackageJson } from 'type-fest';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ArchiveFileAssetEx, CTraceArchiveFileAsset, GDBArchiveFileAsset, PyTSArchiveFileAsset } from './tool-archives.js';
import { chooseAsset, WorkflowArchiveAsset } from './workflow-assets.js';

/** Tool identifiers accepted by the CLI and used as download directory names. */
const TOOLS = ['pyocd', 'gdb', 'pyts', 'ctrace'] as const;
type Tool = typeof TOOLS[number];
type GitHubTool = Exclude<Tool, 'gdb'>;
type CmsisPackageJson = PackageJson & { cmsis: Record<Tool, string> };

/** Upstream workflows supplying main-branch and dependency PR artifacts. */
const WORKFLOWS = {
    pyocd: { nightly: 'nightly.yaml', pr: 'nightly.yaml' },
    pyts: { nightly: 'ci.yml', pr: 'ci.yml' },
    ctrace: { nightly: 'nightly.yml', pr: 'ctrace.yml' },
};

/** Maps VSIX targets to upstream archive naming conventions. */
const PLATFORMS = {
    'win32-x64': { os: 'windows', arch: 'amd64', ext: 'zip' },
    'win32-arm64': { os: 'windows', arch: 'arm64', ext: 'zip' },
    'linux-x64': { os: 'linux', arch: 'amd64', ext: 'tar.gz' },
    'linux-arm64': { os: 'linux', arch: 'arm64', ext: 'tar.gz' },
    'darwin-arm64': { os: 'darwin', arch: 'arm64', ext: 'tar.gz' },
};

/** Channel, target and cache options, plus optional positional tool identifiers. */
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    channel: { type: 'string', default: 'release' },
    target: { type: 'string', short: 't', default: `${process.platform}-${process.arch}` },
    dest: { type: 'string', short: 'd', default: 'tools' },
    cache: { type: 'string', short: 'c' },
    force: { type: 'boolean', short: 'f', default: false },
    'no-cache': { type: 'boolean', default: false },
    'pyocd-pr': { type: 'string' }, 'pyts-pr': { type: 'string' }, 'ctrace-pr': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
} });

/** Parses an optional dependency PR override and rejects invalid numbers. */
function prNumber(tool: GitHubTool): number | undefined {
    const value = values[`${tool}-pr`];
    if (value === undefined) return undefined;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`--${tool}-pr requires a positive PR number`);
    return Number(value);
}

/** Selects the pinned release or a workflow artifact, with release fallback for missing nightly artifacts. */
async function source(tool: GitHubTool, releaseName: string, developmentName: string | RegExp): Promise<Asset> {
    const json = await downloader.getPackageJson<CmsisPackageJson>();
    const match = /^([^/]+)\/([^@]+)@(\d+\.\d+\.\d+)$/.exec(json?.cmsis[tool] ?? '');
    if (!match) throw new Error(`Expected a fixed release pin for ${tool}`);
    const [, owner, repo, version] = match;
    const tag = tool === 'ctrace' ? `tools/ctrace/${version}` : `v${version}`;
    const release = new GitHubReleaseAsset(owner, repo, new RegExp(`^(${tag.replaceAll('.', '\\.')})$`),
        releaseName.replace('{version}', version), process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {});
    if (values.channel === 'release') return release;
    const pr = prNumber(tool);
    const workflow = WORKFLOWS[tool][pr === undefined ? 'nightly' : 'pr'];
    const development = new WorkflowArchiveAsset(owner, repo, workflow, developmentName, pr);
    return chooseAsset(release, development, pr !== undefined);
}

/** Resolves the platform-specific pyOCD archive and prepares its executable. */
const pyocd: Downloadable = new Downloadable('pyOCD', 'pyocd', async target => {
    const { os, arch } = platform(target);
    const build = os === 'darwin' ? 'macos' : os === 'linux' && arch === 'arm64' ? 'linux-arm64' : os;
    return new ArchiveFileAssetEx(await source('pyocd', `pyocd-${build}-{version}.zip`,
        new RegExp(`^pyocd-${build}-\\d+\\.\\d+\\.\\d+[^/\\\\]*$`)), 0, os === 'windows' ? 'pyocd.exe' : 'pyocd');
});

/** Resolves pyTS archives, including workflow uploads with an outer ZIP wrapper. */
const pyts: Downloadable = new Downloadable('pyTS', 'pyts', async target => {
    const { os, arch, ext } = platform(target);
    return new PyTSArchiveFileAsset(await source('pyts', `pyTS-{version}-${os}-${arch}.${ext}`,
        new RegExp(`^pyTS-[^/\\\\]+-${os}-${arch}\\.${ext.replace('.', '\\.')}$`)), 0, os === 'windows' ? 'pyTS.exe' : 'pyTS');
});

/** Resolves ctrace archives and normalizes their executable and license layout. */
const ctrace: Downloadable = new Downloadable('ctrace', 'ctrace', async target => {
    const { os, arch } = platform(target);
    const name = `ctrace${os === 'windows' ? '.exe' : ''}`;
    return new CTraceArchiveFileAsset(await source('ctrace', 'ctrace.zip', `ctrace-${os}-${arch}`),
        path.join('bin', `${os}-${arch}`, name));
});

/** Downloads the pinned Arm GDB release for every channel. */
const gdb: Downloadable = new Downloadable('GNU Debugger for Arm', 'gdb', async target => {
    const { os, arch } = platform(target);
    const json = await downloader.getPackageJson<CmsisPackageJson>();
    const version = json?.cmsis.gdb;
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a fixed GDB release pin');
    const build = os === 'windows' ? 'mingw-w64-x86_64' : os === 'darwin' ? 'darwin-arm64' : arch === 'amd64' ? 'x86_64' : 'aarch64';
    const filename = `arm-gnu-toolchain-${build}-arm-none-eabi-gdb.${os === 'windows' ? 'zip' : 'tar.xz'}`;
    return new GDBArchiveFileAsset(new WebFileAsset(new URL(`https://artifacts.tools.arm.com/arm-none-eabi-gdb/${version}/${filename}`),
        filename, version), os === 'windows' ? 0 : 1);
});

/** Shared helper managing package pins, download caching and tool installation. */
const downloader = new Downloader({ pyocd, gdb, pyts, ctrace });

/** Returns upstream naming details for a supported VSIX target. */
function platform(target: string) {
    if (!(target in PLATFORMS)) throw new Error(`Unsupported target ${target}`);
    return PLATFORMS[target as keyof typeof PLATFORMS];
}

/** Validates CLI selections and downloads the requested tools into the packaging workspace. */
async function main(): Promise<void> {
    if (values.help) {
        console.log('download-tools [pyocd gdb pyts ctrace] [--channel release|nightly|pr] [--target <target>] [--<tool>-pr <number>] [--dest <dir>] [--force] [--cache <dir> | --no-cache]');
        return;
    }
    if (!['release', 'nightly', 'pr'].includes(values.channel)) throw new Error('--channel must be release, nightly or pr');
    
    const overrides = (['pyocd', 'pyts', 'ctrace'] as const).some(tool => values[`${tool}-pr`] !== undefined);
    for (const tool of ['pyocd', 'pyts', 'ctrace'] as const) prNumber(tool);
    if (values.channel === 'release' && overrides) throw new Error('Release channel rejects dependency PR overrides');
    if (values.channel === 'pr' && !overrides) throw new Error('PR channel requires at least one --<tool>-pr number');
    
    const target = VSCE_TARGETS.find(target => target === values.target);
    if (!target) throw new Error(`Unsupported target ${values.target}`);
    
    const selected = positionals.length ? positionals : TOOLS;
    if (selected.some(name => !TOOLS.some(tool => tool === name))) throw new Error(`Unknown tool; choose ${TOOLS.join(', ')}`);
    
    const cache = values['no-cache'] ? undefined : values.cache ?? await downloader.defaultCacheDir();
    downloader.withTargetDir(values.dest).withCacheDir(cache);
    
    await Promise.all(TOOLS.filter(tool => selected.includes(tool)).map(tool => downloader.download(tool, target, { force: values.force })));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
