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

import { CbuildRunReader, CBuildRunFileLocator, ProcessorType } from '../../cbuild-run';
import { PyTsController } from '../../features/trace/pyts-controller';
import { logger } from '../../logger';
import { containsSubstringsInOrder, waitForCondition, waitForImmediate } from '../../utils';
import { CTraceYamlDocument } from './ctrace-yaml';
import { TraceConfigurationGeneratedCTraceFileManager } from './trace-configuration-generated-ctrace-file-manager';

interface CTraceDocumentWriter {
    writeCTraceDocument(traceFileUri: vscode.Uri, document: CTraceYamlDocument): Promise<void>;
}

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

function mockGeneratedCBuildRunProcessors(
    processors: ProcessorType[],
    targetSet = '<default>',
    startPname = processors.at(0)?.pname
): void {
    jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
    jest.spyOn(CbuildRunReader.prototype, 'getTraceMode').mockReturnValue('server');
    jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue(processors);
    jest.spyOn(CbuildRunReader.prototype, 'getStartPname').mockReturnValue(startPname);
    jest.spyOn(CbuildRunReader.prototype, 'getTargetSet').mockReturnValue(targetSet);
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

function createManagerWithConversionSpy() {
    const pyTsController = new PyTsController();
    const convertCTrace = jest.spyOn(pyTsController, 'convertCTrace').mockResolvedValue();
    return {
        manager: new TraceConfigurationGeneratedCTraceFileManager(pyTsController),
        convertCTrace
    };
}

describe('TraceConfigurationGeneratedCTraceFileManager', () => {
    afterEach(async () => {
        jest.restoreAllMocks();
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
        await Promise.all(temporaryWorkspaceRoots.splice(0).map(workspaceRoot =>
            fsPromises.rm(workspaceRoot, { recursive: true, force: true })));
    });

    it('creates a generated ctrace file with only the first processor enabled by default', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M23', 'core1'),
        ]);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const { manager, convertCTrace } = createManagerWithConversionSpy();

        const result = await manager.processGeneratedCBuildRunFileChange({ type: 'created', uri: cbuildRunFile });

        const expectedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        const generatedText = await readTemporaryTextFile(expectedTraceFile);
        expect(result.status).toBe('generated');
        expect(result.status === 'generated' ? result.uri.fsPath : undefined).toEqualFsPath(expectedTraceFile);
        expect(generatedText).toContain('created-by: CMSIS Debugger');
        expect(convertCTrace).not.toHaveBeenCalled();
        expect(containsSubstringsInOrder(generatedText, [
            'pname: core0',
            'core: Cortex-M55',
            'timestamps:',
            'itm-prescaler: 1',
            'data:',
            'events:',
            'itm:',
            'enable: 0x0',
            'pcsampling:',
            'period: 0',
            'synchronization:',
            'DWT: 16M',
            'pname: core1',
            'core: Cortex-M23',
            'disable:'
        ])).toBe(true);
        expect(generatedText.match(/disable:/g) ?? []).toHaveLength(1);
        expect(generatedText).not.toMatch(/timesync|exceptions|instructions/);
        expect(generatedText).not.toContain('timestamps: {}');
        expect(generatedText).not.toContain('instructions: {}');
        expect(generatedText).not.toContain('data: []');
        expect(generatedText).not.toContain('events: []');
        expect(generatedText).not.toContain('pname: core1\n      core: Cortex-M23\n      timestamps');
    });

    it('enables the processor selected by start-pname', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M23', 'core1'),
        ], '<default>', 'core1');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const { manager } = createManagerWithConversionSpy();

        await manager.processGeneratedCBuildRunFileChange({ type: 'created', uri: cbuildRunFile });

        const generatedText = await readTemporaryTextFile(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml'));
        expect(generatedText.match(/disable:/g) ?? []).toHaveLength(1);
        expect(generatedText).toContain('pname: core0\n      core: Cortex-M55\n      disable:');
        expect(generatedText).toContain('pname: core1\n      core: Cortex-M23\n');
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
        const { manager, convertCTrace } = createManagerWithConversionSpy();

        const result = await manager.processGeneratedCBuildRunFileChange({ type: 'changed', uri: cbuildRunFile });

        const generatedText = await readTemporaryTextFile(generatedTraceFile);
        expect(result.status).toBe('generated');
        expect(result.status === 'generated' ? result.uri.fsPath : undefined).toEqualFsPath(generatedTraceFile);
        expect(generatedText.match(/pname: core0/g) ?? []).toHaveLength(1);
        expect(generatedText).toContain('created-by: user');
        expect(generatedText).toContain('location: existingWatch');
        expect(generatedText).toContain('pname: core1');
        expect(generatedText).toContain('core: Cortex-M33');
        expect(convertCTrace).not.toHaveBeenCalled();
    });

    it('runs pyTS after each cbuild-run change regardless of an existing ctrace-run', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')], 'Release');
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const generatedTraceFile = path.join(ctraceDirectory, 'demo@Release.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(generatedTraceFile, 'ctrace:\n  setup:\n    - pname: core0\n      core: Cortex-M55\n');
        const { manager, convertCTrace } = createManagerWithConversionSpy();
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));

        const result = await manager.processGeneratedCBuildRunFileChange({ type: 'changed', uri: cbuildRunFile });

        expect(result.status).toBe('generated');
        if (result.status !== 'generated') {
            throw new Error('Expected a generated ctrace file.');
        }
        expect(result.uri.fsPath).toEqualFsPath(generatedTraceFile);
        await manager.ensureProductionCTraceRunFile(result.uri, { cbuildRunUri: cbuildRunFile });
        expect(convertCTrace).toHaveBeenCalledWith(
            result.uri,
            cbuildRunFile.fsPath
        );

        const traceDirectory = path.join(workspaceRoot, '.trace');
        await createTemporaryDirectory(traceDirectory);
        await writeTemporaryTextFile(path.join(traceDirectory, 'demo@Release.ctrace-run.yml'), 'ctrace-run:\n');
        await manager.ensureProductionCTraceRunFile(result.uri, { cbuildRunUri: cbuildRunFile });

        expect(convertCTrace).toHaveBeenCalledTimes(2);
    });

    it('returns generated configuration while pyTS conversion is still running', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(path.join(ctraceDirectory, 'demo.ctrace.yml'),
            'ctrace:\n  setup:\n    - pname: core0\n      core: Cortex-M55\n');
        const { manager, convertCTrace } = createManagerWithConversionSpy();
        let failConversion: ((error: Error) => void) | undefined;
        convertCTrace.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { failConversion = reject; }));
        const errorLog = jest.spyOn(logger, 'error').mockImplementation();

        const result = await manager.processGeneratedCBuildRunFileChange({
            type: 'changed', uri: vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'))
        });
        expect(result).toMatchObject({ status: 'generated', conversionRequested: true });
        expect(convertCTrace).toHaveBeenCalledTimes(1);
        failConversion?.(new Error('background conversion failed'));
        await Promise.resolve();
        expect(errorLog).toHaveBeenCalledWith('Failed to request pyTS conversion:', expect.any(Error));
    });

    it('does not write generated configuration after its request becomes obsolete', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        let finishParse: (() => void) | undefined;
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockReturnValueOnce(
            new Promise<void>(resolve => { finishParse = resolve; })
        );
        const write = jest.spyOn(vscode.workspace.fs, 'writeFile');
        const { manager, convertCTrace } = createManagerWithConversionSpy();
        let current = true;
        const processing = manager.processGeneratedCBuildRunFileChange({
            type: 'changed', uri: vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'))
        }, { isCurrent: () => current });
        current = false;
        finishParse?.();
        await processing;
        expect(write).not.toHaveBeenCalled();
        expect(convertCTrace).not.toHaveBeenCalled();
    });

    it.each(['read', 'directory'] as const)('does not publish configuration invalidated during %s', async boundary => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFile = path.join(ctraceDirectory, 'demo.ctrace.yml');
        const originalText = 'ctrace:\n  setup: []\n';
        let current = true;
        if (boundary === 'read') {
            await createTemporaryDirectory(ctraceDirectory);
            await writeTemporaryTextFile(ctraceFile, originalText);
            const readFile = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementationOnce(async uri => {
                const contents = await readFile(uri);
                current = false;
                return contents;
            });
        } else {
            const createDirectory = vscode.workspace.fs.createDirectory.bind(vscode.workspace.fs);
            jest.spyOn(vscode.workspace.fs, 'createDirectory').mockImplementationOnce(async uri => {
                await createDirectory(uri);
                current = false;
            });
        }
        const write = jest.spyOn(vscode.workspace.fs, 'writeFile');
        const { manager, convertCTrace } = createManagerWithConversionSpy();

        await manager.processGeneratedCBuildRunFileChange({
            type: 'changed', uri: vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'))
        }, { isCurrent: () => current });

        expect(current).toBe(false);
        expect(write).not.toHaveBeenCalled();
        expect(convertCTrace).not.toHaveBeenCalled();
        if (boundary === 'read') {
            await expect(readTemporaryTextFile(ctraceFile)).resolves.toBe(originalText);
        } else {
            await expect(readTemporaryTextFile(ctraceFile)).rejects.toMatchObject({ code: 'ENOENT' });
        }
    });

    it('normalizes and writes a document when no currency guard is supplied', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const traceFileUri = vscode.Uri.file(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml'));
        const document = CTraceYamlDocument.parse('ctrace:\n  setup:\n    - core: Cortex-M33\n      pname: cm33\n');
        const { manager } = createManagerWithConversionSpy();

        await (manager as unknown as CTraceDocumentWriter).writeCTraceDocument(traceFileUri, document);

        const contents = await readTemporaryTextFile(traceFileUri.fsPath);
        expect(containsSubstringsInOrder(contents, ['pname: cm33', 'core: Cortex-M33'])).toBe(true);
    });

    it.each([true, false])('launches a queued image refresh only while its context remains current: %s', async remainsCurrent => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getActiveSolutionFolder').mockResolvedValue(vscode.Uri.file(workspaceRoot));
        const controller = new PyTsController();
        let finishConversion: ((exitCode: number) => void) | undefined;
        const conversion = new Promise<number>(resolve => {
            finishConversion = resolve;
        });
        const run = jest.spyOn(controller, 'run').mockReturnValueOnce(conversion).mockResolvedValue(0);
        const reads = jest.spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValue(new TextEncoder().encode('ctrace: {}'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager(controller, locator);
        const ctraceUri = vscode.Uri.file(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml'));
        const cbuildRunUri = vscode.Uri.file(path.join(workspaceRoot, 'demo.cbuild-run.yml'));
        const initial = manager.ensureProductionCTraceRunFile(ctraceUri, { cbuildRunUri });
        let refreshed: Promise<void> | undefined;
        let current = true;
        try {
            await waitForCondition('initial conversion to start', () => run.mock.calls.length === 1);
            refreshed = manager.ensureProductionCTraceRunFile(ctraceUri, { cbuildRunUri, force: true, isCurrent: () => current });
            await waitForCondition('the rebuilt image request to read its source', () => reads.mock.calls.length === 4);
            await waitForImmediate();
            expect(run).toHaveBeenCalledTimes(1);
            current = remainsCurrent;
            finishConversion?.(0);
            await Promise.all([initial, refreshed]);
            expect(run).toHaveBeenCalledTimes(remainsCurrent ? 2 : 1);
        } finally {
            finishConversion?.(0);
            await Promise.all([initial, refreshed]);
        }
    });

    it('resolves the active cbuild-run before generating a missing production ctrace-run', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFile = vscode.Uri.file(path.join(ctraceDirectory, 'demo.ctrace.yml'));
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFile.fsPath, 'ctrace:\n');
        const cbuildRunFile = path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml');
        const locator = new CBuildRunFileLocator();
        jest.spyOn(locator, 'getCBuildRunFileName').mockResolvedValue(cbuildRunFile);
        const pyTsController = new PyTsController();
        const convertCTrace = jest.spyOn(pyTsController, 'convertCTrace').mockResolvedValue();
        const manager = new TraceConfigurationGeneratedCTraceFileManager(pyTsController, locator);

        await manager.ensureProductionCTraceRunFile(ctraceFile);

        expect(locator.getCBuildRunFileName).toHaveBeenCalledWith(undefined, true);
        expect(convertCTrace).toHaveBeenCalledWith(
            ctraceFile, expect.toEqualFsPath(cbuildRunFile), { forceRerun: false }
        );
    });

    it('does not generate output for a ctrace file outside the active cbuild-run context', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFile = vscode.Uri.file(path.join(ctraceDirectory, 'other.ctrace.yml'));
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFile.fsPath, 'ctrace:\n');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const { manager, convertCTrace } = createManagerWithConversionSpy();

        await manager.ensureProductionCTraceRunFile(ctraceFile, { cbuildRunUri: cbuildRunFile });

        expect(convertCTrace).not.toHaveBeenCalled();
    });

    it.each(['off' as const, undefined])('does not force image refresh when trace mode is %s', async traceMode => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        jest.mocked(CbuildRunReader.prototype.getTraceMode).mockReturnValue(traceMode);
        const { manager, convertCTrace } = createManagerWithConversionSpy();
        await manager.ensureProductionCTraceRunFile(
            vscode.Uri.file(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml')),
            { cbuildRunUri: vscode.Uri.file(path.join(workspaceRoot, 'demo.cbuild-run.yml')), force: true }
        );
        expect(convertCTrace).not.toHaveBeenCalled();
    });

    it('abandons a stale missing-output request before launching pyTS', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFile = vscode.Uri.file(path.join(ctraceDirectory, 'demo.ctrace.yml'));
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFile.fsPath, 'ctrace:\n');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const { manager, convertCTrace } = createManagerWithConversionSpy();
        const isCurrent = jest.fn()
            .mockReturnValueOnce(true)
            .mockReturnValue(false);

        await manager.ensureProductionCTraceRunFile(ctraceFile, { cbuildRunUri: cbuildRunFile, isCurrent });

        expect(convertCTrace).not.toHaveBeenCalled();
    });

    it('logs a pyTS request failure without rejecting file loading', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFile = vscode.Uri.file(path.join(ctraceDirectory, 'demo.ctrace.yml'));
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFile.fsPath, 'ctrace:\n');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const pyTsController = new PyTsController();
        const conversionError = new Error('conversion failed');
        jest.spyOn(pyTsController, 'convertCTrace').mockRejectedValue(conversionError);
        const error = jest.spyOn(logger, 'error').mockImplementation();
        const manager = new TraceConfigurationGeneratedCTraceFileManager(pyTsController);

        await expect(manager.ensureProductionCTraceRunFile(
            ctraceFile,
            { cbuildRunUri: cbuildRunFile }
        )).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
            'Trace Configuration: Failed to request pyTS conversion for missing ctrace-run output:',
            conversionError
        );
    });

    it.each([
        { targetSet: 'Release', expectedName: 'solution+project+target@Release.ctrace.yml' },
        { targetSet: '<default>', expectedName: 'solution+project+target.ctrace.yml' },
    ])('names the generated ctrace file using target set $targetSet', async ({ targetSet, expectedName }) => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')], targetSet);
        const cbuildRunFile = vscode.Uri.file(path.join(
            os.tmpdir(),
            'external-build-output',
            'nested',
            'solution+project+target.cbuild-run.yml'
        ));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const generatedTraceFile = await manager.createDefaultCTraceFile(cbuildRunFile);

        const expectedTraceFile = path.join(workspaceRoot, '.cmsis', expectedName);
        expect(CbuildRunReader.prototype.parse).toHaveBeenCalledWith(expect.toEqualFsPath(cbuildRunFile.fsPath));
        expect(generatedTraceFile?.fsPath).toEqualFsPath(expectedTraceFile);
        await expect(readTemporaryTextFile(expectedTraceFile)).resolves.toContain('pname: core0');
    });

    it('reports when a generated cbuild-run file is deleted', async () => {
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse');
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const result = await manager.processGeneratedCBuildRunFileChange({
            type: 'deleted',
            uri: vscode.Uri.file('/workspace/out/demo.cbuild-run.yml')
        });

        expect(result).toEqual({ status: 'deleted' });
        expect(parseSpy).not.toHaveBeenCalled();
    });

    it.each([
        { traceMode: 'off' as const, description: 'off' },
        { traceMode: undefined, description: 'undefined' },
    ])('does not generate a ctrace file when trace mode is $description', async ({ traceMode }) => {
        const workspaceRoot = await createTemporaryWorkspace();
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        jest.spyOn(CbuildRunReader.prototype, 'getTraceMode').mockReturnValue(traceMode);
        const getProcessors = jest.spyOn(CbuildRunReader.prototype, 'getProcessors');
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const manager = new TraceConfigurationGeneratedCTraceFileManager();

        const result = await manager.processGeneratedCBuildRunFileChange({
            type: 'created',
            uri: cbuildRunFile
        });

        expect(result).toEqual({ status: 'trace-off' });
        expect(getProcessors).not.toHaveBeenCalled();
        await expect(readTemporaryTextFile(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml')))
            .rejects.toThrow('ENOENT');
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
