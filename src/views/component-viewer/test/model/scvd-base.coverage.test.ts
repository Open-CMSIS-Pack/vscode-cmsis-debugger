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
 * Coverage for ScvdBase.
 */

import { ScvdBase } from '../../model/scvd-base';

class TestBase extends ScvdBase {
    public addToSymbolContext(name: string | undefined, symbol: ScvdBase): void {
        super.addToSymbolContext(name, symbol);
    }
}

class SymbolBase extends ScvdBase {
    public override getSymbol(_name: string): ScvdBase | undefined {
        return this;
    }
}

class UndefinedTagBase extends ScvdBase {
    public override get tag(): string | undefined {
        return undefined;
    }
}

describe('ScvdBase coverage', () => {
    beforeEach(() => {
        ScvdBase.resetIds();
    });

    it('tracks parent/child relationships and ids', () => {
        const parent = new TestBase(undefined);
        const child = new TestBase(parent);

        expect(parent.children).toEqual([child]);
        expect(child.parent).toBe(parent);
        expect(child.nodeId).toMatch(/^TestBase_\d+$/);
        expect(child.classname).toBe('TestBase');

        expect(parent.castToDerived(TestBase)).toBe(parent);
        expect(parent.castToDerived(SymbolBase)).toBeUndefined();
    });

    it('handles metadata and flags', () => {
        const base = new TestBase(undefined);
        base.tag = undefined;
        base.lineNo = '10';
        base.lineNo = undefined;
        base.name = 'Name';
        base.info = 'Info';
        base.isModified = true;
        base.valid = true;
        base.mustRead = false;

        expect(base.tag).toBe('Internal Object');
        expect(base.lineNo).toBe('10');
        expect(base.name).toBe('Name');
        expect(base.info).toBe('Info');
        expect(base.isModified).toBe(true);
        expect(base.valid).toBe(true);
        expect(base.mustRead).toBe(false);
        expect(base.lineNo).toBe('10');
    });

    it('supports traversal helpers', () => {
        const parent = new TestBase(undefined);
        const a = new TestBase(parent);
        const b = new TestBase(parent);

        expect(parent.map(child => child)).toEqual([a, b]);
        const seen: ScvdBase[] = [];
        parent.forEach(child => seen.push(child));
        expect(seen).toEqual([a, b]);
        expect(parent.filter(child => child === b)).toEqual([b]);
    });

    it('delegates symbol context to parents', () => {
        const parent = new TestBase(undefined);
        const child = new TestBase(parent);

        const symbol = new TestBase(undefined);
        const spy = jest.spyOn(parent, 'addToSymbolContext');

        child.addToSymbolContext('name', symbol);
        expect(spy).toHaveBeenCalledWith('name', symbol);
    });

    it('delegates symbol lookups to parents', () => {
        const parent = new SymbolBase(undefined);
        const child = new TestBase(parent);

        expect(child.getSymbol('anything')).toBe(parent);
    });

    it('builds line info and display labels', () => {
        const base = new TestBase(undefined);
        base.tag = 'Tag';
        base.lineNo = '5';
        base.name = 'Name';

        expect(base.getLineInfoStr()).toBe('[Line: 5 Tag: Tag ]');
        expect(base.getLineNoStr()).toBe('5');
        expect(base.getDisplayLabel()).toBe('Name');

        base.name = undefined;
        base.info = 'Info';
        expect(base.getDisplayLabel()).toBe('Info');

        base.info = undefined;
        expect(base.getDisplayLabel()).toBe('Tag (line 5)');

        base.tag = '';
        expect(base.getDisplayLabel()).toBe('TestBase (line 5)');
        expect(base.getLineInfoStr()).toBe('[Line: 5 Tag:  ]');
    });

    it('handles line sorting with NaN values', () => {
        const a = new TestBase(undefined);
        const b = new TestBase(undefined);
        a.lineNo = 'NaN';
        b.lineNo = '2';

        expect((a as unknown as { sortByLine: (x: ScvdBase, y: ScvdBase) => number }).sortByLine(a, b)).toBeLessThan(0);
    });

    it('recurses line info when child line number is missing', () => {
        const parent = new TestBase(undefined);
        parent.lineNo = '12';
        const child = new TestBase(parent);
        child.tag = 'Child';

        expect(child.getLineNoStr()).toBe('12');
        expect(child.getLineInfoStr()).toBe('[Line: 12 Tag: Child ]');
    });

    it('returns empty line info when no line number is available', () => {
        const base = new TestBase(undefined);
        base.tag = 'Tag';

        expect(base.getLineNoStr()).toBe('');
        expect(base.getLineInfoStr()).toBe('[Tag: Tag ]');
    });

    it('omits tag output when tag getter returns undefined', () => {
        const base = new UndefinedTagBase(undefined);
        expect(base.getLineInfoStr()).toBe('[]');
    });

    it('handles NaN on both sides when sorting', () => {
        const a = new TestBase(undefined);
        const b = new TestBase(undefined);
        a.lineNo = 'NaN';
        b.lineNo = 'NaN';

        expect((a as unknown as { sortByLine: (x: ScvdBase, y: ScvdBase) => number }).sortByLine(a, b)).toBe(0);
    });

    it('sorts numeric line numbers without NaN fallback', () => {
        const a = new TestBase(undefined);
        const b = new TestBase(undefined);
        a.lineNo = '1';
        b.lineNo = '2';

        expect((a as unknown as { sortByLine: (x: ScvdBase, y: ScvdBase) => number }).sortByLine(a, b)).toBeLessThan(0);
    });

    it('returns default behaviors', () => {
        const base = new TestBase(undefined);
        expect(base.hasChildren()).toBe(false);
        expect(base.configure()).toBe(true);
        expect(base.validate(true)).toBe(true);
        expect(base.reset()).toBe(true);
    });
});
