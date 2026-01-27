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
 * Unit test for ScvdComponentViewer.
 */

import { ExecutionContext } from '../../../scvd-eval-context';
import { ScvdBreaks } from '../../../model/scvd-break';
import { ScvdComponentIdentifier } from '../../../model/scvd-component-identifier';
import { ScvdComponentViewer } from '../../../model/scvd-component-viewer';
import { ScvdObjects } from '../../../model/scvd-object';
import { ScvdTypedefs } from '../../../model/scvd-typedef';
import { Json } from '../../../model/scvd-base';

describe('ScvdComponentViewer', () => {
    it('returns false when XML is undefined', () => {
        const viewer = new ScvdComponentViewer(undefined);
        expect(viewer.readXml(undefined as unknown as Json)).toBe(false);
    });

    it('returns false when component_viewer is missing', () => {
        const viewer = new ScvdComponentViewer(undefined);
        expect(viewer.readXml({})).toBe(false);
    });

    it('reads component viewer sections and breaks', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const componentSpy = jest.spyOn(ScvdComponentIdentifier.prototype, 'readXml').mockReturnValue(true);
        const objectsSpy = jest.spyOn(ScvdObjects.prototype, 'readXml').mockReturnValue(true);
        const typedefsSpy = jest.spyOn(ScvdTypedefs.prototype, 'readXml').mockReturnValue(true);
        const breaksSpy = jest.spyOn(ScvdBreaks.prototype, 'readXml').mockReturnValue(true);

        const xml = {
            component_viewer: {
                component: { name: 'comp' },
                objects: { object: [] },
                typedefs: { typedef: [] },
                break: [{ name: 'b1' }],
                nested: { break: [{ name: 'b2' }] }
            }
        };

        expect(viewer.readXml(xml)).toBe(true);
        expect(viewer.component).toBeInstanceOf(ScvdComponentIdentifier);
        expect(viewer.objects).toBeInstanceOf(ScvdObjects);
        expect(viewer.typedefs).toBeInstanceOf(ScvdTypedefs);
        expect(viewer.breaks).toBeInstanceOf(ScvdBreaks);

        expect(componentSpy).toHaveBeenCalledTimes(1);
        expect(objectsSpy).toHaveBeenCalledTimes(1);
        expect(typedefsSpy).toHaveBeenCalledTimes(1);
        expect(breaksSpy).toHaveBeenCalledTimes(1);

        componentSpy.mockRestore();
        objectsSpy.mockRestore();
        typedefsSpy.mockRestore();
        breaksSpy.mockRestore();
    });

    it('skips optional sections when they are missing', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const xml = { component_viewer: { component: 'bad', objects: 5, typedefs: null } };

        expect(viewer.readXml(xml)).toBe(true);
        expect(viewer.component).toBeUndefined();
        expect(viewer.objects).toBeUndefined();
        expect(viewer.typedefs).toBeUndefined();
        expect(viewer.events).toBeUndefined();
        expect(viewer.breaks).toBeUndefined();
        expect(viewer.getSymbol('missing')).toBeUndefined();
    });

    it('collects breaks from array entries and ignores non-objects', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const collect = viewer as unknown as { collectBreakStatements: (node: unknown) => unknown[] };
        expect(collect.collectBreakStatements(undefined)).toEqual([]);
        const breaks = collect.collectBreakStatements([
            { break: [{ name: 'b1' }] },
            5,
            { nested: [{ break: [{ name: 'b2' }] }] }
        ]);

        expect(breaks).toHaveLength(2);
    });

    it('configures and validates all nodes', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const child = new ScvdComponentViewer(viewer);

        const configureSpy = jest.spyOn(child, 'configure');
        expect(viewer.configureAll()).toBe(true);
        expect(configureSpy).toHaveBeenCalledTimes(1);

        const validateSpy = jest.spyOn(child, 'validate').mockReturnValue(true);
        expect(viewer.validateAll(true)).toBe(true);
        expect(validateSpy).toHaveBeenCalledTimes(1);
    });

    it('calculates typedefs when present', async () => {
        const viewer = new ScvdComponentViewer(undefined);
        const typedefs = new ScvdTypedefs(viewer);
        const calcSpy = jest.spyOn(typedefs, 'calculateTypedefs').mockResolvedValue();
        (viewer as unknown as { _typedefs?: ScvdTypedefs })._typedefs = typedefs;

        await expect(viewer.calculateTypedefs()).resolves.toBe(false);

        typedefs.addTypedef();
        await expect(viewer.calculateTypedefs()).resolves.toBe(true);
        expect(calcSpy).toHaveBeenCalledTimes(1);
    });

    it('sets execution context recursively', () => {
        const viewer = new ScvdComponentViewer(undefined);
        const child = new ScvdComponentViewer(viewer);
        const ctx = { evalContext: {} } as ExecutionContext;

        const setSpy = jest.spyOn(child, 'setExecutionContext');
        viewer.setExecutionContextAll(ctx);
        expect(setSpy).toHaveBeenCalledWith(ctx);
    });
});
