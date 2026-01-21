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
 */

// generated with AI

/**
 * Integration test for StatementEngineHelpers.
 */

import { MemoryHost } from '../../../data-host/memory-host';
import { RegisterHost } from '../../../data-host/register-host';
import { TestNode, createExecutionContext } from '../../unit/helpers/statement-engine-helpers';

describe('statement-engine helpers', () => {
    it('exposes TestNode defaults and setters', async () => {
        const node = new TestNode(undefined);

        await expect(node.getConditionResult()).resolves.toBe(true);
        await expect(node.getGuiName()).resolves.toBeUndefined();
        await expect(node.getGuiValue()).resolves.toBeUndefined();

        node.conditionResult = false;
        node.guiName = 'Title';
        node.guiValue = '42';

        await expect(node.getConditionResult()).resolves.toBe(false);
        await expect(node.getGuiName()).resolves.toBe('Title');
        await expect(node.getGuiValue()).resolves.toBe('42');
    });

    it('creates execution contexts with defaults and overrides', async () => {
        const base = new TestNode(undefined);
        const findSymbolAddress = jest.fn(async () => 123);
        const readMemory = jest.fn(async () => new Uint8Array([1, 2, 3]));

        const ctx = createExecutionContext(base, { findSymbolAddress, readMemory });

        expect(ctx.memoryHost).toBeInstanceOf(MemoryHost);
        expect(ctx.registerHost).toBeInstanceOf(RegisterHost);
        expect(ctx.evalContext).toBeDefined();
        expect(ctx.evalContext.container.base).toBe(base);

        await expect(ctx.debugTarget.findSymbolAddress('sym')).resolves.toBe(123);
        expect(findSymbolAddress).toHaveBeenCalledWith('sym');

        await expect(ctx.debugTarget.readMemory(0, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
        expect(readMemory).toHaveBeenCalledWith(0, 3);

        await expect(ctx.debugTarget.getNumArrayElements('arr')).resolves.toBeUndefined();
    });

    it('uses default debug target handlers when not overridden', async () => {
        const base = new TestNode(undefined);
        const ctx = createExecutionContext(base);

        await expect(ctx.debugTarget.findSymbolAddress('sym')).resolves.toBeUndefined();
        await expect(ctx.debugTarget.getNumArrayElements('arr')).resolves.toBeUndefined();
        await expect(ctx.debugTarget.readMemory(0, 4)).resolves.toBeUndefined();
    });
});
