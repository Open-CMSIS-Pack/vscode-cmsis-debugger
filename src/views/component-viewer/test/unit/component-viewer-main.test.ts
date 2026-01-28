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

jest.mock('vscode', () => ({
    window: {
        registerTreeDataProvider,
    },
}));

const treeProviderFactory = jest.fn(() => ({
    addGuiOut: jest.fn(),
    showModelData: jest.fn(),
    deleteModels: jest.fn(),
    resetModelCache: jest.fn(),
}));

jest.mock('../../component-viewer-tree-view', () => ({
    ComponentViewerTreeDataProvider: jest.fn(() => treeProviderFactory()),
}));

const instanceFactory = jest.fn(() => ({
    readModel: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    getGuiTree: jest.fn(() => ['node']),
}));

jest.mock('../../component-viewer-instance', () => ({
    ComponentViewerInstance: jest.fn(() => instanceFactory()),
}));

jest.mock('../../../../debug-session', () => ({}));

import type { ExtensionContext } from 'vscode';
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
    callbacks: Partial<{
        willStop: (session: Session) => Promise<void>;
        connected: (session: Session) => Promise<void>;
        activeSession: (session: Session | undefined) => Promise<void>;
        stackTrace: (session: { session: Session }) => Promise<void>;
        willStart: (session: Session) => Promise<void>;
    }>;
};

type Context = { subscriptions: Array<{ dispose: jest.Mock }> };

describe('ComponentViewer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(context.subscriptions.length).toBe(6);
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
        expect(provider?.deleteModels).toHaveBeenCalled();

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

        expect(provider?.deleteModels).not.toHaveBeenCalled();
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
        expect(provider.deleteModels).toHaveBeenCalledTimes(1);
        provider.deleteModels.mockClear();

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1');
        (controller as unknown as { _instances: unknown[] })._instances = [];
        await updateInstances();
        expect(provider.deleteModels).not.toHaveBeenCalled();

        const instanceA = instanceFactory();
        const instanceB = instanceFactory();
        (controller as unknown as { _instances: unknown[] })._instances = [instanceA, instanceB];
        await updateInstances();
        expect(provider.resetModelCache).toHaveBeenCalled();
        expect(provider.addGuiOut).toHaveBeenCalledTimes(2);
        expect(provider.showModelData).toHaveBeenCalled();
        expect(instanceA.update).toHaveBeenCalled();
        expect(instanceB.update).toHaveBeenCalled();
    });
});
