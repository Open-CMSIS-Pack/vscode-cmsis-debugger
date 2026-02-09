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

import { Parser, type ParseResult, type ValueType } from './parser-evaluator/parser';
import { ExpressionOptimizer } from './parser-evaluator/expression-optimizer';
import type { IntegerModel } from './parser-evaluator/c-numeric';
import { ScvdNode } from './model/scvd-node';
import { parsePerf } from './stats-config';

export interface ParserSymbolInfo {
    valueType?: ValueType;
    typeName?: string;
    symbolPath?: string[];
}

export interface ParserModelInfo {
    resolveIdentifier(name: string): ParserSymbolInfo | undefined;
    resolveMember(path: string[], property: string): ParserSymbolInfo | undefined;
    resolveColonPath?(parts: string[]): ParserSymbolInfo | undefined;
}

export class ScvdParserInterface {
    private _parser: Parser;
    private _optimizer: ExpressionOptimizer;

    constructor(model: IntegerModel) {
        this._parser = new Parser(model);
        this._optimizer = new ExpressionOptimizer(model);
    }

    public setIntegerModel(model: IntegerModel): void {
        this._parser.setIntegerModel(model);
        this._optimizer.setIntegerModel(model);
    }

    public setModelInfoFromOutItem(outItem: ScvdNode | undefined): void {
        this._parser.setModelInfoProvider(this.createModelInfo(outItem));
    }

    public parseExpression(expression: string, isPrintExpression: boolean): ParseResult {
        const parseStart = parsePerf?.start() ?? 0;
        const parsed = this._parser.parseWithDiagnostics(expression, isPrintExpression);
        parsePerf?.endParse(parseStart);
        parsePerf?.recordParse(parsed.ast);
        const optimizeStart = parsePerf?.start() ?? 0;
        const optimized = this._optimizer.optimizeParseResult(parsed);
        parsePerf?.endOptimize(optimizeStart);
        parsePerf?.recordOptimize(parsed.ast, optimized.ast, isPrintExpression);
        return optimized;
    }

    private createModelInfo(outItem: ScvdNode | undefined): ParserModelInfo {
        return {
            resolveIdentifier: (name) => this.resolveSymbolPath(outItem, [name]),
            resolveMember: (path, property) => this.resolveSymbolPath(outItem, [...path, property]),
            resolveColonPath: (parts) => this.resolveSymbolPath(outItem, parts),
        };
    }

    private resolveSymbolPath(outItem: ScvdNode | undefined, path: string[]): ParserSymbolInfo | undefined {
        if (!outItem || path.length === 0) {
            return undefined;
        }

        let current: ScvdNode | undefined = outItem.getSymbol(path[0]);
        for (let i = 1; i < path.length && current; i++) {
            current = current.getMember(path[i]);
        }
        if (!current) {
            return { symbolPath: path };
        }

        let typeName: string | undefined;
        if (current.getValueType !== ScvdNode.prototype.getValueType) {
            typeName = current.getValueType();
        }
        if (!typeName) {
            console.error(`ScvdParserInterface: undefined type for '${path.join('.')}'`);
        }
        const valueType = this.mapValueType(typeName);
        const info: ParserSymbolInfo = { symbolPath: path };
        if (typeName) {
            info.typeName = typeName;
        }
        if (valueType) {
            info.valueType = valueType;
        }
        return info;
    }

    private mapValueType(typeName: string | undefined): ValueType | undefined {
        if (!typeName) {
            return undefined;
        }
        const lower = typeName.toLowerCase();
        if (lower.includes('bool')) {
            return 'boolean';
        }
        if (
            lower.includes('char') ||
            lower.includes('int') ||
            lower.includes('short') ||
            lower.includes('long') ||
            lower.includes('float') ||
            lower.includes('double') ||
            lower.includes('uint')
        ) {
            return 'number';
        }
        return undefined;
    }
}
