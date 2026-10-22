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

import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

/** Promise-based runner for isolated ESM test processes. */
const execFile = promisify(execFileCallback);
/** Module URLs loaded by the child process without mocking the helper implementation. */
const MODULE_URL = pathToFileURL(path.resolve('scripts/workflow-assets.ts')).href;
const ARCHIVE_URL = pathToFileURL(path.resolve('scripts/tool-archives.ts')).href;
/** Stable commit shared by matching workflow runs and the dependency PR fixture. */
const HEAD = 'a'.repeat(40);

interface RunFixture {
    id: number;
    created_at: string;
    run_started_at: string;
    run_attempt: number;
    head_branch: string;
    head_sha: string;
    conclusion: string;
    event: string;
    head_repository: { full_name: string };
    pull_requests: { number: number; head: { sha: string } }[];
}
interface ArtifactFixture {
    id: number;
    name: string;
    expired: boolean;
    created_at: string;
    expires_at: string;
}
interface Fixture {
    runs: RunFixture[];
    artifacts: Record<number, ArtifactFixture[]>;
    prNumber?: number;
    prState?: string;
    fallback?: boolean;
    apiError?: boolean;
    licenses?: boolean;
    badSubmodule?: boolean;
}
interface Result { version?: string; cache?: string; error?: string; release?: boolean; licenses?: string[] }

/** Exercises the actual ESM helper subclass in a fresh process with fixture-backed GitHub APIs. */
async function resolve(fixture: Fixture): Promise<Result> {
    const driver = `
        const { WorkflowArchiveAsset, chooseAsset } = await import(${JSON.stringify(MODULE_URL)});
        const { CTraceWorkflowAsset } = await import(${JSON.stringify(ARCHIVE_URL)});
        const fixture = JSON.parse(process.argv[1]);
        console.log = () => {};
        class FixtureAsset extends (fixture.licenses ? CTraceWorkflowAsset : WorkflowArchiveAsset) {
            async getOctokit() {
                return { rest: {
                    pulls: { get: async () => ({ data: { number: 12, state: fixture.prState ?? 'open',
                        head: { sha: '${HEAD}', repo: { full_name: 'fork/repo' } } } }) },
                    actions: {
                        listWorkflowRuns: async () => {
                            if (fixture.apiError) throw new Error('HTTP 403');
                            return { data: { workflow_runs: fixture.runs } };
                        },
                        listWorkflowRunArtifacts: async ({ run_id }) => ({ data: { artifacts: fixture.artifacts[run_id] ?? [] } })
                    },
                    repos: { getContent: async ({ path }) => ({ data: { sha: '${'b'.repeat(40)}',
                        submodule_git_url: 'https://github.com/' + (fixture.badSubmodule ? 'unexpected/repo' :
                            ({ cxxopts: 'jarro2783/cxxopts', 'yaml-cpp': 'jbeder/yaml-cpp', OpenCSD: 'Linaro/OpenCSD' }[path.split('/').at(-1)])) + '.git' } }) }
                } };
            }
        }
        const asset = new FixtureAsset('org', 'repo', 'ci.yml', 'tool-linux-x64', fixture.prNumber);
        try {
            if (fixture.licenses) {
                const { WebFileAsset } = await import('@open-cmsis-pack/vsce-helper');
                const urls = [];
                const original = WebFileAsset.prototype.copyTo;
                WebFileAsset.prototype.copyTo = async function () { urls.push(this.url.toString()); return '/fixture'; };
                try { await asset.copyLicenses('/fixture'); }
                finally { WebFileAsset.prototype.copyTo = original; }
                process.stdout.write(JSON.stringify({ licenses: urls }));
            } else {
                const selected = fixture.fallback ? await chooseAsset({ release: true }, asset, fixture.prNumber !== undefined) : asset;
                process.stdout.write(JSON.stringify(selected.release ? { release: true } :
                    { version: await selected.version, cache: await selected.cacheId }));
            }
        } catch (error) { process.stdout.write(JSON.stringify({ error: error.message })); }
        finally { await asset.dispose(); }
    `;
    const result = await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', driver, JSON.stringify(fixture)]);
    return JSON.parse(result.stdout) as Result;
}
/** Builds a successful main-branch run with optional scenario-specific overrides. */
function run(id: number, overrides: Partial<RunFixture> = {}): RunFixture {
    return { id, created_at: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`,
        run_started_at: '2026-10-01T00:00:00Z', run_attempt: 1, head_branch: 'main', head_sha: HEAD,
        conclusion: 'success', event: 'push', head_repository: { full_name: 'org/repo' }, pull_requests: [], ...overrides };
}
/** Builds an available platform artifact with optional scenario-specific overrides. */
function artifact(id: number, overrides: Partial<ArtifactFixture> = {}): ArtifactFixture {
    return { id, name: 'tool-linux-x64', expired: false, created_at: '2026-10-02T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', ...overrides };
}

describe('helper workflow asset selection', () => {
    it('uses the newest successful main artifact without comparing its source with a release', async () => {
        const result = await resolve({ runs: [run(1), run(4, { conclusion: 'failure' }), run(3, { head_branch: 'feature' }), run(2)],
            artifacts: { 1: [artifact(10)], 2: [artifact(20)] } });
        expect(result.version).toBe('ci.yml@2/1/20');
    });
    it.each(['pull_request', 'pull_request_target'])('does not select a %s run whose branch is named main for nightly', async event => {
        const result = await resolve({ runs: [run(2, { event }), run(1)], artifacts: { 1: [artifact(10)], 2: [artifact(20)] } });
        expect(result.version).toBe('ci.yml@1/1/10');
    });
    it.each([
        { expired: true }, { expires_at: '2000-01-01T00:00:00Z' }, { name: 'wrong-platform' }, { created_at: '2026-09-01T00:00:00Z' },
    ])('skips unavailable or wrong artifacts: %p', async invalid => {
        const result = await resolve({ runs: [run(2), run(1)], artifacts: { 1: [artifact(10)], 2: [artifact(20, invalid)] } });
        expect(result.version).toBe('ci.yml@1/1/10');
    });
    it('matches a PR number and its current head, including merge checkouts', async () => {
        const result = await resolve({ prNumber: 12, runs: [
            run(4, { event: 'pull_request', pull_requests: [{ number: 99, head: { sha: HEAD } }] }),
            run(3, { event: 'pull_request', pull_requests: [{ number: 12, head: { sha: 'stale' } }] }),
            run(2, { event: 'pull_request', head_sha: 'merge-sha', pull_requests: [{ number: 12, head: { sha: HEAD } }] }),
        ], artifacts: { 2: [artifact(20)], 3: [artifact(30)], 4: [artifact(40)] } });
        expect(result.version).toBe('ci.yml@2/1/20');
    });
    it('accepts an explicitly dispatched PR-head build in the matching source repository', async () => {
        const result = await resolve({ prNumber: 12, runs: [run(3, { event: 'workflow_dispatch' }),
            run(2, { event: 'workflow_dispatch', head_repository: { full_name: 'fork/repo' } })], artifacts: { 2: [artifact(20)], 3: [artifact(30)] } });
        expect(result.version).toBe('ci.yml@2/1/20');
    });
    it('rejects closed PRs', async () => {
        expect((await resolve({ prNumber: 12, prState: 'closed', runs: [], artifacts: {} })).error).toContain('not open');
    });
    it('falls back only for missing nightly artifacts', async () => {
        expect(await resolve({ runs: [], artifacts: {}, fallback: true })).toEqual({ release: true });
        expect((await resolve({ runs: [], artifacts: {}, fallback: true, apiError: true })).error).toBe('HTTP 403');
        expect((await resolve({ runs: [], artifacts: {}, fallback: true, prNumber: 12 })).error).toContain('PR #12');
    });
    it('includes attempt and artifact ID in version and cache identity', async () => {
        const result = await resolve({ runs: [run(2, { run_attempt: 3 })], artifacts: { 2: [artifact(23)] } });
        expect(result).toEqual({ version: 'ci.yml@2/3/23', cache: 'org/repo/ci.yml@2/3/23' });
    });
    it('copies ctrace license references from the selected run and pinned submodules', async () => {
        const result = await resolve({ runs: [run(2)], artifacts: { 2: [artifact(20)] }, licenses: true });
        expect(result.licenses).toHaveLength(6);
        expect(result.licenses?.slice(0, 3).every(url => url.includes(HEAD))).toBe(true);
        expect(result.licenses?.slice(3).every(url => url.includes('b'.repeat(40)))).toBe(true);
    });
    it('rejects a changed ctrace submodule repository', async () => {
        const result = await resolve({ runs: [run(2)], artifacts: { 2: [artifact(20)] }, licenses: true, badSubmodule: true });
        expect(result.error).toContain('Unexpected ctrace license submodule');
    });
});

describe('tool channel CLI', () => {
    it.each([
        ['--channel', 'invalid'], ['--channel', 'release', '--pyts-pr', '12'],
        ['--channel', 'pr'], ['--channel', 'pr', '--pyts-pr', '-1'], ['--channel', 'pr', '--pyts-pr', '0'],
    ])('rejects invalid selection without downloads: %p', async (...args) => {
        await expect(execFile(process.execPath, ['--import', 'tsx', 'scripts/download-tools.ts', ...args])).rejects.toThrow();
    });
});
