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
 * Integration test for ParserCoverage.
 */

import {
    type ASTNode,
    type BinaryExpression,
    type UnaryExpression,
    type Diagnostic,
    type EvalPointCall,
    type FormatSegment,
    type ConstValue,
    type NumberLiteral,
    type PrintfExpression,
    type TextSegment,
    type UpdateExpression,
    type ErrorNode,
    type Identifier,
    Parser
} from '../../../../parser-evaluator/parser';
import { __expressionOptimizerTestUtils, foldAst } from '../../../../parser-evaluator/expression-optimizer';
import { parseExpressionForTest as parseExpression } from '../../helpers/parse-expression';
import { DEFAULT_INTEGER_MODEL } from '../../../../parser-evaluator/c-numeric';

type ParserPrivate = {
    diagnostics: Diagnostic[];
    reset(input: string): void;
    eat(token: string): void;
    parse: (...args: unknown[]) => ASTNode;
    parseWithDiagnostics(input: string, allowPrintf: boolean): { ast: ASTNode; diagnostics: Diagnostic[] };
};

function asPrintf(ast: ASTNode): PrintfExpression {
    if (ast.kind !== 'PrintfExpression') {
        throw new Error(`Expected PrintfExpression, got ${ast.kind}`);
    }
    return ast;
}

function findFormat(segments: Array<TextSegment | FormatSegment>): FormatSegment | undefined {
    return segments.find((s): s is FormatSegment => s.kind === 'FormatSegment');
}

describe('parser', () => {
    it('auto-detects printf expressions and parses segments', () => {
        const pr = parseExpression('val=%x[sym]', false);
        expect(pr.isPrintf).toBe(true);
        expect(pr.diagnostics).toHaveLength(0);
        expect(pr.ast.kind).toBe('PrintfExpression');
        const segments = asPrintf(pr.ast).segments;
        expect(Array.isArray(segments)).toBe(true);
        expect(findFormat(segments)?.spec).toBe('x');
    });

    it('parses eval-point intrinsic calls', () => {
        const pr = parseExpression('__GetRegVal(r0)', false);
        expect(pr.diagnostics).toHaveLength(0);
        expect(pr.ast.kind).toBe('EvalPointCall');
        expect((pr.ast as EvalPointCall).intrinsic).toBe('__GetRegVal');
    });

    it('parses colon paths', () => {
        const pr = parseExpression('Type:field:EnumVal', false);
        expect(pr.diagnostics).toHaveLength(0);
        expect(pr.ast.kind).toBe('ColonPath');
        expect((pr.ast as { kind: 'ColonPath'; parts: string[] }).parts).toEqual(['Type', 'field', 'EnumVal']);
    });

    it('parses update expressions (postfix)', () => {
        const pr = parseExpression('foo++', false);
        expect(pr.diagnostics).toHaveLength(0);
        expect(pr.ast.kind).toBe('UpdateExpression');
        const node = pr.ast as UpdateExpression;
        expect(node.operator).toBe('++');
        expect(node.prefix).toBe(false);
    });

    it('parses casts and pointer member access', () => {
        const parser = new Parser(DEFAULT_INTEGER_MODEL);
        const cast = parser.parseWithDiagnostics('(int)1', false);
        expect(cast.diagnostics).toHaveLength(0);
        expect(cast.ast.kind).toBe('CastExpression');

        const ptr = parseExpression('p->field', false);
        expect(ptr.diagnostics).toHaveLength(0);
        expect(ptr.ast.kind).toBe('MemberAccess');

        const badPtr = parseExpression('p->', false);
        expect(badPtr.diagnostics.some(d => d.type === 'error')).toBe(true);
    });

    it('reports diagnostics on unterminated printf bracket', () => {
        const pr = parseExpression('%x[foo', true);
        expect(pr.isPrintf).toBe(true);
        expect(pr.diagnostics.length).toBeGreaterThan(0);
    });

    it('tracks external symbols and drops assigned identifiers', () => {
        const pr = parseExpression('a = b', false);
        expect(pr.diagnostics).toHaveLength(0);
        expect(pr.externalSymbols).toEqual(['b']);
    });

    it('warns on trailing tokens', () => {
        const pr = parseExpression('1 2', false);
        expect(pr.diagnostics.length).toBeGreaterThan(0);
        expect(pr.diagnostics.some(d => d.type === 'warning')).toBe(true);
    });

    it('parses octal, binary, and exponent numbers', () => {
        expect(parseExpression('0o17', false).ast.constValue).toBe(15);
        expect(parseExpression('0b1011', false).ast.constValue).toBe(11);
        expect(parseExpression('1.5e2', false).ast.constValue).toBe(150);
    });

    it('parses hex float exponents and sizeof/alignof type names', () => {
        const hexFloat = parseExpression('0x1.2p-3', false);
        expect(hexFloat.diagnostics).toHaveLength(0);
        expect(hexFloat.ast.constValue).toBeCloseTo(0.140625, 6);

        const sizeofType = parseExpression('sizeof(int)', false);
        expect(sizeofType.ast.constValue).toBe(4);
        const alignofType = parseExpression('alignof(int)', false);
        expect(alignofType.ast.constValue).toBe(4);
    });

    it('unescapes valid and invalid string escapes', () => {
        expect(parseExpression('"\\u0041"', false).ast.constValue).toBe('A');
        expect(parseExpression('"\\u{1F600}"', false).ast.constValue).toBe('😀');
        expect(parseExpression('"\\xZZ"', false).ast.constValue).toBe('xZZ');
        expect(parseExpression('"unterminated\\\\\\"', false).ast.constValue).toBe('unterminated\\\\');
        expect(parseExpression('\'\\101\'', false).ast.constValue).toBe(65);
    });

    it('covers tokenizer branches (exponent signs and unknown tokens)', () => {
        expect(parseExpression('1e-3', false).ast.constValue).toBeCloseTo(0.001);
        const unknown = parseExpression('@', false);
        expect(unknown.diagnostics.some(d => d.type === 'error')).toBe(true);
    });

    it('folds to string and boolean literals when possible', () => {
        expect(parseExpression('"a" + "b"', false).ast.constValue).toBeUndefined();
        expect(parseExpression('1 == 1', false).ast.constValue).toBe(1);
        expect(parseExpression('\'\\\'\'', false).ast.constValue).toBe(39);
    });

    it('handles additional invalid escape sequences', () => {
        expect(parseExpression('"\\u{ZZ}"', false).ast.constValue).toBe('u{ZZ}');
        expect(parseExpression('"\\u00GZ"', false).ast.constValue).toBe('u00GZ');
        expect(parseExpression('"\\x41"', false).ast.constValue).toBe('A');
    });

    it('covers all simple escape sequences and default escape handling', () => {
        // eslint-disable-next-line quotes, no-useless-escape
        const val = parseExpression(`"\\n\\r\\t\\b\\f\\v\\\\\\\"'\\0\\q"`, false).ast.constValue as string;
        expect(val).toBe('\n\r\t\b\f\v\\"\'\0q');
    });

    it('handles NaN from malformed numeric literals', () => {
        const res = parseExpression('0x', false);
        const ast = res.ast as NumberLiteral;
        expect(Number.isNaN(ast.value)).toBe(true);
    });

    it('covers printf edge cases and scanning logic', () => {
        const empty = parseExpression('', true);
        expect(empty.isPrintf).toBe(true);
        expect(asPrintf(empty.ast).segments).toHaveLength(0);

        const trailingPercent = parseExpression('trail %', true);
        const trailingSegments = asPrintf(trailingPercent.ast).segments;
        const trailing = trailingSegments.at(-1);
        expect(trailing && trailing.kind === 'TextSegment' ? trailing.text : undefined).toBe('%');

        const noBracket = parseExpression('%x value', true);
        const first = asPrintf(noBracket.ast).segments[0];
        expect(first.kind === 'TextSegment' ? first.text : undefined).toBe('%x');

        const escapedString = parseExpression('%x["unterminated', true);
        expect(escapedString.diagnostics.some(d => d.message.includes('Unclosed formatter bracket'))).toBe(true);

        const escapedWithin = parseExpression('%x["a\\\\\\"b"]', true);
        expect(escapedWithin.diagnostics).toHaveLength(0);
        const seg = asPrintf(escapedWithin.ast).segments.find(s => s.kind === 'FormatSegment') as FormatSegment | undefined;
        expect(seg?.spec).toBe('x');

        const forcedByDoublePercent = parseExpression('%% literal', false);
        expect(forcedByDoublePercent.isPrintf).toBe(true);

        const semicolonInner = parseExpression('%x[1;]', true);
        expect(asPrintf(semicolonInner.ast).segments.length).toBeGreaterThan(0);
    });

    it('reports division/modulo by zero during folding', () => {
        const div = parseExpression('1/0', false);
        expect(div.diagnostics.some(d => d.message.includes('Division by zero'))).toBe(true);
        const mod = parseExpression('1%0', false);
        expect(mod.diagnostics.some(d => d.message.includes('Division by zero'))).toBe(true);
    });

    it('handles missing intrinsic definitions during parsing', async () => {
        jest.resetModules();
        jest.doMock('../../../../parser-evaluator/intrinsics', () => {
            const actual = jest.requireActual('../../../../parser-evaluator/intrinsics');
            return {
                ...actual,
                INTRINSIC_DEFINITIONS: {
                    ...actual.INTRINSIC_DEFINITIONS,
                    __GetRegVal: undefined
                }
            };
        });
        const { Parser } = await import('../../../../parser-evaluator/parser');
        const { ExpressionOptimizer } = await import('../../../../parser-evaluator/expression-optimizer');
        const { DEFAULT_INTEGER_MODEL } = await import('../../../../parser-evaluator/c-numeric');
        const parser = new Parser(DEFAULT_INTEGER_MODEL);
        const parsed = parser.parseWithDiagnostics('__GetRegVal(1)', false);
        const optimizer = new ExpressionOptimizer(DEFAULT_INTEGER_MODEL);
        const pr = optimizer.optimizeParseResult(parsed);
        expect(pr.ast.kind).toBe('EvalPointCall');
        jest.dontMock('../../../../parser-evaluator/intrinsics');
        jest.resetModules();
    });

    it('exposes parser test utilities for const normalization', () => {
        expect(__expressionOptimizerTestUtils.normalizeConstValue(true)).toBe(true);
        expect(__expressionOptimizerTestUtils.normalizeConstValue({} as unknown as ConstValue)).toBeUndefined();
        expect(__expressionOptimizerTestUtils.isZeroConst(0)).toBe(true);
        expect(__expressionOptimizerTestUtils.isZeroConst(1)).toBe(false);
        expect(__expressionOptimizerTestUtils.isZeroConst(undefined)).toBe(false);
    });

    it('parses plain printf text without specifiers', () => {
        const pr = parseExpression('plain text', true);
        expect(asPrintf(pr.ast).segments).toHaveLength(1);
    });

    it('reports malformed conditionals and invalid assignment targets', () => {
        const missingColon = parseExpression('a ? b', false);
        expect(missingColon.diagnostics.some(d => d.message.includes('Expected ":"'))).toBe(true);

        const badTarget = parseExpression('(a+b)=3', false);
        expect(badTarget.diagnostics.some(d => d.message.includes('Invalid assignment target'))).toBe(true);

        const tooFewArgs = parseExpression('__CalcMemUsed(1)', false);
        expect(tooFewArgs.diagnostics.some(d => d.message.includes('expects at least 4 argument'))).toBe(true);
        const tooManyArgs = parseExpression('__GetRegVal(r0, r1)', false);
        expect(tooManyArgs.diagnostics.some(d => d.message.includes('expects at most 1 argument'))).toBe(true);
    });

    it('parses prefix updates and colon-path failures', () => {
        const prefix = parseExpression('++foo', false);
        expect(prefix.ast.kind).toBe('UpdateExpression');
        expect((prefix.ast as UpdateExpression).prefix).toBe(true);

        const colonError = parseExpression('Type:', false);
        expect(colonError.diagnostics.some(d => d.message.includes('Expected identifier after ":"'))).toBe(true);

        const colonPathContinuation = parseExpression('A:B::C', false);
        expect(colonPathContinuation.diagnostics.some(d => d.message.includes('Expected identifier after ":"'))).toBe(true);
    });

    it('covers call/property/index errors and postfix validation', () => {
        const call = parseExpression('fn(1', false);
        expect(call.diagnostics.some(d => d.message.includes('Expected ")"'))).toBe(true);

        const prop = parseExpression('obj.', false);
        expect(prop.diagnostics.some(d => d.message.includes('Expected identifier after "."'))).toBe(true);

        const idx = parseExpression('arr[1', false);
        expect(idx.diagnostics.some(d => d.message.includes('Expected "]"'))).toBe(true);

        const postfix = parseExpression('(1+2)++', false);
        expect(postfix.diagnostics.some(d => d.message.includes('Invalid increment/decrement target'))).toBe(true);

        const prefixInvalid = parseExpression('++(1+2)', false);
        expect(prefixInvalid.diagnostics.some(d => d.message.includes('Invalid increment/decrement target'))).toBe(true);
    });

    it('folds unary plus, bitwise not, and addition chains', () => {
        expect(parseExpression('+5', false).ast.constValue).toBe(5);
        expect(parseExpression('~1', false).ast.constValue).toBe(-2);

        const chain = parseExpression('foo + 1 + 2', false);
        const chainAst = chain.ast as BinaryExpression;
        expect((chainAst.right as NumberLiteral).value).toBe(3);

        const combined = parseExpression('(foo-1)+2', false).ast as BinaryExpression;
        expect(combined.operator).toBe('+');
        expect((combined.left as Identifier).name).toBe('foo');
        expect((combined.right as NumberLiteral).value).toBe(1);
    });

    it('folds printf segments and nested expressions', () => {
        const pr = parseExpression('v=%x[1+2]', true);
        expect(pr.ast.kind).toBe('PrintfExpression');
        const seg = findFormat(asPrintf(pr.ast).segments);
        expect(seg?.value.constValue).toBe(3);
    });

    it('folds additional binary operators and detects div by zero', () => {
        expect(parseExpression('5 % 2', false).ast.constValue).toBe(1);
        expect(parseExpression('5-2', false).ast.constValue).toBe(3);
        expect(parseExpression('4/2', false).ast.constValue).toBe(2);
        expect(parseExpression('1 != 2', false).ast.constValue).toBe(1);
        expect(parseExpression('1 < 2', false).ast.constValue).toBe(1);
        expect(parseExpression('2 <= 2', false).ast.constValue).toBe(1);
        expect(parseExpression('3 > 2', false).ast.constValue).toBe(1);
        expect(parseExpression('3 >= 3', false).ast.constValue).toBe(1);
        expect(parseExpression('1 && 0', false).ast.constValue).toBe(0);
        expect(parseExpression('1 || 0', false).ast.constValue).toBe(1);
        expect(parseExpression('0 || 1', false).ast.constValue).toBe(1);
        const divZero = parseExpression('1/0', false);
        expect(divZero.diagnostics.some(d => d.message.includes('Division by zero'))).toBe(true);
    });

    it('records diagnostics when eat() sees unexpected tokens', () => {
        const parser = new Parser() as unknown as ParserPrivate;
        parser.reset('');
        parser.diagnostics = [];
        parser.eat('IDENT');
        expect(parser.diagnostics.some((d: Diagnostic) => d.message.includes('Expected IDENT'))).toBe(true);
    });

    it('covers fold error paths via direct invocation', () => {
        const diagnostics: Diagnostic[] = [];
        const throwingPrimitive = { valueOf: () => { throw 'boom'; }, toString: () => { throw 'boom'; } };

        const badUnaryArg: ErrorNode = { kind: 'ErrorNode', message: 'boom', constValue: throwingPrimitive as unknown as ConstValue, start: 0, end: 1 };
        const unaryNode: UnaryExpression = { kind: 'UnaryExpression', operator: '+', argument: badUnaryArg, start: 0, end: 1 };
        const unaryResult = foldAst(unaryNode, diagnostics);
        expect(unaryResult.constValue).toBeUndefined();

        const oddUnary: UnaryExpression = { kind: 'UnaryExpression', operator: '*' as '+' | '-' | '!' | '~', argument: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 }, start: 0, end: 1 };
        const oddUnaryResult = foldAst(oddUnary, diagnostics);
        expect(oddUnaryResult.constValue).toBeUndefined();

        const badBinaryLeft: ErrorNode = { kind: 'ErrorNode', message: 'bin', constValue: throwingPrimitive as unknown as ConstValue, start: 0, end: 1 };
        const badBinaryRight: NumberLiteral = { kind: 'NumberLiteral', value: 2, raw: '2', valueType: 'number', constValue: 2, start: 0, end: 1 };
        const badBinary: BinaryExpression = { kind: 'BinaryExpression', operator: '+', left: badBinaryLeft, right: badBinaryRight, start: 0, end: 1 };
        const badBinaryResult = foldAst(badBinary, diagnostics);
        expect(badBinaryResult.constValue).toBeUndefined();

        const errId: Identifier = { kind: 'Identifier', name: 'x', constValue: { valueOf: () => { throw new Error('err'); } } as unknown as ConstValue, valueType: 'unknown', start: 0, end: 1 };
        const errUnary: UnaryExpression = { kind: 'UnaryExpression', operator: '+', argument: errId, start: 0, end: 1 };
        foldAst(errUnary, diagnostics);

        const literalFallback = __expressionOptimizerTestUtils.literalFromConst(undefined, 0, 1);
        expect(literalFallback.kind).toBe('ErrorNode');

        const errBinary: BinaryExpression = { kind: 'BinaryExpression', operator: '+', left: errId, right: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 0, end: 1 }, start: 0, end: 1 };
        foldAst(errBinary, diagnostics);

        // BigInt normalization, modulo-by-zero early return, and unknown operator fallbacks
        const bigLeft: NumberLiteral = { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1n as unknown as ConstValue, start: 0, end: 1 };
        const bigRight: NumberLiteral = { kind: 'NumberLiteral', value: 2, raw: '2', valueType: 'number', constValue: 2n as unknown as ConstValue, start: 0, end: 1 };
        const bigintSum = foldAst({ kind: 'BinaryExpression', operator: '+', left: bigLeft, right: bigRight, start: 0, end: 1 }, diagnostics);
        expect(bigintSum.constValue).toBe(3); // bigint coerced to number

        const modZeroParsed = parseExpression('1%0', false);
        expect(modZeroParsed.ast.constValue).toBeUndefined();

        const unknownOp = foldAst({ kind: 'BinaryExpression', operator: '**', left: bigLeft, right: bigRight, start: 0, end: 1 }, diagnostics);
        expect(unknownOp.constValue).toBeUndefined();
    });

    it('captures exceptions via parseWithDiagnostics', () => {
        const parser = new Parser() as unknown as ParserPrivate;
        parser.parse = () => { throw new Error('boom'); };
        const res = parser.parseWithDiagnostics('x', false);
        expect(res.ast.kind).toBe('ErrorNode');
        expect(res.diagnostics.some((d: Diagnostic) => d.message.includes('boom'))).toBe(true);
    });

    it('handles AggregateError branches and fallback messages', () => {
        const parser = new Parser() as unknown as ParserPrivate;
        parser.parse = () => { throw new AggregateError(['str'], 'agg'); };
        const res = parser.parseWithDiagnostics('x', false);
        expect(res.diagnostics.some((d: Diagnostic) => d.message.includes('str'))).toBe(true);

        parser.parse = () => { throw new AggregateError([], 'empty'); };
        const res2 = parser.parseWithDiagnostics('x', false);
        expect((res2.ast as ErrorNode).message).toBe('Unknown parser error');
    });

    it('covers map precedence fallback and non-identifier callees', () => {
        const parserCtor = Parser as unknown as { PREC: Map<string, number | undefined> };
        const prev = parserCtor.PREC.get('&&');
        parserCtor.PREC.set('&&', undefined);
        expect(parseExpression('a && b', false).ast.kind).toBe('Identifier');
        parserCtor.PREC.set('&&', prev);

        const call = parseExpression('(obj.fn)()', false);
        expect((call.ast as { callee: ASTNode }).callee.kind).toBeDefined();
    });

    it('falls back when type-name parsing misses closing parens', () => {
        const res = parseExpression('(int 1)', false);
        expect(res.diagnostics.length).toBeGreaterThan(0);
    });

    it('covers empty char literal codepoint fallback', () => {
        const res = parseExpression('\'\'', false);
        expect(res.ast.constValue).toBe(0);
    });

    it('covers boolean literals, hex scanning, and grouped expression diagnostics', () => {
        expect(parseExpression('true', false).ast.constValue).toBe(1);
        expect(parseExpression('false', false).ast.constValue).toBe(0);
        expect(parseExpression('0x1f', false).ast.constValue).toBe(31);
        const missingParen = parseExpression('(1', false);
        expect(missingParen.diagnostics.some(d => d.message.includes('Expected ")"'))).toBe(true);
    });

    it('folds member/array access operands without altering structure', () => {
        const member = foldAst({
            kind: 'MemberAccess',
            object: { kind: 'Identifier', name: 'foo', valueType: 'unknown', start: 0, end: 3 },
            property: { kind: 'Identifier', name: 'bar', valueType: 'unknown', start: 4, end: 7 },
            start: 0,
            end: 7
        } as unknown as ASTNode);
        expect(member.kind).toBe('MemberAccess');

        const arrayIdx = foldAst({
            kind: 'ArrayIndex',
            array: { kind: 'Identifier', name: 'arr', valueType: 'unknown', start: 0, end: 3 },
            index: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1, start: 4, end: 5 },
            start: 0,
            end: 5
        } as unknown as ASTNode);
        expect(arrayIdx.kind).toBe('ArrayIndex');
    });

    it('folds unary/logical/conditional expressions and BigInt coercion', () => {
        expect(parseExpression('!1', false).ast.constValue).toBe(0);
        expect(parseExpression('~0', false).ast.constValue).toBe(-1);
        expect(parseExpression('0 && foo', false).ast.constValue).toBe(0);
        expect(parseExpression('1 || foo', false).ast.constValue).toBe(1);
        expect(parseExpression('true ? 1 : 2', false).ast.constValue).toBe(1);
        expect(parseExpression('1 / 0', false).ast.constValue).toBeUndefined();
        expect(parseExpression('1 % 0', false).ast.constValue).toBeUndefined();

        const bigLeft = { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1n as unknown as ConstValue, start: 0, end: 1 } as NumberLiteral;
        const bigRight = { kind: 'NumberLiteral', value: 2, raw: '2', valueType: 'number', constValue: 2n as unknown as ConstValue, start: 0, end: 1 } as NumberLiteral;
        const folded = foldAst({ kind: 'BinaryExpression', operator: '+', left: bigLeft, right: bigRight, start: 0, end: 1 });
        expect(folded.constValue).toBe(3);

        expect(parseExpression('-2', false).ast.constValue).toBe(-2);
        expect(parseExpression('+foo', false).ast.constValue).toBeUndefined();
        const falseTernary = parseExpression('false ? 1 : 2', false);
        expect(falseTernary.ast.constValue).toBe(2);

        const bigintNot = foldAst({
            kind: 'UnaryExpression',
            operator: '~',
            argument: { kind: 'NumberLiteral', value: 1, raw: '1', valueType: 'number', constValue: 1n as unknown as ConstValue, start: 0, end: 1 },
            start: 0,
            end: 1
        } as unknown as ASTNode);
        expect(typeof bigintNot.constValue).toBe('number');

        // Exercise bigint branches in foldBinaryConst (div/mod zero and non-zero)
        const bigZero: NumberLiteral = { kind: 'NumberLiteral', value: 0, raw: '0', valueType: 'number', constValue: 0n as unknown as ConstValue, start: 0, end: 1 };
        const divZeroBig = foldAst({ kind: 'BinaryExpression', operator: '/', left: bigLeft, right: bigZero, start: 0, end: 1 });
        expect((divZeroBig as { constValue?: ConstValue }).constValue).toBeUndefined();
        const modBig = foldAst({ kind: 'BinaryExpression', operator: '%', left: bigRight, right: bigLeft, start: 0, end: 1 });
        expect(modBig.constValue).toBe(0);
    });
    it('folds remaining binary operators and normalizes const values', () => {
        expect(parseExpression('5 * 2', false).ast.constValue).toBe(10);
        expect(parseExpression('7 - 3', false).ast.constValue).toBe(4);
        expect(parseExpression('1 << 3', false).ast.constValue).toBe(8);
        expect(parseExpression('8 >> 1', false).ast.constValue).toBe(4);
        expect(parseExpression('1 & 3', false).ast.constValue).toBe(1);
        expect(parseExpression('1 ^ 3', false).ast.constValue).toBe(2);
        expect(parseExpression('1 | 2', false).ast.constValue).toBe(3);
        const bigNormalized = parseExpression('1 + 9007199254740993', false).ast.constValue;
        expect(typeof bigNormalized).toBe('bigint');
        expect(bigNormalized as bigint).toBeGreaterThan(9_000_000_000_000_000n);
        const idxOk = parseExpression('arr[1]', false);
        expect(idxOk.ast.kind).toBe('ArrayIndex');
    });

    it('consumes trailing semicolons and leaves diagnostics for stray tokens', () => {
        const trailingSemicolons = parseExpression('1;;;', false);
        expect(trailingSemicolons.diagnostics).toHaveLength(0);

        const strayColon = parseExpression('1:2', false);
        expect(strayColon.diagnostics.some(d => d.message.includes('Extra tokens'))).toBe(true);
    });

    it('handles nested formatter brackets in printf parsing', () => {
        const nested = parseExpression('%x[[1]]', true);
        expect(nested.isPrintf).toBe(true);
        expect(asPrintf(nested.ast).segments).toHaveLength(1);
    });

    it('parses multiple call arguments', () => {
        const call = parseExpression('fn(1,2,3)', false);
        const callAst = call.ast as { kind: string; args?: unknown[] };
        expect(callAst.kind).toBe('CallExpression');
        expect(callAst.args && callAst.args.length).toBe(3);
    });
});
