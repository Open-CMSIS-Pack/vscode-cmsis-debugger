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
 * Unit test for ScvdEvalContext happy-path and failure branches.
 */

import { ScvdEvalContext } from '../../scvd-eval-context';
import { ScvdComponentViewer } from '../../model/scvd-component-viewer';
import { ScvdObjects } from '../../model/scvd-object';
import type { ScvdNode } from '../../model/scvd-node';
import { MemoryHost } from '../../data-host/memory-host';
import { RegisterHost } from '../../data-host/register-host';

describe('ScvdEvalContext', () => {
    const buildViewerWithObject = (): { viewer: ScvdComponentViewer; firstObject: ScvdNode } => {
        const viewer = new ScvdComponentViewer(undefined);
        const objects = new ScvdObjects(viewer);
        const first = objects.addObject();
        (viewer as unknown as { _objects?: ScvdObjects })._objects = objects;
        return { viewer, firstObject: first };
    };

    it('constructs with an out item and returns execution context', () => {
        const { viewer, firstObject } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);
        expect(ctx.getOutItem()).toBe(firstObject);

        const exec = ctx.getExecutionContext();
        expect(exec.memoryHost).toBeDefined();
        expect(exec.registerHost).toBeDefined();
        expect(exec.evalContext).toBeDefined();
        expect(exec.debugTarget).toBeDefined();
    });

    it('throws when no output item exists', () => {
        const viewer = new ScvdComponentViewer(undefined);
        expect(() => new ScvdEvalContext(viewer)).toThrow('SCVD EvalContext: No output item defined');
    });

    it('throws when model or hosts are unset internally', () => {
        const { viewer } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);

        (ctx as unknown as { _model: ScvdComponentViewer | undefined })._model = undefined;
        expect(() => ctx.getOutItem()).toThrow('SCVD EvalContext: Model not initialized');

        (ctx as unknown as { _memoryHost: MemoryHost | undefined })._memoryHost = undefined;
        expect(() => ctx.getExecutionContext()).toThrow('SCVD EvalContext: MemoryHost not initialized');

        // RegisterHost guard
        (ctx as unknown as { _memoryHost: MemoryHost })._memoryHost = new ScvdEvalContext(viewer)['getExecutionContext']().memoryHost;
        (ctx as unknown as { _registerHost: RegisterHost | undefined })._registerHost = undefined;
        expect(() => ctx.getExecutionContext()).toThrow('SCVD EvalContext: RegisterHost not initialized');

        // EvalContext guard
        (ctx as unknown as { _registerHost: RegisterHost })._registerHost = new ScvdEvalContext(viewer)['getExecutionContext']().registerHost;
        (ctx as unknown as { _ctx: ReturnType<ScvdEvalContext['getExecutionContext']>['evalContext'] | undefined })._ctx = undefined;
        expect(() => ctx.getExecutionContext()).toThrow('SCVD EvalContext: EvalContext not initialized');

        // DebugTarget guard
        (ctx as unknown as { _ctx: ReturnType<ScvdEvalContext['getExecutionContext']>['evalContext'] })._ctx = new ScvdEvalContext(viewer)['getExecutionContext']().evalContext;
        (ctx as unknown as { _debugTarget: ReturnType<ScvdEvalContext['getExecutionContext']>['debugTarget'] | undefined })._debugTarget = undefined;
        expect(() => ctx.getExecutionContext()).toThrow('SCVD EvalContext: DebugTarget not initialized');
    });

    it('returns undefined when objects container is empty', () => {
        const { viewer } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);
        // Replace objects with an empty container after construction
        const emptyObjects = new ScvdObjects(viewer);
        (emptyObjects as unknown as { _objects: unknown[] })._objects = [];
        (viewer as unknown as { _objects?: ScvdObjects })._objects = emptyObjects;
        expect(ctx.getOutItem()).toBeUndefined();
    });

    it('delegates init to debug target', () => {
        const { viewer } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);
        const debugTarget = ctx.getExecutionContext().debugTarget;
        jest.spyOn(debugTarget, 'init').mockImplementation(() => undefined as unknown as void);
        const fakeSession = {} as unknown as Parameters<typeof debugTarget.init>[0];
        const fakeTracker = {} as unknown as Parameters<typeof debugTarget.init>[1];
        ctx.init(fakeSession, fakeTracker);
        expect(debugTarget.init).toHaveBeenCalledWith(fakeSession, fakeTracker);
    });

    it('updates model via setter', () => {
        const { viewer } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);
        const replacement = new ScvdComponentViewer(undefined);

        ctx.model = replacement;
        expect(ctx.model).toBe(replacement);
    });

    it('forwards active session updates to debug target', () => {
        const { viewer } = buildViewerWithObject();
        const ctx = new ScvdEvalContext(viewer);
        const debugTarget = ctx.getExecutionContext().debugTarget;
        const setActiveSessionSpy = jest.spyOn(debugTarget, 'setActiveSession').mockImplementation(() => undefined);
        const session = {} as unknown as Parameters<typeof debugTarget.setActiveSession>[0];

        ctx.updateActiveSession(session);
        expect(setActiveSessionSpy).toHaveBeenCalledWith(session);
    });
});
