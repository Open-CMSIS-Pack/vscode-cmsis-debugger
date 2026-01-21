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
 * Unit test for ScvdTypedefs/ScvdTypedef.
 */

import { ScvdExpression } from '../../../model/scvd-expression';
import { ScvdMember } from '../../../model/scvd-member';
import { ScvdSymbol } from '../../../model/scvd-symbol';
import { ScvdTypedef, ScvdTypedefs } from '../../../model/scvd-typedef';
import { ScvdVar } from '../../../model/scvd-var';
import { Json } from '../../../model/scvd-base';

describe('ScvdTypedefs', () => {
    it('returns false when XML is undefined', () => {
        const typedefs = new ScvdTypedefs(undefined);
        expect(typedefs.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads typedef entries from XML', () => {
        const typedefs = new ScvdTypedefs(undefined);
        const readSpy = jest.spyOn(ScvdTypedef.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            typedef: [{ name: 'A' }, { name: 'B' }]
        };

        expect(typedefs.readXml(xml)).toBe(true);
        expect(typedefs.typedef).toHaveLength(2);

        readSpy.mockRestore();
    });

    it('calculates typedefs when present', async () => {
        const typedefs = new ScvdTypedefs(undefined);
        const typedef = typedefs.addTypedef();
        const calcSpy = jest.spyOn(typedef, 'calculateTypedef').mockResolvedValue();

        await typedefs.calculateTypedefs();
        expect(calcSpy).toHaveBeenCalledTimes(1);
    });

    it('skips calculation when no typedefs are defined', async () => {
        const typedefs = new ScvdTypedefs(undefined);
        await expect(typedefs.calculateTypedefs()).resolves.toBeUndefined();
    });
});

describe('ScvdTypedef', () => {
    it('returns false when XML is undefined', () => {
        const typedef = new ScvdTypedef(undefined);
        expect(typedef.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('reads members and vars from XML', () => {
        const typedef = new ScvdTypedef(undefined);
        const memberSpy = jest.spyOn(ScvdMember.prototype, 'readXml').mockReturnValue(true);
        const varSpy = jest.spyOn(ScvdVar.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            size: '4',
            import: 'SYM',
            member: [{ name: 'm1', __line: '2' }, { name: 'm2', __line: '1' }],
            var: [{ name: 'v1', __line: '3' }]
        };

        expect(typedef.readXml(xml)).toBe(true);
        expect(typedef.size).toBeInstanceOf(ScvdExpression);
        expect(typedef.import).toBeInstanceOf(ScvdSymbol);
        expect(typedef.member).toHaveLength(2);
        expect(typedef.var).toHaveLength(1);

        memberSpy.mockRestore();
        varSpy.mockRestore();
    });

    it('returns type sizing and pointer defaults', () => {
        const typedef = new ScvdTypedef(undefined);
        (typedef as unknown as { _targetSize?: number })._targetSize = 12;

        expect(typedef.getTypeSize()).toBe(12);
        expect(typedef.getVirtualSize()).toBe(12);
        expect(typedef.getIsPointer()).toBe(false);
    });

    it('ignores undefined setter inputs', () => {
        const typedef = new ScvdTypedef(undefined);
        typedef.size = undefined;
        typedef.import = undefined;

        expect(typedef.size).toBeUndefined();
        expect(typedef.import).toBeUndefined();
    });

    it('resolves members and vars by name', () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();
        const variable = typedef.addVar();

        member.name = 'field';
        variable.name = 'local';

        expect(typedef.getMember('field')).toBe(member);
        expect(typedef.getMember('local')).toBe(variable);
    });

    it('calculates offsets with explicit member offsets and size overflow', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();

        member.name = 'm1';
        member.offset = '8';
        jest.spyOn(member.offset as ScvdExpression, 'getValue').mockResolvedValue(8);
        jest.spyOn(member, 'getTypeSize').mockReturnValue(4);

        typedef.size = '8';
        jest.spyOn(typedef.size as ScvdExpression, 'getValue').mockResolvedValue(8);

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await typedef.calculateOffsets();
        errorSpy.mockRestore();

        expect(typedef.getTargetSize()).toBe(8);
        expect(typedef.getVirtualSize()).toBe(16);
    });

    it('pads typedef size when offsets are smaller than size', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();

        member.name = 'm1';
        member.offset = '0';
        jest.spyOn(member.offset as ScvdExpression, 'getValue').mockResolvedValue(0);
        jest.spyOn(member, 'getTypeSize').mockReturnValue(1);

        typedef.size = '4';
        jest.spyOn(typedef.size as ScvdExpression, 'getValue').mockResolvedValue(4);

        await typedef.calculateOffsets();

        expect(typedef.getTargetSize()).toBe(4);
        expect(typedef.getVirtualSize()).toBe(8);
    });

    it('pads typedef size when no members are present', async () => {
        const typedef = new ScvdTypedef(undefined);
        typedef.size = '4';
        jest.spyOn(typedef.size as ScvdExpression, 'getValue').mockResolvedValue(4);

        await typedef.calculateOffsets();

        expect(typedef.getTargetSize()).toBe(4);
        expect(typedef.getVirtualSize()).toBe(8);
    });

    it('keeps size when offsets match the declared size', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();

        member.name = 'm1';
        member.offset = '0';
        jest.spyOn(member.offset as ScvdExpression, 'getValue').mockResolvedValue(0);
        jest.spyOn(member, 'getTypeSize').mockReturnValue(4);

        typedef.size = '4';
        jest.spyOn(typedef.size as ScvdExpression, 'getValue').mockResolvedValue(4);

        await typedef.calculateOffsets();

        expect(typedef.getTargetSize()).toBe(4);
        expect(typedef.getVirtualSize()).toBe(8);
    });

    it('calculates offsets without import and assigns defaults', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();

        member.name = 'm1';
        jest.spyOn(member, 'getTypeSize').mockReturnValue(2);

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await typedef.calculateOffsets();
        errorSpy.mockRestore();

        expect(member.offset?.expression).toBe('0');
        expect(typedef.getTargetSize()).toBe(2);
        expect(typedef.getVirtualSize()).toBe(8);
    });

    it('calculates offsets with import and virtual size expansion', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();
        const variable = typedef.addVar();

        member.name = 'm1';
        typedef.import = 'SYM';
        const symbol = typedef.import as ScvdSymbol;
        symbol.memberInfo.push({ name: 'm1', size: 1, offset: 4 });

        jest.spyOn(member, 'getTypeSize').mockReturnValue(1);
        jest.spyOn(variable, 'getTargetSize').mockReturnValue(2);

        typedef.size = '8';
        jest.spyOn(typedef.size as ScvdExpression, 'getValue').mockResolvedValue(8);

        await typedef.calculateOffsets();

        expect(member.offset?.expression).toBe('4');
        expect(variable.offset?.expression).toBe('12');
        expect(typedef.getTargetSize()).toBe(8);
        expect(typedef.getVirtualSize()).toBe(14);
    });

    it('handles missing import offsets and undefined member sizes', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();
        const variable = typedef.addVar();

        member.name = 'm1';
        typedef.import = 'SYM';
        jest.spyOn(member, 'getTypeSize').mockReturnValue(undefined);
        jest.spyOn(variable, 'getTargetSize').mockReturnValue(undefined);

        await typedef.calculateOffsets();

        expect(member.offset).toBeUndefined();
        expect(variable.offset?.expression).toBe('4');
        expect(typedef.getTargetSize()).toBe(0);
        expect(typedef.getVirtualSize()).toBe(8);
    });

    it('skips offset updates when offset values are undefined', async () => {
        const typedef = new ScvdTypedef(undefined);
        const member = typedef.addMember();

        member.name = 'm1';
        member.offset = '1';
        jest.spyOn(member.offset as ScvdExpression, 'getValue').mockResolvedValue(undefined);
        jest.spyOn(member, 'getTypeSize').mockReturnValue(1);

        await typedef.calculateOffsets();

        expect(typedef.getTargetSize()).toBe(1);
    });

    it('invokes symbol fetch when calculating typedefs', async () => {
        const typedef = new ScvdTypedef(undefined);
        typedef.import = 'SYM';

        let fetchComplete = false;
        const fetchSpy = jest.spyOn(typedef.import as ScvdSymbol, 'fetchSymbolInformation').mockImplementation(async () => {
            await Promise.resolve();
            fetchComplete = true;
            return true;
        });
        const offsetsSpy = jest.spyOn(typedef, 'calculateOffsets').mockImplementation(async () => {
            expect(fetchComplete).toBe(true);
        });

        await typedef.calculateTypedef();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(offsetsSpy).toHaveBeenCalledTimes(1);
    });

    it('calculates typedefs without import symbols', async () => {
        const typedef = new ScvdTypedef(undefined);
        const offsetsSpy = jest.spyOn(typedef, 'calculateOffsets').mockResolvedValue();

        await typedef.calculateTypedef();
        expect(offsetsSpy).toHaveBeenCalledTimes(1);
    });

    it('updates import name when import already exists', () => {
        const typedef = new ScvdTypedef(undefined);
        typedef.import = 'SYM';
        const existing = typedef.import as ScvdSymbol;

        typedef.import = 'NEXT';
        expect(existing.name).toBe('NEXT');
    });
});
