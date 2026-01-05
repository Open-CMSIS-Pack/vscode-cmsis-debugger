#!/usr/bin/env npx tsx

/**
<<<<<<< HEAD
 * Copyright 2026 Arm Limited
=======
 * Copyright 2025 Arm Limited
>>>>>>> 16c42a8 (Validate downloaded dependencies)
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

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import extract from 'extract-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ValidationResult = {
    success: boolean;
    message: string;
};

type ToolManifest = {
    toolPattern: RegExp;    // Pattern to find the tool directory (e.g., gdb-*, pyocd)
    executablePath: string; // Path within the found directory
    requiredFiles: string[];
    requiredDirs: string[];
    versionCheck: {
        args: string[];
        expectedOutput: string;
        timeout: number;
    };
};

const TOOLS: Record<string, ToolManifest> = {
    gdb: {
        toolPattern: /^gdb(-\d+)?$/,  // Matches 'gdb' or 'gdb-<numbers>'
        executablePath: 'bin/arm-none-eabi-gdb',
        requiredFiles: [
            'bin/arm-none-eabi-gdb',
            'bin/arm-none-eabi-gdb-py',
        ],
        requiredDirs: [
            'bin',
            'share',
        ],
        versionCheck: {
            args: ['--version'],
            expectedOutput: 'GNU gdb',
            timeout: 5000,
        },
    },
    pyocd: {
        toolPattern: /^pyocd$/,
        executablePath: 'pyocd',
        requiredFiles: [
            'pyocd',
        ],
        requiredDirs: [
            '_internal',
        ],
        versionCheck: {
            args: ['--version'],
            expectedOutput: '0.',  // pyOCD outputs version like "0.42.0"
            timeout: 5000,
        },
    },
};

let targetPlatform: string = process.platform;
let validationBaseDir: string = __dirname;

/**
 * Find the tool directory in the tools folder based on a pattern.
 */
async function findToolDirectory(pattern: RegExp): Promise<string | undefined> {
    const toolsDir = path.join(validationBaseDir, 'tools');
    console.log(`  Looking for tools in: ${toolsDir}`);
    try {
        const entries = await fs.readdir(toolsDir, { withFileTypes: true });
        const match = entries.find(entry => entry.isDirectory() && pattern.test(entry.name));
        return match ? path.join(toolsDir, match.name) : undefined;
    } catch (error) {
        console.log(`  ⚠️ Error reading tools directory: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

function getExecutablePath(toolDir: string, execPath: string): string {
    const fullPath = path.join(toolDir, execPath);
    const isWindowsTarget = targetPlatform.startsWith('win32');
    return isWindowsTarget ? `${fullPath}.exe` : fullPath;
}

async function checkFileExists(filePath: string): Promise<ValidationResult> {
    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return {
                success: false,
                message: `❌ Path exists but is not a file: ${filePath}`,
            };
        }

        // On Unix host validating Unix target tools, check if file is executable
        const isHostUnix = process.platform !== 'win32';
        const isTargetUnix = !targetPlatform.startsWith('win32');
        if (isHostUnix && isTargetUnix) {
            try {
                await fs.access(filePath, fs.constants.X_OK);
            } catch {
                return {
                    success: false,
                    message: `❌ File exists but is not executable: ${filePath}`,
                };
            }
        }

        return {
            success: true,
            message: `✓ File exists: ${path.basename(filePath)}`,
        };
    } catch (error) {
        return {
            success: false,
            message: `❌ File not found: ${filePath}`,
        };
    }
}

async function checkDirExists(dirPath: string): Promise<ValidationResult> {
    try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
            return {
                success: false,
                message: `❌ Path exists but is not a directory: ${dirPath}`,
            };
        }
        return {
            success: true,
            message: `✓ Directory exists: ${path.basename(dirPath)}`,
        };
    } catch (error) {
        return {
            success: false,
            message: `❌ Directory not found: ${dirPath}`,
        };
    }
}

async function runVersionCheck(
    execPath: string,
    args: string[],
    expectedOutput: string,
    timeout: number
): Promise<ValidationResult> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let child;
        try {
            child = spawn(execPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout,
            });
        } catch (error: unknown) {
            resolve({
                success: false,
                message: `❌ Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
            });
            return;
        }

        const timer = setTimeout(() => {
            child.kill();
            resolve({
                success: false,
                message: `❌ Version check timed out after ${timeout}ms`,
            });
        }, timeout);
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            resolve({
                success: false,
                message: `❌ Failed to execute: ${error.message}`,
            });
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            
            const output = stdout + stderr;
            if (code !== 0) {
                resolve({
                    success: false,
                    message: `❌ Version check exited with code ${code}`,
                });
                return;
            }

            if (!output.toLowerCase().includes(expectedOutput.toLowerCase())) {
                resolve({
                    success: false,
                    message: `❌ Version check output does not contain "${expectedOutput}"`,
                });
                return;
            }

            // Extract version info from first line
            const firstLine = output.split('\n')[0].trim();
            resolve({
                success: true,
                message: `✓ Version check passed: ${firstLine}`,
            });
        });
    });
}

async function validateTool(name: string, manifest: ToolManifest): Promise<boolean> {
    console.log(`\nValidating ${name}...`);

    // First, find the tool directory
    const toolDir = await findToolDirectory(manifest.toolPattern);
    if (!toolDir) {
        console.log(`  ❌ Tool directory not found matching pattern: ${manifest.toolPattern}`);
        return false;
    }

    console.log(`  Found tool directory: ${path.basename(toolDir)}`);

    let allPassed = true;
    const results: ValidationResult[] = [];

    // Level 1: Check essential files
    console.log('  Level 1: Essential files');

    // Check required files
    for (const file of manifest.requiredFiles) {
        const filePath = getExecutablePath(toolDir, file);
        const result = await checkFileExists(filePath);
        results.push(result);
        console.log(`\t${result.message}`);
        if (!result.success) allPassed = false;
    }

    // Check required directories
    for (const dir of manifest.requiredDirs) {
        const dirPath = path.join(toolDir, dir);
        const result = await checkDirExists(dirPath);
        results.push(result);
        console.log(`\t${result.message}`);
        if (!result.success) allPassed = false;
    }

    // Level 2: Functional check (only if we can execute it)
    console.log('\n  Level 2: Functional check');

    // Map target platform to process.platform values
    const targetOs = targetPlatform.split('-')[0];
    const hostOs = process.platform;
    const targetArch = targetPlatform.split('-')[1];
    const hostArch = process.arch;
    
    // Check if we can execute the target binary on this host
    const platformMap: Record<string, string> = {
        'win32': 'win32',
        'linux': 'linux',
        'darwin': 'darwin'
    };

    const canExecute = platformMap[targetOs] === hostOs && targetArch === hostArch;

    if (!canExecute) {
        console.log(`\t⊘ Skipped (cannot execute ${targetPlatform} binaries on ${hostOs}-${hostArch})`);
    } else {
        const execPath = getExecutablePath(toolDir, manifest.executablePath);
        const versionResult = await runVersionCheck(
            execPath,
            manifest.versionCheck.args,
            manifest.versionCheck.expectedOutput,
            manifest.versionCheck.timeout
        );
        results.push(versionResult);
        console.log(`\t${versionResult.message}`);
        if (!versionResult.success) allPassed = false;
    }

    return allPassed;
}

async function main() {
    console.log('Tool Dependency Validation');
    console.log('═'.repeat(50));

    const args = process.argv.slice(2);
    const targetIndex = args.indexOf('--target');
    const target = targetIndex !== -1 && args[targetIndex + 1] 
        ? args[targetIndex + 1] 
        : `${process.platform}-${process.arch}`;

    // Check if we should validate a VSIX file
    const vsixIndex = args.indexOf('--vsix');
    const vsixPath = vsixIndex !== -1 && args[vsixIndex + 1] ? args[vsixIndex + 1] : null;

    let workDir = __dirname;
    let cleanupDir: string | null = null;

    if (vsixPath) {
        console.log(`VSIX file: ${vsixPath}`);
        console.log('Extracting VSIX...');

        // Create temp directory for extraction
        const tempDir = path.join(__dirname, '..', 'vsix-extracted-temp', 'extension');
        await fs.mkdir(tempDir, { recursive: true });

        // Extract VSIX (it's a ZIP file)
        await extract(vsixPath, { dir: tempDir });

        // VSIX structure: extension/ contains the actual extension files
        workDir = path.join(tempDir, 'extension');
        validationBaseDir = workDir;
        cleanupDir = tempDir;

        console.log(`Extraction complete in ${tempDir}`);
    }

    // Set global target platform for use in other functions
    targetPlatform = target;
    let allToolsPassed = true;

    for (const [name, manifest] of Object.entries(TOOLS)) {
        const passed = await validateTool(name, manifest);
        if (!passed) {
            allToolsPassed = false;
        }
    }

    console.log('\n' + '═'.repeat(50));
    if (allToolsPassed) {
        console.log('✅ All tools validated successfully');

        // Cleanup extracted VSIX if needed
        if (cleanupDir) {
            await fs.rm(cleanupDir, { recursive: true, force: true });
        }

        process.exit(0);
    } else {
        console.log('❌ Tool validation failed');

        // Cleanup extracted VSIX if needed
        if (cleanupDir) {
            await fs.rm(cleanupDir, { recursive: true, force: true });
        }

        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
