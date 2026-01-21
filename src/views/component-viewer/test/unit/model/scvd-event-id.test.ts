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
 * Unit test for ScvdEventId.
 */

import { ParseResult } from '../../../parser-evaluator/parser';
import { ScvdEventId } from '../../../model/scvd-event-id';

describe('ScvdEventId', () => {
    const makeAst = (constValue: ParseResult['constValue']): ParseResult => ({
        ast: {} as ParseResult['ast'],
        diagnostics: [],
        externalSymbols: [],
        isPrintf: false,
        constValue
    });

    it('derives message, component, and level from numeric const values', () => {
        const eventId = new ScvdEventId(undefined, '0x12345');
        eventId.id.expressionAst = makeAst(0x12345);

        expect(eventId.configure()).toBe(true);
        expect(eventId.messageNumber).toBe(0x45);
        expect(eventId.componentNumber).toBe(0x23);
        expect(eventId.level).toBe(0x1);
    });

    it('ignores non-numeric constant values', () => {
        const eventId = new ScvdEventId(undefined, 'ID');
        eventId.id.expressionAst = makeAst('ID');

        eventId.configure();
        expect(eventId.messageNumber).toBeUndefined();
        expect(eventId.componentNumber).toBeUndefined();
        expect(eventId.level).toBeUndefined();
    });

    it('returns the validation result unchanged', () => {
        const eventId = new ScvdEventId(undefined, '1');
        expect(eventId.validate(true)).toBe(true);
        expect(eventId.validate(false)).toBe(false);
    });

    it('handles missing id expressions', () => {
        const eventId = new ScvdEventId(undefined, '1');
        (eventId as unknown as { _id?: unknown })._id = undefined;
        expect(eventId.configure()).toBe(true);
    });
});
