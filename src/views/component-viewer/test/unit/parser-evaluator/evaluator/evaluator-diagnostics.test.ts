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

import { EvaluatorDiagnostics } from '../../../../parser-evaluator/evaluator-diagnostics';
import type {
    ASTNode,
    AssignmentExpression,
    BinaryExpression,
    ConditionalExpression,
    EvalPointCall,
    FormatSegment,
    Identifier,
    MemberAccess,
    NumberLiteral,
    PrintfExpression,
    StringLiteral,
    TextSegment,
    UnaryExpression,
    UpdateExpression,
    ArrayIndex,
    BooleanLiteral,
    CallExpression,
} from '../../../../parser-evaluator/parser';
import type { EvalValue } from '../../../../parser-evaluator/model-host';

const span = { start: 0, end: 0 };
const id = (name: string): Identifier => ({ kind: 'Identifier', name, ...span });
const num = (value: number): NumberLiteral => ({ kind: 'NumberLiteral', value, raw: String(value), valueType: 'number', constValue: value, ...span });
const str = (value: string): StringLiteral => ({ kind: 'StringLiteral', value, raw: JSON.stringify(value), valueType: 'string', constValue: value, ...span });
const bool = (value: boolean): BooleanLiteral => ({ kind: 'BooleanLiteral', value, valueType: 'boolean', constValue: value, ...span });
const member = (object: ASTNode, property: string): MemberAccess => ({ kind: 'MemberAccess', object, property, ...span });
const arr = (array: ASTNode, index: ASTNode): ArrayIndex => ({ kind: 'ArrayIndex', array, index, ...span } as ArrayIndex);
const unary = (operator: UnaryExpression['operator'], argument: ASTNode): UnaryExpression => ({ kind: 'UnaryExpression', operator, argument, ...span });
const binary = (operator: BinaryExpression['operator'], left: ASTNode, right: ASTNode): BinaryExpression => ({ kind: 'BinaryExpression', operator, left, right, ...span });
const update = (operator: UpdateExpression['operator'], argument: ASTNode, prefix: boolean): UpdateExpression => ({ kind: 'UpdateExpression', operator, argument, prefix, ...span });
const assign = (operator: AssignmentExpression['operator'], left: ASTNode, right: ASTNode): AssignmentExpression => ({ kind: 'AssignmentExpression', operator, left, right, ...span });
const callExpr = (callee: ASTNode, args: ASTNode[]): CallExpression => ({ kind: 'CallExpression', callee, args, ...span });
const evalPoint = (name: string, args: ASTNode[]): EvalPointCall => ({ kind: 'EvalPointCall', intrinsic: name, callee: id(name), args, ...span } as EvalPointCall);
const formatSeg = (spec: FormatSegment['spec'], value: ASTNode): FormatSegment => ({ kind: 'FormatSegment', spec, value, ...span });
const textSeg = (text: string): TextSegment => ({ kind: 'TextSegment', text, ...span });
const printfExpr = (segments: Array<TextSegment | FormatSegment>): PrintfExpression => ({ kind: 'PrintfExpression', segments, resultType: 'string', ...span } as PrintfExpression);

describe('EvaluatorDiagnostics', () => {
    it('records, resets, and exposes messages', () => {
        const diag = new EvaluatorDiagnostics();
        expect(diag.getMessages()).toBe('');

        diag.record('a');
        diag.record('b');
        expect(diag.getMessages()).toBe('a\nb');

        diag.reset();
        expect(diag.getMessages()).toBe('');

        diag.onIntrinsicError('intrinsic');
        expect(diag.getMessages()).toBe('intrinsic');
    });

    it('formats eval values for messages', () => {
        const diag = new EvaluatorDiagnostics();
        expect(diag.formatEvalValueForMessage(undefined)).toBe('undefined');
        expect(diag.formatEvalValueForMessage('short')).toBe('"short"');

        const long = 'x'.repeat(70);
        const formattedLong = diag.formatEvalValueForMessage(long);
        expect(formattedLong.startsWith('"')).toBe(true);
        expect(formattedLong.endsWith('"')).toBe(true);
        expect(formattedLong).toContain('...');

        expect(diag.formatEvalValueForMessage(123)).toBe('123');
        expect(diag.formatEvalValueForMessage(123n)).toBe('123');
        expect(diag.formatEvalValueForMessage(new Uint8Array([1, 2, 3]))).toBe('Uint8Array(3)');
        expect(diag.formatEvalValueForMessage({} as unknown as EvalValue)).toBe('[object Object]');
    });

    it('formats nodes for messages', () => {
        const diag = new EvaluatorDiagnostics();

        expect(diag.formatNodeForMessage(id('x'))).toBe('Identifier(x)');
        expect(diag.formatNodeForMessage(member(id('obj'), 'field'))).toBe('MemberAccess(Identifier(obj).field)');
        expect(diag.formatNodeForMessage(arr(id('arr'), num(0)))).toBe('ArrayIndex(Identifier(arr)[...])');
        expect(diag.formatNodeForMessage(callExpr(id('fn'), []))).toBe('CallExpression');
        expect(diag.formatNodeForMessage(evalPoint('__Running', []))).toBe('EvalPointCall');
        expect(diag.formatNodeForMessage(unary('-', num(1)))).toBe('UnaryExpression(-)');
        expect(diag.formatNodeForMessage(binary('+', num(1), num(2)))).toBe('BinaryExpression(+)');

        const cond: ConditionalExpression = { kind: 'ConditionalExpression', test: num(1), consequent: num(2), alternate: num(3), ...span };
        expect(diag.formatNodeForMessage(cond)).toBe('ConditionalExpression');

        expect(diag.formatNodeForMessage(assign('=', id('x'), num(1)))).toBe('AssignmentExpression(=)');
        expect(diag.formatNodeForMessage(update('++', id('x'), true))).toBe('UpdateExpression(++)');
        expect(diag.formatNodeForMessage(printfExpr([textSeg('x')]))).toBe('PrintfExpression');
        expect(diag.formatNodeForMessage(formatSeg('d', num(1)))).toBe('FormatSegment');
        expect(diag.formatNodeForMessage(textSeg('t'))).toBe('TextSegment');
        expect(diag.formatNodeForMessage(num(5))).toBe('NumberLiteral(5)');
        expect(diag.formatNodeForMessage(str('hi'))).toBe('StringLiteral("hi")');
        expect(diag.formatNodeForMessage(bool(true))).toBe('BooleanLiteral(true)');

        expect(diag.formatNodeForMessage({ kind: 'UnknownKind', ...span } as unknown as ASTNode)).toBe('UnknownKind');
    });
});
