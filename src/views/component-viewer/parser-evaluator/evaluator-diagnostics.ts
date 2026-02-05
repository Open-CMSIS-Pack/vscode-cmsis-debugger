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

import type {
    ASTNode,
    AssignmentExpression,
    BinaryExpression,
    BooleanLiteral,
    Identifier,
    MemberAccess,
    NumberLiteral,
    StringLiteral,
    UnaryExpression,
    UpdateExpression,
    ArrayIndex,
} from './parser';
import type { EvalValue } from './model-host';

export class EvaluatorDiagnostics {
    private readonly messages: string[] = [];

    public reset(): void {
        this.messages.length = 0;
    }

    public record(message: string): void {
        this.messages.push(message);
    }

    public getMessages(): string {
        return this.messages.join('\n');
    }

    public onIntrinsicError = (message: string): void => {
        this.record(message);
    };

    public formatEvalValueForMessage(value: EvalValue): string {
        if (value === undefined) {
            return 'undefined';
        }
        if (typeof value === 'string') {
            const trimmed = value.length > 64 ? `${value.slice(0, 61)}...` : value;
            return `"${trimmed}"`;
        }
        if (typeof value === 'number' || typeof value === 'bigint') {
            return String(value);
        }
        if (value instanceof Uint8Array) {
            return `Uint8Array(${value.length})`;
        }
        return String(value);
    }

    public formatNodeForMessage(node: ASTNode): string {
        switch (node.kind) {
            case 'Identifier':
                return `Identifier(${(node as Identifier).name})`;
            case 'MemberAccess': {
                const ma = node as MemberAccess;
                return `MemberAccess(${this.formatNodeForMessage(ma.object)}.${ma.property})`;
            }
            case 'ArrayIndex': {
                const ai = node as ArrayIndex;
                return `ArrayIndex(${this.formatNodeForMessage(ai.array)}[...])`;
            }
            case 'CallExpression':
                return 'CallExpression';
            case 'EvalPointCall':
                return 'EvalPointCall';
            case 'UnaryExpression':
                return `UnaryExpression(${(node as UnaryExpression).operator})`;
            case 'BinaryExpression':
                return `BinaryExpression(${(node as BinaryExpression).operator})`;
            case 'ConditionalExpression':
                return 'ConditionalExpression';
            case 'AssignmentExpression':
                return `AssignmentExpression(${(node as AssignmentExpression).operator})`;
            case 'UpdateExpression':
                return `UpdateExpression(${(node as UpdateExpression).operator})`;
            case 'PrintfExpression':
                return 'PrintfExpression';
            case 'FormatSegment':
                return 'FormatSegment';
            case 'TextSegment':
                return 'TextSegment';
            case 'NumberLiteral':
                return `NumberLiteral(${(node as NumberLiteral).value})`;
            case 'StringLiteral':
                return `StringLiteral("${(node as StringLiteral).value}")`;
            case 'BooleanLiteral':
                return `BooleanLiteral(${(node as BooleanLiteral).value})`;
            default:
                return node.kind;
        }
    }
}
