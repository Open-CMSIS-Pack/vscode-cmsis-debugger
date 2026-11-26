/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

/** Accepts identifiers, qualification, parentheses, members and constant array indices only.
 * This deliberately excludes calls, pointer dereferences, casts and dynamic indices.
 */
export function isStaticSymbolExpression(expression: string): boolean {
    if (expression.length > 4096 || /[\r\n\0]/.test(expression)) {
        return false;
    }
    const tokens = expression.match(/::|[A-Za-z_][A-Za-z_0-9]*|0[xX][0-9a-fA-F]+|[0-9]+|[^\s]/g) ?? [];
    let index = 0;

    /** Consumes one identifier, including optional C++ namespace qualification. */
    const identifier = (): boolean => {
        if (tokens.at(index) === '::') {
            index++;
        }
        if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(tokens.at(index) ?? '')) {
            return false;
        }
        index++;
        while (tokens.at(index) === '::') {
            index++;
            if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(tokens.at(index) ?? '')) {
                return false;
            }
            index++;
        }
        return true;
    };

    /** Consumes a primary expression and its member/index suffixes. */
    const primary = (depth: number): boolean => {
        if (depth > 64) {
            return false;
        }
        if (tokens.at(index) === '(') {
            index++;
            if (!primary(depth + 1) || tokens.at(index++) !== ')') {
                return false;
            }
        } else if (!identifier()) {
            return false;
        }
        while (tokens.at(index) === '.' || tokens.at(index) === '[') {
            if (tokens.at(index++) === '.') {
                if (!identifier()) {
                    return false;
                }
            } else {
                if (!/^(?:0[xX][0-9a-fA-F]+|[0-9]+)$/.test(tokens.at(index++) ?? '') || tokens.at(index++) !== ']') {
                    return false;
                }
            }
        }
        return true;
    };
    return primary(0) && index === tokens.length;
}
