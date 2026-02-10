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
import path from 'path';

type Attr = { name: string; forcePrintf?: boolean };
type Extracted = { expr: string; forcePrintf: boolean };

const ATTRS: Attr[] = [
    { name: 'offset' },
    { name: 'value' },
    { name: 'size' },
    { name: 'cond' },
    { name: 'symbol' },
    { name: 'count' },
    { name: 'init' },
    { name: 'start' },
    { name: 'limit' },
    { name: 'next' },
    { name: 'property', forcePrintf: true }, // property strings are printf-like templates
    { name: 'id' },
    { name: 'hname' },
    { name: 'handle' },
];

const PRINTF_RE = /%[^\s%]\s*\[|%%/;
const ATTR_NAME_TO_FLAG = new Map<string, boolean>(ATTRS.map(({ name, forcePrintf }) => [name, !!forcePrintf]));
const ATTR_SCAN_RE = /(\w+)\s*=\s*"([^"]*)"/gi;

const ENTITY_DECODE_MAP = new Map<string, string>([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&apos;', '\''],
]);

export function decodeEntities(s: string): string {
    return s.replace(/&(amp|lt|gt|quot|apos);/g, (match) => ENTITY_DECODE_MAP.get(match) ?? match);
}

export function extractExpressionsFromScvd(content: string): Extracted[] {
    const expressions: Extracted[] = [];

    let m: RegExpExecArray | null;
    while ((m = ATTR_SCAN_RE.exec(content)) !== null) {
        const name = m[1];
        const forcePrintf = ATTR_NAME_TO_FLAG.get(name);
        if (!ATTR_NAME_TO_FLAG.has(name)) {
            continue;
        }
        const expr = decodeEntities(m[2]!.trim());
        if (expr) {
            expressions.push({ expr, forcePrintf: !!forcePrintf });
        }
    }

    const calcRe = /<calc[^>]*>([\s\S]*?)<\/calc>/gi;
    let c: RegExpExecArray | null;
    while ((c = calcRe.exec(content)) !== null) {
        const inner = c[1]!;
        inner
            .split(/\r?\n/)
            .map((line) => decodeEntities(line.trim()))
            .filter(Boolean)
            .forEach((expr) => expressions.push({ expr, forcePrintf: false }));
    }

    return expressions;
}

export function writeJsonl(outPath: string, expressions: Extracted[]): void {
    // Paths are constructed from fixed repository locations; safe to create/read here.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const lines = [
        JSON.stringify({ _meta: { format: 'expressions-jsonl-v1', total: expressions.length } }),
        ...expressions.map(({ expr, forcePrintf }, idx) =>
            JSON.stringify({
                i: idx + 1,
                expr,
                isPrintf: forcePrintf || PRINTF_RE.test(expr),
            }),
        ),
    ];
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

export function main(): void {
    const root = path.join(__dirname, '../../../../..'); // repo root
    const sources = ['RTX5', 'Network', 'USB'].map((base) => ({
        base,
        file: path.join(root, 'src/component-viewer/test/test-files/scvd', `${base}.scvd`),
    }));

    for (const { base, file } of sources) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const content = fs.readFileSync(file, 'utf8');
        const expressions = extractExpressionsFromScvd(content);
        const out = path.join(root, 'src/views/component-viewer/test/integration/testfiles', `${base}_expressions.jsonl`);
        writeJsonl(out, expressions);

        console.log(`Wrote ${expressions.length} expressions to ${out}`);
    }
}

export function runMainIfEntrypoint(isMain: boolean = require.main === module): void {
    if (isMain) {
        main();
    }
}

runMainIfEntrypoint();
