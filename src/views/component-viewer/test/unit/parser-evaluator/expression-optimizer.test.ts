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

import {
    ExpressionOptimizer,
    __expressionOptimizerTestUtils,
    foldAst,
    optimizeParseResult,
} from '../../../parser-evaluator/expression-optimizer';
import type {
    ASTNode,
    AssignmentExpression,
    BinaryExpression,
    BooleanLiteral,
    CallExpression,
    CastExpression,
    ConditionalExpression,
    Diagnostic,
    EvalPointCall,
    FormatSegment,
    NumberLiteral,
    ParseResult,
    PrintfExpression,
    SizeofExpression,
    UnaryExpression,
    UpdateExpression,
} from '../../../parser-evaluator/parser';

const span = (start = 0, end = 1) => ({ start, end });

const num = (raw: string, value?: number | bigint, start = 0, end = 1): NumberLiteral => ({
    kind: 'NumberLiteral',
    raw,
    value: value ?? Number(raw),
    valueType: 'number',
    ...span(start, end),
});

const bool = (value: boolean, start = 0, end = 1): BooleanLiteral => ({
    kind: 'BooleanLiteral',
    value,
    valueType: 'boolean',
    ...span(start, end),
});

const ident = (name: string, constValue?: number | bigint | boolean, start = 0, end = 1): ASTNode => ({
    kind: 'Identifier',
    name,
    ...(constValue !== undefined ? { constValue } : {}),
    ...span(start, end),
});

const bin = (operator: string, left: ASTNode, right: ASTNode, start = 0, end = 1): BinaryExpression => ({
    kind: 'BinaryExpression',
    operator,
    left,
    right,
    ...span(start, end),
});

const unary = (operator: UnaryExpression['operator'], argument: ASTNode, start = 0, end = 1): UnaryExpression => ({
    kind: 'UnaryExpression',
    operator,
    argument,
    ...span(start, end),
});

describe('expression-optimizer', () => {
    it('exposes literal helpers and normalizers', () => {
        expect(__expressionOptimizerTestUtils.normalizeConstValue(1)).toBe(1);
        expect(__expressionOptimizerTestUtils.normalizeConstValue({})).toBeUndefined();
        expect(__expressionOptimizerTestUtils.isZeroConst(0)).toBe(true);
        expect(__expressionOptimizerTestUtils.isZeroConst(0n)).toBe(true);
        expect(__expressionOptimizerTestUtils.isZeroConst(1)).toBe(false);

        expect(__expressionOptimizerTestUtils.literalFromConst(3, 0, 1).kind).toBe('NumberLiteral');
        expect(__expressionOptimizerTestUtils.literalFromConst(3n, 0, 1).kind).toBe('NumberLiteral');
        expect(__expressionOptimizerTestUtils.literalFromConst('s', 0, 1).kind).toBe('StringLiteral');
        expect(__expressionOptimizerTestUtils.literalFromConst(true, 0, 1).kind).toBe('BooleanLiteral');
        expect(__expressionOptimizerTestUtils.literalFromConst({}, 0, 1).kind).toBe('ErrorNode');
    });

    it('folds literals, member access, and array indices', () => {
        const charLiteral = num('\'A\'', 65, 1, 2);
        const numLiteral = num('0x10', 16, 2, 3);
        const strLiteral: ASTNode = { kind: 'StringLiteral', value: 'hi', raw: '"hi"', valueType: 'string', ...span(3, 4) };
        const boolLiteral = bool(true, 4, 5);
        const member = { kind: 'MemberAccess', object: numLiteral, property: 'field', ...span(5, 6) };
        const index = { kind: 'ArrayIndex', array: member, index: num('2', 2, 6, 7), ...span(6, 8) };

        const foldedChar = foldAst(charLiteral);
        expect(foldedChar.constValue).toBe(65);
        const foldedNum = foldAst(numLiteral);
        expect(foldedNum.constValue).toBe(16);
        const foldedStr = foldAst(strLiteral);
        expect(foldedStr.constValue).toBe('hi');
        const foldedBool = foldAst(boolLiteral);
        expect(foldedBool.constValue).toBe(1);

        const foldedMember = foldAst(member);
        expect((foldedMember as { object: ASTNode }).object.constValue).toBe(16);
        const foldedIndex = foldAst(index);
        expect((foldedIndex as { index: ASTNode }).index.constValue).toBe(2);
    });

    it('folds unary and update expressions with diagnostics on errors', () => {
        const diagnostics: Diagnostic[] = [];
        const foldedUnary = foldAst(unary('-', num('1', 1, 0, 2)), diagnostics);
        expect(foldedUnary.kind).toBe('NumberLiteral');
        expect(foldedUnary.constValue).toBe(-1);

        const noFoldUnary = foldAst(unary('*', num('1', 1, 0, 2)));
        expect(noFoldUnary.kind).toBe('UnaryExpression');

        const update: UpdateExpression = {
            kind: 'UpdateExpression',
            operator: '++',
            argument: num('1', 1, 0, 2),
            prefix: true,
            ...span(0, 2),
        };
        const foldedUpdate = foldAst(update, diagnostics);
        expect((foldedUpdate as UpdateExpression).argument.constValue).toBe(1);
    });

    it('folds binary expressions, short-circuits, and identities', () => {
        const diagnostics: Diagnostic[] = [];
        const fullFold = foldAst(bin('+', num('1', 1, 0, 1), num('2', 2, 1, 2)), diagnostics);
        expect(fullFold.kind).toBe('NumberLiteral');
        expect(fullFold.constValue).toBe(3);

        const commaFold = foldAst(bin(',', num('1', 1, 0, 1), num('2', 2, 1, 2)));
        expect(commaFold.constValue).toBe(2);

        const shortAnd = foldAst(bin('&&', num('0', 0, 0, 1), ident('x', undefined, 1, 2)));
        expect(shortAnd.constValue).toBe(0);
        const shortOr = foldAst(bin('||', num('1', 1, 0, 1), ident('x', undefined, 1, 2)));
        expect(shortOr.constValue).toBe(1);

        const identityCases: Array<{ node: ASTNode; expected: ASTNode }> = [
            { node: bin('&&', ident('a'), num('1', 1)), expected: ident('a') },
            { node: bin('||', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('+', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('+', num('0', 0), ident('b')), expected: ident('b') },
            { node: bin('-', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('*', ident('a'), num('1', 1)), expected: ident('a') },
            { node: bin('*', num('1', 1), ident('b')), expected: ident('b') },
            { node: bin('/', ident('a'), num('1', 1)), expected: ident('a') },
            { node: bin('|', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('|', num('0', 0), ident('b')), expected: ident('b') },
            { node: bin('^', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('^', num('0', 0), ident('b')), expected: ident('b') },
            { node: bin('<<', ident('a'), num('0', 0)), expected: ident('a') },
            { node: bin('>>', ident('a'), num('0', 0)), expected: ident('a') },
        ];
        identityCases.forEach(({ node, expected }) => {
            const folded = foldAst(node);
            expect(folded.kind).toBe(expected.kind);
        });

        const fullCases: ASTNode[] = [
            bin('||', num('1', 1), num('1', 1)),
            bin('&&', num('1', 1), num('0', 0)),
            bin('*', num('2', 2), num('0', 0)),
            bin('*', num('0', 0), num('2', 2)),
            bin('&', num('2', 2), num('0', 0)),
            bin('&', num('0', 0), num('2', 2)),
        ];
        fullCases.forEach((node) => {
            const folded = foldAst(node);
            expect(folded.kind).toBe('NumberLiteral');
        });

        const divZero = foldAst(bin('/', num('1', 1), num('0', 0)), diagnostics);
        expect(divZero.kind).toBe('BinaryExpression');
        expect(diagnostics.some((d) => d.message === 'Division by zero')).toBe(true);

        const badShift = foldAst(bin('<<', num('1', 1), num('-1', -1)), diagnostics);
        expect(badShift.kind).toBe('BinaryExpression');
        expect(diagnostics.some((d) => d.message.includes('Invalid <<'))).toBe(true);
    });

    it('partially folds numeric chains', () => {
        const chain1 = bin('+', bin('+', ident('x'), num('1', 1)), num('2', 2));
        const folded1 = foldAst(chain1) as BinaryExpression;
        expect(folded1.operator).toBe('+');
        expect(folded1.right.constValue).toBe(3);

        const chain2 = bin('-', bin('+', ident('x'), num('5', 5)), num('2', 2));
        const folded2 = foldAst(chain2) as BinaryExpression;
        expect(folded2.operator).toBe('+');
        expect(folded2.right.constValue).toBe(3);

        const chain3 = bin('+', bin('-', ident('x'), num('5', 5)), num('2', 2));
        const folded3 = foldAst(chain3) as BinaryExpression;
        expect(folded3.operator).toBe('+');
        expect(folded3.right.constValue).toBe(-3);

        const chain4 = bin('-', bin('-', ident('x'), num('2', 2)), num('3', 3));
        const folded4 = foldAst(chain4) as BinaryExpression;
        expect(folded4.operator).toBe('-');
        expect(folded4.right.constValue).toBe(5);

        const mulChain = bin('*', bin('*', ident('x'), num('2', 2)), num('3', 3));
        const foldedMul = foldAst(mulChain) as BinaryExpression;
        expect(foldedMul.operator).toBe('*');
        expect(foldedMul.right.constValue).toBe(6);
    });

    it('folds conditional, casts, sizeof/alignof, and calls', () => {
        const cond: ConditionalExpression = {
            kind: 'ConditionalExpression',
            test: num('1', 1),
            consequent: num('2', 2),
            alternate: num('3', 3),
            ...span(0, 3),
        };
        const foldedCond = foldAst(cond);
        expect(foldedCond.constValue).toBe(2);

        const condNoFold: ConditionalExpression = {
            kind: 'ConditionalExpression',
            test: ident('x'),
            consequent: num('2', 2),
            alternate: num('3', 3),
            ...span(0, 3),
        };
        const foldedCondNoFold = foldAst(condNoFold);
        expect(foldedCondNoFold.kind).toBe('ConditionalExpression');

        const cast: CastExpression = {
            kind: 'CastExpression',
            typeName: 'unsigned int',
            argument: num('1', 1),
            ...span(0, 2),
        };
        const foldedCast = foldAst(cast);
        expect(foldedCast.constValue).toBe(1);

        const badCast: CastExpression = {
            kind: 'CastExpression',
            typeName: 'not-a-type',
            argument: num('1', 1),
            ...span(0, 2),
        };
        const foldedBadCast = foldAst(badCast);
        expect(foldedBadCast.kind).toBe('CastExpression');

        const sizeofExpr: SizeofExpression = { kind: 'SizeofExpression', typeName: 'int', ...span(0, 1) };
        const foldedSizeof = foldAst(sizeofExpr);
        expect(foldedSizeof.constValue).toBe(4);

        const alignofExpr: ASTNode = { kind: 'AlignofExpression', argument: num('1', 1), ...span(0, 1) };
        const foldedAlignof = foldAst(alignofExpr);
        expect((foldedAlignof as { argument?: ASTNode }).argument?.constValue).toBe(1);

        const call: CallExpression = { kind: 'CallExpression', callee: ident('fn'), args: [num('1', 1), num('2', 2)], ...span(0, 2) };
        const foldedCall = foldAst(call);
        expect((foldedCall as CallExpression).args[0]?.constValue).toBe(1);

        const evalPoint: EvalPointCall = {
            kind: 'EvalPointCall',
            callee: ident('__Running'),
            args: [num('1', 1)],
            intrinsic: '__Running',
            ...span(0, 1),
        };
        const foldedEvalPoint = foldAst(evalPoint);
        expect((foldedEvalPoint as EvalPointCall).args[0]?.constValue).toBe(1);
    });

    it('folds printf segments and assignments', () => {
        const formatSeg: FormatSegment = {
            kind: 'FormatSegment',
            spec: 'd',
            value: num('1', 1),
            ...span(0, 1),
        };
        const printf: PrintfExpression = {
            kind: 'PrintfExpression',
            segments: [formatSeg, { kind: 'TextSegment', text: 'x', ...span(1, 2) }],
            resultType: 'string',
            ...span(0, 2),
        };
        const foldedPrintf = foldAst(printf) as PrintfExpression;
        const foldedSeg = foldedPrintf.segments[0] as FormatSegment;
        expect(foldedSeg.value.constValue).toBe(1);

        const assign: AssignmentExpression = {
            kind: 'AssignmentExpression',
            operator: '=',
            left: ident('x'),
            right: num('2', 2),
            ...span(0, 2),
        };
        const foldedAssign = foldAst(assign) as AssignmentExpression;
        expect(foldedAssign.right.constValue).toBe(2);
    });

    it('wraps optimizeParseResult and logs on errors', () => {
        const optimizer = new ExpressionOptimizer();
        const diagnostics: Diagnostic[] = [];
        const ast = bin('/', num('1', 1), num('0', 0));
        const parsed: ParseResult = {
            ast,
            diagnostics,
            externalSymbols: [],
            isPrintf: false,
        };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const optimized = optimizer.optimizeParseResult(parsed);
        expect(optimized.diagnostics.some((d) => d.type === 'error')).toBe(true);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();

        const optimizedWrapped = optimizeParseResult(parsed);
        expect(optimizedWrapped.ast).toBeDefined();
    });

    it('handles mocked failures in applyUnary and applyBinary', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.doMock('../../../parser-evaluator/c-numeric', () => {
                const actual = jest.requireActual('../../../parser-evaluator/c-numeric');
                return {
                    ...actual,
                    applyUnary: () => {
                        throw new Error('boom');
                    },
                    applyBinary: () => {
                        throw new Error('boom');
                    },
                };
            });

            const mod = await import('../../../parser-evaluator/expression-optimizer');
            const diagnostics: Diagnostic[] = [];
            const unaryExpr = unary('-', num('1', 1));
            const binaryExpr = bin('+', num('1', 1), num('2', 2));
            const optimizer = new mod.ExpressionOptimizer();
            optimizer.foldAst(unaryExpr, diagnostics);
            optimizer.foldAst(binaryExpr, diagnostics);
            expect(diagnostics.some((d) => d.message.includes('Failed to fold unary'))).toBe(true);
            expect(diagnostics.some((d) => d.message.includes('Failed to fold binary'))).toBe(true);
        });
    });
});
