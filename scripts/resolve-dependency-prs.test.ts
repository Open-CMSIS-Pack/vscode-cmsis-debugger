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
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

/** Promise-based runner for the actual workflow script in an isolated Node process. */
const execFile = promisify(execFileCallback);
/** Absolute script path so fixtures can supply their own package.json working directory. */
const SCRIPT_PATH = path.resolve('scripts/resolve-dependency-prs.ts');
/** Absolute loader path so temporary workspaces do not need their own dependencies. */
const TSX_LOADER_URL = pathToFileURL(createRequire(path.resolve('package.json')).resolve('tsx')).href;
/** Release pins used as the dependency repository allowlist in workflow fixtures. */
const PINS = {
    pyocd: 'pyocd/pyOCD@0.46.0',
    pyts: 'Open-CMSIS-Pack/pyTS@1.0.0',
    ctrace: 'Open-CMSIS-Pack/devtools@1.0.0',
};

/** File inputs and environment for one isolated workflow invocation. */
interface WorkflowFixture {
    eventPath: string;
    outputPath: string;
    packagePath: string;
    run: (environment?: NodeJS.ProcessEnv) => Promise<{ stdout: string; stderr: string }>;
}

/** Supplies real GitHub event and output files and removes them after each scenario. */
async function withWorkflow(test: (fixture: WorkflowFixture) => Promise<void>): Promise<void> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dependency prs '));
    const eventPath = path.join(root, 'event.json');
    const outputPath = path.join(root, 'github-output');
    const packagePath = path.join(root, 'package.json');
    try {
        await fs.writeFile(eventPath, JSON.stringify({ pull_request: { body: '' } }));
        await fs.writeFile(outputPath, 'existing=value\n');
        await fs.writeFile(packagePath, JSON.stringify({ cmsis: PINS }));

        await test({
            eventPath,
            outputPath,
            packagePath,
            run: (environment = {}) => execFile(process.execPath, ['--import', TSX_LOADER_URL, SCRIPT_PATH], {
                cwd: root,
                env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath, ...environment },
            }),
        });
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

describe('resolve dependency PR links workflow script', () => {
    it('appends the PR channel and all selected dependency numbers to GitHub outputs', async () => {
        await withWorkflow(async ({ eventPath, outputPath, run }) => {
            const body = 'pyocd/pyOCD#12 Open-CMSIS-Pack/pyTS#34 Open-CMSIS-Pack/devtools#56';
            await fs.writeFile(eventPath, JSON.stringify({ pull_request: { body } }));

            const { stdout } = await run();

            expect(await fs.readFile(outputPath, 'utf8')).toBe('existing=value\nchannel=pr\npyocd=12\npyts=34\nctrace=56\n');
            expect(stdout).toContain('Tool channel: pr; dependency PRs: {"pyocd":12,"pyts":34,"ctrace":56}');
        });
    });

    it.each([{}, { body: null }, { body: '' }, { body: 'No dependency PRs.' }])(
        'selects nightly when the PR description contains no overrides: %p', async pullRequest => {
            await withWorkflow(async ({ eventPath, outputPath, run }) => {
                await fs.writeFile(eventPath, JSON.stringify({ pull_request: pullRequest }));

                const { stdout } = await run();

                expect(await fs.readFile(outputPath, 'utf8')).toBe('existing=value\nchannel=nightly\n');
                expect(stdout).toContain('Tool channel: nightly; dependency PRs: {}');
            });
        },
    );

    it.each([
        ['', 'channel=nightly\n'],
        [' Open-CMSIS-Pack/devtools#56', 'channel=pr\nctrace=56\n'],
    ])('emits a workflow warning for conflicting links and retains other overrides: %s', async (otherLink, outputs) => {
        await withWorkflow(async ({ eventPath, outputPath, run }) => {
            const body = `Open-CMSIS-Pack/pyTS#12 Open-CMSIS-Pack/pyTS#13${otherLink}`;
            await fs.writeFile(eventPath, JSON.stringify({ pull_request: { body } }));

            const { stdout } = await run();

            expect(await fs.readFile(outputPath, 'utf8')).toBe(`existing=value\n${outputs}`);
            expect(stdout).toContain('::warning::Multiple dependency PRs linked for pyts (#12, #13); ignoring these links and using nightly selection.');
        });
    });

    it('reads the dependency repository allowlist from the working directory package.json', async () => {
        await withWorkflow(async ({ eventPath, outputPath, packagePath, run }) => {
            await fs.writeFile(packagePath, JSON.stringify({ cmsis: { ...PINS, pyts: 'other/pyTS@2.0.0' } }));
            await fs.writeFile(eventPath, JSON.stringify({ pull_request: { body: 'other/pyTS#12 Open-CMSIS-Pack/pyTS#13' } }));

            await run();

            expect(await fs.readFile(outputPath, 'utf8')).toBe('existing=value\nchannel=pr\npyts=12\n');
        });
    });

    it.each(['GITHUB_EVENT_PATH', 'GITHUB_OUTPUT'])('fails clearly when %s is missing without writing outputs', async variable => {
        await withWorkflow(async ({ outputPath, run }) => {
            await expect(run({ [variable]: '' })).rejects.toThrow('GITHUB_EVENT_PATH and GITHUB_OUTPUT must be set');
            expect(await fs.readFile(outputPath, 'utf8')).toBe('existing=value\n');
        });
    });

    it('fails on invalid event JSON without writing outputs', async () => {
        await withWorkflow(async ({ eventPath, outputPath, run }) => {
            await fs.writeFile(eventPath, '{invalid');

            await expect(run()).rejects.toThrow();

            expect(await fs.readFile(outputPath, 'utf8')).toBe('existing=value\n');
        });
    });
});
