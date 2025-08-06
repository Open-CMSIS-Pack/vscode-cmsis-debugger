#!npx tsx

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

import fs from "fs";
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { parse, LockFileObject } from "@yarnpkg/lockfile";
import { PackageJson } from "type-fest";

class PackageFile {
    public content: PackageJson;

    constructor(filename: string) {
        const content = fs.readFileSync(filename, "utf8");
        this.content = JSON.parse(content);
    }

    get dependencies() {
        return this.content.dependencies;
    }
}

class YarnLock {
    public content: LockFileObject;

    constructor(filename: string) {
        const content = fs.readFileSync(filename, "utf8");
        const parsedLockfile = parse(content);

        if (parsedLockfile.type === "success") {
            this.content = parsedLockfile.object;
        } else {
            throw new Error(`Failed to parse ${filename} due to merge conflicts`);
        }
    }

}

async function main() {

    const { package: packageFile, lockfile } = yargs(hideBin(process.argv))
        .usage('Usage: $0 [options]')
        .option('package', {
            alias: 'p',
            description: 'Path to package.json',
            default: 'package.json',
            type: 'string',
        })
        .option('lockfile', {
            alias: 'l',
            description: 'Path to yarn.lock',
            default: 'yarn.lock',
            type: 'string',
        })
        .help('h')
        .version(false)
        .strict()
        .parseSync();
    
    const yarnLock = new YarnLock(lockfile);
    const packageJson = new PackageFile(packageFile);


    if (packageJson.dependencies) {
        console.log("Dependencies in package.json:");
        for (const [key, value] of Object.entries(packageJson.dependencies)) {
            console.log(`${key}: ${value}`);
        }    
    }

    console.log("\nDependencies in yarn.lock:");
    for (const [key, value] of Object.entries(yarnLock.content)) {
        console.log(`${key}: ${value.version}`);
    }

}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
