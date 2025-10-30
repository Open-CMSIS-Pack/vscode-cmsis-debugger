/**
 * Copyright 2025 Arm Limited
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';
import { LiveWatchValue, LiveWatchTreeDataProvider } from './live-watch';
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
    function makeNode(expression = 'x', value: LiveWatchValue = { result: '1', variablesReference: 0 }, id = 1) {
        return { id, expression, value, parent: undefined, children: [] };
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
        it('should activate the live watch tree data provider', () => {
            liveWatchTreeDataProvider.activate(tracker);
        });

        it('registers the live watch tree data provider', async () => {
            liveWatchTreeDataProvider.activate(tracker);
            expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledWith('cmsis-debugger.liveWatch', liveWatchTreeDataProvider);
        });

        it('manages session lifecycles correctly', async () => {
            liveWatchTreeDataProvider.activate(tracker);
            // No active session yet
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
            // Add session (should not set active session yet)
            (tracker as any)._onWillStartSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession).toBeUndefined();
            // Activate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.id).toEqual(gdbtargetDebugSession.session.id);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.name).toEqual(gdbtargetDebugSession.session.name);
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

        it('refreshes on stopped event and on onDidChangeActiveStackItem', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue('');
            liveWatchTreeDataProvider.activate(tracker);
            // Activate session
            (tracker as any)._onDidChangeActiveDebugSession.fire(gdbtargetDebugSession);
            expect((liveWatchTreeDataProvider as any).activeSession?.session.id).toEqual(gdbtargetDebugSession.session.id);
            // Fire stopped event
            (tracker as any)._onStopped.fire({ session: gdbtargetDebugSession });
            expect(refreshSpy).toHaveBeenCalled();
            refreshSpy.mockClear();
            // Fire onDidChangeActiveStackItem event
            (tracker as any)._onDidChangeActiveStackItem.fire({ item: { frameId: 1 } });
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('calls save function when extension is deactivating', async () => {
            const saveSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'save').mockResolvedValue('');
            liveWatchTreeDataProvider.activate(tracker);
            await liveWatchTreeDataProvider.deactivate();
            expect(saveSpy).toHaveBeenCalled();
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

        it('getTreeItem returns correct TreeItem', () => {
            const node = makeNode('expression', { result: 'value', variablesReference: 1 }, 1);
            const item = liveWatchTreeDataProvider.getTreeItem(node);
            expect(item.label).toBe('expression = ');
            expect(item.description).toBe('value');
            expect(item.contextValue).toBe('expression');
        });
    });

    describe('node management', () => {
        it('add creates a new root node', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: '1234', variablesReference: 0 });
            // adapt method name addToRoots (changed implementation)
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

        it('copy copies node expression to clipboard', async () => {
            const node = makeNode('node-to-copy', { result: '1', variablesReference: 0 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            await (liveWatchTreeDataProvider as any).handleCopyCommand(node);
            expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('node-to-copy');
        });

        it('AddFromSelection adds selected text as new live watch expression to roots', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: '5678', variablesReference: 0 });
            // Mock the active text editor with a selection whose active position returns a word range
            const fakeRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };
            const mockEditor: any = {
                document: {
                    getWordRangeAtPosition: jest.fn().mockReturnValue(fakeRange),
                    getText: jest.fn().mockReturnValue('selected-expression')
                },
                selection: { active: { line: 0, character: 5 } }
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
    });

    describe('refresh', () => {
        it('refresh updates all root node values', async () => {
            const node = makeNode('expression', { result: 'old-value', variablesReference: 1 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: 'new-value', variablesReference: 0 });
            await (liveWatchTreeDataProvider as any).refresh();
            expect(node.value.result).toBe('new-value');
        });

        it('refresh(node) updates only that node', async () => {
            const node = makeNode('expression', { result: 'old-value', variablesReference: 1 }, 1);
            (liveWatchTreeDataProvider as any).roots = [node];
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: 'new-value', variablesReference: 0 });
            await (liveWatchTreeDataProvider as any).refresh(node);
            expect(node.value.result).toBe('new-value');
        });

        it('refresh without argument evaluates each root and fires tree change once', async () => {
            const nodeA = makeNode('node-A', { result: 'value-A', variablesReference: 0 }, 1);
            const nodeB = makeNode('node-B', { result: 'value-B', variablesReference: 0 }, 2);
            (liveWatchTreeDataProvider as any).roots = [nodeA, nodeB];
            const evalMock = jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate')
                .mockImplementation(async (expr: unknown) => ({ result: String(expr) + '-updated', variablesReference: 0 }));
            const fireSpy = jest.spyOn((liveWatchTreeDataProvider as any)._onDidChangeTreeData, 'fire');
            await (liveWatchTreeDataProvider as any).refresh();
            expect(evalMock).toHaveBeenCalledTimes(2);
            expect(nodeA.value.result).toBe('node-A-updated');
            expect(nodeB.value.result).toBe('node-B-updated');
            expect(fireSpy).toHaveBeenCalledTimes(1);
            // fire called with undefined (no specific node) per implementation
            expect(fireSpy.mock.calls[0][0]).toBeUndefined();
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

        it('registers all live watch commands on activate', () => {
            liveWatchTreeDataProvider.activate(tracker);
            const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(call => call[0]);
            expect(calls).toEqual(expect.arrayContaining([
                'vscode-cmsis-debugger.liveWatch.add',
                'vscode-cmsis-debugger.liveWatch.deleteAll',
                'vscode-cmsis-debugger.liveWatch.delete',
                'vscode-cmsis-debugger.liveWatch.refresh',
                'vscode-cmsis-debugger.liveWatch.modify',
                'vscode-cmsis-debugger.liveWatch.copy',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromTextEditor',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow',
                'vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView',
                'vscode-cmsis-debugger.liveWatch.showInMemoryInspector'
            ]));
        });

        it('add command adds a node when expression provided', async () => {
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue('expression');
            const evaluateSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue('someValue');
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.add');
            expect(handler).toBeDefined();
            await handler();
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('expression');
            expect(evaluateSpy).toHaveBeenCalledWith('expression');
        });

        it('add command does nothing when expression undefined', async () => {
            (vscode.window as any).showInputBox = jest.fn().mockResolvedValue(undefined);
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.add');
            await handler();
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('deleteAll command clears roots', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('nodeA', { result: '1', variablesReference: 0 }, 1), makeNode('nodeB', { result: '2', variablesReference: 0 }, 2)];
            const clearSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'clear');
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.deleteAll');
            await handler();
            expect(clearSpy).toHaveBeenCalled();
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('delete command removes provided node', async () => {
            (liveWatchTreeDataProvider as any).roots = [makeNode('nodeA', { result: '1', variablesReference: 0 }, 1), makeNode('nodeB', { result: '2', variablesReference: 0 }, 2)];
            const deleteSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'delete');
            liveWatchTreeDataProvider.activate(tracker);
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
            liveWatchTreeDataProvider.activate(tracker);
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
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.modify');
            await handler(node);
            expect(renameSpy).not.toHaveBeenCalled();
            expect(node.expression).toBe('oldExpression');
        });

        it('refresh command triggers provider.refresh()', async () => {
            const refreshSpy = jest.spyOn(liveWatchTreeDataProvider as any, 'refresh').mockResolvedValue(undefined);
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.refresh');
            await handler();
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('watch window command adds variable name root', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: 'value', variablesReference: 0 });
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow');
            expect(handler).toBeDefined();
            await handler({ variable: { name: 'myWatchVariable' } });
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('myWatchVariable');
        });

        it('watch window command does nothing with falsy payload', async () => {
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromWatchWindow');
            await handler(undefined);
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('variables view command adds variable name root', async () => {
            jest.spyOn(liveWatchTreeDataProvider as any, 'evaluate').mockResolvedValue({ result: '12345', variablesReference: 0 });
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView');
            expect(handler).toBeDefined();
            const payload = { container: { name: 'local' }, variable: { name: 'localVariable' } };
            await handler(payload);
            const roots = (liveWatchTreeDataProvider as any).roots;
            expect(roots.length).toBe(1);
            expect(roots[0].expression).toBe('localVariable');
        });

        it('variables view command does nothing when variable missing', async () => {
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.addToLiveWatchFromVariablesView');
            await handler({ container: { name: 'local' } });
            expect((liveWatchTreeDataProvider as any).roots.length).toBe(0);
        });

        it('showInMemoryInspector command does nothing when node is undefined', async () => {
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.showInMemoryInspector');
            expect(handler).toBeDefined();
            await handler(undefined);
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('memory-inspector.show-variable', expect.anything());
        });

        it('showInMemoryInspector shows error if extension is missing', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
            (vscode.window.showErrorMessage as jest.Mock).mockClear();
            liveWatchTreeDataProvider.activate(tracker);
            const handler = getRegisteredHandler('vscode-cmsis-debugger.liveWatch.showInMemoryInspector');
            const node = makeNode('node', { result: '0x1234', variablesReference: 77 }, 1);
            await handler(node);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Memory Inspector extension is not installed'));
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('memory-inspector.show-variable', expect.anything());
        });

        it('showInMemoryInspector executes command with proper args when extension is present', async () => {
            (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ id: 'eclipse-cdt.memory-inspector' });
            (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('ok');
            liveWatchTreeDataProvider.activate(tracker);
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
    });

    describe('evaluate', () => {
        it('returns No active session when none set', async () => {
            const result = await (liveWatchTreeDataProvider as any).evaluate('myExpression');
            expect(result.result).toBe('No active session');
            expect(result.variablesReference).toBe(0);
        });

        it('maps string result into LiveWatchValue', async () => {
            // mock active session with evaluateGlobalExpression returning a string
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue('string-value'),
                session: {}
            };
            const evalResult = await (liveWatchTreeDataProvider as any).evaluate('myExpression');
            expect(evalResult.result).toBe('string-value');
            expect(evalResult.variablesReference).toBe(0);
        });

        it('maps object result into LiveWatchValue', async () => {
            const responseObj = { result: 'value', variablesReference: 1234 };
            (liveWatchTreeDataProvider as any)._activeSession = {
                evaluateGlobalExpression: jest.fn().mockResolvedValue(responseObj),
                session: {}
            };
            const evalResult = await (liveWatchTreeDataProvider as any).evaluate('myExpression');
            expect(evalResult.result).toBe('value');
            expect(evalResult.variablesReference).toBe(1234);
        });
    });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
