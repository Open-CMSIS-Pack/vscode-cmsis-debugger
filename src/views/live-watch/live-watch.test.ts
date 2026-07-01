/**
 * Copyright 2025-2026 Arm Limited
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';
import { LiveWatchValue, LiveWatchTreeDataProvider, LiveWatchNode } from './live-watch';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';
import { gdbTargetConfiguration } from '../../debug-configuration/debug-configuration.factory';
import { GDBTargetConfiguration } from '../../debug-configuration';


describe('LiveWatchTreeDataProvider', () => {
    let liveWatchTreeDataProvider: LiveWatchTreeDataProvider;
    let tracker: GDBTargetDebugTracker;
    let debugSession: vscode.DebugSession;
    let gdbtargetDebugSession: GDBTargetDebugSession;
    let debugConfig: GDBTargetConfiguration;

    // Helper: create a dummy node
    function makeNode(expression = 'x', value: LiveWatchValue = { result: '1', variablesReference: 0 }, id = 1, parent?: LiveWatchNode) {
        return { id, expression, value, parent: parent, children: [] };
    }

    beforeEach(() => {
        // Mock the ExtensionContext
        const mockContext = extensionContextFactory();
        debugConfig = gdbTargetConfiguration();
        liveWatchTreeDataProvider = new LiveWatchTreeDataProvider(mockContext);
        tracker = new GDBTargetDebugTracker();
        tracker.activate(mockContext);
        debugSession = debugSessionFactory(debugConfig);
        gdbtargetDebugSession = new GDBTargetDebugSession(debugSession);
    });

    describe('session management and connection tests', () => {
        it('should successfully activate the live watch tree data provider', async () => {
            const activationResult = await liveWatchTreeDataProvider.activate(tracker);
            expect(activationResult).toBe(true);
        });

        it('should fail to activate the live watch tree data provider if view is not correctly loaded', async () => {
            // Clear live watch commands to simulate view not correctly loaded.
            // Ensure to override the mock only once to not permanently change the global mock implementation for other tests.
            (vscode.commands.getCommands as jest.Mock).mockResolvedValueOnce([
                'cmsis-debugger.componentViewer.open',
                'cmsis-debugger.componentViewer.focus',
            ]);
            const activationResult = await liveWatchTreeDataProvider.activate(tracker);
            expect(activationResult).toBe(false);
        });

        it('registers the live watch tree data provider', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledWith('cmsis-debugger.liveWatch', liveWatchTreeDataProvider);
        });

        it('manages session lifecycles correctly', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            // No active session yet
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
            // Add session (should not set active session yet)
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
            // Activate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.id).toEqual(gdbtargetDebugSession.session.id);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.name).toEqual(gdbtargetDebugSession.session.name);
            // Continue session should set context of vscode-cmsis-debugger.setExpressionSupported to false
            (tracker as any)._onContinued.fire({ session: gdbtargetDebugSession });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'vscode-cmsis-debugger.setExpressionSupported', false);
            // Stopped session should call setSetExpressionSupportedContext of active session
            const setContextSpy = jest.spyOn(gdbtargetDebugSession, 'setSetExpressionSupportedContext').mockResolvedValue();
            (tracker as any)._onStopped.fire({ session: gdbtargetDebugSession });
            expect(setContextSpy).toHaveBeenCalled();
            // Deactivate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(undefined);
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
            // Reactivate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession).toBeDefined();
            // Stop session should clear active session
            (tracker as any)._onWillStopSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
        });

        it('schedules a refresh on onDidChangeActiveStackItem, onMemory, and onInvalidated events', async () => {
            const scheduleSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'schedulePendingRefresh');
            await liveWatchTreeDataProvider.activate(tracker);
            // Activate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.id).toEqual(gdbtargetDebugSession.session.id);
            scheduleSpy.mockClear();
            // Fire onDidChangeActiveStackItem event
            (tracker as any)._onDidChangeActiveStackItem.fire({ item: { frameId: 1 } });
            expect(scheduleSpy).toHaveBeenCalled();
            scheduleSpy.mockClear();
            // Fire onMemory event
            (tracker as any)._onMemory.fire({ session: gdbtargetDebugSession, event: { memoryReference: '0x1234', offset: 0, count: 4 } });
            expect(scheduleSpy).toHaveBeenCalled();
            scheduleSpy.mockClear();
            // Fire onInvalidated event
            (tracker as any)._onInvalidated.fire({ session: gdbtargetDebugSession, event: { memoryReference: '0x1234', offset: 0, count: 4 } });
            expect(scheduleSpy).toHaveBeenCalled();
        });

        it('calls save function when extension is deactivating', async () => {
            const saveSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'save').mockResolvedValue('');
            await liveWatchTreeDataProvider.activate(tracker);
            await liveWatchTreeDataProvider.deactivate();
            expect(saveSpy).toHaveBeenCalled();
        });

        it('clears highlighted labels before saving on session stop', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            // Activate session and set up nodes with highlights
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            const node = makeNode('myVar', {
                result: 'value',
                variablesReference: 0,
                highlightedLabel: { label: 'myVar = ', highlights: [[0, 5]] }
            }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            // Stop session triggers save
            (tracker as any)._onWillStopSession.fire(gdbtargetDebugSession);
            // Allow async handlers to complete
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(node.value.highlightedLabel).toBeUndefined();
        });

        it('reassigns IDs sequentially for restored nodes on construction', () => {
            const storedNodes = [
                { id: 5, expression: 'expression1', value: 'some-value', parent: undefined },
                { id: 9, expression: 'expression2', value: 'some-value', parent: undefined }
            ];
            const mockContext: any = {
                subscriptions: [],
                workspaceState: {
                    get: (key: string) => key === 'cmsis-debugger.liveWatch.tree.items' ? storedNodes : undefined,
                    update: jest.fn()
                }
            };
            const provider = new LiveWatchTreeDataProvider(mockContext);
            const roots = (provider as any).roots;
            expect(roots.length).toBe(2);
            expect(roots[0].id).toBe(0);
            expect(roots[1].id).toBe(1);
            expect((provider as any).nodeID).toBe(2);
        });
    });

    describe('tree data methods', () => {
        it('getChildren returns roots when no element is passed', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('node-1', { result: '1', variablesReference: 0 }, 1), makeNode('node-2', { result: '2', variablesReference: 0 }, 2)];
            const children = await liveWatchTreeDataProvider.getChildren();
            expect(children.length).toBe(2);
            expect(children[0].expression).toBe('node-1');
            expect(children[1].expression).toBe('node-2');
        });

        it('getChildren returns children of element', async () => {
            const parent = makeNode('parentNode', { result: '1', variablesReference: 123 }, 1);
            (liveWatchTreeDataProvider as any).roots = [parent];
            // Mock active session with customRequest returning one variable
            (liveWatchTreeDataProvider as any)._activeSession = {
                session: {
                    customRequest: jest.fn().mockResolvedValue({
                        variables: [
                            { name: 'childNode', value: '2', variablesReference: 0 }
                        ]
                    })
                },
                evaluateGlobalExpression: jest.fn()
            };
            const children = await liveWatchTreeDataProvider.getChildren(parent);
            expect((liveWatchTreeDataProvider as any)._activeSession.session.customRequest).toHaveBeenCalledWith('variables', { variablesReference: parent.value.variablesReference });
            expect(children.length).toBe(1);
            expect(children[0].expression).toBe('childNode');
            expect(children[0].value.result).toBe('2');
            expect(children[0].value.variablesReference).toBe(0);
            // Ensure dynamic children not persisted on parent
            expect(parent.children.length).toBe(0);
        });

        it('returns correct TreeItem for parent nodes', () => {
            const node = makeNode('expression', { result: 'value', variablesReference: 0 }, 1);
            const item = liveWatchTreeDataProvider.getTreeItem(node);
            expect(item.label).toBe('expression = ');
            expect(item.description).toBe('value');
            expect(item.contextValue).toBe('parentExpression');
        });

        it('returns correct TreeItem for leaf nodes', () => {
            // Create a child node within a parent node
            const parent = makeNode('parentExpression', { result: 'parentValue', variablesReference: 1 }, 1);
            const child = makeNode('childExpression', { result: 'childValue', variablesReference: 0 }, 2, parent);
            const item = liveWatchTreeDataProvider.getTreeItem(child);
            expect(item.label).toBe('childExpression = ');
            expect(item.description).toBe('childValue');
            expect(item.contextValue).toBe('childExpression');
        });
    });

    describe('node management', () => {
        it('add creates a new root node', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: '1234', variablesReference: 0 });
            await (liveWatchTreeDataProvider as any).addToRoots('expression');
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(1);
            expect((liveWatchTreeDataProvider as any).roots[0].expression).toBe('expression');
            expect((liveWatchTreeDataProvider as any).roots[0].value.result).toBe('1234');
        });

        it('clear removes all nodes', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('expression', { result: '1', variablesReference: 0 })];
            await (liveWatchTreeDataProvider as any).clear();
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('delete removes a node by id', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('node-1', { result: '1', variablesReference: 0 }, 1), makeNode('node-2', { result: '2', variablesReference: 0 }, 2)];
            await (liveWatchTreeDataProvider as any).delete({ id: 1 });
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(1);
            expect((liveWatchTreeDataProvider as any).roots[0].id).toBe(2);
        });

        it('rename updates node expression', async () => {
            const node = makeNode('node-1', { result: '1', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            await (liveWatchTreeDataProvider as any).rename(node, 'node-1-renamed');
            expect(node.expression).toBe('node-1-renamed');
        });

        it('copies node expression to clipboard', async () => {
            const node = makeNode('node-to-copy', { result: '1', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            await (liveWatchTreeDataProvider as any).handleCopyCommand(node);
            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('node-to-copy');
        });

        it('copies evaluateName of children to clipboard when present', async () => {
            const child = makeNode('childName', {
                result: '42',
                variablesReference: 0,
                evaluateName: 'parent.childName'
            }, 2);
            (liveWatchTreeDataProvider as any).roots = [child];
            await (liveWatchTreeDataProvider as any).handleCopyCommand(child);
            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('parent.childName');
        });

        it('copies expression to clipboard when evaluateName not present', async () => {
            const node = makeNode('myExpression', { result: '123', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            await (liveWatchTreeDataProvider as any).handleCopyCommand(node);
            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('myExpression');
        });

        it('set root value and send a setExpression request to session and calls refresh right after', async () => {
            const node = makeNode('myVar', { result: '1', variablesReference: 0 }, 1);
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue('');
            (liveWatchTreeDataProvider as any)._activeSession = {
                session: {
                    customRequest: jest.fn().mockResolvedValue({ result: '2', variablesReference: 0 })
                },
                evaluateGlobalExpression: jest.fn()
            };
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('2');
            await (liveWatchTreeDataProvider as any).handleSetValueCommand(node);
            expect((liveWatchTreeDataProvider as any)._activeSession.session.customRequest).toHaveBeenCalledWith('setExpression', { expression: 'myVar', frameId: 0, value: '2' });
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('set child node value and send a setVariable request to session', async () => {
            const parent = makeNode('parentVar', { result: '1', variablesReference: 123 }, 1);
            const child = makeNode('childVar', { result: '1', variablesReference: 0 }, 2, parent);
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue('');
            (liveWatchTreeDataProvider as any)._activeSession = {
                session: {
                    customRequest: jest.fn().mockResolvedValue({ result: '2', variablesReference: 0 })
                },
                evaluateGlobalExpression: jest.fn()
            };
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('2');
            await (liveWatchTreeDataProvider as any).handleSetValueCommand(child);
            expect((liveWatchTreeDataProvider as any)._activeSession.session.customRequest).toHaveBeenCalledWith('setVariable', { name: 'childVar', value: '2', variablesReference: 123 });
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should show error message when trying to set value with no active session', async () => {
            const node = makeNode('node', { result: '1', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any)._activeSession = undefined;
            const showErrorMessageSpy = jest.spyOn(vscode.window, 'showErrorMessage').mockImplementation(undefined);
            await (liveWatchTreeDataProvider as any).handleSetValueCommand(node);
            expect(showErrorMessageSpy).toHaveBeenCalledWith('No active debug session');
        });

        it('AddFromSelection adds selected text as new live watch expression to roots', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: '5678', variablesReference: 0 });
            // Mock the active text editor with fake range
            const fakeRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } };
            const mockEditor: any = {
                document: {
                    getText: jest.fn().mockReturnValue('selected-expression'),
                    getWordRangeAtPosition: jest.fn().mockReturnValue(fakeRange)
                },
                selection: {
                    active: { line: 0, character: 5 },
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 17 }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            await (liveWatchTreeDataProvider as any).handleAddFromSelectionCommand();
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(mockEditor.document.getWordRangeAtPosition).toHaveBeenCalledWith(mockEditor.selection.active);
            expect(mockEditor.document.getText).toHaveBeenCalledWith(fakeRange);
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('selected-expression');
            expect(roots[0].value.result).toBe('5678');
        });

        it('AddFromSelection does nothing when selection spans multiple lines', async () => {
            const mockEditor: any = {
                document: {
                    getText: jest.fn().mockReturnValue('multi-line\nselection'),
                    getWordRangeAtPosition: jest.fn().mockReturnValue(undefined)
                },
                selection: {
                    active: { line: 0, character: 5 },
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: 9 }
                }
            };
            (vscode.window as any).activeTextEditor = mockEditor;
            await (liveWatchTreeDataProvider as any).handleAddFromSelectionCommand();
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(mockEditor.document.getWordRangeAtPosition).toHaveBeenCalledWith(mockEditor.selection.active);
            expect(roots.length).toBe(0);
        });
    });

    describe('refresh', () => {
        it('refresh updates all root node values', async () => {
            const node = makeNode('expression', { result: 'old-value', variablesReference: 1 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: 'new-value', variablesReference: 0 });
            await (liveWatchTreeDataProvider as any).refresh();
            expect(node.value.result).toBe('new-value');
        });

        it('refresh(node) updates only that node', async () => {
            const node = makeNode('expression', { result: 'old-value', variablesReference: 1 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: 'new-value', variablesReference: 0 });
            await (liveWatchTreeDataProvider as any).refresh(node);
            expect(node.value.result).toBe('new-value');
        });

        it('refresh without argument evaluates each root and fires tree change once', async () => {
            const nodeA = makeNode('node-A', { result: 'value-A', variablesReference: 0 }, 1);
            const nodeB = makeNode('node-B', { result: 'value-B', variablesReference: 0 }, 2);
            (liveWatchTreeDataProvider as any).roots = [nodeA, nodeB];
            const evalMock = jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression')
                .mockImplementation(async (...args: unknown[]) => {
                    const node = args[0] as LiveWatchNode;
                    return { result: node.expression + '-updated', variablesReference: 0 };
                });
            const fireSpy = jest.spyOn((liveWatchTreeDataProvider as any)._onDidChangeTreeData, 'fire');
            await (liveWatchTreeDataProvider as any).refresh();
            expect(evalMock).toHaveBeenCalledTimes(2);
            expect(evalMock).toHaveBeenCalledWith(nodeA);
            expect(evalMock).toHaveBeenCalledWith(nodeB);
            expect(nodeA.value.result).toBe('node-A-updated');
            expect(nodeB.value.result).toBe('node-B-updated');
            expect(fireSpy).toHaveBeenCalledTimes(1);
            // fire called with undefined (no specific node) per implementation
            expect(fireSpy.mock.calls[0][0]).toBeUndefined();
        });

        it('refresh highlights nodes whose value changed', async () => {
            const node = makeNode('myVar', { result: 'old-value', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue({ result: 'new-value', variablesReference: 0 }),
                session: {}
            };
            await (liveWatchTreeDataProvider as any).refresh();
            expect(node.value.highlightedLabel).toEqual({
                label: 'myVar = ',
                highlights: [[0, 5]]
            });
        });

        it('refresh does not highlight nodes whose value is unchanged', async () => {
            const node = makeNode('myVar', { result: 'same-value', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue({ result: 'same-value', variablesReference: 0 }),
                session: {}
            };
            await (liveWatchTreeDataProvider as any).refresh();
            expect(node.value.highlightedLabel).toBeUndefined();
        });
    });

    describe('schedulePendingRefresh', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('sets _pendingRefresh to true', () => {
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            expect((liveWatchTreeDataProvider as any)._pendingRefresh).toBe(true);
        });

        it('triggers a refresh after the 50ms debounce', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            expect(refreshSpy).not.toHaveBeenCalled();
            jest.advanceTimersByTime(50);
            await Promise.resolve(); // flush setTimeout callback
            await Promise.resolve(); // flush runPendingRefresh internals
            expect(refreshSpy).toHaveBeenCalledTimes(1);
        });

        it('debounces multiple rapid calls, triggering only one refresh', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            jest.advanceTimersByTime(50);
            await Promise.resolve();
            await Promise.resolve();
            expect(refreshSpy).toHaveBeenCalledTimes(1);
        });

        it('clears the existing timer before scheduling a new one', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            (liveWatchTreeDataProvider as any)._pendingUpdateTimer = setTimeout(() => { /* placeholder */ }, 100);
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            expect(clearTimeoutSpy).toHaveBeenCalled();
        });

        it('does not trigger a refresh before 50ms have elapsed', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any).schedulePendingRefresh();
            jest.advanceTimersByTime(49);
            await Promise.resolve();
            expect(refreshSpy).not.toHaveBeenCalled();
        });
    });

    describe('runPendingRefresh', () => {
        it('does nothing if _updateInProgress is true', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any)._updateInProgress = true;
            (liveWatchTreeDataProvider as any)._pendingRefresh = true;
            await (liveWatchTreeDataProvider as any).runPendingRefresh();
            expect(refreshSpy).not.toHaveBeenCalled();
            // _updateInProgress remains true since we returned early without modifying it
            expect((liveWatchTreeDataProvider as any)._updateInProgress).toBe(true);
        });

        it('calls refresh once when there is a single pending refresh', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any)._pendingRefresh = true;
            await (liveWatchTreeDataProvider as any).runPendingRefresh();
            expect(refreshSpy).toHaveBeenCalledTimes(1);
            expect((liveWatchTreeDataProvider as any)._pendingRefresh).toBe(false);
            expect((liveWatchTreeDataProvider as any)._updateInProgress).toBe(false);
        });

        it('loops to handle a pending refresh set again during refresh execution', async () => {
            let callCount = 0;
            jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Simulate another refresh being scheduled while one is in progress
                    (liveWatchTreeDataProvider as any)._pendingRefresh = true;
                }
            });
            (liveWatchTreeDataProvider as any)._pendingRefresh = true;
            await (liveWatchTreeDataProvider as any).runPendingRefresh();
            expect(callCount).toBe(2);
            expect((liveWatchTreeDataProvider as any)._pendingRefresh).toBe(false);
            expect((liveWatchTreeDataProvider as any)._updateInProgress).toBe(false);
        });

        it('resets _updateInProgress to false after completion', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any)._pendingRefresh = true;
            await (liveWatchTreeDataProvider as any).runPendingRefresh();
            expect((liveWatchTreeDataProvider as any)._updateInProgress).toBe(false);
        });

        it('does not call refresh when _pendingRefresh is false', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            (liveWatchTreeDataProvider as any)._pendingRefresh = false;
            await (liveWatchTreeDataProvider as any).runPendingRefresh();
            expect(refreshSpy).not.toHaveBeenCalled();
            expect((liveWatchTreeDataProvider as any)._updateInProgress).toBe(false);
        });
    });

    describe('command registration', () => {
        beforeEach(() => {
            (vscode.commands as any).registerCommand?.mockClear?.();
        });

        function getRegisteredHandler(commandId: string) {
            const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const match = calls.find(c => c[0] === commandId);
            return match ? match[1] : undefined;
        }

        it('registers all live watch commands on activate', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(call => call[0]);
            expect(calls).toEqual([
                'vscode-cmsis-debugger.liveWatch.add',
                'vscode-cmsis-debugger.liveWatch.deleteAll',
                'vscode-cmsis-debugger.liveWatch.delete',
                'vscode-cmsis-debugger.liveWatch.refresh',
                'vscode-cmsis-debugger.liveWatch.modify',
                'vscode-cmsis-debugger.liveWatch.copy',
                'vscode-cmsis-debugger.liveWatch.setValue',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromTextEditor',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView',
                'vscode-cmsis-debugger.liveWatch.showInMemoryInspector',
                'vscode-cmsis-debugger.liveWatch.enablePeriodicUpdate',
                'vscode-cmsis-debugger.liveWatch.disablePeriodicUpdate',
                'vscode-cmsis-debugger.liveWatch.resetViewState'
            ]);
        });

        it('add command adds a node when expression provided', async () => {
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('expression');
            const evaluatedValue = {
                result: 'someValue',
                variablesReference: 0
            } as LiveWatchValue;
            const evaluateSpy = jest
                .spyOn(liveWatchTreeDataProvider as any, 'evaluateInitialExpression')
                .mockResolvedValue(evaluatedValue);
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.add');
            expect(handler).toBeDefined();
            await handler();
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('expression');
            expect(roots[0].value.result).toBe('someValue');
            expect(evaluateSpy).toHaveBeenCalledWith('expression');
        });

        it('add command does nothing when expression undefined', async () => {
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue(undefined);
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.add');
            await handler();
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('deleteAll command clears roots', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('nodeA', { result: '1', variablesReference: 0 }, 1), makeNode('nodeB', { result: '2', variablesReference: 0 }, 2)];
            const clearSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'clear');
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.deleteAll');
            await handler();
            expect(clearSpy).toHaveBeenCalled();
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('delete command removes provided node', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('nodeA', { result: '1', variablesReference: 0 }, 1), makeNode('nodeB', { result: '2', variablesReference: 0 }, 2)];
            const deleteSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'delete');
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.delete');
            const target = (liveWatchTreeDataProvider as any).roots[0];
            await handler(target);
            expect(deleteSpy).toHaveBeenCalledWith(target);
            expect((liveWatchTreeDataProvider as any).roots.some((r: any) => r.id === target.id)).toBe(false);
        });

        it('modify command renames a node when expression provided', async () => {
            const node = makeNode('oldExpression',{ result: '1', variablesReference: 0 },1);
            (liveWatchTreeDataProvider as any).roots = [node];
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('newExpression');
            const renameSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'rename');
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.modify');
            await handler(node);
            expect(renameSpy).toHaveBeenCalledWith(node,'newExpression');
            expect(node.expression).toBe('newExpression');
        });

        it('modify command does nothing when expression undefined', async () => {
            const node = makeNode('oldExpression', { result: '1', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue(undefined);
            const renameSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'rename');
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.modify');
            await handler(node);
            expect(renameSpy).not.toHaveBeenCalled();
            expect(node.expression).toBe('oldExpression');
        });

        it('refresh command triggers provider.refresh()', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.refresh');
            await handler();
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('watch window command adds variable name root', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: 'value', variablesReference: 0 });
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow');
            expect(handler).toBeDefined();
            await handler({ variable: { name: 'myWatchVariable' } });
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('myWatchVariable');
        });

        it('watch window command does nothing with falsy payload', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow');
            await handler(undefined);
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('variables view command adds variable name root', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluateNodeExpression').mockResolvedValue({ result: '12345', variablesReference: 0 });
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView');
            expect(handler).toBeDefined();
            const payload = { container: { name: 'local' }, variable: { name: 'localVariable' } };
            await handler(payload);
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('localVariable');
        });

        it('variables view command does nothing when variable missing', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView');
            await handler({ container: { name: 'local' } });
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('set value command calls handleSetValueCommand with node', async () => {
            const node = makeNode('node', { result: '1', variablesReference: 0 }, 1);
            const handleSetValueSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'handleSetValueCommand').mockResolvedValue('');
            await liveWatchTreeDataProvider.activate(tracker);
            // Simulate command invocation with node argument
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.setValue');
            expect(handler).toBeDefined();
            await handler(node);
            expect(handleSetValueSpy).toHaveBeenCalledWith(node);
        });

        it('set value command does nothing when node is undefined', async () => {
            const handleSetValueSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'handleSetValueCommand').mockResolvedValue('');
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.setValue');
            expect(handler).toBeDefined();
            await handler(undefined);
            expect(handleSetValueSpy).toHaveBeenCalled();
        });

        it('set value command does nothing when no new value provided', async () => {
            const node = makeNode('node', { result: '1', variablesReference: 0 }, 1);
            const handleSetValueSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'handleSetValueCommand').mockResolvedValue('');
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue(undefined);
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.setValue');
            expect(handler).toBeDefined();
            await handler(node);
            expect(handleSetValueSpy).toHaveBeenCalled();
        });

        it('showInMemoryInspector command does nothing when node is undefined', async () => {
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.showInMemoryInspector');
            expect(handler).toBeDefined();
            await handler(undefined);
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('memory-inspector.show-variable', expect.anything());
        });

        it('showInMemoryInspector shows error if extension is missing', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            (vscode.window.showErrorMessage as jest.Mock).mockClear();
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.showInMemoryInspector');
            const node = makeNode('node', { result: '0x1234', variablesReference: 77 }, 1);
            await handler(node);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Memory Inspector extension is not installed'));
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('memory-inspector.show-variable', expect.anything());
        });

        it('showInMemoryInspector executes command with proper args when extension is present', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ id: 'eclipse-cdt.memory-inspector' });
            (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('ok');
            await liveWatchTreeDataProvider.activate(tracker);
            (liveWatchTreeDataProvider as any)._activeSession = { session: { id: 'session-1' } };
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.showInMemoryInspector');
            const node = makeNode('node', { result: '0x1234', variablesReference: 0 }, 1);
            await handler(node);
            const lastCall = (vscode.commands.executeCommand as jest.Mock).mock.calls.pop();
            expect(lastCall[0]).toBe('memory-inspector.show-variable');
            const args = lastCall[1];
            expect(args.sessionId).toBe('session-1');
            expect(args.container.name).toBe('node');
            expect(args.variable.name).toBe('node');
            expect(args.variable.memoryReference).toBe('&(node)');
        });

        it('enable and disable periodic update commands update active session state', async () => {
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({ globalValue: {}, workspaceValue: {} }),
            } as any);
            await liveWatchTreeDataProvider.activate(tracker);
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            (liveWatchTreeDataProvider as any)._activeSession = gdbtargetDebugSession;

            await getRegisteredHandler('vscode-cmsis-debugger.liveWatch.disablePeriodicUpdate')();
            const state = (liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id);
            expect(state.periodicUpdateEnabled).toBe(false);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    [debugSession.configuration.name]: {
                        liveWatchPeriodicUpdateEnabled: false,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );

            await getRegisteredHandler('vscode-cmsis-debugger.liveWatch.enablePeriodicUpdate')();
            expect(state.periodicUpdateEnabled).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', true);
        });

        it('periodic refresh only refreshes when enabled for the active session', async () => {
            jest.useFakeTimers();
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            await liveWatchTreeDataProvider.activate(tracker);
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            (liveWatchTreeDataProvider as any)._activeSession = gdbtargetDebugSession;
            const state = (liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id);

            state.periodicUpdateEnabled = false;
            (gdbtargetDebugSession.refreshTimer as any)._onRefresh.fire(gdbtargetDebugSession);
            jest.advanceTimersByTime(50);
            await Promise.resolve();
            await Promise.resolve();
            expect(refreshSpy).not.toHaveBeenCalled();

            state.periodicUpdateEnabled = true;
            (gdbtargetDebugSession.refreshTimer as any)._onRefresh.fire(gdbtargetDebugSession);
            jest.advanceTimersByTime(50);
            await Promise.resolve();
            await Promise.resolve();
            expect(refreshSpy).toHaveBeenCalled();
            jest.useRealTimers();
        });

        it('reset view state command resets Live Watch view state', async () => {
            const resetViewStateSpy = jest.spyOn(liveWatchTreeDataProvider, 'resetViewState').mockResolvedValue(undefined);
            await liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.resetViewState');
            expect(handler).toBeDefined();
            await handler();

            expect(resetViewStateSpy).toHaveBeenCalled();
        });
    });

    describe('Live Watch periodic update state persists to and restores from settings', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('restores periodic update state from settings on active debug session change', async () => {
            jest.spyOn(gdbtargetDebugSession, 'getConfigStateKey').mockResolvedValue('My-Target::Debug');
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                inspect: jest.fn().mockReturnValue({
                    globalValue: {
                        'My-Target::Debug': {
                            liveWatchPeriodicUpdateEnabled: false,
                        },
                    },
                    workspaceValue: {},
                }),
            } as any);
            await liveWatchTreeDataProvider.activate(tracker);
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            await Promise.resolve();

            const state = (liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id);
            expect(state.periodicUpdateEnabled).toBe(false);
            expect(state.configStateKey).toBe('My-Target::Debug');
        });

        it('toolbar button state switches when changing the active debug session', async () => {
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
            const debugConfig2 = gdbTargetConfiguration({ name: 'Debug2' });
            const debugSession2 = debugSessionFactory(debugConfig2, '{session-id-2}');
            const gdbtargetDebugSession2 = new GDBTargetDebugSession(debugSession2);
            (gdbtargetDebugSession2 as unknown as { canAccessWhileRunning: boolean }).canAccessWhileRunning = true;
            jest.spyOn(gdbtargetDebugSession, 'getConfigStateKey').mockResolvedValue('Debug');
            jest.spyOn(gdbtargetDebugSession2, 'getConfigStateKey').mockResolvedValue('Debug2');
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                inspect: jest.fn().mockReturnValue({
                    globalValue: {},
                    workspaceValue: {
                        Debug2: {
                            liveWatchPeriodicUpdateEnabled: false,
                        },
                    },
                }),
            } as any);
            await liveWatchTreeDataProvider.activate(tracker);
            executeCommandSpy.mockClear();

            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            expect(executeCommandSpy).not.toHaveBeenCalledWith('setContext', 'liveWatch.canAccessWhileRunning', false);
            executeCommandSpy.mockClear();

            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession2);
            expect(executeCommandSpy).not.toHaveBeenCalledWith('setContext', 'liveWatch.canAccessWhileRunning', true);
            executeCommandSpy.mockClear();

            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            await Promise.resolve();
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.canAccessWhileRunning', false);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', true);
            executeCommandSpy.mockClear();

            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession2);
            await Promise.resolve();
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.canAccessWhileRunning', true);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', false);
            executeCommandSpy.mockClear();

            (tracker as any)._onDidChangeActiveDebugSession.fire(undefined);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.canAccessWhileRunning', false);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', true);
        });

        it('re-enables sessions and updates the toolbar context on view state reset', async () => {
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({
                    globalValue: {
                        Debug: {
                            liveWatchPeriodicUpdateEnabled: false,
                        },
                    },
                    workspaceValue: {
                        Debug: {
                            liveWatchPeriodicUpdateEnabled: false,
                            cpuStatesEnabled: true,
                        },
                    },
                }),
            } as any);
            await liveWatchTreeDataProvider.activate(tracker);
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            (liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id)!.periodicUpdateEnabled = false;

            await liveWatchTreeDataProvider.resetViewState();

            expect((liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id)!.periodicUpdateEnabled).toBe(true);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', true);
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                {
                    Debug: {
                        cpuStatesEnabled: true,
                    },
                },
                vscode.ConfigurationTarget.Workspace
            );
            expect(updateMock).toHaveBeenCalledWith(
                'vscode-cmsis-debugger.viewState',
                undefined,
                vscode.ConfigurationTarget.Global
            );
        });

        it('runtime view state reset does not clear persisted settings', async () => {
            const executeCommandSpy = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
            const updateMock = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
                update: updateMock,
                inspect: jest.fn().mockReturnValue({
                    globalValue: {
                        Debug: {
                            liveWatchPeriodicUpdateEnabled: false,
                        },
                    },
                    workspaceValue: {
                        Debug: {
                            liveWatchPeriodicUpdateEnabled: false,
                        },
                    },
                }),
            } as any);
            await liveWatchTreeDataProvider.activate(tracker);
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            (liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id)!.periodicUpdateEnabled = false;

            liveWatchTreeDataProvider.resetRuntimeViewState();

            expect((liveWatchTreeDataProvider as any).sessionLiveWatchStates.get(gdbtargetDebugSession.session.id)!.periodicUpdateEnabled).toBe(true);
            expect(executeCommandSpy).toHaveBeenCalledWith('setContext', 'liveWatch.periodicUpdateEnabled', true);
            expect(updateMock).not.toHaveBeenCalled();
        });
    });

    describe('evaluateInitialExpression and evaluateNodeExpression', () => {
        it('returns No active session when none set', async () => {
            const result = await (liveWatchTreeDataProvider as any).evaluateInitialExpression('myExpression');
            expect(result.result).toBe('No active session');
            expect(result.variablesReference).toBe(0);
        });

        it('maps string result into LiveWatchValue on first evaluation', async () => {
            // mock active session with evaluateGlobalExpression returning a string
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue('string-value'),
                session: {}
            };
            const evalResult = await (liveWatchTreeDataProvider as any).evaluateInitialExpression('myExpression');
            expect(evalResult.result).toBe('string-value');
            expect(evalResult.variablesReference).toBe(0);
        });

        it('maps object result into LiveWatchValue on first evaluation', async () => {
            const responseObj = { result: 'value', variablesReference: 1234 };
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue(responseObj),
                session: {}
            };
            const evalResult = await (liveWatchTreeDataProvider as any).evaluateInitialExpression('myExpression');
            expect(evalResult.result).toBe('value');
            expect(evalResult.variablesReference).toBe(1234);
        });

        it('highlights and returns node value when session returns a string error', async () => {
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue('error-message'),
                session: {}
            };
            const node = makeNode('myVar', { result: 'prev', variablesReference: 0 }, 1);
            const evalResult = await (liveWatchTreeDataProvider as any).evaluateNodeExpression(node);
            expect(evalResult.result).toBe('error-message');
            expect(evalResult.highlightedLabel).toEqual({
                label: 'myVar = ',
                highlights: [[0, 5]]
            });
        });
    });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
