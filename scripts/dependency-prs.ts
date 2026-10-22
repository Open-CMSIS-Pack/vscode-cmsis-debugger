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

/** Dependencies whose GitHub PR artifacts can replace nightly tools. */
const DEPENDENCY_TOOLS = ['pyocd', 'pyts', 'ctrace'] as const;
type DependencyTool = typeof DEPENDENCY_TOOLS[number];
type DependencyPullRequests = Partial<Record<DependencyTool, number>>;

/** Finds unique dependency PR links, using the release pins as the repository allowlist. */
export function findDependencyPullRequests(
    body: string,
    pins: Record<DependencyTool, string>,
    warn: (message: string) => void,
): DependencyPullRequests {
    const candidates = new Map<DependencyTool, Set<number>>();
    // GitHub renders owner/repo#number as a PR link without expanding the raw description.
    const expandedBody = body.replace(/(?<![\w./@-])([\w.-]+\/[\w.-]+)#([1-9]\d*)(?![\w-])/g,
        (_match: string, repository: string, number: string) => `https://github.com/${repository}/pull/${number}`);
    for (const [link] of expandedBody.matchAll(/https:\/\/[^\s<>()[\]`"']+/gi)) {
        let url: URL;
        try {
            url = new URL(link.replace(/[.,;:!]+$/, ''));
        } catch {
            continue;
        }
        if (url.origin !== 'https://github.com' || url.username || url.password) continue;
        const [, owner, repo, kind, number] = url.pathname.split('/');
        if (kind !== 'pull' || !/^[1-9]\d*$/.test(number)) continue;
        const repository = `${owner}/${repo}`;
        const tool = DEPENDENCY_TOOLS.find(tool => pins[tool].split('@')[0].toLowerCase() === repository.toLowerCase());
        if (!tool) continue;
        const pr = Number(number);
        if (!Number.isSafeInteger(pr)) throw new Error(`Invalid dependency PR number for ${tool}: ${number}`);
        const numbers = candidates.get(tool) ?? new Set<number>();
        numbers.add(pr);
        candidates.set(tool, numbers);
    }

    const selected: DependencyPullRequests = {};
    for (const [tool, numbers] of candidates) {
        if (numbers.size > 1) {
            warn(`Multiple dependency PRs linked for ${tool} (${[...numbers].map(number => `#${number}`).join(', ')}); ignoring these links and using nightly selection.`);
        } else {
            for (const number of numbers) selected[tool] = number;
        }
    }
    return selected;
}
