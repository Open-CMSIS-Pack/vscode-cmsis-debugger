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
 * Unit test for ComponentViewerController.
 */

const registerTreeDataProvider = jest.fn(() => ({ dispose: jest.fn() }));
const onDidChangeActiveStackItem = jest.fn(() => ({ dispose: jest.fn() }));

jest.mock('vscode', () => ({
    window: {
        registerTreeDataProvider,
    },
    debug: {
        onDidChangeActiveStackItem,
        activeDebugSession: undefined,
        activeStackItem: undefined,
    },
}));

const treeProviderFactory = jest.fn(() => ({
    setRoots: jest.fn(),
    clear: jest.fn(),
}));

jest.mock('../../component-viewer-tree-view', () => ({
    ComponentViewerTreeDataProvider: jest.fn(() => treeProviderFactory()),
}));

const instanceFactory = jest.fn(() => ({
    readModel: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    getGuiTree: jest.fn(() => ['node']),
    updateActiveSession: jest.fn(),
}));

jest.mock('../../component-viewer-instance', () => ({
    ComponentViewerInstance: jest.fn(() => instanceFactory()),
}));

jest.mock('../../../../debug-session', () => ({}));

import type { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import type { GDBTargetDebugTracker } from '../../../../debug-session';
import { ComponentViewer } from '../../component-viewer-main';

// Local test mocks

type Session = {
    session: { id: string };
    getCbuildRun: () => Promise<{ getScvdFilePaths: () => string[] } | undefined>;
    getPname: () => Promise<string | undefined>;
    refreshTimer: { onRefresh: (cb: (session: Session) => void) => void };
};

type TrackerCallbacks = {
    onWillStopSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onConnected: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveDebugSession: (cb: (session: Session | undefined) => Promise<void>) => { dispose: jest.Mock };
    onStackTrace: (cb: (session: { session: Session }) => Promise<void>) => { dispose: jest.Mock };
    onWillStartSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveStackItem: (cb: (stackItem: unknown) => Promise<void>) => { dispose: jest.Mock };
    callbacks: Partial<{
        willStop: (session: Session) => Promise<void>;
        connected: (session: Session) => Promise<void>;
        activeSession: (session: Session | undefined) => Promise<void>;
        stackTrace: (session: { session: Session }) => Promise<void>;
        willStart: (session: Session) => Promise<void>;
        activeStackItem: (stackItem: unknown) => Promise<void>;
    }>;
};

type Context = { subscriptions: Array<{ dispose: jest.Mock }> };

describe('ComponentViewer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.debug as unknown as { activeDebugSession?: unknown }).activeDebugSession = undefined;
        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = undefined;
    });

    const makeContext = (): Context => ({ subscriptions: [] });

    const makeTracker = (): TrackerCallbacks => {
        const callbacks: TrackerCallbacks['callbacks'] = {};
        return {
            callbacks,
            onWillStopSession: (cb) => {
                callbacks.willStop = cb;
                return { dispose: jest.fn() };
            },
            onConnected: (cb) => {
                callbacks.connected = cb;
                return { dispose: jest.fn() };
            },
            onDidChangeActiveDebugSession: (cb) => {
                callbacks.activeSession = cb;
                return { dispose: jest.fn() };
            },
            onStackTrace: (cb) => {
                callbacks.stackTrace = cb;
                return { dispose: jest.fn() };
            },
            onWillStartSession: (cb) => {
                callbacks.willStart = cb;
                return { dispose: jest.fn() };
            },
            onDidChangeActiveStackItem: (cb) => {
                callbacks.activeStackItem = cb;
                return { dispose: jest.fn() };
            },
        };
    };

    const makeSession = (id: string, paths: string[] = []): Session => ({
        session: { id },
        getCbuildRun: async () => ({ getScvdFilePaths: () => paths }),
        getPname: async () => undefined,
        refreshTimer: {
            onRefresh: jest.fn(),
        },
    });

    it('activates tree provider and registers tracker events', async () => {
        const context = makeContext();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);

        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        expect(registerTreeDataProvider).toHaveBeenCalledWith('cmsis-debugger.componentViewer', expect.any(Object));
        expect(context.subscriptions.length).toBe(7);
    });

    it('forwards active stack item changes on activate', async () => {
        const context = makeContext();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);
        const handleOnDidChangeActiveStackItem = jest
            .spyOn(controller as unknown as { handleOnDidChangeActiveStackItem: (stackItem: unknown) => Promise<void> }, 'handleOnDidChangeActiveStackItem')
            .mockResolvedValue(undefined);

        controller.activate(tracker as unknown as GDBTargetDebugTracker);
        await tracker.callbacks.activeStackItem?.({ frameId: 1 });

        expect(handleOnDidChangeActiveStackItem).toHaveBeenCalledWith({ frameId: 1 });
    });

    it('skips reading scvd files when session or cbuild-run is missing', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const tracker = makeTracker();

        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

        await readScvdFiles(tracker, undefined);

        const sessionNoReader: Session = {
            session: { id: 's1' },
            getCbuildRun: async () => undefined,
            getPname: async () => undefined,
            refreshTimer: { onRefresh: jest.fn() },
        };
        await readScvdFiles(tracker, sessionNoReader);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('skips reading when no scvd files are listed', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const tracker = makeTracker();
        const session = makeSession('s1', []);
        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

        await readScvdFiles(tracker, session);
        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('reads scvd files when active session is set', async () => {
        const context = makeContext();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);
        const tracker = makeTracker();
        const session = makeSession('s1', ['a.scvd', 'b.scvd']);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;

        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);
        await readScvdFiles(tracker, session);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances.length).toBe(2);
        expect(instanceFactory).toHaveBeenCalledTimes(2);
    });

    it('skips reading scvd files when no active session is set', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const tracker = makeTracker();
        const session = makeSession('s1', ['a.scvd']);
        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

        await readScvdFiles(tracker, session);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('handles tracker events and updates sessions', async () => {
        const context = makeContext();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const provider = (controller as unknown as { _componentViewerTreeDataProvider?: ReturnType<typeof treeProviderFactory> })._componentViewerTreeDataProvider;

        const session = makeSession('s1', ['a.scvd']);
        const otherSession = makeSession('s2', []);

        await tracker.callbacks.willStart?.(session);
        await tracker.callbacks.connected?.(session);

        const refreshCallback = (session.refreshTimer.onRefresh as jest.Mock).mock.calls[0]?.[0];
        expect(refreshCallback).toBeDefined();
        if (refreshCallback) {
            await refreshCallback(session);
            await refreshCallback(otherSession);
        }

        await tracker.callbacks.connected?.(otherSession);
        expect(provider?.clear).toHaveBeenCalled();

        await tracker.callbacks.activeSession?.(session);
        await tracker.callbacks.activeSession?.(undefined);

        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        await tracker.callbacks.stackTrace?.({ session });
        await tracker.callbacks.stackTrace?.({ session: otherSession });

        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        await tracker.callbacks.willStop?.(session);
        (controller as unknown as { _activeSession?: Session })._activeSession = otherSession;
        await tracker.callbacks.willStop?.(session);
    });

    it('does not reset instances when the same session reconnects', async () => {
        const context = makeContext();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const provider = (controller as unknown as { _componentViewerTreeDataProvider?: ReturnType<typeof treeProviderFactory> })._componentViewerTreeDataProvider;
        const session = makeSession('s1', ['a.scvd']);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (controller as unknown as { _instances: unknown[] })._instances = [instanceFactory()];

        await tracker.callbacks.connected?.(session);

        expect(provider?.clear).not.toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(1);
    });

    it('updates instances when active session and instances are present', async () => {
        const context = makeContext();
        const controller = new ComponentViewer(context as unknown as ExtensionContext);
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const updateInstances = (controller as unknown as { updateInstances: () => Promise<void> }).updateInstances.bind(controller);

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = undefined;
        await updateInstances();
        expect(provider.clear).toHaveBeenCalledTimes(1);
        provider.clear.mockClear();

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1');
        (controller as unknown as { _instances: unknown[] })._instances = [];
        await updateInstances();
        expect(provider.clear).not.toHaveBeenCalled();
        expect(provider.setRoots).not.toHaveBeenCalled();

        const instanceA = instanceFactory();
        const instanceB = instanceFactory();
        (controller as unknown as { _instances: unknown[] })._instances = [instanceA, instanceB];
        await updateInstances();
        expect(provider.setRoots).toHaveBeenCalledWith(['node', 'node']);
        expect(instanceA.update).toHaveBeenCalled();
        expect(instanceB.update).toHaveBeenCalled();
    });

    it('returns false for stack trace update when frame data is not usable', () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const shouldUpdateOnStackTrace = (controller as unknown as { shouldUpdateOnStackTrace: (s: Session) => boolean }).shouldUpdateOnStackTrace.bind(controller);
        const session = makeSession('s1');

        expect(shouldUpdateOnStackTrace(session)).toBe(false);

        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = undefined;
        expect(shouldUpdateOnStackTrace(session)).toBe(false);

        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = {};
        expect(shouldUpdateOnStackTrace(session)).toBe(false);

        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = { frameId: 'nope' };
        expect(shouldUpdateOnStackTrace(session)).toBe(false);
    });

    it('runs a debounced update after stack trace when idle', async () => {
        jest.useFakeTimers();
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const session = makeSession('s1');
        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = { frameId: 0 };
        const updateOnStackTrace = (controller as unknown as { updateOnStackTrace: (s: Session) => Promise<void> }).updateOnStackTrace.bind(controller);
        const runUpdateIfIdle = jest
            .spyOn(controller as unknown as { runUpdateIfIdle: () => Promise<void> }, 'runUpdateIfIdle')
            .mockResolvedValue(undefined);

        await updateOnStackTrace(session);
        await updateOnStackTrace(session);
        expect(runUpdateIfIdle).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        expect(runUpdateIfIdle).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('re-queues updates when one is already in flight', async () => {
        jest.useFakeTimers();
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const schedulePendingUpdate = jest.spyOn(controller as unknown as { schedulePendingUpdate: () => void }, 'schedulePendingUpdate');

        (controller as unknown as { _updateInFlight: boolean })._updateInFlight = true;
        const runUpdateIfIdle = (controller as unknown as { runUpdateIfIdle: () => Promise<void> }).runUpdateIfIdle.bind(controller);

        await runUpdateIfIdle();
        expect(schedulePendingUpdate).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('runs update immediately when idle', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const runUpdateOnce = jest
            .spyOn(controller as unknown as { runUpdateOnce: () => Promise<void> }, 'runUpdateOnce')
            .mockResolvedValue(undefined);
        const runUpdateIfIdle = (controller as unknown as { runUpdateIfIdle: () => Promise<void> }).runUpdateIfIdle.bind(controller);

        await runUpdateIfIdle();
        expect(runUpdateOnce).toHaveBeenCalled();
    });

    it('clears in-flight flag even when updateInstances throws', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        (controller as unknown as { updateInstances: () => Promise<void> }).updateInstances = jest.fn().mockRejectedValue(new Error('fail'));
        const runUpdateOnce = (controller as unknown as { runUpdateOnce: () => Promise<void> }).runUpdateOnce.bind(controller);

        await expect(runUpdateOnce()).rejects.toThrow('fail');
        expect((controller as unknown as { _updateInFlight: boolean })._updateInFlight).toBe(false);
    });

    it('loads instances and skips update on stack item mismatch', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const tracker = makeTracker();
        const session = makeSession('s1', []);
        const otherSession = makeSession('s2', []);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;

        const loadCbuildRunInstances = (controller as unknown as { loadCbuildRunInstances: (s: Session, t: TrackerCallbacks) => Promise<void | undefined> }).loadCbuildRunInstances.bind(controller);
        await expect(loadCbuildRunInstances(session, tracker)).resolves.toBeUndefined();

        (vscode.debug as unknown as { activeDebugSession?: unknown }).activeDebugSession = { id: otherSession.session.id };
        const updateOnStackTrace = jest.spyOn(controller as unknown as { updateOnStackTrace: (s: Session) => Promise<void> }, 'updateOnStackTrace');
        const handleOnDidChangeActiveStackItem = (controller as unknown as { handleOnDidChangeActiveStackItem: (stackItem: unknown) => Promise<void> }).handleOnDidChangeActiveStackItem.bind(controller);

        await handleOnDidChangeActiveStackItem({});
        expect(updateOnStackTrace).not.toHaveBeenCalled();
    });

    it('updates on active stack item when session matches', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const session = makeSession('s1', []);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (vscode.debug as unknown as { activeDebugSession?: unknown }).activeDebugSession = { id: session.session.id };
        const updateOnStackTrace = jest.spyOn(controller as unknown as { updateOnStackTrace: (s: Session) => Promise<void> }, 'updateOnStackTrace').mockResolvedValue(undefined);
        const handleOnDidChangeActiveStackItem = (controller as unknown as { handleOnDidChangeActiveStackItem: (stackItem: unknown) => Promise<void> }).handleOnDidChangeActiveStackItem.bind(controller);

        await handleOnDidChangeActiveStackItem({ frameId: 1 });
        expect(updateOnStackTrace).toHaveBeenCalledWith(session);
    });

    it('updates active session on debug session change', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const handleOnDidChangeActiveDebugSession = (controller as unknown as { handleOnDidChangeActiveDebugSession: (s: Session | undefined) => Promise<void> }).handleOnDidChangeActiveDebugSession.bind(controller);
        const session = makeSession('s1', []);
        const instance = instanceFactory();
        (controller as unknown as { _instances: unknown[] })._instances = [instance];

        await handleOnDidChangeActiveDebugSession(session);
        expect(instance.updateActiveSession).toHaveBeenCalledWith(session);
    });

    it('clears state when stopping the active session', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;
        const session = makeSession('s1', []);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (controller as unknown as { _instances: unknown[] })._instances = [instanceFactory()];

        const handleOnWillStopSession = (controller as unknown as { handleOnWillStopSession: (s: Session) => Promise<void> }).handleOnWillStopSession.bind(controller);
        await handleOnWillStopSession(session);

        expect(provider.clear).toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(0);
    });

    it('skips stack-item updates when no active session', async () => {
        const controller = new ComponentViewer(makeContext() as unknown as ExtensionContext);
        const handleOnDidChangeActiveStackItem = (controller as unknown as { handleOnDidChangeActiveStackItem: (stackItem: unknown) => Promise<void> }).handleOnDidChangeActiveStackItem.bind(controller);
        const updateOnStackTrace = jest.spyOn(controller as unknown as { updateOnStackTrace: (s: Session) => Promise<void> }, 'updateOnStackTrace');

        await handleOnDidChangeActiveStackItem({});
        expect(updateOnStackTrace).not.toHaveBeenCalled();
    });
});
