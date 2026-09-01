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

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { ENABLE_TRACE_GENERATION_VIEW_SETTING } from '../../manifest';
import { containsSubstringsInOrder, normalizeFsPath } from '../../utils';
import { TraceConfigurationGeneratedCTraceFileManager } from './trace-configuration-generated-ctrace-file-manager';

interface MutableWorkspace {
    workspaceFolders: vscode.WorkspaceFolder[] | undefined;
}

const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;
const temporaryWorkspaceRoots: string[] = [];

function createProcessor(core: string, pname?: string): ProcessorType {
    return {
        core,
        revision: 'r0p0',
        'max-clock': 0,
        ...(pname ? { pname } : {})
    };
}

function mockGeneratedCBuildRunProcessors(processors: ProcessorType[]): void {
    jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
    jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue(processors);
}

function mockTraceGenerationConfiguration(): jest.Mock {
    const update = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: jest.fn(),
        update,
        inspect: jest.fn().mockReturnValue(undefined),
        has: jest.fn()
    } as unknown as vscode.WorkspaceConfiguration);
    return update;
}

async function createTemporaryWorkspace(): Promise<string> {
    const workspaceRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'trace-configuration-generated-manager-'));
    temporaryWorkspaceRoots.push(workspaceRoot);
    mutableWorkspace.workspaceFolders = [{
        uri: vscode.Uri.file(workspaceRoot),
        name: path.basename(workspaceRoot),
        index: 0
    }];
    return workspaceRoot;
}

async function readTemporaryTextFile(fileName: string): Promise<string> {
    // Test paths are created under this suite's temporary workspace root.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fsPromises.readFile(fileName, 'utf8');
}

async function writeTemporaryTextFile(fileName: string, contents: string): Promise<void> {
    // Test paths are created under this suite's temporary workspace root.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fsPromises.writeFile(fileName, contents);
}

async function createTemporaryDirectory(directoryName: string): Promise<void> {
    // Test paths are created under this suite's temporary workspace root.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fsPromises.mkdir(directoryName, { recursive: true });
}

function expectSameFsPath(actual: string | undefined, expected: string): void {
    expect(normalizeFsPath(actual)).toBe(normalizeFsPath(expected));
}

describe('TraceConfigurationGeneratedCTraceFileManager', () => {
    afterEach(async () => {
        jest.restoreAllMocks();
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
        await Promise.all(temporaryWorkspaceRoots.splice(0).map(workspaceRoot =>
            fsPromises.rm(workspaceRoot, { recursive: true, force: true })));
    });

    it('creates a generated ctrace file with processor defaults and enables trace generation', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M23', 'core1'),
        ]);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const generatedTraceFile = await manager.processGeneratedCBuildRunFileChange({ type: 'created', uri: cbuildRunFile });

        const expectedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        const generatedText = await readTemporaryTextFile(expectedTraceFile);
        expectSameFsPath(generatedTraceFile?.fsPath, expectedTraceFile);
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            true,
            vscode.ConfigurationTarget.Workspace
        );
        expect(generatedText).toContain('created-by: CMSIS Debugger');
        expect(containsSubstringsInOrder(generatedText, [
            'pname: core0',
            'core: Cortex-M55',
            'timestamps: {}',
            'timesync:',
            'data:',
            'exceptions:',
            'events:',
            'itm:',
            'enable: 0x0',
            'instructions: {}',
            'pcsampling:',
            'period: off',
            'synchronization:',
            'DWT: 256M',
            'pname: core1',
            'core: Cortex-M23',
            'instructions: {}'
        ])).toBe(true);
    });

    it('updates an existing generated ctrace file without duplicating existing processors', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M33', 'core1'),
        ]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const generatedTraceFile = path.join(ctraceDirectory, 'demo.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(generatedTraceFile, [
            'ctrace:',
            '  created-by: user',
            '  setup:',
            '    - pname: core0',
            '      core: Cortex-M55',
            '      data:',
            '        - location: existingWatch',
            '          access: W',
            ''
        ].join('\n'));
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const returnedTraceFile = await manager.processGeneratedCBuildRunFileChange({ type: 'changed', uri: cbuildRunFile });

        const generatedText = await readTemporaryTextFile(generatedTraceFile);
        expectSameFsPath(returnedTraceFile?.fsPath, generatedTraceFile);
        expect(generatedText.match(/pname: core0/g) ?? []).toHaveLength(1);
        expect(generatedText).toContain('created-by: user');
        expect(generatedText).toContain('location: existingWatch');
        expect(generatedText).toContain('pname: core1');
        expect(generatedText).toContain('core: Cortex-M33');
    });

    it('names the generated ctrace file after the cbuild-run file', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const cbuildRunFile = vscode.Uri.file(path.join(
            os.tmpdir(),
            'external-build-output',
            'nested',
            'solution+project+target.cbuild-run.yml'
        ));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const generatedTraceFile = await manager.createDefaultCTraceFile(cbuildRunFile);

        const expectedTraceFile = path.join(workspaceRoot, '.cmsis', 'solution+project+target.ctrace.yml');
        expect(CbuildRunReader.prototype.parse).toHaveBeenCalledWith(cbuildRunFile.fsPath);
        expectSameFsPath(generatedTraceFile?.fsPath, expectedTraceFile);
        await expect(readTemporaryTextFile(expectedTraceFile)).resolves.toContain('pname: core0');
    });

    it('disables trace generation when a generated cbuild-run file is deleted', async () => {
        const updateConfiguration = mockTraceGenerationConfiguration();
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse');
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const generatedTraceFile = await manager.processGeneratedCBuildRunFileChange({
            type: 'deleted',
            uri: vscode.Uri.file('/workspace/out/demo.cbuild-run.yml')
        });

        expect(generatedTraceFile).toBeUndefined();
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            false,
            vscode.ConfigurationTarget.Workspace
        );
        expect(parseSpy).not.toHaveBeenCalled();
    });

    it('does not generate a ctrace file when SWO UART trace mode is off', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        jest.spyOn(CbuildRunReader.prototype, 'getSwoUartTraceMode').mockReturnValue('off');
        const getProcessors = jest.spyOn(CbuildRunReader.prototype, 'getProcessors');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const generatedTraceFile = await manager.processGeneratedCBuildRunFileChange({
            type: 'created',
            uri: cbuildRunFile
        });

        expect(generatedTraceFile).toBeUndefined();
        expect(getProcessors).not.toHaveBeenCalled();
        await expect(readTemporaryTextFile(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml')))
            .rejects.toThrow('ENOENT');
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            false,
            vscode.ConfigurationTarget.Workspace
        );
    });

    it('rejects generated multi-core processor data when a processor is missing pname', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M33'),
        ]);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        await expect(manager.processGeneratedCBuildRunFileChange({ type: 'created', uri: cbuildRunFile }))
            .rejects.toThrow('Invalid multi-core cbuild-run processor data: processor entries 2 are missing pname.');
    });
});
