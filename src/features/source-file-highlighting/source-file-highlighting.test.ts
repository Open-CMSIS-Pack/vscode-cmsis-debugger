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

import * as vscode from 'vscode';
import { SourceFileHighlighting } from './source-file-highlighting';
import { debugSessionFactory, extensionContextFactory } from '../../__test__/vscode.factory';

type ActiveDebugSessionListener = (session: vscode.DebugSession | undefined) => void;
type ActiveTextEditorListener = (editor: vscode.TextEditor | undefined) => void;

function makeDocument(options: {
    fileName?: string;
    lineCount?: number;
    scheme?: string;
} = {}): vscode.TextDocument {
    const fileName = options.fileName ?? '/workspace/source/main.c';
    const uri = options.scheme === 'file' || options.scheme === undefined
        ? vscode.Uri.file(fileName)
        : { ...vscode.Uri.file(fileName), scheme: options.scheme };
    return {
        fileName,
        uri,
        lineCount: options.lineCount ?? 12
    } as vscode.TextDocument;
}

function makeEditor(document: vscode.TextDocument = makeDocument()): jest.Mocked<vscode.TextEditor> {
    return {
        document,
        setDecorations: jest.fn()
    } as unknown as jest.Mocked<vscode.TextEditor>;
}

async function waitForAsyncCallbacks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('SourceFileHighlighting', () => {
    let activeDebugSessionListener: ActiveDebugSessionListener;
    let activeTextEditorListener: ActiveTextEditorListener;
    let debugSessionDisposable: vscode.Disposable;
    let editorDisposable: vscode.Disposable;

    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.window.visibleTextEditors as unknown as vscode.TextEditor[]) = [];
        debugSessionDisposable = { dispose: jest.fn() };
        editorDisposable = { dispose: jest.fn() };
        (vscode.debug.onDidChangeActiveDebugSession as jest.Mock).mockImplementation((listener: ActiveDebugSessionListener) => {
            activeDebugSessionListener = listener;
            return debugSessionDisposable;
        });
        (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mockImplementation((listener: ActiveTextEditorListener) => {
            activeTextEditorListener = listener;
            return editorDisposable;
        });
    });

    it('registers active debug session and active editor listeners', () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);

        sourceFileHighlighting.activate();

        expect(vscode.debug.onDidChangeActiveDebugSession).toHaveBeenCalledWith(expect.any(Function));
        expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalledWith(expect.any(Function));
        expect(context.subscriptions).toEqual([debugSessionDisposable, editorDisposable]);
    });

    it('requests breakpoint locations for the active file and highlights unique executable lines', async () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);
        const debugSession = debugSessionFactory({ name: 'test-session', type: 'gdbtarget', request: 'launch' });
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce({
            breakpoints: [
                { line: 2 },
                { line: 7 },
                { line: 2 }
            ]
        });
        const editor = makeEditor(makeDocument({ fileName: '/workspace/source/main.c', lineCount: 20 }));

        sourceFileHighlighting.activate();
        activeDebugSessionListener(debugSession);
        activeTextEditorListener(editor);
        await waitForAsyncCallbacks();

        expect(debugSession.customRequest).toHaveBeenCalledWith('breakpointLocations', {
            source: { path: '/workspace/source/main.c' },
            line: 1,
            endLine: 20
        });
        expect(editor.setDecorations).toHaveBeenCalledTimes(1);
        expect(editor.setDecorations).toHaveBeenCalledWith(
            (vscode.window.createTextEditorDecorationType as jest.Mock).mock.results[0].value,
            [
                { range: new vscode.Range(1, 0, 1, 0) },
                { range: new vscode.Range(6, 0, 6, 0) }
            ]
        );
    });

    it('clears executable line decorations before an active debug session exists', async () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);
        const debugSession = debugSessionFactory({ name: 'test-session', type: 'gdbtarget', request: 'launch' });
        const editor = makeEditor();

        sourceFileHighlighting.activate();
        activeTextEditorListener(editor);
        await waitForAsyncCallbacks();

        expect(debugSession.customRequest).not.toHaveBeenCalled();
        expect(editor.setDecorations).toHaveBeenCalledWith(
            (vscode.window.createTextEditorDecorationType as jest.Mock).mock.results[0].value,
            []
        );
    });

    it('clears executable line decorations for non-file editors', async () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);
        const debugSession = debugSessionFactory({ name: 'test-session', type: 'gdbtarget', request: 'launch' });
        const editor = makeEditor(makeDocument({ scheme: 'untitled' }));

        sourceFileHighlighting.activate();
        activeDebugSessionListener(debugSession);
        activeTextEditorListener(editor);
        await waitForAsyncCallbacks();

        expect(debugSession.customRequest).not.toHaveBeenCalled();
        expect(editor.setDecorations).toHaveBeenCalledWith(
            (vscode.window.createTextEditorDecorationType as jest.Mock).mock.results[0].value,
            []
        );
    });

    it('clears executable line decorations when the adapter returns no breakpoint locations', async () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);
        const debugSession = debugSessionFactory({ name: 'test-session', type: 'gdbtarget', request: 'launch' });
        (debugSession.customRequest as jest.Mock).mockResolvedValueOnce(undefined);
        const editor = makeEditor();

        sourceFileHighlighting.activate();
        activeDebugSessionListener(debugSession);
        activeTextEditorListener(editor);
        await waitForAsyncCallbacks();

        expect(debugSession.customRequest).toHaveBeenCalledWith('breakpointLocations', {
            source: { path: '/workspace/source/main.c' },
            line: 1,
            endLine: 12
        });
        expect(editor.setDecorations).toHaveBeenCalledWith(
            (vscode.window.createTextEditorDecorationType as jest.Mock).mock.results[0].value,
            []
        );
    });

    it('clears visible editors when the active debug session is cleared', async () => {
        const context = extensionContextFactory();
        const sourceFileHighlighting = new SourceFileHighlighting(context);
        const editor = makeEditor();
        (vscode.window.visibleTextEditors as unknown as vscode.TextEditor[]) = [editor];

        sourceFileHighlighting.activate();
        activeDebugSessionListener(undefined);
        await waitForAsyncCallbacks();

        expect(editor.setDecorations).toHaveBeenCalledWith(
            (vscode.window.createTextEditorDecorationType as jest.Mock).mock.results[0].value,
            []
        );
    });
});
