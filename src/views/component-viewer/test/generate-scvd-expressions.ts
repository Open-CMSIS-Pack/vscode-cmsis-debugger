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

export function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'');
}

export function extractExpressionsFromScvd(content: string): Extracted[] {
    const expressions: Extracted[] = [];

    for (const { name, forcePrintf } of ATTRS) {
        const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            const expr = decodeEntities(m[1]!.trim());
            if (expr) {
                expressions.push({ expr, forcePrintf: !!forcePrintf });
            }
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
    fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

export function main(): void {
    const root = path.join(__dirname, '../../../..'); // repo root
    const sources = ['RTX5', 'Network', 'USB'].map((base) => ({
        base,
        file: path.join(root, 'src/component-viewer/test/test-files/scvd', `${base}.scvd`),
    }));

    for (const { base, file } of sources) {
        const content = fs.readFileSync(file, 'utf8');
        const expressions = extractExpressionsFromScvd(content);
        const out = path.join(root, 'src/views/component-viewer/test/testfiles', `${base}_expressions.jsonl`);
        writeJsonl(out, expressions);

        console.log(`Wrote ${expressions.length} expressions to ${out}`);
    }
}

if (require.main === module) {
    main();
}
