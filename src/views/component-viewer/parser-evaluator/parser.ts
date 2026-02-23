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

import { INTRINSIC_DEFINITIONS, isIntrinsicName } from './intrinsics';
import type { IntrinsicName as HostIntrinsicName } from './intrinsics';
import { DEFAULT_INTEGER_MODEL, type IntegerModel, cValueFromConst, convertToType, parseNumericLiteral } from './c-numeric';

export type ValueType = 'number' | 'boolean' | 'string' | 'unknown';

export type ConstValue = number | bigint | string | boolean | undefined;

export interface BaseNode {
  kind: string;
  start: number;
  end: number;
  valueType?: ValueType;
  constValue?: ConstValue;
}
export interface NumberLiteral extends BaseNode { kind:'NumberLiteral'; value:number | bigint; raw:string; valueType:'number'; }
export interface StringLiteral extends BaseNode { kind:'StringLiteral'; value:string; raw:string; valueType:'string'; }
export interface BooleanLiteral extends BaseNode { kind:'BooleanLiteral'; value:boolean; valueType:'boolean'; }
export interface Identifier extends BaseNode { kind:'Identifier'; name:string; }
export interface MemberAccess extends BaseNode { kind:'MemberAccess'; object: ASTNode; property: string; }
export interface ArrayIndex extends BaseNode { kind:'ArrayIndex'; array: ASTNode; index: ASTNode; }
export interface UnaryExpression extends BaseNode { kind:'UnaryExpression'; operator:'+'|'-'|'!'|'~'|'*'|'&'; argument:ASTNode; }
export interface BinaryExpression extends BaseNode { kind:'BinaryExpression'; operator:string; left:ASTNode; right:ASTNode; }
export interface ConditionalExpression extends BaseNode { kind:'ConditionalExpression'; test:ASTNode; consequent:ASTNode; alternate:ASTNode; }
export interface CastExpression extends BaseNode { kind:'CastExpression'; typeName:string; argument:ASTNode; }
export interface SizeofExpression extends BaseNode { kind:'SizeofExpression'; typeName?:string; argument?:ASTNode; }
export interface AlignofExpression extends BaseNode { kind:'AlignofExpression'; typeName?:string; argument?:ASTNode; }

export interface AssignmentExpression extends BaseNode {
  kind:'AssignmentExpression';
  operator:'='|'+='|'-='|'*='|'/='|'%='|'<<='|'>>='|'&='|'^='|'|=';
  left:ASTNode; right:ASTNode;
}

export interface UpdateExpression extends BaseNode {
  kind:'UpdateExpression';
  operator:'++'|'--';
  argument: ASTNode;
  // true for prefix (++x), false for postfix (x++)
  prefix: boolean;
}

// Colon selector for `typedef_name:member` and `typedef_name:member:enum`
export interface ColonPath extends BaseNode {
  kind:'ColonPath';
  parts: string[]; // e.g., ["MyType","field"] or ["MyType","field","EnumVal"]
}

export type IntrinsicName = HostIntrinsicName;

export interface CallExpression extends BaseNode { kind:'CallExpression'; callee:ASTNode; args:ASTNode[]; intrinsic?: undefined; }
export interface EvalPointCall extends BaseNode { kind:'EvalPointCall'; callee:ASTNode; args:ASTNode[]; intrinsic:IntrinsicName; }
export type FormatSpec = string; // accept ANY spec char after '%'
export interface TextSegment extends BaseNode { kind:'TextSegment'; text:string; }
export interface FormatSegment extends BaseNode { kind:'FormatSegment'; spec:FormatSpec; value:ASTNode; }
export interface PrintfExpression extends BaseNode { kind:'PrintfExpression'; segments:(TextSegment|FormatSegment)[]; resultType:'string'; }
export interface ErrorNode extends BaseNode { kind:'ErrorNode'; message:string; }

export type ASTNode =
  | NumberLiteral | StringLiteral | BooleanLiteral | Identifier | MemberAccess | ArrayIndex
  | UnaryExpression | BinaryExpression | ConditionalExpression | AssignmentExpression | UpdateExpression
  | CastExpression | SizeofExpression | AlignofExpression
  | ColonPath
  | CallExpression | EvalPointCall | PrintfExpression | TextSegment | FormatSegment | ErrorNode;

export interface Diagnostic { type: 'error'|'warning'|'info'; message: string; start: number; end: number; }
export interface ParseResult {
  ast: ASTNode;
  diagnostics: Diagnostic[];
  externalSymbols: string[];
  isPrintf: boolean;
  constValue?: ConstValue;          // exists when the entire expression folds to a constant
}

/* ---------------- Tokenizer ---------------- */

type TokenKind = 'EOF'|'IDENT'|'NUMBER'|'STRING'|'PUNCT'|'UNKNOWN';
interface Token { kind: TokenKind; value: string; start: number; end: number; }

// include ++, --, and C compound assignment ops; keep longer tokens before shorter ones
const MULTI = [
    '>>=','<<=',
    '++','--',
    '&&','||','==','!=','<=','>=','<<','>>','->',
    '+=','-=','*=','/=','%=','&=','^=','|='
] as const;

const SINGLE = new Set('()[]{}.,:?;+-*/%&|^!~<>= '.split(''));

class Tokenizer {
    private s: string = '';
    private i = 0;
    private n = 0;
    constructor(s: string) {
        this.reset(s);
    }
    public reset(s: string) {
        this.s = s;
        this.i = 0;
        this.n = s.length;
    }
    public getIndex(): number {
        return this.i;
    }
    public setIndex(i: number): void {
        this.i = i;
    }
    public eof() {
        return this.i >= this.n;
    }
    public peek(k=0) {
        const j = this.i + k;
        return j < this.n ? this.s.charAt(j) : '';
    }
    public advance(k=1) {
        this.i += k;
    }
    public skipWS() {
        while (!this.eof() && /\s/.test(this.s.charAt(this.i))) {
            this.i++;
        }
    }
    public next(): Token {
        this.skipWS();
        if (this.eof()) {
            return { kind:'EOF', value:'', start:this.i, end:this.i };
        }

        for (const m of MULTI) {
            if (this.s.startsWith(m, this.i)) {
                const start = this.i; this.advance(m.length);
                return { kind:'PUNCT', value:m as string, start, end:this.i };
            }
        }

        const ch = this.peek(0);

        const isDigit = (c:string)=> c >= '0' && c <= '9';
        if (isDigit(ch) || (ch === '.' && isDigit(this.peek(1)))) {
            const start = this.i;
            if (ch === '0' && (this.peek(1).toLowerCase() === 'x')) {
                this.advance(2);
                while (!this.eof() && /[0-9a-f_]/i.test(this.peek())) {
                    this.advance();
                }
                if (this.peek() === '.') {
                    this.advance();
                    while (!this.eof() && /[0-9a-f_]/i.test(this.peek())) {
                        this.advance();
                    }
                }
                if (this.peek().toLowerCase() === 'p') {
                    this.advance();
                    if (/[+-]/.test(this.peek())) {
                        this.advance();
                    }
                    while (!this.eof() && /[0-9_]/.test(this.peek())) {
                        this.advance();
                    }
                }
            } else if (ch === '0' && (this.peek(1).toLowerCase() === 'b')) {
                this.advance(2);
                while (!this.eof() && /[01_]/.test(this.peek())) {
                    this.advance();
                }
            } else if (ch === '0' && (this.peek(1).toLowerCase() === 'o')) {
                this.advance(2);
                while (!this.eof() && /[0-7_]/.test(this.peek())) {
                    this.advance();
                }
            } else {
                while (!this.eof() && /[0-9_]/.test(this.peek())) {
                    this.advance();
                }
                if (this.peek() === '.') {
                    this.advance();
                    while (!this.eof() && /[0-9_]/.test(this.peek())) {
                        this.advance();
                    }
                }
                if (this.peek().toLowerCase() === 'e') {
                    this.advance();
                    if (/[+-]/.test(this.peek())) {
                        this.advance();
                    }
                    while (!this.eof() && /[0-9_]/.test(this.peek())) {
                        this.advance();
                    }
                }
            }
            while (!this.eof() && /[a-zA-Z]/.test(this.peek())) {
                this.advance();
            }
            const raw = this.s.slice(start, this.i);
            return { kind:'NUMBER', value:raw, start, end:this.i };
        }

        const isAlpha = (c:string)=> (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
        if (isAlpha(ch)) {
            const start = this.i; this.advance();
            while (!this.eof() && (isAlpha(this.peek()) || /[0-9]/.test(this.peek()))) {
                this.advance();
            }
            const val = this.s.slice(start, this.i);
            return { kind:'IDENT', value:val, start, end:this.i };
        }

        if (ch === '"' || ch === '\'') {
            const quote = ch;
            const start = this.i;
            this.advance();
            let escaped = false;
            while (!this.eof()) {
                const c = this.peek();
                this.advance();
                if (escaped) {
                    escaped = false;
                } else if (c === '\\') {
                    escaped = true;
                } else if (c === quote) {
                    break;
                }
            }
            return { kind:'STRING', value:this.s.slice(start, this.i), start, end:this.i };
        }

        if (SINGLE.has(ch)) {
            const start = this.i;
            this.advance();
            return { kind:'PUNCT', value:ch, start, end:this.i };
        }

        const start = this.i;
        const u = this.peek();
        this.advance();
        return { kind:'UNKNOWN', value:u, start, end:this.i };
    }
}

/* ---------------- Parser ---------------- */

function span(start:number, end:number) {
    return { start, end };
}
const startOf = (n: ASTNode) => (n as BaseNode).start;
const endOf = (n: ASTNode) => (n as BaseNode).end;

function constValueFromCValue(value: { type: { kind: string }, value: bigint | number }): number | bigint {
    if (value.type.kind === 'float') {
        return value.value as number;
    }
    const bigintValue = value.value as bigint;
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    if (bigintValue > maxSafe || bigintValue < minSafe) {
        return bigintValue;
    }
    return Number(bigintValue);
}

/**
 * Validates that a string doesn't contain leftover XML entity references.
 * Returns undefined if valid, or an error message if XML entities are detected.
 *
 * Common XML entities that should be decoded before parsing:
 * - &amp;  → &
 * - &lt;   → <
 * - &gt;   → >
 * - &quot; → "
 * - &apos; → '
 */
export function validateNoXmlEntities(expr: string): string | undefined {
    const xmlEntityPattern = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;
    const match = xmlEntityPattern.exec(expr);
    if (match) {
        return `Expression contains undecoded XML entity '${match[0]}'. XML attributes should be decoded before parsing.`;
    }
    return undefined;
}

function unescapeString(rawWithQuotes: string): string {
    const s = rawWithQuotes.slice(1, -1);
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s.charAt(i);
        if (ch !== '\\') {
            out += ch; continue;
        }
        i++;
        if (i >= s.length) {
            out += '\\'; break;
        }
        const e = s.charAt(i);
        switch (e) {
            case 'n': out += '\n'; break;
            case 'r': out += '\r'; break;
            case 't': out += '\t'; break;
            case 'b': out += '\b'; break;
            case 'f': out += '\f'; break;
            case 'v': out += '\v'; break;
            case '\\': out += '\\'; break;
            case '"': out += '"'; break;
            case '\'': out += '\''; break;
            case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
                let oct = e;
                let j = i + 1;
                let count = 0;
                while (count < 2 && j < s.length && /[0-7]/.test(s.charAt(j))) {
                    oct += s.charAt(j);
                    j++;
                    count++;
                }
                const code = parseInt(oct, 8);
                out += String.fromCharCode(code & 0xFF);
                i = j - 1;
                break;
            }
            case 'x': {
                let j = i + 1;
                let hex = '';
                while (j < s.length && /[0-9a-fA-F]/.test(s.charAt(j))) {
                    hex += s.charAt(j);
                    j++;
                }
                if (hex.length > 0) {
                    const code = parseInt(hex, 16);
                    out += String.fromCharCode(code & 0xFF);
                    i = j - 1;
                } else {
                    out += 'x';
                }
                break;
            }
            case 'u': {
                if (s.charAt(i+1) === '{') {
                    let j = i + 2, hex = '';
                    while (j < s.length && s.charAt(j) !== '}') {
                        hex += s.charAt(j); j++;
                    }
                    if (s.charAt(j) === '}' && /^[0-9a-fA-F]+$/.test(hex)) {
                        out += String.fromCodePoint(parseInt(hex, 16)); i = j;
                    } else {
                        out += 'u';
                    }
                } else {
                    const h = s.substr(i+1, 4);
                    if (/^[0-9a-fA-F]{4}$/.test(h)) {
                        out += String.fromCharCode(parseInt(h, 16)); i += 4;
                    } else {
                        out += 'u';
                    }
                }
                break;
            }
            default: out += e; break;
        }
    }
    return out;
}

export class Parser {
    private s = '';
    private tok = new Tokenizer('');
    private cur: Token = this.tok.next();
    private diagnostics: Diagnostic[] = [];
    private externals: Set<string> = new Set();
    private _model: IntegerModel;
    private static readonly TYPE_KEYWORDS = new Set([
        'void','char','short','int','long','float','double','signed','unsigned','bool','_bool','_Bool','size_t','ptrdiff_t'
    ]);

    /* ---------- lifecycle ---------- */

    constructor(model: IntegerModel = DEFAULT_INTEGER_MODEL) {
        this._model = model;
    }

    public setIntegerModel(model: IntegerModel): void {
        this._model = model;
    }

    private reinit(s:string) {
        this.s = s;
        this.tok.reset(s);
        this.cur = this.tok.next();
        this.diagnostics = [];
        this.externals.clear();
    }
    // Public alias for consumers that want to reuse the instance
    public reset(s:string) {
        this.reinit(s);
    }

    /* ---------- public API ---------- */

    /**
     * Wrapper that keeps diagnostics when the underlying parse throws.
     */
    public parseWithDiagnostics(input: string, isPrintExpression: boolean): ParseResult {
        try {
            return this.parse(input, isPrintExpression);
        } catch (e) {
            const start = 0;
            const end = Math.max(input.length, 0);
            const errors = (e instanceof AggregateError && Array.isArray(e.errors)) ? e.errors : [e];
            for (const err of errors) {
                const message = err instanceof Error ? err.message : String(err);
                this.error(message, start, end);
            }
            const message = errors.length ? (errors[0] instanceof Error ? errors[0].message : String(errors[0])) : 'Unknown parser error';
            const ast: ErrorNode = { kind: 'ErrorNode', message, start, end };
            return {
                ast,
                diagnostics: this.diagnostics.slice(),
                externalSymbols: [],
                isPrintf: isPrintExpression,
            };
        }
    }

    public parse(input: string, isPrintExpression: boolean): ParseResult {
        this.reinit(input);

        // Check for leftover XML entities before parsing
        const xmlError = validateNoXmlEntities(input);
        if (xmlError) {
            this.warn(xmlError, 0, input.length);
        }

        let ast: ASTNode;
        let isPrintf = false;

        if (isPrintExpression) {
            // Always treat as printf, even if it's pure text like "foobar"
            ast = this.parsePrintfExpression();
            isPrintf = true;

            // Force EOF so tokenizer-based trailing checks don't run in printf mode
            this.cur = { kind: 'EOF', value: '', start: input.length, end: input.length };

        } else if (this.looksLikePrintf(input)) {
            // Auto-detect printf only when not explicitly forced
            ast = this.parsePrintfExpression();
            isPrintf = true;
            this.cur = { kind: 'EOF', value: '', start: input.length, end: input.length };

        } else {
            // Normal expression parsing
            ast = this.parseExpression();
            while (this.cur.kind === 'PUNCT' && this.cur.value === ';') {
                this.eat('PUNCT',';');
            }
            if (this.cur.kind !== 'EOF') {
                this.warn('Extra tokens after expression', this.cur.start, this.cur.end);
            }
        }

        return {
            ast,
            diagnostics: this.diagnostics.slice(),
            externalSymbols: Array.from(this.externals).sort(),
            isPrintf,
        };
    }

    /* ---------- diagnostics & token helpers ---------- */

    private error(msg:string, start:number, end:number) {
        this.diagnostics.push({ type:'error', message:msg, start, end });
    }
    private warn(msg:string, start:number, end:number) {
        this.diagnostics.push({ type:'warning', message:msg, start, end });
    }

    private eat(kind:TokenKind, value?:string): Token {
        const t = this.cur;
        if (t.kind !== kind || (value !== undefined && t.value !== value)) {
            this.error(`Expected ${kind} ${value ?? ''} but found ${t.kind} ${JSON.stringify(t.value)}`, t.start, t.end);
            return t;
        }
        this.cur = this.tok.next();
        return t;
    }
    private tryEat(kind:TokenKind, value?:string): Token|undefined {
        const t = this.cur;
        if (t.kind === kind && (value === undefined || t.value === value)) {
            this.cur = this.tok.next(); return t;
        }
        return undefined;
    }
    private curIs(kind: TokenKind, value?: string): boolean {
        const t = this.cur;
        return t.kind === kind && (value === undefined || t.value === value);
    }

    private isTypeKeyword(name: string): boolean {
        if (Parser.TYPE_KEYWORDS.has(name)) {
            return true;
        }
        return /_t$/.test(name);
    }

    private tryParseTypeNameInParens(): { typeName: string; start: number; end: number } | undefined {
        const savedIndex = this.tok.getIndex();
        const savedCur = this.cur;
        const startTok = this.tryEat('PUNCT', '(');
        if (!startTok) {
            return undefined;
        }
        if (!this.curIs('IDENT')) {
            this.tok.setIndex(savedIndex);
            this.cur = savedCur;
            return undefined;
        }
        if (!this.isTypeKeyword(this.cur.value)) {
            this.tok.setIndex(savedIndex);
            this.cur = savedCur;
            return undefined;
        }
        const parts: string[] = [];
        while (this.curIs('IDENT') || this.curIs('PUNCT', '*')) {
            parts.push(this.cur.value);
            this.cur = this.tok.next();
        }
        if (!this.curIs('PUNCT', ')')) {
            this.tok.setIndex(savedIndex);
            this.cur = savedCur;
            return undefined;
        }
        const endTok = this.eat('PUNCT', ')');
        return { typeName: parts.join(' '), start: startTok.start, end: endTok.end };
    }

    private tryParseCast(): CastExpression | undefined {
        const maybeType = this.tryParseTypeNameInParens();
        if (!maybeType) {
            return undefined;
        }
        const arg = this.parseUnary();
        return { kind:'CastExpression', typeName: maybeType.typeName, argument: arg, ...span(maybeType.start, endOf(arg)) };
    }

    // Generic printf detection: %% or %x[ ... ] for ANY non-space spec x
    private looksLikePrintf(s:string): boolean {
        if (s.includes('%%')) {
            return true;
        }
        return /%[^\s%]\s*\[/.test(s);
    }

    private isAssignable(n: ASTNode): boolean {
        return n.kind === 'Identifier' || n.kind === 'MemberAccess' || n.kind === 'ArrayIndex';
    }

    /* ---------- printf parsing ---------- */

    // Parse a printf-style template from the raw input string into segments.
    private parsePrintfExpression(): PrintfExpression {
        const s = this.s;
        const n = s.length;
        let i = 0;
        const segments: (TextSegment|FormatSegment)[] = [];

        while (i < n) {
            const j = s.indexOf('%', i);
            if (j === -1) {
                /* istanbul ignore else -- loop guard ensures i <= n */
                if (i < n) {
                    segments.push({ kind:'TextSegment', text:s.slice(i), ...span(i,n) });
                }
                break;
            }
            if (j > i) {
                segments.push({ kind:'TextSegment', text:s.slice(i,j), ...span(i,j) });
            }

            // Handle escaped percent
            if (j+1 < n && s.charAt(j+1) === '%') {
                segments.push({ kind:'TextSegment', text:'%', ...span(j,j+2) });
                i = j+2; continue;
            }

            // Accept ANY single spec character after '%'
            const spec = (j+1 < n) ? s.charAt(j+1) : '';
            if (spec && spec !== '%') {
                // Look for a bracketed expression after optional whitespace
                let k = j + 2;
                while (k<n && /\s/.test(s.charAt(k))) {
                    k++;
                }
                if (k>=n || s.charAt(k) !== '[') {
                    // Not a bracket form: treat literally as "%x"
                    segments.push({ kind:'TextSegment', text:'%'+spec, ...span(j,j+2) });
                    i = j+2; continue;
                }

                // Balanced scan for %[ ... ] with string awareness
                const exprStart = k+1;
                let depth = 1;
                let m = exprStart;
                let inString: '"'|'\''|null = null;
                let escaped = false;
                while (m < n && depth > 0) {
                    const c = s.charAt(m);
                    if (inString) {
                        if (escaped) {
                            escaped = false; m++; continue;
                        }
                        if (c === '\\') {
                            escaped = true; m++; continue;
                        }
                        if (c === inString) {
                            inString = null; m++; continue;
                        }
                        m++; continue;
                    }
                    if (c === '"' || c === '\'') {
                        inString = c as '"'|'\''; m++; continue;
                    }
                    if (c === '[') {
                        depth++; m++; continue;
                    }
                    if (c === ']') {
                        depth--; if (depth === 0) {
                            break;
                        } m++; continue;
                    }
                    m++;
                }

                let exprEnd = m;
                if (depth !== 0) {
                    this.warn('Unclosed formatter bracket; treating rest as expression.', j, n); exprEnd = n;
                }

                const inner = this.parseSubexpression(s.slice(exprStart, exprEnd), exprStart);
                const seg: FormatSegment = { kind:'FormatSegment', spec: spec as FormatSpec, value: inner, ...span(j, depth===0? exprEnd+1 : n) };
                segments.push(seg);
                i = (depth===0? exprEnd+1 : n);
                continue;
            }

            // Lone '%'
            segments.push({ kind:'TextSegment', text:'%', ...span(j,j+1) });
            i = j+1;
        }
        return { kind:'PrintfExpression', segments, resultType:'string', ...span(0,n) };
    }

    // Parse a subexpression with a fresh tokenizer, adjust diagnostics offsets.
    private parseSubexpression(exprSrc: string, baseOffset: number): ASTNode {
        const savedS = this.s, savedTok = this.tok, savedCur = this.cur, savedDiag = this.diagnostics, savedExt = this.externals;
        const t = new Tokenizer(exprSrc);
        this.s = exprSrc;
        this.tok = t;
        this.cur = t.next();
        const tmp: Diagnostic[] = [];
        this.diagnostics = tmp;
        this.externals = new Set<string>();

        const node = this.parseExpression();

        // consume optional semicolons and check for trailing junk
        while (this.cur.kind === 'PUNCT' && this.cur.value === ';') {
            this.eat('PUNCT',';');
        }
        if (this.cur.kind !== 'EOF') {
            tmp.push({ type:'warning', message:'Extra tokens after expression', start:this.cur.start + baseOffset, end:this.cur.end + baseOffset });
        }

        const adj = tmp.map(d => ({ ...d, start: d.start + baseOffset, end: d.end + baseOffset }));
        savedDiag.push(...adj);
        for (const sym of this.externals) {
            savedExt.add(sym);
        }
        this.s = savedS;
        this.tok = savedTok;
        this.cur = savedCur;
        this.diagnostics = savedDiag;
        this.externals = savedExt;
        return node;
    }

    /* ---------- expression parsing ---------- */

    private parseExpression(): ASTNode {
        return this.parseComma();
    }

    private parseComma(): ASTNode {
        let node = this.parseAssignment();
        while (this.curIs('PUNCT', ',')) {
            const comma = this.eat('PUNCT', ',');
            const rhs = this.parseAssignment();
            node = { kind:'BinaryExpression', operator:',', left:node, right:rhs, ...span(startOf(node), endOf(rhs)) };
            if (comma) {
                // no-op; keeps structure
            }
        }
        return node;
    }

    private parseConditional(): ASTNode {
        let node = this.parseBinary(1);
        if (this.cur.kind === 'PUNCT' && this.cur.value === '?') {
            this.eat('PUNCT','?');
            const cons = this.parseExpression();
            if (!this.tryEat('PUNCT',':')) {
                this.error('Expected ":" in conditional expression', this.cur.start, this.cur.end);
            }
            const alt = this.parseExpression();
            node = { kind:'ConditionalExpression', test:node, consequent:cons, alternate:alt, ...span(startOf(node), endOf(alt)) };
        }
        return node;
    }

    private static PREC: Map<string, number> = new Map<string, number>([
        ['||', 1],
        ['&&', 2],
        ['|', 3],
        ['^', 4],
        ['&', 5],
        ['==', 6], ['!=', 6],
        ['<', 7], ['>', 7], ['<=', 7], ['>=', 7],
        ['>>', 8], ['<<', 8],
        ['+', 9], ['-', 9],
        ['*', 10], ['/', 10], ['%', 10],
    ]);

    private parseAssignment(): ASTNode {
        const left = this.parseConditional();
        if (this.cur.kind === 'PUNCT') {
            const op = this.cur.value;
            const assignOps = new Set(['=','+=','-=','*=','/=','%=','<<=','>>=','&=','^=','|=']);

            if (assignOps.has(op)) {
                this.eat('PUNCT', op);
                if (!this.isAssignable(left)) {
                    this.error('Invalid assignment target', startOf(left), endOf(left));
                }
                if (left.kind === 'Identifier') {
                    this.externals.delete((left as Identifier).name);
                }
                const right = this.parseAssignment(); // right-assoc
                return { kind:'AssignmentExpression', operator: op as AssignmentExpression['operator'], left, right, ...span(startOf(left), endOf(right)) };
            }
        }
        return left;
    }

    private parseBinary(minPrec: number): ASTNode {
        let node = this.parseUnary();
        while (this.cur.kind === 'PUNCT' && Parser.PREC.has(this.cur.value)) {
            const op = this.cur.value;
            const prec = Parser.PREC.get(op) ?? 0;
            if (prec < minPrec) {
                break;
            }
            this.eat('PUNCT', op);
            const rhs = this.parseBinary(prec + 1);
            node = { kind:'BinaryExpression', operator:op, left:node, right:rhs, ...span(startOf(node), endOf(rhs)) };
        }
        return node;
    }

    private parseUnary(): ASTNode {
        const punct = this.cur.kind === 'PUNCT' ? this.cur.value : undefined;

        if (this.cur.kind === 'IDENT' && (this.cur.value === 'sizeof' || this.cur.value === 'alignof')) {
            const keyword = this.cur.value;
            const t = this.eat('IDENT');
            const typeName = this.tryParseTypeNameInParens();
            if (typeName) {
                if (keyword === 'sizeof') {
                    return { kind:'SizeofExpression', typeName: typeName.typeName, ...span(t.start, typeName.end) };
                }
                return { kind:'AlignofExpression', typeName: typeName.typeName, ...span(t.start, typeName.end) };
            }
            const arg = this.parseUnary();
            if (keyword === 'sizeof') {
                return { kind:'SizeofExpression', argument: arg, ...span(t.start, endOf(arg)) };
            }
            return { kind:'AlignofExpression', argument: arg, ...span(t.start, endOf(arg)) };
        }

        const cast = this.tryParseCast();
        if (cast) {
            return cast;
        }

        if (punct && (punct === '++' || punct === '--')) {
            const op = punct;
            const t = this.eat('PUNCT', op);
            const arg = this.parseUnary();
            if (!this.isAssignable(arg)) {
                this.error('Invalid increment/decrement target', startOf(arg), endOf(arg));
            }
            return { kind:'UpdateExpression', operator: op as UpdateExpression['operator'], argument: arg, prefix: true, ...span(t.start, endOf(arg)) };
        }

        if (punct && ['+', '-', '!', '~', '*', '&'].includes(punct)) {
            const op = punct;
            const t = this.eat('PUNCT', op);
            const arg = this.parseUnary();
            return { kind:'UnaryExpression', operator:op as UnaryExpression['operator'], argument:arg, ...span(t.start, endOf(arg)) };
        }

        return this.parsePostfix();
    }

    private parsePostfix(): ASTNode {
        let node = this.parsePrimary();
        while (true) {
            // colon-type/member/enum selector chain: typedef_name:member[:enum]
            if ((node.kind === 'Identifier' || node.kind === 'ColonPath') && this.curIs('PUNCT', ':')) {
                this.eat('PUNCT', ':');
                let parts: string[];
                const startPos = startOf(node);
                let lastEnd = endOf(node);
                if (node.kind === 'Identifier') {
                    this.externals.delete((node as Identifier).name);
                    parts = [(node as Identifier).name];
                } else {
                    parts = [...(node as ColonPath).parts];
                }
                if (!this.curIs('IDENT')) {
                    this.error('Expected identifier after ":"', this.cur.start, this.cur.end);
                } else {
                    const first = this.eat('IDENT');
                    parts.push(first.value);
                    lastEnd = first.end;
                    while (this.curIs('PUNCT', ':')) {
                        this.eat('PUNCT', ':');
                        if (!this.curIs('IDENT')) {
                            this.error('Expected identifier after ":"', this.cur.start, this.cur.end);
                            break;
                        }
                        const idt = this.eat('IDENT');
                        parts.push(idt.value);
                        lastEnd = idt.end;
                    }
                }
                const colonNode: ColonPath = { kind:'ColonPath', parts, valueType:'unknown', ...span(startPos, lastEnd) };
                node = colonNode;
                continue;
            }

            // If next token is ':' but we're not on Identifier/ColonPath, it's likely the ternary ':'; stop here.
            if (this.curIs('PUNCT', ':')) {
                break;
            }

            // function call
            if (this.tryEat('PUNCT','(')) {
                const args: ASTNode[] = [];
                if (!(this.cur.kind === 'PUNCT' && this.cur.value === ')')) {
                    while (true) {
                        args.push(this.parseAssignment());
                        if (this.tryEat('PUNCT',',')) {
                            continue;
                        }
                        break;
                    }
                }
                if (!this.tryEat('PUNCT',')')) {
                    this.error('Expected ")"', this.cur.start, this.cur.end);
                }
                const callee = node as ASTNode;
                const isIntrinsic = callee.kind === 'Identifier' && isIntrinsicName((callee as Identifier).name);
                const calleeName = callee.kind === 'Identifier' ? (callee as Identifier).name : undefined;
                if (isIntrinsic && calleeName) {
                    const intrinsicDef = INTRINSIC_DEFINITIONS[calleeName as IntrinsicName];
                    if (intrinsicDef) {
                        const { minArgs, maxArgs } = intrinsicDef;
                        if (minArgs !== undefined && args.length < minArgs) {
                            this.error(`Intrinsic ${calleeName} expects at least ${minArgs} argument(s)`, startOf(node), this.cur.end);
                        }
                        if (maxArgs !== undefined && args.length > maxArgs) {
                            this.error(`Intrinsic ${calleeName} expects at most ${maxArgs} argument(s)`, startOf(node), this.cur.end);
                        }
                    }
                    const callNode: EvalPointCall = {
                        kind: 'EvalPointCall',
                        callee,
                        args,
                        intrinsic: calleeName as IntrinsicName,
                        valueType: 'number' as const,
                        ...span(startOf(node), this.cur.end)
                    };
                    node = callNode;
                } else {
                    const callNode: CallExpression = {
                        kind: 'CallExpression',
                        callee,
                        args,
                        ...span(startOf(node), this.cur.end)
                    };
                    node = callNode;
                }
                continue;
            }
            // property access
            if (this.tryEat('PUNCT','.')) {
                if (this.cur.kind === 'IDENT') {
                    const prop = this.cur.value;
                    const idt = this.eat('IDENT');
                    const memberNode: MemberAccess = { kind:'MemberAccess', object:node, property:prop, ...span(startOf(node), idt.end) };
                    node = memberNode;
                } else {
                    this.error('Expected identifier after "."', this.cur.start, this.cur.end);
                }
                continue;
            }
            // pointer member access
            if (this.tryEat('PUNCT','->')) {
                if (this.cur.kind === 'IDENT') {
                    const prop = this.cur.value;
                    const idt = this.eat('IDENT');
                    const deref: UnaryExpression = {
                        kind:'UnaryExpression',
                        operator:'*',
                        argument: node,
                        ...span(startOf(node), endOf(node))
                    };
                    const memberNode: MemberAccess = { kind:'MemberAccess', object:deref, property:prop, ...span(startOf(node), idt.end) };
                    node = memberNode;
                } else {
                    this.error('Expected identifier after "->"', this.cur.start, this.cur.end);
                }
                continue;
            }
            // index access
            if (this.tryEat('PUNCT', '[')) {
                const index = this.parseExpression();
                if (!this.tryEat('PUNCT', ']')) {
                    this.error('Expected "]"', this.cur.start, this.cur.end);
                }
                const arrayNode: ArrayIndex = { kind:'ArrayIndex', array:node, index, ...span(startOf(node), endOf(index)) };
                node = arrayNode;
                continue;
            }      // postfix ++ / --
            if (this.cur.kind === 'PUNCT' && (this.cur.value === '++' || this.cur.value === '--')) {
                const op = this.cur.value;
                const t = this.eat('PUNCT', op);
                if (!this.isAssignable(node)) {
                    this.error('Invalid increment/decrement target', startOf(node), endOf(node));
                }
                node = { kind:'UpdateExpression', operator: op as UpdateExpression['operator'], argument: node, prefix: false, ...span(startOf(node), t.end) };
                break;
            }
            break;
        }
        return node;
    }

    private parsePrimary(): ASTNode {
        const t = this.cur;
        if (t.kind === 'NUMBER') {
            this.eat('NUMBER');
            const parsed = parseNumericLiteral(t.value, this._model);
            const val = constValueFromCValue(parsed);
            return { kind:'NumberLiteral', value:val, raw:t.value, valueType:'number', constValue: val, ...span(t.start,t.end) };
        }
        if (t.kind === 'STRING') {
            this.eat('STRING');
            const text = unescapeString(t.value);
            const isCharLiteral = t.value.startsWith('\'') && t.value.endsWith('\'');
            if (isCharLiteral) {
                const code = text.codePointAt(0) ?? 0;
                const charType = { kind: 'int', bits: this._model.intBits, name: 'int' } as const;
                const cv = convertToType(cValueFromConst(code, charType), charType);
                const val = constValueFromCValue(cv);
                return { kind:'NumberLiteral', value:val, raw:t.value, valueType:'number', constValue: val, ...span(t.start,t.end) };
            }
            return { kind:'StringLiteral', value:text, raw:t.value, valueType:'string', constValue: text, ...span(t.start,t.end) };
        }
        if (t.kind === 'IDENT' && (t.value === 'true' || t.value === 'false')) {
            this.eat('IDENT');
            const val = t.value === 'true';
            return { kind:'BooleanLiteral', value: val, valueType:'boolean', constValue: val, ...span(t.start,t.end) };
        }
        if (t.kind === 'IDENT') {
            this.eat('IDENT');
            const node: Identifier = { kind:'Identifier', name:t.value, valueType:'unknown', ...span(t.start,t.end) };
            if (!isIntrinsicName(t.value)) {
                this.externals.add(t.value);
            }
            return node;
        }
        if (t.kind === 'PUNCT' && t.value === '(') {
            this.eat('PUNCT','(');
            const expr = this.parseExpression();
            if (!this.tryEat('PUNCT',')')) {
                this.error('Expected ")"', this.cur.start, this.cur.end);
            }
            return expr;
        }
        this.error(`Unexpected token ${t.kind} ${JSON.stringify(t.value)}`, t.start, t.end);
        this.eat(t.kind);
        return { kind:'ErrorNode', message:'Unexpected token', ...span(t.start,t.end) };
    }

}
