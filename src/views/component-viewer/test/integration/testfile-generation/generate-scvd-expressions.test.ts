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
 * Integration test for GenerateScvdExpressions.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    decodeEntities,
    extractExpressionsFromScvd,
    writeJsonl,
} from './generate-scvd-expressions';

describe('generate-scvd-expressions', () => {
    it('decodes entities and extracts expressions with flags', () => {
        const content = `
            <node offset="1 &amp; 2" property="%d[%s]" unknown="skip" value="  ">
                <calc>
                    a &lt; b
                </calc>
            </node>
        `;

        const expressions = extractExpressionsFromScvd(content);

        expect(expressions).toEqual([
            { expr: '1 & 2', forcePrintf: false },
            { expr: '%d[%s]', forcePrintf: true },
            { expr: 'a < b', forcePrintf: false },
        ]);

        expect(decodeEntities('A &gt; B &amp; C')).toBe('A > B & C');
        expect(decodeEntities('A &unknown; B')).toBe('A &unknown; B');
    });

    it('writes JSONL with printf detection', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scvd-expr-'));
        const outPath = path.join(tempDir, 'out.jsonl');

        writeJsonl(outPath, [
            { expr: '%%', forcePrintf: false },
            { expr: 'plain', forcePrintf: true },
        ]);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const lines = fs.readFileSync(outPath, 'utf8').trim().split('\n');
        const meta = JSON.parse(lines[0]!);
        const first = JSON.parse(lines[1]!);
        const second = JSON.parse(lines[2]!);

        expect(meta._meta.total).toBe(2);
        expect(first.isPrintf).toBe(true);
        expect(second.isPrintf).toBe(true);
    });

    it('main reads inputs and writes outputs', async () => {
        const readFileSync = jest.fn(() => 'offset="1"');
        const writeFileSync = jest.fn();
        const mkdirSync = jest.fn();

        await jest.isolateModulesAsync(async () => {
            jest.doMock('fs', () => ({
                readFileSync,
                writeFileSync,
                mkdirSync,
            }));
            const mod = await import('./generate-scvd-expressions');

            mod.main();
        });

        expect(readFileSync).toHaveBeenCalledTimes(3);
        expect(writeFileSync).toHaveBeenCalledTimes(3);
    });

    it('runs the entrypoint helper when flagged', async () => {
        const readFileSync = jest.fn(() => 'offset="1"');
        const writeFileSync = jest.fn();
        const mkdirSync = jest.fn();

        await jest.isolateModulesAsync(async () => {
            jest.doMock('fs', () => ({
                readFileSync,
                writeFileSync,
                mkdirSync,
            }));
            const mod = await import('./generate-scvd-expressions');
            mod.runMainIfEntrypoint(true);
        });

        expect(readFileSync).toHaveBeenCalledTimes(3);
        expect(writeFileSync).toHaveBeenCalledTimes(3);
    });
});
