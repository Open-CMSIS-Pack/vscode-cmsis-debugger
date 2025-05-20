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

import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const execFileAsync = promisify(execFile);

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option("config", {
            alias: "c",
            type: "string",
            description: "Path to markdown-link-check config file"
        })
        .option("ignore", {
            alias: "i",
            type: "array",
            description: "Directories to ignore",
            default: ["node_modules/**"],
        })
        .help()
        .alias("help", "h")
        .parseSync();

    const { globby } = await import("globby");
    const ignorePatterns = (argv.ignore as string[]).map((pattern) => `!${pattern}`);
    const configPath = resolve(argv.config as string);
    const mdFiles = await globby(["**/*.md", ...ignorePatterns]);

    if (mdFiles.length === 0) {
        console.log("No markdown files found.");
        return;
    }

    console.log(`Checking ${mdFiles.length} markdown file(s)...`);
    for (const file of mdFiles) {
        try {
            const { stdout } = await execFileAsync(
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

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
