#!/usr/bin/env node

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

const allowedCommands = new Set(['package', 'publish']);
const command = process.argv[2] ?? 'package';

if (!allowedCommands.has(command)) {
  console.error(`Unsupported vsce command: ${command}`);
  console.error('Supported commands: package, publish');
  process.exit(1);
}

const passthroughArgs = process.argv.slice(3);
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
