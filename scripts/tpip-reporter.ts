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

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs";

async function main() {

    const { json, report, header } = yargs(hideBin(process.argv))
        .usage('Usage: $0 <json> <report> [--header <header>]')
        .options('header', {
            describe: 'Header to add to the report',
            type: 'string'
        })
        .command('$0 <json> <report>', '', y => {
            y.positional('json', {
                describe: 'JSON file to parse',
                type: 'string'
            });
            y.positional('report', {
                describe: 'Report file to generate',
                type: 'string'
            });
        })
        .help('h')
        .version(false)
        .strict()
        .parseSync();

    const tpipJson = JSON.parse(fs.readFileSync(json as string, "utf8"));
    
    var data: string = '';
    if (header && fs.existsSync(header as string)) {
        data += fs.readFileSync(header as string, "utf8");
    } else {
        data += "# TPIP Report\n\n";
    }

    data += '\n';
    data += `Report prepared at: ${new Date().toLocaleString('en-GB')}\n\n`;
    data += '| *Package* | *Version* | *Repository* | *License* |\n';
    data += '|---|---|---|---|\n';

    for(const value of tpipJson) {
        data += `| ${value.name} | ${value.version} | ${value.url} | ${value.license} |\n`;
    }

    fs.writeFileSync(report as string, data);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
