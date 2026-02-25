#!/usr/bin/env node

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

// generated with AI

/**
 * CLI usage:
 * - Preferred: npm run package
 * - With extra vsce flags: npm run package -- <vsce-args>
 * - Direct invocation: node ./scripts/vsce-release.js [package] [vsce-args]
 *
 * Notes:
 * - This helper only supports the `package` command.
 * - `--pre-release` is appended automatically for odd minor versions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootPath, 'package.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
if (!match) {
  console.error(`Unsupported package.json version format: ${version}`);
  process.exit(1);
}

const minor = Number(match[2]);
const isPreReleaseChannel = minor % 2 === 1;

const allowedCommands = new Set(['package']);
const firstArg = process.argv[2];
const command = firstArg && !firstArg.startsWith('-') ? firstArg : 'package';

if (!allowedCommands.has(command)) {
  console.error(`Unsupported vsce command: ${command}`);
  console.error('Supported commands: package');
  process.exit(1);
}

const passthroughArgs = command === firstArg ? process.argv.slice(3) : process.argv.slice(2);
const args = [command, ...passthroughArgs];

if (isPreReleaseChannel) {
  args.push('--pre-release');
}

console.log(`Running: vsce ${args.join(' ')}`);

const result = spawnSync('vsce', args, {
  cwd: rootPath,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
