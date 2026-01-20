/**
 * Copyright 2025-2026 Arm Limited
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
 *
 * Unit test for ScvdValueOutput.
 */

import { ScvdPrintExpression } from '../../../model/scvd-print-expression';
import { ScvdValueOutput } from '../../../model/scvd-value-output';

describe('ScvdValueOutput', () => {
    it('creates expressions and updates them', () => {
        const output = new ScvdValueOutput(undefined, 'A', 'value');
        expect(output.expression).toBeInstanceOf(ScvdPrintExpression);

        const original = output.expression;
        output.expression = 'B';
        expect(output.expression).toBe(original);
    });

    it('creates a new expression when missing', () => {
        const output = new ScvdValueOutput(undefined, 'A', 'value');
        const outputState = output as unknown as { _expression?: ScvdPrintExpression };
        delete outputState._expression;
        output.expression = 'B';
        expect(output.expression).toBeInstanceOf(ScvdPrintExpression);
    });

    it('returns GUI name/value from expression results', async () => {
        const output = new ScvdValueOutput(undefined, 'A', 'value');
        const resultSpy = jest.spyOn(ScvdPrintExpression.prototype, 'getResultString').mockResolvedValue('OK');

        await expect(output.getGuiName()).resolves.toBe('OK');
        await expect(output.getGuiValue()).resolves.toBe('OK');

        resultSpy.mockRestore();
    });

    it('returns undefined when expression is missing', async () => {
        const output = new ScvdValueOutput(undefined, 'A', 'value');
        const outputState = output as unknown as { _expression?: ScvdPrintExpression };
        delete outputState._expression;

        await expect(output.getGuiName()).resolves.toBeUndefined();
        await expect(output.getGuiValue()).resolves.toBeUndefined();
    });
});
