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
 *
 * Coverage for resolver: cache creation, dispatching, and guard branches.
 */
// generated with AI

import { Resolver, ResolveType } from '../resolver';
import { ScvdComponentViewer } from '../model/scvd-component-viewer';
import { ScvdTypedef, ScvdTypedefs } from '../model/scvd-typedef';
import { ScvdNode } from '../model/scvd-node';

class FakeNode extends ScvdNode {
    public calls = 0;
    public override resolveAndLink(): boolean {
        this.calls += 1;
        return true;
    }
}

class FakeViewer extends ScvdComponentViewer {
    public calls = 0;
    public override resolveAndLink(): boolean {
        this.calls += 1;
        return true;
    }
}

describe('Resolver coverage', () => {
    it('creates type cache and resolves recursively over children', () => {
        const viewer = new FakeViewer(undefined);
        const child = new FakeNode(viewer);
        const grandChild = new FakeNode(child);
        const typedefs = new ScvdTypedefs(viewer);
        const td = typedefs.addTypedef();
        td.name = 'T1';
        (viewer as unknown as { _typedefs?: ScvdTypedefs })._typedefs = typedefs;

        const resolver = new Resolver(viewer);
        expect(resolver.resolve()).toBe(true);
        expect(resolver.typesCache?.findTypeByName('T1')).toBe(td);
        expect(viewer.calls).toBe(1);
        expect(child.calls).toBe(1);
        expect(grandChild.calls).toBe(1);
    });

    it('routes resolveSymbolCb based on resolve type', () => {
        const viewer = new FakeViewer(undefined);
        const resolver = new Resolver(viewer);
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const typedef = new ScvdTypedef(viewer);
        typedef.name = 'Found';
        (resolver as unknown as { _typesCache: { findTypeByName: (n: string) => ScvdTypedef | undefined } })._typesCache = {
            findTypeByName: (n: string) => (n === 'Found' ? typedef : undefined),
        };
        const member = new FakeNode(undefined);
        const scvdObject = { getSymbol: (n: string) => (n === 'mem' ? member : undefined) } as unknown as ScvdNode;

        expect(resolver.resolveSymbolCb('Found', ResolveType.localType)).toBe(typedef);
        expect(resolver.resolveSymbolCb('mem', ResolveType.localMember, scvdObject)).toBe(member);
        const scvdObjectMissing = { getSymbol: () => undefined } as unknown as ScvdNode;
        expect(resolver.resolveSymbolCb('mem', ResolveType.localMember, scvdObjectMissing)).toBeUndefined();
        expect(resolver.resolveSymbolCb('any', ResolveType.targetType)).toBeUndefined();
        expect(resolver.resolveSymbolCb('x', ResolveType.localMember)).toBeUndefined(); // scvdObject undefined branch
        // Local type missing / non-typedef branch
        (resolver as unknown as { _typesCache: { findTypeByName: (n: string) => ScvdNode | undefined } })._typesCache = {
            findTypeByName: () => new FakeNode(undefined),
        };
        expect(resolver.resolveSymbolCb('Other', ResolveType.localType)).toBeUndefined();
        // Default switch branch
        expect(resolver.resolveSymbolCb('noop', 'bogus' as unknown as ResolveType)).toBeUndefined();
        (console.log as unknown as jest.Mock).mockRestore();
    });

    it('guards when model or caches are missing', () => {
        const viewer = new FakeViewer(undefined);
        const resolver = new Resolver(viewer);

        (resolver as unknown as { _model?: undefined })._model = undefined;
        expect(resolver.resolve()).toBe(false);

        (resolver as unknown as { _model?: FakeViewer })._model = viewer;
        (resolver as unknown as { _typesCache?: undefined })._typesCache = undefined;
        expect((resolver as unknown as { resolveTypes: () => boolean }).resolveTypes()).toBe(false);

        (resolver as unknown as { _model?: undefined })._model = undefined;
        expect((resolver as unknown as { createTypesCache: () => void }).createTypesCache()).toBeUndefined();
    });
});
