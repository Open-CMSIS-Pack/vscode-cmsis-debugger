#!npx tsx

/**
 * Copyright 2025 Arm Limited
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

import { execFile as execFileCallback } from "child_process";
import { readFile as readFileCallback } from "fs";
import { resolve } from "path";
import { promisify } from "util";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const execFile = promisify(execFileCallback);
const readFile = promisify(readFileCallback);


async function getChangedFiles(): Promise<string[]> {
    const changedFiles = new Set<string>();

    const unstaged = await execFile("git", [
        "diff",
        "--name-only",
        "--diff-filter=ACMR"
    ]);
    unstaged.stdout
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => changedFiles.add(f));

    const staged = await execFile("git", [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "--cached"
    ]);
    staged.stdout
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => changedFiles.add(f));

    // Explicitly include newly added files from the index.
    const stagedAdded = await execFile("git", [
        "diff",
        "--name-only",
        "--diff-filter=A",
        "--cached"
    ]);
    stagedAdded.stdout
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => changedFiles.add(f));

    return Array.from(changedFiles);
}

async function checkForInsecureUrls(files: string[]): Promise<void> {
    const insecurePattern = /http:\/\//;

    for (const file of files) {
        try {
            const content = await readFile(file, "utf8");

            // Skip likely binary files.
            if (content.includes("\0")) {
                continue;
            }

            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (!insecurePattern.test(lines[i])) {
                    continue;
                }

                console.error(`Insecure URL found in ${file}:${i + 1}`);
                console.error(`  ${lines[i].trim()}`);
                process.exitCode = 1;
            }
        } catch {
            // Ignore unreadable/non-text files.
        }
    }
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option("config", {
            alias: "c",
            type: "string",
            description: "Path to markdown-link-check config file",
            default: ".github/markdown-link-check.jsonc",
        })
        .option("ignore", {
            alias: "i",
            type: "array",
            description: "Directories to ignore",
            default: ["node_modules/**"],
        })
        .option("checkHttp", {
            type: "boolean",
            description: "Scan changed files for insecure http URLs",
            default: true,
        })
        .help()
        .alias("help", "h")
        .parseSync();

    const { globby } = await import("globby");
    const ignorePatterns = (argv.ignore as string[]).map((pattern) => `!${pattern}`);
    const configPath = resolve(argv.config);
    const mdFiles = await globby(["**/*.md", ...ignorePatterns]);

    if (mdFiles.length === 0) {
        console.log("No markdown files found.");
    } else {
        console.log(`Checking ${mdFiles.length} markdown file(s)...`);
        for (const file of mdFiles) {
            try {
                const { stdout } = await execFile(
                    "npx", ["markdown-link-check", "-v", "-c", configPath, file], { shell: true }
                );
                console.log(stdout);
            } catch (err: any) {
                console.error(`Error in file: ${file}`);
                console.error(err.stdout || err.message);
                process.exitCode = 1;
            }
        }
    }

    if (argv.checkHttp) {
        const changedFiles = await getChangedFiles();

        if (changedFiles.length === 0) {
            console.log("No changed files found for insecure URL check.");
            return;
        }

        console.log(`Checking ${changedFiles.length} changed file(s) for insecure URLs...`);
        await checkForInsecureUrls(changedFiles);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
