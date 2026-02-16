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
import { ComponentViewer, ComponentViewerInstancesWrapper, fifoUpdateReason } from '../../component-viewer-main';
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

// Local test mocks

type Session = {
    session: { id: string };
    getCbuildRun: () => Promise<{ getScvdFilePaths: () => string[] } | undefined>;
    getPname: () => Promise<string | undefined>;
    refreshTimer: { onRefresh: (cb: (session: Session) => void) => void };
    targetState?: TargetState;
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
        expect(context.subscriptions.length).toBe(9);
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
        //expect(refreshCallback).toBeDefined();
        if (refreshCallback) {
            await refreshCallback(session);
            await refreshCallback(otherSession);
        }

        await tracker.callbacks.connected?.(otherSession);
        expect(provider?.clear).not.toHaveBeenCalled();

        await tracker.callbacks.activeSession?.(session);
        await tracker.callbacks.activeSession?.(undefined);

        (controller as unknown as { _activeSession?: Session })._activeSession = session;
        await tracker.callbacks.stackTrace?.({ session });
        await tracker.callbacks.stackTrace?.({ session: otherSession });

        // stackTrace from a different session clears active session
        expect((controller as unknown as { _activeSession?: Session })._activeSession).toBeUndefined();

        await tracker.callbacks.activeStackItem?.({ session: otherSession });
        expect((controller as unknown as { _activeSession?: Session })._activeSession).toBe(otherSession);

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
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's1' }];

        await tracker.callbacks.connected?.(session);

        expect(provider?.clear).not.toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(1);
    });

    it('clears all instances after all sessions stop', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const sessionA = makeSession('s1', [], 'stopped');
        const sessionB = makeSession('s2', [], 'stopped');

        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's1' },
            { componentViewerInstance: instanceFactory(), lockState: false, sessionId: 's2' },
        ];

        const handleOnWillStopSession = (controller as unknown as { handleOnWillStopSession: (s: Session) => Promise<void> }).handleOnWillStopSession.bind(controller);

        await handleOnWillStopSession(sessionA);
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(1);

        await handleOnWillStopSession(sessionB);
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(0);
    });

    it('updates active session and instances on stack item change', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const sessionA = makeSession('s1', [], 'stopped');
        const sessionB = makeSession('s2');
        const updateSpy = jest.fn();

        (controller as unknown as { _activeSession?: Session })._activeSession = sessionA;
        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            {
                componentViewerInstance: { updateActiveSession: updateSpy } as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'],
                lockState: false,
                sessionId: 's1',
            },
        ];

        const handleOnStackItemChanged = (controller as unknown as { handleOnStackItemChanged: (s: Session) => Promise<void> }).handleOnStackItemChanged.bind(controller);
        await handleOnStackItemChanged(sessionB);

        expect((controller as unknown as { _activeSession?: Session })._activeSession).toBe(sessionB);
        expect(updateSpy).toHaveBeenCalledWith(sessionB);
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

        const updateInstances = (controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }).updateInstances.bind(controller);

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = undefined;
        await updateInstances('stackTrace');
        expect(provider.clear).toHaveBeenCalledTimes(1);
        provider.clear.mockClear();

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1');
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
            { componentViewerInstance: instanceA, lockState: false, sessionId: 's1' },
            { componentViewerInstance: instanceB, lockState: false, sessionId: 's1' },
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

        const updateInstances = (controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }).updateInstances.bind(controller);
        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1');
        const instance = instanceFactory();
        instance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instance, lockState: false, sessionId: 's1' },
        ];

        await updateInstances('stackTrace');
        expect(provider.setRoots).toHaveBeenCalledWith([]);
    });

    it('updates only instances for the active session', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        const provider = treeProviderFactory();
        (controller as unknown as { _componentViewerTreeDataProvider?: typeof provider })._componentViewerTreeDataProvider = provider;

        const sessionA = makeSession('s1');
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
            { componentViewerInstance: instanceA as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1' },
            { componentViewerInstance: instanceB as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1' },
            { componentViewerInstance: instanceOther as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's2' },
        ];

        const updateInstances = (controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }).updateInstances.bind(controller);
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

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = makeSession('s1');

        const rootUnlocked = makeGuiNode('u');
        const rootLocked = makeGuiNode('l');

        const unlockedInstance = instanceFactory();
        unlockedInstance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootUnlocked]);
        const lockedInstance = instanceFactory();
        lockedInstance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [rootLocked]);

        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: unlockedInstance, lockState: false, sessionId: 's1' },
            { componentViewerInstance: lockedInstance, lockState: true, sessionId: 's1' },
        ];

        const updateInstances = (controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }).updateInstances.bind(controller);
        await updateInstances('stackTrace');

        expect(unlockedInstance.update).toHaveBeenCalled();
        expect(lockedInstance.update).not.toHaveBeenCalled();
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

        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false, sessionId: 's1' }];

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
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: instMissingTree, lockState: false }];

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
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false }];

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(root);

        expect(provider.refresh).not.toHaveBeenCalled();
    });

    it('runs a debounced update when scheduling multiple times', async () => {
        jest.useFakeTimers();
        const controller = new ComponentViewer(extensionContextFactory());
        const runUpdate = jest
            .spyOn(controller as unknown as { runUpdate: (reason: fifoUpdateReason) => Promise<void> }, 'runUpdate')
            .mockResolvedValue(undefined);
        const schedulePendingUpdate = (controller as unknown as { schedulePendingUpdate: (reason: fifoUpdateReason) => void }).schedulePendingUpdate.bind(controller);

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
        const updateInstances = jest.spyOn(controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }, 'updateInstances');
        const runUpdate = (controller as unknown as { runUpdate: (reason: fifoUpdateReason) => Promise<void> }).runUpdate.bind(controller);

        await runUpdate('stackTrace');

        expect(updateInstances).not.toHaveBeenCalled();
    });

    it('runs update immediately when idle', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        (controller as unknown as { _pendingUpdate: boolean })._pendingUpdate = true;
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = false;
        const updateInstances = jest
            .spyOn(controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }, 'updateInstances')
            .mockResolvedValue(undefined);
        const runUpdate = (controller as unknown as { runUpdate: (reason: fifoUpdateReason) => Promise<void> }).runUpdate.bind(controller);

        await runUpdate('stackTrace');
        expect(updateInstances).toHaveBeenCalledWith('stackTrace');
    });

    it('propagates errors during a coalescing update', async () => {
        const controller = new ComponentViewer(extensionContextFactory());
        (controller as unknown as { _pendingUpdate: boolean })._pendingUpdate = true;
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = false;
        (controller as unknown as { updateInstances: (reason: fifoUpdateReason) => Promise<void> }).updateInstances = jest
            .fn()
            .mockRejectedValue(new Error('fail'));
        const runUpdate = (controller as unknown as { runUpdate: (reason: fifoUpdateReason) => Promise<void> }).runUpdate.bind(controller);

        await expect(runUpdate('stackTrace')).rejects.toThrow('fail');
        // Clears running state if runUpdate throws
        expect((controller as unknown as { _runningUpdate: boolean })._runningUpdate).toBe(false);
    });

});
