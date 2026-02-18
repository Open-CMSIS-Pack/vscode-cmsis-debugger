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

import * as vscode from 'vscode';
import type { GDBTargetDebugTracker } from '../../../../debug-session';
import type { TargetState } from '../../../../debug-session/gdbtarget-debug-session';
import { componentViewerLogger } from '../../../../logger';
import { extensionContextFactory } from '../../../../__test__/vscode.factory';
import { ComponentViewer, ComponentViewerInstancesWrapper, UpdateReason } from '../../component-viewer-main';
import type { ScvdGuiInterface } from '../../model/scvd-gui-interface';


const treeProviderFactory = jest.fn(() => ({
    setRoots: jest.fn(),
    clear: jest.fn(),
    refresh: jest.fn(),
}));

jest.mock('../../component-viewer-tree-view', () => ({
    ComponentViewerTreeDataProvider: jest.fn(() => treeProviderFactory()),
}));

const instanceFactory = jest.fn(() => ({
    readModel: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    getGuiTree: jest.fn<ScvdGuiInterface[] | undefined, []>(() => []),
    updateActiveSession: jest.fn(),
}));

jest.mock('../../component-viewer-instance', () => ({
    ComponentViewerInstance: jest.fn(() => instanceFactory()),
}));

jest.mock('../../../../logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
    componentViewerLogger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        trace: jest.fn(),
    },
}));

jest.mock('../../../../debug-session', () => ({}));

function asMockedFunction<Args extends unknown[], Return>(
    fn: (...args: Args) => Return
): jest.MockedFunction<(...args: Args) => Return> {
    return fn as unknown as jest.MockedFunction<(...args: Args) => Return>;
}

const getUpdateInstances = (controller: ComponentViewer) =>
    (controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }).updateInstances.bind(controller);

const getSchedulePendingUpdate = (controller: ComponentViewer) =>
    (controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }).schedulePendingUpdate.bind(controller);

const getRunUpdate = (controller: ComponentViewer) =>
    (controller as unknown as { runUpdate: (reason: UpdateReason) => Promise<void> }).runUpdate.bind(controller);

// Local test mocks

type Session = {
    session: { id: string };
    getCbuildRun: () => Promise<{ getScvdFilePaths: () => string[] } | undefined>;
    getPname: () => Promise<string | undefined>;
    refreshTimer: { onRefresh: (cb: (session: Session) => void) => void };
    targetState?: TargetState;
    canAccessWhileRunning?: boolean;
};

type TrackerCallbacks = {
    onWillStopSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onConnected: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveDebugSession: (cb: (session: Session | undefined) => Promise<void>) => { dispose: jest.Mock };
    onStackTrace: (cb: (session: { session: Session }) => Promise<void>) => { dispose: jest.Mock };
    onDidChangeActiveStackItem: (cb: (session: { session: Session }) => Promise<void>) => { dispose: jest.Mock };
    onWillStartSession: (cb: (session: Session) => Promise<void>) => { dispose: jest.Mock };
    callbacks: Partial<{
        willStop: (session: Session) => Promise<void>;
        connected: (session: Session) => Promise<void>;
        activeSession: (session: Session | undefined) => Promise<void>;
        stackTrace: (session: { session: Session }) => Promise<void>;
        activeStackItem: (session: { session: Session }) => Promise<void>;
        willStart: (session: Session) => Promise<void>;
    }>;
};

describe('ComponentViewer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.debug as unknown as { activeDebugSession?: unknown }).activeDebugSession = undefined;
        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = undefined;

        // Global vscode mock defines registerCommand as jest.fn(), but it does not provide a default return value.
        // The production code stores the return value in subscriptions, so return a disposable by default.
        asMockedFunction(vscode.commands.registerCommand).mockReturnValue({ dispose: jest.fn() } as unknown as vscode.Disposable);
    });

    const makeGuiNode = (id: string, children: ScvdGuiInterface[] = []): ScvdGuiInterface => ({
        isLocked: false,
        isRootInstance: false,
        getGuiEntry: () => ({ name: id, value: undefined }),
        getGuiChildren: () => children,
        getGuiName: () => id,
        getGuiValue: () => undefined,
        getGuiId: () => id,
        getGuiConditionResult: () => true,
        getGuiLineInfo: () => undefined,
        hasGuiChildren: () => children.length > 0,
    });


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
            onDidChangeActiveStackItem: (cb) => {
                callbacks.activeStackItem = cb;
                return { dispose: jest.fn() };
            },
            onWillStartSession: (cb) => {
                callbacks.willStart = cb;
                return { dispose: jest.fn() };
            },
        };
    };

    const makeSession = (id: string, paths: string[] = [], targetState: Session['targetState'] = 'unknown'): Session => ({
        session: { id },
        getCbuildRun: async () => ({ getScvdFilePaths: () => paths }),
        getPname: async () => undefined,
        refreshTimer: {
            onRefresh: jest.fn(),
        },
        targetState,
    });

    it('activates tree provider and registers tracker events', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);

        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledWith('cmsis-debugger.componentViewer', expect.any(Object));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.componentViewer.lockComponent', expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.componentViewer.unlockComponent', expect.any(Function));
        // tree provider + 2 commands + 5 tracker disposables
        expect(context.subscriptions.length).toBe(11);
    });

    it('skips reading scvd files when session or cbuild-run is missing', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
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
        const controller = new ComponentViewer(extensionContextFactory());
        const tracker = makeTracker();
        const session = makeSession('s1', []);
        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

        await readScvdFiles(tracker, session);
        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('reads scvd files when active session is set', async () => {
        const context = extensionContextFactory();
        const controller = new ComponentViewer(context);
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
        const controller = new ComponentViewer(extensionContextFactory());
        const tracker = makeTracker();
        const session = makeSession('s1', ['a.scvd']);
        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

        await readScvdFiles(tracker, session);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('logs and shows error when scvd read fails', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const tracker = makeTracker();
        const session = makeSession('s1', ['a.scvd']);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;

        const readModelError = new Error('boom');
        const readModel = jest.fn().mockRejectedValue(readModelError);
        instanceFactory.mockImplementationOnce(() => ({
            readModel,
            update: jest.fn(),
            getGuiTree: jest.fn(() => []),
            updateActiveSession: jest.fn(),
        }));
        const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
        const errorSpy = jest.spyOn(componentViewerLogger, 'error');

        const readScvdFiles = (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);
        await readScvdFiles(tracker, session);

        expect(readModel).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
            'Component Viewer: Failed to read SCVD file at a.scvd - boom'
        );
        expect(showErrorSpy).toHaveBeenCalledWith('Component Viewer: cannot read SCVD file at a.scvd');
        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('returns undefined when cbuild run contains no scvd instances', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const tracker = makeTracker();
        const session = makeSession('s1', []);

        const readScvdFiles = jest.fn().mockResolvedValue(undefined);
        (controller as unknown as { readScvdFiles: typeof readScvdFiles }).readScvdFiles = readScvdFiles;

        const load = (controller as unknown as {
            loadCbuildRunInstances: (s: Session, t: TrackerCallbacks) => Promise<void | undefined>;
        }).loadCbuildRunInstances.bind(controller);

        const result = await load(session, tracker);
        expect(result).toBeUndefined();
        expect(readScvdFiles).toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(0);
    });

    it('handles tracker events and updates sessions', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);
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
        }

        await tracker.callbacks.connected?.(otherSession);
        expect(provider?.clear).not.toHaveBeenCalled();

        await tracker.callbacks.activeSession?.(session);
        await tracker.callbacks.activeSession?.(undefined);

        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        await tracker.callbacks.stackTrace?.({ session });
        expect((controller as unknown as { _activeSession?: Session })._activeSession).toBe(session);


        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        await tracker.callbacks.willStop?.(session);
        (controller as unknown as { _activeSession?: Session })._activeSession = otherSession;
        await tracker.callbacks.willStop?.(session);
    });

    it('does not reset instances when the same session reconnects', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const provider = (controller as unknown as { _componentViewerTreeDataProvider?: ReturnType<typeof treeProviderFactory> })._componentViewerTreeDataProvider;
        const session: Session = {
            session: { id: 's1' },
            getCbuildRun: async () => undefined,
            getPname: async () => undefined,
            refreshTimer: { onRefresh: jest.fn() },
        };
        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        await tracker.callbacks.connected?.(session);

        expect(provider?.clear).not.toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(1);
    });

    it('clears all instances after all sessions stop', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const sessionA = makeSession('s1', [], 'stopped');
        const sessionB = makeSession('s2', [], 'stopped');

        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's1', dirtyWhileLocked: false },
            { componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's2', dirtyWhileLocked: false },
        ];

        const handleOnWillStopSession = (controller as unknown as { handleOnWillStopSession: (s: Session) => Promise<void> }).handleOnWillStopSession.bind(controller);

        await handleOnWillStopSession(sessionA);
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(1);

        await handleOnWillStopSession(sessionB);
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(0);
    });

    it('updates instances on stack item change', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const sessionA = makeSession('s1', [], 'stopped');

        (controller as unknown as { _activeSession?: Session })._activeSession = sessionA;

        const scheduleSpy = jest
            .spyOn(controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }, 'schedulePendingUpdate')
            .mockImplementation(() => undefined);

        const handleOnStackItemChanged = (controller as unknown as { handleOnStackItemChanged: (s: Session) => Promise<void> }).handleOnStackItemChanged.bind(controller);
        await handleOnStackItemChanged(sessionA);

        expect(scheduleSpy).toHaveBeenCalledWith('stackItemChanged');
        expect((controller as unknown as { _activeSession?: Session })._activeSession).toBe(sessionA);
    });

    it('does not update active session when stack item matches the active session', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const sessionA = makeSession('s1');
        const updateSpy = jest.fn();

        (controller as unknown as { _activeSession?: Session })._activeSession = sessionA;
        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            {
                componentViewerInstance: { updateActiveSession: updateSpy } as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'],
                lockState: false,
                sessionId: 's1',
                dirtyWhileLocked: false,
            },
        ];

        const handleOnStackItemChanged = (controller as unknown as { handleOnStackItemChanged: (s: Session) => Promise<void> }).handleOnStackItemChanged.bind(controller);
        await handleOnStackItemChanged(sessionA);

        expect(updateSpy).not.toHaveBeenCalled();
    });

    it('updates instances when active session and instances are present', async () => {
        const context = extensionContextFactory();
        const controller = new ComponentViewer(context);
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');

        const updateInstances = getUpdateInstances(controller);

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = undefined;
        await updateInstances('stackTrace');
        expect(provider.clear).toHaveBeenCalledTimes(1);
        provider.clear.mockClear();

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1', [], 'stopped');
        (controller as unknown as { _instances: unknown[] })._instances = [];
        await updateInstances('stackTrace');
        expect(provider.clear).not.toHaveBeenCalled();
        expect(provider.setRoots).not.toHaveBeenCalled();

        const rootA = makeGuiNode('rootA');
        const rootB = makeGuiNode('rootB');
        const instanceA = instanceFactory();
        instanceA.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootA]);
        const instanceB = instanceFactory();
        instanceB.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootB]);
        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instanceA, lockState: false, sessionId: 's1', dirtyWhileLocked: false },
            { componentViewerInstance: instanceB, lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        await updateInstances('stackTrace');
        expect(provider.setRoots).toHaveBeenCalledWith([rootA, rootB]);
        expect(instanceA.update).toHaveBeenCalled();
        expect(instanceB.update).toHaveBeenCalled();
        expect(rootA.isRootInstance).toBe(true);
        expect(rootB.isRootInstance).toBe(true);
        expect(debugSpy).toHaveBeenCalled();
    });

    it('skips gui tree updates when an instance returns no gui tree', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const updateInstances = getUpdateInstances(controller);
        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1', [], 'stopped');
        const instance = instanceFactory();
        instance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instance, lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        await updateInstances('stackTrace');
        expect(provider.setRoots).toHaveBeenCalledWith([]);
    });

    it('updates only instances for the active session', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const sessionA = makeSession('s1', [], 'stopped');
        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = sessionA;

        const rootA = { ...makeGuiNode('rootA'), clear: jest.fn() } as ScvdGuiInterface & { clear: jest.Mock };
        const rootB = { ...makeGuiNode('rootB'), clear: jest.fn() } as ScvdGuiInterface & { clear: jest.Mock };
        const rootOther = { ...makeGuiNode('rootOther'), clear: jest.fn() } as ScvdGuiInterface & { clear: jest.Mock };

        const instanceA = instanceFactory();
        instanceA.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootA]);
        const instanceB = instanceFactory();
        instanceB.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootB]);
        const instanceOther = instanceFactory();
        instanceOther.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootOther]);

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceA as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
            { componentViewerInstance: instanceB as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
            { componentViewerInstance: instanceOther as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's2', dirtyWhileLocked: false },
        ];

        const updateInstances = getUpdateInstances(controller);
        await updateInstances('stackTrace');

        expect(instanceA.update).toHaveBeenCalled();
        expect(instanceB.update).toHaveBeenCalled();
        expect(instanceOther.update).not.toHaveBeenCalled();
        expect(provider.setRoots).toHaveBeenCalledWith([rootA, rootB]);
    });

    it('skips updating a locked instance and marks root as locked', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1', [], 'stopped');

        const rootUnlocked = makeGuiNode('u');
        const rootLocked = makeGuiNode('l');

        const unlockedInstance = instanceFactory();
        unlockedInstance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootUnlocked]);
        const lockedInstance = instanceFactory();
        lockedInstance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootLocked]);

        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: unlockedInstance, lockState: false, sessionId: 's1', dirtyWhileLocked: false },
            { componentViewerInstance: lockedInstance, lockState: true, sessionId: 's1', dirtyWhileLocked: false },
        ];

        const updateInstances = getUpdateInstances(controller);
        await updateInstances('stackTrace');

        expect(unlockedInstance.update).toHaveBeenCalled();
        expect(lockedInstance.update).not.toHaveBeenCalled();
        expect((controller as unknown as { _instances: Array<{ dirtyWhileLocked: boolean }> })._instances[1].dirtyWhileLocked).toBe(true);
        expect(rootLocked.isLocked).toBe(true);
        expect(rootUnlocked.isLocked).toBe(false);
        expect(rootUnlocked.isRootInstance).toBe(true);
        expect(rootLocked.isRootInstance).toBe(true);
    });

    it('toggles lock state when lock command is invoked for a node in an instance tree', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const provider = (controller as unknown as { _componentViewerTreeDataProvider?: ReturnType<typeof treeProviderFactory> })._componentViewerTreeDataProvider;

        const root = makeGuiNode('root', [makeGuiNode('child')]);
        const inst = instanceFactory();
        inst.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [root]);

        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const lockHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.componentViewer.lockComponent')?.[1] as
            | ((node: ScvdGuiInterface) => Promise<void> | void)
            | undefined;
        expect(lockHandler).toBeDefined();

        await lockHandler?.(root);
        expect((controller as unknown as { _instances: Array<{ lockState: boolean }> })._instances[0].lockState).toBe(true);
        expect(root.isLocked).toBe(true);
        expect(provider?.refresh).toHaveBeenCalled();

        await lockHandler?.(root);
        expect((controller as unknown as { _instances: Array<{ lockState: boolean }> })._instances[0].lockState).toBe(false);
        expect(root.isLocked).toBe(false);
    });

    it('schedules an update when unlocking a locked instance', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const root = makeGuiNode('root');
        const inst = instanceFactory();
        inst.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [root]);

        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: true, sessionId: 's1', dirtyWhileLocked: true }];

        const scheduleSpy = jest
            .spyOn(controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }, 'schedulePendingUpdate')
            .mockImplementation(() => undefined);

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(root);

        expect(scheduleSpy).toHaveBeenCalledWith('unlockingInstance');
        expect((controller as unknown as { _instances: Array<{ dirtyWhileLocked: boolean }> })._instances[0].dirtyWhileLocked).toBe(false);
    });

    it('does not schedule an update when locking an unlocked instance', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const root = makeGuiNode('root');
        const inst = instanceFactory();
        inst.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [root]);

        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const scheduleSpy = jest
            .spyOn(controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }, 'schedulePendingUpdate')
            .mockImplementation(() => undefined);

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(root);

        expect(scheduleSpy).not.toHaveBeenCalled();
    });

    it('toggles periodic updates via commands', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const enableHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.componentViewer.enablePeriodicUpdate')?.[1] as
            | (() => Promise<void> | void)
            | undefined;
        const disableHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.componentViewer.disablePeriodicUpdate')?.[1] as
            | (() => Promise<void> | void)
            | undefined;

        expect(enableHandler).toBeDefined();
        expect(disableHandler).toBeDefined();

        await enableHandler?.();
        expect((controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled).toBe(true);
        expect(componentViewerLogger.info).toHaveBeenCalledWith('Component Viewer: Auto refresh enabled');

        await disableHandler?.();
        expect((controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled).toBe(false);
        expect(componentViewerLogger.info).toHaveBeenCalledWith('Component Viewer: Auto refresh disabled');
    });

    it('invokes unlock handler and skips lock when no matching instance exists', async () => {
        const context = extensionContextFactory();
        const tracker = makeTracker();
        const controller = new ComponentViewer(context);
        controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const unlockHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.componentViewer.unlockComponent')?.[1] as
            | ((node: ScvdGuiInterface) => Promise<void> | void)
            | undefined;

        expect(unlockHandler).toBeDefined();
        const root = makeGuiNode('root');
        await unlockHandler?.(root);
    });

    it('skips lock operations when gui trees are missing', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const instMissingTree = instanceFactory();
        instMissingTree.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: instMissingTree, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(makeGuiNode('root'));
        expect(provider.refresh).not.toHaveBeenCalled();
    });

    it('returns early when gui tree disappears after toggling lock', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const root = makeGuiNode('root');
        const inst = instanceFactory();
        inst.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>()
            .mockReturnValueOnce([root])
            .mockReturnValueOnce(undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(root);

        expect(provider.refresh).not.toHaveBeenCalled();
    });

    it('runs a debounced update when scheduling multiple times', async () => {
        jest.useFakeTimers();
        const controller = new ComponentViewer(extensionContextFactory());
        const runUpdate = jest
            .spyOn(controller as unknown as { runUpdate: (reason: UpdateReason) => Promise<void> }, 'runUpdate')
            .mockResolvedValue(undefined);
        const schedulePendingUpdate = getSchedulePendingUpdate(controller);

        schedulePendingUpdate('stackTrace');
        schedulePendingUpdate('stackTrace');
        expect(runUpdate).not.toHaveBeenCalled();

        jest.advanceTimersByTime(200);
        expect(runUpdate).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('does nothing when an update is already running', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = true;
        const updateInstances = jest.spyOn(controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }, 'updateInstances');
        const runUpdate = getRunUpdate(controller);

        await runUpdate('stackTrace');

        expect(updateInstances).not.toHaveBeenCalled();
    });

    it('runs update immediately when idle', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        (controller as unknown as { _pendingUpdate: boolean })._pendingUpdate = true;
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = false;
        const updateInstances = jest
            .spyOn(controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }, 'updateInstances')
            .mockResolvedValue(undefined);
        const runUpdate = getRunUpdate(controller);

        await runUpdate('stackTrace');
        expect(updateInstances).toHaveBeenCalledWith('stackTrace');
    });

    it('swallows errors during a coalescing update', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        (controller as unknown as { _pendingUpdate: boolean })._pendingUpdate = true;
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = false;
        const updateInstances = jest.spyOn(controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }, 'updateInstances')
            .mockRejectedValue(new Error('fail'));
        const runUpdate = getRunUpdate(controller);

        await expect(runUpdate('stackTrace')).resolves.toBeUndefined();
        expect(updateInstances).toHaveBeenCalledWith('stackTrace');
        // Clears running state after runUpdate completes
        expect((controller as unknown as { _runningUpdate: boolean })._runningUpdate).toBe(false);
    });

    it('shouldUpdateInstances returns false when no instances', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'stopped');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when target state is unknown', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'unknown');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when running and refresh disabled', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = false;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when running without access', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = false;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = true;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns true when running with refresh and access', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = true;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(true);
    });

    it('shouldUpdateInstances returns true when stopped', () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const session = makeSession('s1', [], 'stopped');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(true);
    });

});
