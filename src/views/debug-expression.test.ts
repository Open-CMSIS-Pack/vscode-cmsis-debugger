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

import type * as vscode from 'vscode';

import { getDebugExpression, getEditorExpression } from './debug-expression';

/** Creates a partial editor at the VS Code boundary for expression extraction tests. */
function createEditor(text: string, isEmpty = false): vscode.TextEditor {
    return {
        document: {
            getText: jest.fn().mockReturnValue(text),
            getWordRangeAtPosition: jest.fn().mockReturnValue({})
        },
        selection: { isEmpty, active: {} }
    } as unknown as vscode.TextEditor;
}

describe('editor expressions', () => {
    it('preserves a complete selected expression instead of extracting its final identifier', () => {
        const editor = createEditor('  buffer[index].member  ');
        expect(getEditorExpression(editor)).toBe('buffer[index].member');
        expect(editor.document.getText).toHaveBeenCalledWith(editor.selection);
        expect(editor.document.getWordRangeAtPosition).not.toHaveBeenCalled();
    });

    it('uses the word at the cursor when the selection is empty', () => {
        const editor = createEditor('counter', true);
        expect(getEditorExpression(editor)).toBe('counter');
        expect(editor.document.getWordRangeAtPosition).toHaveBeenCalledWith(editor.selection.active);
    });

    it('does not read the whole document when no word exists at the cursor', () => {
        const editor = createEditor('whole document', true);
        jest.mocked(editor.document.getWordRangeAtPosition).mockReturnValue(undefined);
        expect(getEditorExpression(editor)).toBeUndefined();
        expect(editor.document.getText).not.toHaveBeenCalled();
    });

    it('ignores missing editors and blank selections', () => {
        expect(getEditorExpression(undefined)).toBeUndefined();
        expect(getEditorExpression(createEditor('  '))).toBeUndefined();
    });
});

describe('debug menu expressions', () => {
    it.each([
        { variable: { name: 'member', evaluateName: 'object.member' }, container: { name: 'Locals' } },
        { variable: { name: 'buffer[index]', evaluateName: 'buffer[index]' } }
    ])('uses evaluateName for Variables and Watch, including roots without a container', payload => {
        expect(getDebugExpression(payload)).toBe(payload.variable.evaluateName);
    });

    it.each([undefined, null, 'name', {}, { variable: null }, { variable: { name: 'member' } },
        { variable: { evaluateName: 12 } }, { variable: { evaluateName: '  ' } }])(
        'rejects malformed or ambiguous context %j', payload => {
            expect(getDebugExpression(payload)).toBeUndefined();
        }
    );
});
