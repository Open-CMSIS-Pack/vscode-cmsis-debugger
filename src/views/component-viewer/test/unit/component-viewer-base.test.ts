/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// generated with AI

/**
 * Unit test for ComponentViewerBase class.
 */

import * as vscode from 'vscode';
import type { GDBTargetDebugTracker } from '../../../../debug-session';
import type { GDBTargetDebugSession } from '../../../../debug-session/gdbtarget-debug-session';
import { componentViewerLogger } from '../../../../logger';
import { extensionContextFactory } from '../../../../__test__/vscode.factory';
import { treeDataProviderFactory } from '../../__test__/component-viewer-parts.factory';
import { ComponentViewerInstancesWrapper, ScvdCollector, UpdateReason } from '../../component-viewer-base';
import { ComponentViewerBase } from '../../component-viewer-base';
import { ComponentViewerTreeDataProvider } from '../../component-viewer-tree-view';
import type { ScvdGuiInterface } from '../../model/scvd-gui-interface';
import { debugSessionFactory, trackerFactory, OnRefreshCallback, Session, TrackerCallbacks } from '../../../../debug-session/__test__/debug-session.factory';


const instanceFactory = jest.fn(() => ({
    readModel: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    getGuiTree: jest.fn<ScvdGuiInterface[] | undefined, []>(() => []),
    updateActiveSession: jest.fn(),
    cancelExecution: jest.fn(),
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

function asMockedFunction<Args extends unknown[], Return>(
    fn: (...args: Args) => Return
): jest.MockedFunction<(...args: Args) => Return> {
    return fn as unknown as jest.MockedFunction<(...args: Args) => Return>;
}

class TestClassScvdCollector implements ScvdCollector {
    public async getScvdFilePaths(session: GDBTargetDebugSession): Promise<string[]> {
        // Lightweight implementation based on session logic
        const cbuildRunReader = await session.getCbuildRun();
        return cbuildRunReader?.getScvdFilePaths() ?? [];
    }
}

class TestClass extends ComponentViewerBase {
    public constructor(
        context: vscode.ExtensionContext,
        componentViewerTreeDataProvider: ComponentViewerTreeDataProvider,
    ) {
        super(
            context,
            componentViewerTreeDataProvider,
            new TestClassScvdCollector(),
            'Test Class',
            'testClass');
    }
};

const getUpdateInstances = (controller: TestClass) =>
    (controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }).updateInstances.bind(controller);

const getSchedulePendingUpdate = (controller: TestClass) =>
    (controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }).schedulePendingUpdate.bind(controller);

const getRunUpdate = (controller: TestClass) =>
    (controller as unknown as { runUpdate: (reason: UpdateReason) => Promise<void> }).runUpdate.bind(controller);

const getReadScvdFiles = (controller: TestClass) =>
    (controller as unknown as { readScvdFiles: (t: TrackerCallbacks, s?: Session) => Promise<void> }).readScvdFiles.bind(controller);

// Local test mocks
type ExpansionEventCallback = (event: vscode.TreeViewExpansionEvent<ScvdGuiInterface>) => void;

const createController = (
    context: vscode.ExtensionContext = extensionContextFactory(),
    provider: ComponentViewerTreeDataProvider = treeDataProviderFactory()
): TestClass => new TestClass(
    context,
    provider as ComponentViewerTreeDataProvider
);

describe('ComponentViewerBase', () => {
    let context: vscode.ExtensionContext;
    let tracker: TrackerCallbacks;
    let provider: ComponentViewerTreeDataProvider;
    let controller: TestClass;

    beforeEach(async () => {
        jest.clearAllMocks();
        context = extensionContextFactory();
        provider = treeDataProviderFactory();
        tracker = trackerFactory();
        controller = createController(context, provider);
        // Extend registered commands for test class.
        const defaultMockedCommands = await vscode.commands.getCommands();
        asMockedFunction(vscode.commands.getCommands).mockResolvedValue([
            ...defaultMockedCommands,
            'cmsis-debugger.testClass.open',
            'cmsis-debugger.testClass.focus',
        ]);
        (vscode.debug as unknown as { activeDebugSession?: unknown }).activeDebugSession = undefined;
        (vscode.debug as unknown as { activeStackItem?: unknown }).activeStackItem = undefined;
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

    it('activates tree provider and registers tracker events', async () => {
        const activationResult = await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        expect(activationResult).toBe(true);
        expect(vscode.window.createTreeView).toHaveBeenCalledWith('cmsis-debugger.testClass', {
            treeDataProvider: expect.any(Object),
            showCollapseAll: true
        });
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.testClass.lockComponent', expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.testClass.unlockComponent', expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.testClass.expandAll', expect.any(Function));
        // 1 tree view + 2 event listeners + 7 commands + 6 tracker disposables
        expect(context.subscriptions.length).toBe(16);
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.testClass.filterTree', expect.any(Function));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('vscode-cmsis-debugger.testClass.clearFilter', expect.any(Function));
        // 1 tree view + 2 event listeners + 7 commands + 6 tracker disposables
        expect(context.subscriptions.length).toBe(16);
    });

    it('should fail to activate the test class tree data provider if view is not correctly loaded', async () => {
        // Clear test class commands to simulate view not correctly loaded.
        // Ensure to override the mock only once to not permanently change the global mock implementation for other tests.
        (vscode.commands.getCommands as jest.Mock).mockResolvedValueOnce([
            'cmsis-debugger.liveWatch.open',
            'cmsis-debugger.liveWatch.focus',
        ]);
        const activationResult = await controller.activate(tracker as unknown as GDBTargetDebugTracker);
        expect(activationResult).toBe(false);
    });

    it('skips reading scvd files when session or cbuild-run is missing', async () => {
        const readScvdFiles = getReadScvdFiles(controller);
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
        const session = debugSessionFactory('s1', []);
        const readScvdFiles = getReadScvdFiles(controller);

        await readScvdFiles(tracker, session);
        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('reads scvd files when active session is set', async () => {
        const session = debugSessionFactory('s1', ['a.scvd', 'b.scvd']);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;

        const readScvdFiles = getReadScvdFiles(controller);
        await readScvdFiles(tracker, session);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances.length).toBe(2);
        expect(instanceFactory).toHaveBeenCalledTimes(2);
    });

    it('skips reading scvd files when no active session is set', async () => {
        const session = debugSessionFactory('s1', ['a.scvd']);
        const readScvdFiles = getReadScvdFiles(controller);

        await readScvdFiles(tracker, session);

        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('logs and shows error when scvd read fails', async () => {
        const session = debugSessionFactory('s1', ['a.scvd']);
        (controller as unknown as { _activeSession?: Session })._activeSession = session;

        const readModelError = new Error('boom');
        const readModel = jest.fn().mockRejectedValue(readModelError);
        instanceFactory.mockImplementationOnce(() => ({
            readModel,
            update: jest.fn(),
            getGuiTree: jest.fn(() => []),
            updateActiveSession: jest.fn(),
            cancelExecution: jest.fn(),
        }));
        const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
        const errorSpy = jest.spyOn(componentViewerLogger, 'error');

        const readScvdFiles = getReadScvdFiles(controller);
        await readScvdFiles(tracker, session);

        expect(readModel).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
            'Test Class: Failed to read SCVD file at a.scvd - boom'
        );
        expect(showErrorSpy).toHaveBeenCalledWith('Test Class: cannot read SCVD file at a.scvd');
        const instances = (controller as unknown as { _instances: unknown[] })._instances;
        expect(instances).toEqual([]);
    });

    it('returns undefined when cbuild run contains no scvd instances', async () => {
        const session = debugSessionFactory('s1', []);

        const readScvdFiles = jest.fn().mockResolvedValue(undefined);
        (controller as unknown as { readScvdFiles: typeof readScvdFiles }).readScvdFiles = readScvdFiles;

        const load = (controller as unknown as {
            loadScvdFiles: (s: Session, t: TrackerCallbacks) => Promise<void | undefined>;
        }).loadScvdFiles.bind(controller);

        const result = await load(session, tracker);
        expect(result).toBeUndefined();
        expect(readScvdFiles).toHaveBeenCalled();
        expect((controller as unknown as { _instances: unknown[] })._instances).toHaveLength(0);
    });

    it('handles tracker events and updates sessions', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const session = debugSessionFactory('s1', ['a.scvd']);
        const otherSession = debugSessionFactory('s2', []);

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
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

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
        const sessionA = debugSessionFactory('s1', [], 'stopped');
        const sessionB = debugSessionFactory('s2', [], 'stopped');

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
        const sessionA = debugSessionFactory('s1', [], 'stopped');

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
        const sessionA = debugSessionFactory('s1');
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
        const debugSpy = jest.spyOn(componentViewerLogger, 'debug');

        const updateInstances = getUpdateInstances(controller);

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = undefined;
        await updateInstances('stackTrace');
        expect(provider.clear).toHaveBeenCalledTimes(1);
        (provider.clear as jest.Mock).mockClear();

        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = debugSessionFactory('s1', [], 'stopped');
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
        const updateInstances = getUpdateInstances(controller);
        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = debugSessionFactory('s1', [], 'stopped');
        const instance = instanceFactory();
        instance.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [
            { componentViewerInstance: instance, lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        await updateInstances('stackTrace');
        expect(provider.setRoots).toHaveBeenCalledWith([]);
    });

    it('updates only instances for the active session', async () => {
        const sessionA = debugSessionFactory('s1', [], 'stopped');
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
        (controller as unknown as { _activeSession?: Session | undefined })._activeSession = debugSessionFactory('s1', [], 'stopped');

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
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);
        const root = makeGuiNode('root', [makeGuiNode('child')]);
        const inst = instanceFactory();
        inst.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => [root]);

        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: inst, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const lockHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.lockComponent')?.[1] as
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
        (controller as unknown as { _componentViewerTreeDataProvider: typeof provider })._componentViewerTreeDataProvider = provider;

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
        (controller as unknown as { _componentViewerTreeDataProvider: typeof provider })._componentViewerTreeDataProvider = provider;

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
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const enableHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.enablePeriodicUpdate')?.[1] as
            | (() => Promise<void> | void)
            | undefined;
        const disableHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.disablePeriodicUpdate')?.[1] as
            | (() => Promise<void> | void)
            | undefined;

        expect(enableHandler).toBeDefined();
        expect(disableHandler).toBeDefined();

        await enableHandler?.();
        expect((controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled).toBe(true);
        expect(componentViewerLogger.info).toHaveBeenCalledWith('Test Class: Auto refresh enabled');

        await disableHandler?.();
        expect((controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled).toBe(false);
        expect(componentViewerLogger.info).toHaveBeenCalledWith('Test Class: Auto refresh disabled');
    });

    it('filterTree command opens input box and applies filter live after 3 chars', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const filterHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.filterTree')?.[1] as
            | (() => void)
            | undefined;
        expect(filterHandler).toBeDefined();

        filterHandler?.();
        const createInputBoxMock = asMockedFunction(vscode.window.createInputBox);
        expect(createInputBoxMock).toHaveBeenCalledTimes(1);
        const inputBox = createInputBoxMock.mock.results[0]?.value;
        expect(inputBox).toBeDefined();
        expect(inputBox.show).toHaveBeenCalled();

        // Simulate typing 3 chars — should apply filter
        const onChangeHandler = inputBox._handlers.onDidChangeValue[0];
        inputBox.value = 'abc';
        onChangeHandler('abc');
        expect(provider.setFilter).toHaveBeenCalledWith('abc');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'testClass.filterActive', true);

        // Simulate typing less than 3 chars — should still apply filter
        jest.clearAllMocks();
        inputBox.value = 'ab';
        onChangeHandler('ab');
        expect(provider.setFilter).toHaveBeenCalledWith('ab');

        // Simulate clearing the input — should clear filter
        jest.clearAllMocks();
        inputBox.value = '';
        onChangeHandler('');
        expect(provider.setFilter).toHaveBeenCalledWith(undefined);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'testClass.filterActive', false);
    });

    it('filterTree command applies filter on Enter regardless of length', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const filterHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.filterTree')?.[1] as
            | (() => void)
            | undefined;
        filterHandler?.();
        const inputBox = asMockedFunction(vscode.window.createInputBox).mock.results[0]?.value;
        const onAcceptHandler = inputBox._handlers.onDidAccept[0];

        // Accept with short value (< 3 chars) still applies filter
        inputBox.value = 'ab';
        onAcceptHandler();
        expect(provider.setFilter).toHaveBeenCalledWith('ab');
        expect(inputBox.hide).toHaveBeenCalled();
    });

    it('filterTree command clears filter on Enter with empty value', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const filterHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.filterTree')?.[1] as
            | (() => void)
            | undefined;
        filterHandler?.();
        const inputBox = asMockedFunction(vscode.window.createInputBox).mock.results[0]?.value;
        const onAcceptHandler = inputBox._handlers.onDidAccept[0];

        inputBox.value = '';
        onAcceptHandler();
        expect(provider.setFilter).toHaveBeenCalledWith(undefined);
        expect(inputBox.hide).toHaveBeenCalled();
    });

    it('filterTree command disposes input box on hide', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const filterHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.filterTree')?.[1] as
            | (() => void)
            | undefined;
        filterHandler?.();
        const inputBox = asMockedFunction(vscode.window.createInputBox).mock.results[0]?.value;
        const onHideHandler = inputBox._handlers.onDidHide[0];

        onHideHandler();
        expect(inputBox.dispose).toHaveBeenCalled();
    });

    it('clearFilter command clears filter and resets context', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const clearHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.clearFilter')?.[1] as
            | (() => Promise<void> | void)
            | undefined;
        expect(clearHandler).toBeDefined();

        await clearHandler?.();
        expect(provider.setFilter).toHaveBeenCalledWith(undefined);
        expect(componentViewerLogger.info).toHaveBeenCalledWith('Test Class: Filter cleared');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'testClass.filterActive', false);
    });

    it('invokes unlock handler and skips lock when no matching instance exists', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const unlockHandler = registerCommandMock.mock.calls.find(([command]) => command === 'vscode-cmsis-debugger.testClass.unlockComponent')?.[1] as
            | ((node: ScvdGuiInterface) => Promise<void> | void)
            | undefined;

        expect(unlockHandler).toBeDefined();
        const root = makeGuiNode('root');
        await unlockHandler?.(root);
    });

    it('skips lock operations when gui trees are missing', () => {
        const instMissingTree = instanceFactory();
        instMissingTree.getGuiTree = jest.fn<ScvdGuiInterface[] | undefined, []>(() => undefined);
        (controller as unknown as { _instances: unknown[] })._instances = [{ componentViewerInstance: instMissingTree, lockState: false, sessionId: 's1', dirtyWhileLocked: false }];

        const handleLockInstance = (controller as unknown as { handleLockInstance: (node: ScvdGuiInterface) => void }).handleLockInstance.bind(controller);
        handleLockInstance(makeGuiNode('root'));
        expect(provider.refresh).not.toHaveBeenCalled();
    });

    it('returns early when gui tree disappears after toggling lock', () => {
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
        (controller as unknown as { _runningUpdate: boolean })._runningUpdate = true;
        const updateInstances = jest.spyOn(controller as unknown as { updateInstances: (reason: UpdateReason) => Promise<void> }, 'updateInstances');
        const runUpdate = getRunUpdate(controller);

        await runUpdate('stackTrace');

        expect(updateInstances).not.toHaveBeenCalled();
    });

    it('runs update immediately when idle', async () => {
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
        const session = debugSessionFactory('s1', [], 'stopped');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when target state is unknown', () => {
        const session = debugSessionFactory('s1', [], 'unknown');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when running and refresh disabled', () => {
        const session = debugSessionFactory('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = false;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns false when running without access', () => {
        const session = debugSessionFactory('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = false;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = true;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(false);
    });

    it('shouldUpdateInstances returns true when running with refresh and access', () => {
        const session = debugSessionFactory('s1', [], 'running');
        (session as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];
        (controller as unknown as { _refreshTimerEnabled: boolean })._refreshTimerEnabled = true;

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(true);
    });

    it('shouldUpdateInstances returns true when stopped', () => {
        const session = debugSessionFactory('s1', [], 'stopped');

        (controller as unknown as { _instances: ComponentViewerInstancesWrapper[] })._instances = [
            { componentViewerInstance: instanceFactory() as unknown as ComponentViewerInstancesWrapper['componentViewerInstance'], lockState: false, sessionId: 's1', dirtyWhileLocked: false },
        ];

        const shouldUpdateInstances = (controller as unknown as { shouldUpdateInstances: (s: Session) => boolean }).shouldUpdateInstances.bind(controller);
        expect(shouldUpdateInstances(session)).toBe(true);
    });

    it('silently skips periodic refresh if event comes for session not in front', async () => {
        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        // Set up two sessions
        const sessionFront = debugSessionFactory('s1', [], 'running');
        const sessionOther = debugSessionFactory('s2', [], 'running');
        (sessionFront as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;
        (sessionOther as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;

        //Set up spy on schedulePendingUpdate to verify whether updates are scheduled from the refresh callbacks
        const schedulePendingUpdateSpy = jest.spyOn((controller as unknown as { schedulePendingUpdate: (reason: UpdateReason) => void }), 'schedulePendingUpdate');

        // Capture refresh callbacks for both sessions to fire refreshs manually in the test
        let sessionFrontRefreshCallback: OnRefreshCallback;
        let sessionOtherRefreshCallback: OnRefreshCallback;
        sessionFront.refreshTimer.onRefresh = (callback => sessionFrontRefreshCallback = callback);
        sessionOther.refreshTimer.onRefresh = (callback => sessionOtherRefreshCallback = callback);

        await tracker.callbacks.willStart?.(sessionFront);
        await tracker.callbacks.willStart?.(sessionOther);
        expect(sessionFrontRefreshCallback!).toBeDefined();
        expect(sessionOtherRefreshCallback!).toBeDefined();

        // Bring sessionFront to the front, fire refresh on other session.
        tracker.callbacks.activeSession?.(sessionFront);
        sessionOtherRefreshCallback!(sessionOther);
        // No update gets scheduled
        expect(schedulePendingUpdateSpy).not.toHaveBeenCalled();
        // Fire refresh on front session, update gets scheduled
        sessionFrontRefreshCallback!(sessionFront);
        expect(schedulePendingUpdateSpy).toHaveBeenCalledWith('refreshTimer');

    });

    it('handles onDidExpandElement and onDidCollapseElement correctly', async () => {
        // Capture callbacks for onDidExpandElement and onDidCollapseElement to invoke them manually in the test
        let expandCallback: ExpansionEventCallback;
        let collapseCallback: ExpansionEventCallback;
        (vscode.window.createTreeView as jest.Mock).mockReturnValueOnce({
            onDidExpandElement: jest.fn(callback => expandCallback = callback),
            onDidCollapseElement: jest.fn(callback => collapseCallback = callback),
        });

        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        // Ensure callbacks are set
        expect(expandCallback!).toBeDefined();
        expect(collapseCallback!).toBeDefined();

        // Setup spy on expected method calls when elements are expanded/collapsed
        const setElementExpandedSpy = jest.spyOn(provider, 'setElementExpanded');

        // Simulate expanding an element
        const element = makeGuiNode('element');
        expandCallback!({ element });
        expect(setElementExpandedSpy).toHaveBeenCalledWith(element, true);

        // Simulate collapsing the same element
        collapseCallback!({ element });
        expect(setElementExpandedSpy).toHaveBeenCalledWith(element, false);
    });

    it('expandAll command force-expands all elements and scrolls to root when nothing is selected', async () => {
        const childA = makeGuiNode('childA');
        const rootA = makeGuiNode('rootA', [childA]);
        const revealMock = jest.fn().mockResolvedValue(undefined);

        (vscode.window.createTreeView as jest.Mock).mockReturnValueOnce({
            onDidExpandElement: jest.fn(),
            onDidCollapseElement: jest.fn(),
            reveal: revealMock,
            selection: [],
        });

        (provider.getChildren as jest.Mock).mockReturnValue([rootA]);

        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const expandAllHandler = registerCommandMock.mock.calls.find(
            ([command]) => command === 'vscode-cmsis-debugger.testClass.expandAll'
        )?.[1] as (() => Promise<void>) | undefined;

        expect(expandAllHandler).toBeDefined();
        await expandAllHandler?.();

        expect(provider.expandAllElements).toHaveBeenCalled();
        // Single reveal to scroll to root (no per-node expansion reveals)
        expect(revealMock).toHaveBeenCalledTimes(1);
        expect(revealMock).toHaveBeenCalledWith(rootA, { select: false, focus: false, expand: false });
    });

    it('expandAll command reveals the selected element to keep it in focus', async () => {
        const childA = makeGuiNode('childA');
        const rootA = makeGuiNode('rootA', [childA]);
        const revealMock = jest.fn().mockResolvedValue(undefined);

        (vscode.window.createTreeView as jest.Mock).mockReturnValueOnce({
            onDidExpandElement: jest.fn(),
            onDidCollapseElement: jest.fn(),
            reveal: revealMock,
            selection: [childA],
        });

        (provider.getChildren as jest.Mock).mockReturnValue([rootA]);

        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const expandAllHandler = registerCommandMock.mock.calls.find(
            ([command]) => command === 'vscode-cmsis-debugger.testClass.expandAll'
        )?.[1] as (() => Promise<void>) | undefined;

        await expandAllHandler?.();

        expect(provider.expandAllElements).toHaveBeenCalled();
        // Single reveal to scroll to selected element
        expect(revealMock).toHaveBeenCalledTimes(1);
        expect(revealMock).toHaveBeenCalledWith(childA, { select: true, focus: false, expand: false });
    });

    it('expandAll command does not reveal when tree is empty', async () => {
        const revealMock = jest.fn().mockResolvedValue(undefined);

        (vscode.window.createTreeView as jest.Mock).mockReturnValueOnce({
            onDidExpandElement: jest.fn(),
            onDidCollapseElement: jest.fn(),
            reveal: revealMock,
            selection: [],
        });

        (provider.getChildren as jest.Mock).mockReturnValue([]);

        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const expandAllHandler = registerCommandMock.mock.calls.find(
            ([command]) => command === 'vscode-cmsis-debugger.testClass.expandAll'
        )?.[1] as (() => Promise<void>) | undefined;

        await expandAllHandler?.();

        expect(provider.expandAllElements).toHaveBeenCalled();
        expect(revealMock).not.toHaveBeenCalled();
    });

    it('expandAll command gracefully handles reveal errors', async () => {
        const rootA = makeGuiNode('rootA', [makeGuiNode('childA1')]);
        const revealMock = jest.fn()
            .mockRejectedValueOnce(new Error('element not visible'));

        (vscode.window.createTreeView as jest.Mock).mockReturnValueOnce({
            onDidExpandElement: jest.fn(),
            onDidCollapseElement: jest.fn(),
            reveal: revealMock,
            selection: [],
        });

        (provider.getChildren as jest.Mock).mockReturnValue([rootA]);

        await controller.activate(tracker as unknown as GDBTargetDebugTracker);

        const registerCommandMock = asMockedFunction(vscode.commands.registerCommand);
        const expandAllHandler = registerCommandMock.mock.calls.find(
            ([command]) => command === 'vscode-cmsis-debugger.testClass.expandAll'
        )?.[1] as (() => Promise<void>) | undefined;

        // Should not throw despite reveal failing
        await expect(expandAllHandler?.()).resolves.toBeUndefined();
        expect(provider.expandAllElements).toHaveBeenCalled();
        expect(revealMock).toHaveBeenCalledTimes(1);
        expect(revealMock).toHaveBeenCalledWith(rootA, { select: false, focus: false, expand: false });
    });

    it('handleExpandAll returns early when treeView is not set', async () => {
        // Do not activate (so _treeView is undefined)
        const handleExpandAll = (controller as unknown as { handleExpandAll: () => Promise<void> }).handleExpandAll.bind(controller);

        await expect(handleExpandAll()).resolves.toBeUndefined();
        expect(provider.expandAllElements).not.toHaveBeenCalled();
    });
});
