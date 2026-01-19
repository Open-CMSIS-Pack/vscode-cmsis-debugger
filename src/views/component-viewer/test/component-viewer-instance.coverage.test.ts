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
 *
 * Coverage for ComponentViewerInstance: happy path and guard branches.
 */
// generated with AI

import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { parseStringPromise } from 'xml2js';
import { ComponentViewerInstance } from '../component-viewer-instance';
import { ScvdComponentViewer } from '../model/scvd-component-viewer';
import { ScvdBase } from '../model/scvd-base';
import { Resolver } from '../resolver';
import { ScvdEvalContext } from '../scvd-eval-context';
import { StatementEngine } from '../statement-engine/statement-engine';
import { ScvdGuiTree } from '../scvd-gui-tree';
import type { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../../debug-session';

jest.mock('vscode', () => ({
    workspace: {
        fs: {
            readFile: jest.fn(),
        },
    },
}));

jest.mock('xml2js', () => ({
    parseStringPromise: jest.fn(),
}));

jest.mock('../model/scvd-base', () => ({
    ScvdBase: {
        resetIds: jest.fn(),
    },
}));

jest.mock('../model/scvd-component-viewer', () => ({
    ScvdComponentViewer: jest.fn(),
}));

jest.mock('../resolver', () => ({
    Resolver: jest.fn(),
}));

jest.mock('../scvd-eval-context', () => ({
    ScvdEvalContext: jest.fn(),
}));

jest.mock('../statement-engine/statement-engine', () => ({
    StatementEngine: jest.fn(),
}));

jest.mock('../scvd-gui-tree', () => ({
    ScvdGuiTree: jest.fn(),
}));

describe('ComponentViewerInstance coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads a model, initializes the engine, and updates', async () => {
        const readFileMock = vscode.workspace.fs.readFile as jest.Mock;
        const parseStringMock = parseStringPromise as jest.Mock;
        const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        readFileMock.mockResolvedValue(Buffer.from('<root>\n  <child/>\n</root>'));
        parseStringMock.mockResolvedValue({ root: { child: {} } });

        const readXml = jest.fn();
        const setExecutionContextAll = jest.fn();
        const configureAll = jest.fn();
        const validateAll = jest.fn();
        const calculateTypedefs = jest.fn().mockResolvedValue(undefined);
        (ScvdComponentViewer as unknown as jest.Mock).mockImplementation(() => ({
            readXml,
            setExecutionContextAll,
            configureAll,
            validateAll,
            calculateTypedefs,
        }));

        const resolve = jest.fn();
        (Resolver as unknown as jest.Mock).mockImplementation(() => ({
            resolve,
        }));

        const init = jest.fn();
        const getExecutionContext = jest.fn().mockReturnValue({ exec: true });
        (ScvdEvalContext as unknown as jest.Mock).mockImplementation(() => ({
            init,
            getExecutionContext,
        }));

        const initialize = jest.fn();
        const executeAll = jest.fn().mockResolvedValue(undefined);
        (StatementEngine as unknown as jest.Mock).mockImplementation(() => ({
            initialize,
            executeAll,
        }));

        const beginUpdate = jest.fn().mockReturnValue(7);
        const finalizeUpdate = jest.fn();
        (ScvdGuiTree as unknown as jest.Mock).mockImplementation(() => ({
            children: ['child'],
            beginUpdate,
            finalizeUpdate,
        }));

        const instance = new ComponentViewerInstance();
        const debugSession = {} as unknown as GDBTargetDebugSession;
        const debugTracker = {} as unknown as GDBTargetDebugTracker;
        await instance.readModel(URI.file('/tmp/example.scvd'), debugSession, debugTracker);

        expect(ScvdBase.resetIds).toHaveBeenCalled();
        expect(readXml).toHaveBeenCalled();
        expect(setExecutionContextAll).toHaveBeenCalledWith({ exec: true });
        expect(configureAll).toHaveBeenCalled();
        expect(validateAll).toHaveBeenCalledWith(true);
        expect(resolve).toHaveBeenCalled();
        expect(calculateTypedefs).toHaveBeenCalled();
        expect(initialize).toHaveBeenCalled();
        expect(instance.getGuiTree()).toEqual(['child']);

        await instance.update();
        expect(beginUpdate).toHaveBeenCalled();
        expect(executeAll).toHaveBeenCalledWith(expect.any(Object));
        expect(finalizeUpdate).toHaveBeenCalledWith(7);

        const guiTree = {} as ScvdGuiTree;
        await instance.executeStatements(guiTree);
        expect(executeAll).toHaveBeenCalledWith(guiTree);

        consoleLog.mockRestore();
        consoleError.mockRestore();
    });

    it('skips update and executeStatements when dependencies are missing', async () => {
        const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        const instance = new ComponentViewerInstance();

        expect(instance.getGuiTree()).toBeUndefined();
        await instance.update();
        await instance.executeStatements({} as ScvdGuiTree);

        consoleLog.mockRestore();
    });

    it('handles XML parse failures', async () => {
        const readFileMock = vscode.workspace.fs.readFile as jest.Mock;
        const parseStringMock = parseStringPromise as jest.Mock;
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        readFileMock.mockResolvedValue(Buffer.from('<root/>'));
        parseStringMock.mockRejectedValue(new Error('parse failed'));

        const instance = new ComponentViewerInstance();
        await instance.readModel(URI.file('/tmp/invalid.scvd'), {} as unknown as GDBTargetDebugSession, {} as unknown as GDBTargetDebugTracker);

        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('handles model construction failures', async () => {
        const readFileMock = vscode.workspace.fs.readFile as jest.Mock;
        const parseStringMock = parseStringPromise as jest.Mock;
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        readFileMock.mockResolvedValue(Buffer.from('<root/>'));
        parseStringMock.mockResolvedValue({ root: {} });
        (ScvdComponentViewer as unknown as jest.Mock).mockImplementation(() => ({
            readXml: jest.fn(),
            setExecutionContextAll: jest.fn(),
            configureAll: jest.fn(),
            validateAll: jest.fn(),
            calculateTypedefs: jest.fn(),
        }));

        const instance = new ComponentViewerInstance();
        const modelGetter = jest
            .spyOn(instance as unknown as { model: ScvdComponentViewer | undefined }, 'model', 'get')
            .mockReturnValue(undefined);

        await instance.readModel(URI.file('/tmp/model.scvd'), {} as unknown as GDBTargetDebugSession, {} as unknown as GDBTargetDebugTracker);

        expect(consoleError).toHaveBeenCalledWith('Failed to create SCVD model');

        modelGetter.mockRestore();
        consoleError.mockRestore();
    });

    it('rethrows file read errors', async () => {
        const readFileMock = vscode.workspace.fs.readFile as jest.Mock;
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        readFileMock.mockRejectedValue(new Error('read failed'));
        const instance = new ComponentViewerInstance();
        const instanceWithReader = instance as unknown as { readFileToBuffer: (filePath: URI) => Promise<Buffer> };
        await expect(instanceWithReader.readFileToBuffer(URI.file('/tmp/missing'))).rejects.toThrow('read failed');

        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('injects line numbers and reports stats twice', () => {
        const instance = new ComponentViewerInstance();
        const injectLineNumbers = (instance as unknown as { injectLineNumbers: (xml: string) => string }).injectLineNumbers;
        const tagged = injectLineNumbers('<root>\n<child/>\n</root>');

        expect(tagged).toContain('__line="1"');
        expect(tagged).toContain('__line="2"');

        const first = instance.getStats('first');
        const second = instance.getStats('second');
        expect(first).toContain('Time:');
        expect(second).toContain('Mem Increase:');
    });
});
