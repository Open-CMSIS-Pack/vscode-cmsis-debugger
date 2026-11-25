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

/** Extracts a selected expression, falling back to the identifier at the cursor. */
export function getEditorExpression(editor: vscode.TextEditor | undefined): string | undefined {
    if (!editor) {
        return undefined;
    }

    const { document, selection } = editor;
    const range = selection.isEmpty ? document.getWordRangeAtPosition(selection.active) : selection;
    return range ? document.getText(range).trim() || undefined : undefined;
}

/** Reads a fully qualified expression from a native Variables or Watch menu payload. */
export function getDebugExpression(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object' || !('variable' in payload)) {
        return undefined;
    }

    const variable = payload.variable;
    if (!variable || typeof variable !== 'object' || !('evaluateName' in variable)) {
        return undefined;
    }

    return typeof variable.evaluateName === 'string' ? variable.evaluateName.trim() || undefined : undefined;
}
