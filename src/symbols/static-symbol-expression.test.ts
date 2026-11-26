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

import { isStaticSymbolExpression } from './static-symbol-expression';

describe('static symbol expressions', () => {
    it.each(['main', '::app::variable', '(state).member', '((state.cpus[0])).count', 'data[0x1f][2].name', ' data [ 3 ] '])('accepts %s', expression => {
        expect(isStaticSymbolExpression(expression)).toBe(true);
    });

    it.each(['', 'a b', 'main()', '*ptr', '&value', 'ptr->value', 'a[index]', 'a[1+2]', 'a[-1]', 'a++', 'a=1', '(int)a', '$pc', 'a;quit', 'a\n.b', 'a[0]junk', 'a..b', 'a[', '(a', 'a)', 'a::', '0x1234'])('rejects %s', expression => {
        expect(isStaticSymbolExpression(expression)).toBe(false);
    });

    it('bounds length and parenthesis nesting', () => {
        expect(isStaticSymbolExpression('a'.repeat(4097))).toBe(false);
        expect(isStaticSymbolExpression('('.repeat(100) + 'a' + ')'.repeat(100))).toBe(false);
    });
});
