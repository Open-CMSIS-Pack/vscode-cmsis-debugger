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

import { Asset, GitHubWorkflowAsset } from '@open-cmsis-pack/vsce-helper';
import path from 'node:path';

/** Signals that no matching workflow artifact exists, allowing nightly release fallback. */
export class MissingWorkflowArtifactError extends Error {}

/** Selects main or PR runs; downloading and caching stay in vsce-helper. */
export class WorkflowArchiveAsset extends GitHubWorkflowAsset {
    /** Configures a workflow artifact for main or an explicitly selected dependency PR. */
    public constructor(owner: string, repo: string, workflow: string, artifactName: string | RegExp,
        private readonly pullRequest?: number) {
        super(owner, repo, workflow, artifactName,
            process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {});
    }

    /** Finds the latest successful matching run with an available artifact from its current attempt. */
    protected override async findLastWorkflowRunArtifact() {
        const octokit = await this.getOctokit();
        const pr = this.pullRequest === undefined ? undefined :
            (await octokit.rest.pulls.get({ ...this.repoAndOwner, pull_number: this.pullRequest })).data;
        if (pr && pr.state !== 'open') throw new Error(`Dependency PR #${pr.number} is not open`);
        // Filter locally, as the helper does, to avoid stale filtered Actions API results.
        const { data } = await octokit.rest.actions.listWorkflowRuns({
            ...this.repoAndOwner, workflow_id: this.workflow, per_page: 100,
        });
        const runs = data.workflow_runs.filter(run => {
            if (run.conclusion !== 'success') return false;
            if (!pr) return run.head_branch === 'main' && !run.event.startsWith('pull_request');
            const associated = run.pull_requests?.some(p => p.number === pr.number && p.head.sha === pr.head.sha);
            const dispatched = run.event === 'workflow_dispatch' && run.head_sha === pr.head.sha &&
                run.head_repository.full_name === pr.head.repo.full_name;
            return (run.event === 'pull_request' && associated) || dispatched;
        }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
        for (const run of runs) {
            const { data: { artifacts } } = await octokit.rest.actions.listWorkflowRunArtifacts({
                ...this.repoAndOwner, run_id: run.id, per_page: 100,
            });
            const artifact = artifacts.find(a => !a.expired &&
                (typeof this.artifactName === 'string' ? a.name === this.artifactName : this.artifactName.test(a.name)) &&
                (!a.expires_at || Date.parse(a.expires_at) > Date.now()) &&
                (!run.run_started_at || (a.created_at !== null && Date.parse(a.created_at) >= Date.parse(run.run_started_at))));
            if (artifact) return { run, artifact };
        }
        throw new MissingWorkflowArtifactError(`No successful ${this.owner}/${this.repo}/${this.workflow} run with ${String(this.artifactName)} artifacts for ${pr ? `PR #${pr.number} at ${pr.head.sha}` : 'main'}`);
    }

    /** Identifies the selected workflow run, attempt and artifact. */
    public override get version(): Promise<string> {
        return this.lastWorkflowRunArtifact.then(({ run, artifact }) =>
            `${this.workflow}@${run.id}/${run.run_attempt ?? 1}/${artifact.id}`);
    }

    /** Namespaces the selected artifact identity by its upstream repository. */
    public override get cacheId(): Promise<string> {
        return this.version.then(version => `${this.owner}/${this.repo}/${version}`);
    }

    /** Downloads the artifact as an archive file for the shared extraction wrappers. */
    public override async copyTo(dest?: string): Promise<string> {
        const { artifact } = await this.lastWorkflowRunArtifact;
        const directory = await this.mkDest(dest);
        // Keep uploads as files so the same ArchiveFileAsset wrappers handle every channel.
        const extension = artifact.name.endsWith('.tar.gz') ? '.tar.gz' : '.zip';
        return this.downloadArtifact(artifact.id, path.join(directory, `artifact${extension}`));
    }
}

/** Prefers workflow artifacts; only missing nightly artifacts fall back to the pinned release. */
export async function chooseAsset(release: Asset, development: WorkflowArchiveAsset, explicitPr: boolean): Promise<Asset> {
    try {
        console.log(`Using ${await development.version}`);
        return development;
    } catch (error) {
        await development.dispose();
        if (explicitPr || !(error instanceof MissingWorkflowArtifactError)) throw error;
        console.log(`${error.message}; using pinned release`);
        return release;
    }
}
