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
 * Unit test for ScvdSymbol.
 */

import { ScvdSymbol } from '../../../model/scvd-symbol';
import { ExecutionContext } from '../../../scvd-eval-context';
import { parseExpression } from '../../../parser-evaluator/parser';

describe('ScvdSymbol', () => {
    it('tracks symbol and address values', () => {
        const symbol = new ScvdSymbol(undefined, 'SYMBOL');
        expect(symbol.symbol).toBe('SYMBOL');

        symbol.symbol = 'NEW';
        expect(symbol.symbol).toBe('NEW');

        expect(symbol.address).toBeUndefined();
        symbol.address = 1234;
        expect(symbol.address).toBe(1234);
    });

    it('returns undefined offsets for missing names', () => {
        const symbol = new ScvdSymbol(undefined, 'SYMBOL');
        expect(symbol.getOffset(undefined)).toBeUndefined();
        expect(symbol.getOffset('missing')).toBeUndefined();
    });

    it('fetches symbol information when context and symbol are available', async () => {
        const symbol = new ScvdSymbol(undefined, 'sym');
        const getSymbolInfo = jest.fn().mockResolvedValue({
            name: 'sym',
            address: 256,
            member: [
                { name: 'field', size: 4, offset: 8 },
                { name: 'next', size: 2, offset: 12 }
            ]
        });
        const context = { debugTarget: { getSymbolInfo }, parseExpression } as unknown as ExecutionContext;

        symbol.setExecutionContext(context);
        const result = await symbol.fetchSymbolInformation();

        expect(result).toBe(true);
        expect(symbol.address).toBe(256);
        expect(symbol.memberInfo).toHaveLength(2);
        expect(symbol.getOffset('field')).toBe(8);
        expect(symbol.getOffset('next')).toBe(12);
    });

    it('returns false without symbol or execution context', async () => {
        const symbol = new ScvdSymbol(undefined, 'sym');
        symbol.symbol = undefined;
        await expect(symbol.fetchSymbolInformation()).resolves.toBe(false);

        const withSymbol = new ScvdSymbol(undefined, 'sym');
        await expect(withSymbol.fetchSymbolInformation()).resolves.toBe(false);
    });

    it('handles missing symbol info gracefully', async () => {
        const symbol = new ScvdSymbol(undefined, 'sym');
        const getSymbolInfo = jest.fn().mockResolvedValue(undefined);
        const context = { debugTarget: { getSymbolInfo }, parseExpression } as unknown as ExecutionContext;

        symbol.setExecutionContext(context);
        const result = await symbol.fetchSymbolInformation();
        expect(result).toBe(true);
        expect(symbol.address).toBeUndefined();
        expect(symbol.memberInfo).toHaveLength(0);
    });
});
