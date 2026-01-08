/**
 * Fast, reusable, error-tolerant expression parser with:
 *  - Assignment '=' (right-associative) and C-style compound assignments: +=, -=, *=, /=, %=, <<=, >>=, &=, ^=, |=
 *  - ++ / -- (both prefix and postfix)
 *  - Printf-like formatting segments: `%x[ expr ]` (x = ANY single non-space char) and `%%` (escaped percent)
 *  - Intrinsic evaluation-point calls:
 *      __CalcMemUsed, __FindSymbol, __GetRegVal, __Offset_of, __size_of, __Symbol_exists, __Running
 *  - Constant folding (never folds assignments; side-effecting nodes are kept as AST)
 *  - External symbol collection
 *  - Colon selector operators `typedef_name:member` and `typedef_name:member:enum`
 *  - Ternary conditional `?:` (right-associative)
 *
 * Intended to be instantiated once and reused: `const parser = new Parser();`
 */

export type ValueType = 'number' | 'boolean' | 'string' | 'unknown';

export interface BaseNode { kind: string; start: number; end: number; valueType?: ValueType; constValue?: any; }
export interface NumberLiteral extends BaseNode { kind:'NumberLiteral'; value:number; raw:string; valueType:'number'; }
export interface StringLiteral extends BaseNode { kind:'StringLiteral'; value:string; raw:string; valueType:'string'; }
export interface BooleanLiteral extends BaseNode { kind:'BooleanLiteral'; value:boolean; valueType:'boolean'; }
export interface Identifier extends BaseNode { kind:'Identifier'; name:string; }
export interface MemberAccess extends BaseNode { kind:'MemberAccess'; object: ASTNode; property: string; }
export interface ArrayIndex extends BaseNode { kind:'ArrayIndex'; array: ASTNode; index: ASTNode; }
export interface UnaryExpression extends BaseNode { kind:'UnaryExpression'; operator:'+'|'-'|'!'|'~'; argument:ASTNode; }
export interface BinaryExpression extends BaseNode { kind:'BinaryExpression'; operator:string; left:ASTNode; right:ASTNode; }
export interface ConditionalExpression extends BaseNode { kind:'ConditionalExpression'; test:ASTNode; consequent:ASTNode; alternate:ASTNode; }

export interface AssignmentExpression extends BaseNode {
  kind:'AssignmentExpression';
  operator:'='|'+='|'-='|'*='|'/='|'%='|'<<='|'>>='|'&='|'^='|'|=';
  left:ASTNode; right:ASTNode;
}

export interface UpdateExpression extends BaseNode {
  kind:'UpdateExpression';
  operator:'++'|'--';
  argument: ASTNode;
  /** true for prefix (++x), false for postfix (x++) */
  prefix: boolean;
}

/** Colon selector for `typedef_name:member` and `typedef_name:member:enum` */
export interface ColonPath extends BaseNode {
  kind:'ColonPath';
  parts: string[]; // e.g., ["MyType","field"] or ["MyType","field","EnumVal"]
}

export type IntrinsicName =
  '__CalcMemUsed'|'__FindSymbol'|'__GetRegVal'|'__Offset_of'|'__size_of'|'__Symbol_exists'|'__Running';

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
  | ColonPath
  | CallExpression | EvalPointCall | PrintfExpression | TextSegment | FormatSegment | ErrorNode;

export interface Diagnostic { type: 'error'|'warning'|'info'; message: string; start: number; end: number; }
export interface ParseResult {
  ast: ASTNode;
  diagnostics: Diagnostic[];
  externalSymbols: string[];
  isPrintf: boolean;
  constValue?: any;          // exists when the entire expression folds to a constant
}

/* ---------------- Tokenizer ---------------- */

type TokenKind = 'EOF'|'IDENT'|'NUMBER'|'STRING'|'PUNCT'|'UNKNOWN';
interface Token { kind: TokenKind; value: string; start: number; end: number; }

/** include >>>, ++, --, and C compound assignment ops; keep longer tokens before shorter ones */
const MULTI = [
    '>>=','<<=',
    '>>>',
    '++','--',
    '&&','||','==','!=','<=','>=','<<','>>',
    '+=','-=','*=','/=','%=','&=','^=','|='
] as const;

const SINGLE = new Set('()[]{}.,:?;+-*/%&|^!~<>= '.split(''));

class Tokenizer {
    private s: string = '';
    private i = 0;
    private n = 0;
    constructor(s: string) { this.reset(s); }
    reset(s: string) { this.s = s; this.i = 0; this.n = s.length; }
    eof() { return this.i >= this.n; }
    peek(k=0) { const j = this.i + k; return j < this.n ? this.s[j] : ''; }
    advance(k=1) { this.i += k; }
    skipWS() { while (!this.eof() && /\s/.test(this.s[this.i]!)) this.i++; }
    next(): Token {
        this.skipWS();
        if (this.eof()) return { kind:'EOF', value:'', start:this.i, end:this.i };

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
                this.advance(2); while (!this.eof() && /[0-9a-f]/i.test(this.peek())) this.advance();
            } else if (ch === '0' && (this.peek(1).toLowerCase() === 'b')) {
                this.advance(2); while (!this.eof() && /[01]/.test(this.peek())) this.advance();
            } else if (ch === '0' && (this.peek(1).toLowerCase() === 'o')) {
                this.advance(2); while (!this.eof() && /[0-7]/.test(this.peek())) this.advance();
            } else {
                while (!this.eof() && /[0-9_]/.test(this.peek())) this.advance();
                if (this.peek() === '.') { this.advance(); while (!this.eof() && /[0-9_]/.test(this.peek())) this.advance(); }
                if (this.peek().toLowerCase() === 'e') { this.advance(); if (/[+-]/.test(this.peek())) this.advance(); while (!this.eof() && /[0-9]/.test(this.peek())) this.advance(); }
            }
            const raw = this.s.slice(start, this.i);
            return { kind:'NUMBER', value:raw, start, end:this.i };
        }

        const isAlpha = (c:string)=> (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
        if (isAlpha(ch)) {
            const start = this.i; this.advance();
            while (!this.eof() && (isAlpha(this.peek()) || /[0-9]/.test(this.peek()))) this.advance();
            const val = this.s.slice(start, this.i);
            return { kind:'IDENT', value:val, start, end:this.i };
        }

        if (ch === '"' || ch === '\'') {
            const quote = ch; const start = this.i; this.advance();
            let escaped = false;
            while (!this.eof()) {
                const c = this.peek(); this.advance();
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === quote) break;
            }
            return { kind:'STRING', value:this.s.slice(start, this.i), start, end:this.i };
        }

        if (SINGLE.has(ch)) {
            const start = this.i; this.advance();
            return { kind:'PUNCT', value:ch, start, end:this.i };
        }

        const start = this.i;
        const u = this.peek();
        this.advance();
        return { kind:'UNKNOWN', value:u, start, end:this.i };
    }
}

/* ---------------- Parser ---------------- */

const INTRINSICS: Set<string> = new Set([
    '__CalcMemUsed','__FindSymbol','__GetRegVal','__Offset_of','__size_of','__Symbol_exists','__Running'
]);

function span(start:number, end:number) { return { start, end }; }

function numFromRaw(raw: string): number {
    try {
        if (/^0[xX]/.test(raw)) return parseInt(raw, 16);
        if (/^0[bB]/.test(raw)) return parseInt(raw, 2);
        if (/^0[oO]/.test(raw)) return parseInt(raw, 8);
        if (raw.includes('.') || /e/i.test(raw)) return parseFloat(raw.replace(/_/g,'')); // decimal float
        return parseInt(raw.replace(/_/g,''), 10);
    } catch { return NaN; }
}

function unescapeString(rawWithQuotes: string): string {
    const s = rawWithQuotes.slice(1, -1);
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        if (ch !== '\\') { out += ch; continue; }
        i++;
        if (i >= s.length) { out += '\\'; break; }
        const e = s[i]!;
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
            case '0': out += '\0'; break;
            case 'x': {
                const h1 = s[i+1], h2 = s[i+2];
                if (h1 && h2 && /[0-9a-fA-F]/.test(h1) && /[0-9a-fA-F]/.test(h2)) {
                    out += String.fromCharCode(parseInt(h1 + h2, 16));
                    i += 2;
                } else out += 'x';
                break;
            }
            case 'u': {
                if (s[i+1] === '{') {
                    let j = i + 2, hex = '';
                    while (j < s.length && s[j] !== '}') { hex += s[j]!; j++; }
                    if (s[j] === '}' && /^[0-9a-fA-F]+$/.test(hex)) { out += String.fromCodePoint(parseInt(hex, 16)); i = j; } else out += 'u';
                } else {
                    const h = s.substr(i+1, 4);
                    if (/^[0-9a-fA-F]{4}$/.test(h)) { out += String.fromCharCode(parseInt(h, 16)); i += 4; } else out += 'u';
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

    /* ---------- lifecycle ---------- */

    private reinit(s:string) {
        this.s = s;
        this.tok.reset(s);
        this.cur = this.tok.next();
        this.diagnostics = [];
        this.externals.clear();
    }
    /** Public alias for consumers that want to reuse the instance */
    public reset(s:string) { this.reinit(s); }

    /* ---------- public API ---------- */

    parse(input: string, isPrintExpression: boolean): ParseResult {
        this.reinit(input);

        let ast: ASTNode;
        let isPrintf = false;

        if (isPrintExpression) {
            // Always treat as printf, even if it's pure text like "foobar"
            ast = this.parsePrintfExpression();
            isPrintf = true;

            // Force EOF so tokenizer-based trailing checks don't run in printf mode
            this.cur = { kind: 'EOF', value: '', start: input.length, end: input.length } as any;

        } else if (this.looksLikePrintf(input)) {
            // Auto-detect printf only when not explicitly forced
            ast = this.parsePrintfExpression();
            isPrintf = true;
            this.cur = { kind: 'EOF', value: '', start: input.length, end: input.length } as any;

        } else {
            // Normal expression parsing
            ast = this.parseExpression();
            while (this.cur.kind === 'PUNCT' && this.cur.value === ';') this.eat('PUNCT',';');
            if (this.cur.kind !== 'EOF') this.warn('Extra tokens after expression', this.cur.start, this.cur.end);
        }

        // Constant folding only for non-printf ASTs
        ast = this.fold(ast);
        const constValue = isPrintf ? undefined : (ast as any).constValue;

        return {
            ast,
            diagnostics: this.diagnostics.slice(),
            externalSymbols: Array.from(this.externals).sort(),
            isPrintf,
            constValue,
        };
    }

    /* ---------- diagnostics & token helpers ---------- */

    private error(msg:string, start:number, end:number) { this.diagnostics.push({ type:'error', message:msg, start, end }); }
    private warn(msg:string, start:number, end:number) { this.diagnostics.push({ type:'warning', message:msg, start, end }); }

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
        if (t.kind === kind && (value === undefined || t.value === value)) { this.cur = this.tok.next(); return t; }
        return undefined;
    }
    private curIs(kind: TokenKind, value?: string): boolean {
        const t = this.cur;
        return t.kind === kind && (value === undefined || t.value === value);
    }

    /** Generic printf detection: %% or %x[ ... ] for ANY non-space spec x */
    private looksLikePrintf(s:string): boolean {
        if (s.includes('%%')) return true;
        return /%[^\s%]\s*\[/.test(s);
    }

    private isAssignable(n: ASTNode): boolean {
        return n.kind === 'Identifier' || n.kind === 'MemberAccess' || n.kind === 'ArrayIndex';
    }

    /* ---------- printf parsing ---------- */

    /** Parse a printf-style template from the raw input string into segments. */
    private parsePrintfExpression(): PrintfExpression {
        const s = this.s;
        const n = s.length;
        let i = 0;
        const segments: (TextSegment|FormatSegment)[] = [];

        while (i < n) {
            const j = s.indexOf('%', i);
            if (j === -1) {
                if (i < n) segments.push({ kind:'TextSegment', text:s.slice(i), ...span(i,n) });
                break;
            }
            if (j > i) segments.push({ kind:'TextSegment', text:s.slice(i,j), ...span(i,j) });

            // Handle escaped percent
            if (j+1 < n && s[j+1] === '%') {
                segments.push({ kind:'TextSegment', text:'%', ...span(j,j+2) });
                i = j+2; continue;
            }

            // Accept ANY single spec character after '%'
            const spec = (j+1 < n) ? s[j+1] : '';
            if (spec && spec !== '%') {
                // Look for a bracketed expression after optional whitespace
                let k = j + 2;
                while (k<n && /\s/.test(s[k]!)) k++;
                if (k>=n || s[k] !== '[') {
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
                    const c = s[m]!;
                    if (inString) {
                        if (escaped) { escaped = false; m++; continue; }
                        if (c === '\\') { escaped = true; m++; continue; }
                        if (c === inString) { inString = null; m++; continue; }
                        m++; continue;
                    }
                    if (c === '"' || c === '\'') { inString = c as any; m++; continue; }
                    if (c === '[') { depth++; m++; continue; }
                    if (c === ']') { depth--; if (depth === 0) break; m++; continue; }
                    m++;
                }

                let exprEnd = m;
                if (depth !== 0) { this.warn('Unclosed formatter bracket; treating rest as expression.', j, n); exprEnd = n; }

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

    /** Parse a subexpression with a fresh tokenizer, adjust diagnostics offsets. */
    private parseSubexpression(exprSrc: string, baseOffset: number): ASTNode {
        const savedS = this.s, savedTok = this.tok, savedCur = this.cur, savedDiag = this.diagnostics, savedExt = this.externals;
        const t = new Tokenizer(exprSrc);
        (this as any).s = exprSrc;
        (this as any).tok = t;
        (this as any).cur = t.next();
        const tmp: Diagnostic[] = [];
        (this as any).diagnostics = tmp;
        (this as any).externals = new Set<string>();

        const node = this.parseExpression();
        const folded = this.fold(node);

        // consume optional semicolons and check for trailing junk
        while (this.cur.kind === 'PUNCT' && this.cur.value === ';') this.eat('PUNCT',';');
        if (this.cur.kind !== 'EOF') tmp.push({ type:'warning', message:'Extra tokens after expression', start:this.cur.start + baseOffset, end:this.cur.end + baseOffset });

        const adj = tmp.map(d => ({ ...d, start: d.start + baseOffset, end: d.end + baseOffset }));
        savedDiag.push(...adj);
        (this as any).s = savedS;
        (this as any).tok = savedTok;
        (this as any).cur = savedCur;
        (this as any).diagnostics = savedDiag;
        (this as any).externals = savedExt;
        return folded;
    }

    /* ---------- expression parsing ---------- */

    private parseExpression(): ASTNode { return this.parseAssignment(); }

    private parseConditional(): ASTNode {
        let node = this.parseBinary(1);
        if (this.cur.kind === 'PUNCT' && this.cur.value === '?') {
            this.eat('PUNCT','?');
            const cons = this.parseExpression();
            if (!this.tryEat('PUNCT',':')) this.error('Expected ":" in conditional expression', this.cur.start, this.cur.end);
            const alt = this.parseExpression();
            node = { kind:'ConditionalExpression', test:node, consequent:cons, alternate:alt, ...span((node as any).start, (alt as any).end) };
        }
        return node;
    }

    private static PREC: Record<string, number> = {
        '||':1,
        '&&':2,
        '|':3,
        '^':4,
        '&':5,
        '==':6,'!=':6,
        '<':7,'>':7,'<=':7,'>=':7,
        '>>':8,'<<':8,'>>>':8,
        '+':9,'-':9,
        '*':10,'/':10,'%':10
    };

    private parseAssignment(): ASTNode {
        const left = this.parseConditional();
        if (this.cur.kind === 'PUNCT') {
            const op = this.cur.value;
            const isAssignOp =
        op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=' ||
        op === '%=' || op === '<<=' || op === '>>=' || op === '&=' || op === '^=' || op === '|=';

            if (isAssignOp) {
                this.eat('PUNCT', op);
                if (!this.isAssignable(left)) this.error('Invalid assignment target', (left as any).start, (left as any).end);
                if (left.kind === 'Identifier') this.externals.delete((left as Identifier).name);
                const right = this.parseAssignment(); // right-assoc
                return { kind:'AssignmentExpression', operator: op as any, left, right, ...span((left as any).start, (right as any).end) };
            }
        }
        return left;
    }

    private parseBinary(minPrec: number): ASTNode {
        let node = this.parseUnary();
        while (this.cur.kind === 'PUNCT' && Parser.PREC[this.cur.value] !== undefined) {
            const op = this.cur.value;
            const prec = Parser.PREC[op];
            if (prec < minPrec) break;
            this.eat('PUNCT', op);
            const rhs = this.parseBinary(prec + 1);
            node = { kind:'BinaryExpression', operator:op, left:node, right:rhs, ...span((node as any).start, (rhs as any).end) };
        }
        return node;
    }

    private parseUnary(): ASTNode {
        if (this.cur.kind === 'PUNCT' && (this.cur.value === '++' || this.cur.value === '--')) {
            const op = this.cur.value; const t = this.eat('PUNCT', op);
            const arg = this.parseUnary();
            if (!this.isAssignable(arg)) this.error('Invalid increment/decrement target', (arg as any).start, (arg as any).end);
            return { kind:'UpdateExpression', operator: op as any, argument: arg, prefix: true, ...span(t.start, (arg as any).end) };
        }
        if (this.cur.kind === 'PUNCT' && (this.cur.value === '+' || this.cur.value === '-' || this.cur.value === '!' || this.cur.value === '~')) {
            const op = this.cur.value; const t = this.eat('PUNCT', op);
            const arg = this.parseUnary();
            return { kind:'UnaryExpression', operator:op as any, argument:arg, ...span(t.start, (arg as any).end) };
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
                const startPos = (node as any).start;
                let lastEnd = (node as any).end;
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
                node = { kind:'ColonPath', parts, valueType:'unknown', ...span(startPos, lastEnd) };
                continue;
            }

            // If next token is ':' but we're not on Identifier/ColonPath, it's likely the ternary ':'; stop here.
            if (this.curIs('PUNCT', ':')) break;

            // function call
            if (this.tryEat('PUNCT','(')) {
                const args: ASTNode[] = [];
                if (!(this.cur.kind === 'PUNCT' && this.cur.value === ')')) {
                    while (true) {
                        args.push(this.parseExpression());
                        if (this.tryEat('PUNCT',',')) continue;
                        break;
                    }
                }
                if (!this.tryEat('PUNCT',')')) this.error('Expected ")"', this.cur.start, this.cur.end);
                const callee = node as ASTNode;
                const isIntrinsic = (callee as any).kind === 'Identifier' && INTRINSICS.has((callee as any).name);
                node = {
                    kind: isIntrinsic ? 'EvalPointCall' : 'CallExpression',
                    callee, args,
                    intrinsic: isIntrinsic ? ( (callee as any).name as IntrinsicName) : undefined,
                    ...(isIntrinsic && (['__CalcMemUsed','__FindSymbol','__GetRegVal','__Offset_of','__size_of','__Symbol_exists','__Running'] as string[]).includes((callee as any).name) ? { valueType: 'number' as const } : {}),
                    ...span((node as any).start, this.cur.end)
                } as any;
                continue;
            }
            // property access
            if (this.tryEat('PUNCT','.')) {
                if (this.cur.kind === 'IDENT') {
                    const prop = this.cur.value; const idt = this.eat('IDENT');
                    node = { kind:'MemberAccess', object:node, property:prop, ...span((node as any).start, idt.end) };
                } else {
                    this.error('Expected identifier after "."', this.cur.start, this.cur.end);
                }
                continue;
            }
            // index access
            if (this.tryEat('PUNCT', '[')) {
                const index = this.parseExpression();
                if (!this.tryEat('PUNCT', ']')) this.error('Expected "]"', this.cur.start, this.cur.end);
                node = { kind:'ArrayIndex', array:node, index, ...span((node as any).start, (index as any).end) };
                continue;
            }      // postfix ++ / --
            if (this.cur.kind === 'PUNCT' && (this.cur.value === '++' || this.cur.value === '--')) {
                const op = this.cur.value; const t = this.eat('PUNCT', op);
                if (!this.isAssignable(node)) this.error('Invalid increment/decrement target', (node as any).start, (node as any).end);
                node = { kind:'UpdateExpression', operator: op as any, argument: node, prefix: false, ...span((node as any).start, t.end) };
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
            const val = numFromRaw(t.value);
            return { kind:'NumberLiteral', value:val, raw:t.value, valueType:'number', constValue: val, ...span(t.start,t.end) };
        }
        if (t.kind === 'STRING') {
            this.eat('STRING');
            const text = unescapeString(t.value);
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
            if (!INTRINSICS.has(t.value)) this.externals.add(t.value);
            return node;
        }
        if (t.kind === 'PUNCT' && t.value === '(') {
            this.eat('PUNCT','(');
            const expr = this.parseExpression();
            if (!this.tryEat('PUNCT',')')) this.error('Expected ")"', this.cur.start, this.cur.end);
            return expr;
        }
        this.error(`Unexpected token ${t.kind} ${JSON.stringify(t.value)}`, t.start, t.end);
        this.eat(t.kind);
        return { kind:'ErrorNode', message:'Unexpected token', ...span(t.start,t.end) };
    }

    /* ---------- constant folding ---------- */

    private fold(node: ASTNode): ASTNode {
        const k = node.kind;

        if (k === 'NumberLiteral' || k === 'StringLiteral' || k === 'BooleanLiteral') {
            return { ...node, constValue: (node as any).value };
        }
        if (k === 'Identifier') return node;
        if (k === 'ColonPath') return node;
        if (k === 'MemberAccess') return { ...node, object: this.fold((node as MemberAccess).object) };
        if (k === 'ArrayIndex') return { ...node, array: this.fold((node as ArrayIndex).array), index: this.fold((node as ArrayIndex).index) };

        if (k === 'UnaryExpression') {
            const arg = this.fold((node as UnaryExpression).argument);
            const op = (node as UnaryExpression).operator;
            const res: any = { ...node, argument: arg };
            if ((arg as any).constValue !== undefined) {
                const v = (arg as any).constValue;
                try {
                    let cv: any;
                    if (op === '+') cv = +v;
                    else if (op === '-') cv = -v;
                    else if (op === '!') cv = !v;
                    else if (op === '~') cv = (~(v|0)) >>> 0;
                    if (cv !== undefined) res.constValue = cv;
                } catch {}
            }
            return res;
        }

        if (k === 'UpdateExpression') {
            const ue = node as UpdateExpression;
            return { ...ue, argument: this.fold(ue.argument) };
        }

        if (k === 'BinaryExpression') {
            const left = this.fold((node as BinaryExpression).left);
            const right = this.fold((node as BinaryExpression).right);
            const op = (node as BinaryExpression).operator;
            const res: any = { ...node, left, right };
            const la = (left as any).constValue; const ra = (right as any).constValue;
            const hasL = la !== undefined; const hasR = ra !== undefined;
            if (hasL && hasR) {
                try {
                    let cv: any;
                    const a:any = la, b:any = ra;
                    switch (op) {
                        case '+': cv = a + b; break;
                        case '-': cv = a - b; break;
                        case '*': cv = a * b; break;
                        case '/': if (b === 0) this.error('Division by zero', (node as any).start, (node as any).end); else cv = a / b; break;
                        case '%': cv = a % b; break;
                        case '<<': cv = (a << b) >>> 0; break;
                        case '>>': cv = (a >> b) >>> 0; break;
                        case '>>>': cv = (a >>> b); break;
                        case '&': cv = (a & b) >>> 0; break;
                        case '^': cv = (a ^ b) >>> 0; break;
                        case '|': cv = (a | b) >>> 0; break;
                        case '==': cv = a == b; break;
                        case '!=': cv = a != b; break;
                        case '<': cv = a < b; break;
                        case '<=': cv = a <= b; break;
                        case '>': cv = a > b; break;
                        case '>=': cv = a >= b; break;
                        case '&&': cv = !!a && !!b; break;
                        case '||': cv = !!a || !!b; break;
                    }
                    if (cv !== undefined) res.constValue = cv;
                } catch {}
            } else {
                if (op === '&&' && hasL && !la) res.constValue = false;
                if (op === '||' && hasL && la) res.constValue = true;
            }
            return res;
        }

        if (k === 'AssignmentExpression') {
            const ae = node as AssignmentExpression;
            const right = this.fold(ae.right);
            // Do not fold assignments to constants; keep side effects for evaluator
            const res: any = { ...ae, right };
            return res;
        }

        if (k === 'ConditionalExpression') {
            const test = this.fold((node as ConditionalExpression).test);
            const cons = this.fold((node as ConditionalExpression).consequent);
            const alt = this.fold((node as ConditionalExpression).alternate);
            const res: any = { ...node, test, consequent: cons, alternate: alt };
            if ((test as any).constValue !== undefined) {
                res.constValue = ((test as any).constValue ? (cons as any).constValue : (alt as any).constValue);
            }
            return res;
        }

        if (k === 'CallExpression' || k === 'EvalPointCall') {
            return { ...node, args: (node as any).args.map((a:ASTNode)=> this.fold(a)) } as any;
        }

        if (k === 'PrintfExpression') {
            return { ...node, segments: (node as PrintfExpression).segments.map(seg => {
                if (seg.kind === 'FormatSegment') return { ...seg, value: this.fold(seg.value) };
                return seg;
            }) };
        }

        return node;
    }
}

/* -------- Convenience singleton and API -------- */

export const defaultParser = new Parser();
export function parseExpression(expr: string, isPrintExpression: boolean): ParseResult {
    return defaultParser.parse(expr, isPrintExpression);
}
