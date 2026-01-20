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
 * Unit test for ScvdCondition.
 */

import { ScvdCondition } from '../../../model/scvd-condition';
import { ScvdExpression } from '../../../model/scvd-expression';
import { ExecutionContext } from '../../../scvd-eval-context';

describe('ScvdCondition', () => {
    it('defaults to true when no expression is defined', async () => {
        const condition = new ScvdCondition(undefined);
        await expect(condition.getResult()).resolves.toBe(true);
    });

    it('evaluates falsy and truthy values', async () => {
        const condition = new ScvdCondition(undefined, 'expr');
        const getValueSpy = jest.spyOn(ScvdExpression.prototype, 'getValue');

        getValueSpy.mockResolvedValueOnce(undefined);
        await expect(condition.getResult()).resolves.toBe(false);

        getValueSpy.mockResolvedValueOnce(0);
        await expect(condition.getResult()).resolves.toBe(false);

        getValueSpy.mockResolvedValueOnce(0n);
        await expect(condition.getResult()).resolves.toBe(false);

        getValueSpy.mockResolvedValueOnce(1);
        await expect(condition.getResult()).resolves.toBe(true);

        getValueSpy.mockResolvedValueOnce(2n);
        await expect(condition.getResult()).resolves.toBe(true);

        getValueSpy.mockRestore();
    });

    it('handles expression evaluation errors', async () => {
        const condition = new ScvdCondition(undefined, 'expr');
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(ScvdExpression.prototype, 'getValue').mockRejectedValue(new Error('fail'));

        await expect(condition.getResult()).resolves.toBe(false);

        errorSpy.mockRestore();
    });

    it('updates expressions and forwards execution context', () => {
        const condition = new ScvdCondition(undefined, 'expr');
        const original = condition.expression;

        condition.expression = 'next';
        expect(condition.expression).toBe(original);

        const ctx = { evalContext: {} } as ExecutionContext;
        const ctxSpy = jest.spyOn(ScvdExpression.prototype, 'setExecutionContext');
        condition.setExecutionContext(ctx);

        expect(ctxSpy).toHaveBeenCalledWith(ctx);
        ctxSpy.mockRestore();
    });

    it('creates expressions when none exist', () => {
        const condition = new ScvdCondition(undefined);
        condition.expression = 'created';
        expect(condition.expression).toBeInstanceOf(ScvdExpression);
    });
});
