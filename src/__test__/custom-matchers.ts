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

import * as path from 'node:path';

function normalizeTestFsPath(fileName: string): string {
    const normalized = path.normalize(fileName);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function toEqualFsPath(
    this: jest.MatcherContext,
    received: unknown,
    expected: string
): jest.CustomMatcherResult {
    const pass = typeof received === 'string'
        && normalizeTestFsPath(received) === normalizeTestFsPath(expected);
    return {
        pass,
        message: (): string => [
            `expected ${this.utils.printReceived(received)}`,
            pass ? 'not to equal filesystem path' : 'to equal filesystem path',
            this.utils.printExpected(expected)
        ].join(' ')
    };
}

expect.extend({ toEqualFsPath });
