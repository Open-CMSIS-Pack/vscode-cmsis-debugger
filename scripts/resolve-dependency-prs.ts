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

import { findDependencyPullRequests } from './dependency-prs.js';

/** Relevant fields of the GitHub pull request event supplied by the workflow. */
interface PullRequestEvent {
    pull_request: {
        body?: string | null;
    };
}

/** Package configuration containing the repository allowlist used by the PR parser. */
interface DependencyPackageJson {
    cmsis: Parameters<typeof findDependencyPullRequests>[1];
}

/** Reads workflow inputs and appends the selected tool channel and dependency PRs to GitHub outputs. */
async function main(): Promise<void> {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!eventPath || !outputPath) {
        throw new Error('GITHUB_EVENT_PATH and GITHUB_OUTPUT must be set');
    }

    const event: PullRequestEvent = JSON.parse(await fs.readFile(eventPath, 'utf8'));
    const { cmsis }: DependencyPackageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const prs = findDependencyPullRequests(event.pull_request.body ?? '', cmsis,
        message => console.log(`::warning::${message}`));
    const channel = Object.keys(prs).length > 0 ? 'pr' : 'nightly';
    console.log(`Tool channel: ${channel}; dependency PRs: ${JSON.stringify(prs)}`);

    const outputs = Object.entries({ channel, ...prs }).map(([key, value]) => `${key}=${value}\n`).join('');
    await fs.appendFile(outputPath, outputs);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
