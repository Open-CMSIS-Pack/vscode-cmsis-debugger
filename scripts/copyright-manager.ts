#!npx tsx

/**
 * Copyright 2026 Arm Limited
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

import fs from 'fs-extra';
import * as glob from 'glob';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const mode = args.mode || 'check';
const includeGlobs: string[] = args.include ? args.include.split(',') : ['src/**/*.ts', 'scripts/**/*.ts'];
const excludeGlobs: string[] = args.exclude ? args.exclude.split(',') : ['**/node_modules/**,coverage/**,dist/**,tools/**'];

const COPYRIGHT_TEXT = `/**
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
 */`;

// Regular expression to match the copyright notice
const COPYRIGHT_REGEX = /\/\*\*\n \* Copyright 20\d{2}(?:-(?:20\d{2}))? Arm Limited[\s\S]*?\*\//;


function getFiles(): string[] {
    const allFiles: string[] = [];
    for (const pattern of includeGlobs) {
        try {
            const matchedFiles = glob.sync(pattern, {
                ignore: excludeGlobs,
                absolute: true,
                cwd: process.cwd(),
            });
            allFiles.push(...matchedFiles);
        } catch (err) {
            console.error(`Error processing pattern "${pattern}":`, err);
        }
    }
    return allFiles;
}

function hasCopyrightNotice(content: string): boolean {
    return COPYRIGHT_REGEX.test(content);
}

function checkFiles(files: string[]) {
    const violations = files.filter(file => {
        const content = fs.readFileSync(file, 'utf-8');
        return !hasCopyrightNotice(content);
    });

    if (violations.length > 0) {
        console.error('error: Missing copyright notice:');
        violations.forEach(f => console.error(` - ${f}`));
        process.exit(1);
    } else {
        console.log('All files are compliant.');
    }
}

function fixFiles(files: string[]) {
    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        if (!hasCopyrightNotice(content)) {
            const newContent = `${COPYRIGHT_TEXT}\n\n${content}`;
            fs.writeFileSync(file, newContent, 'utf-8');
            console.log(`Fixed: ${file}`);
        }
    });
    console.log('Fix completed.');
}

function main() {
    const files = getFiles();
    if (mode === 'fix') {
        fixFiles(files);
    } else {
        checkFiles(files);
    }
}

main();
