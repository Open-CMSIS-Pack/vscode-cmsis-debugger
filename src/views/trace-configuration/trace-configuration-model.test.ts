/**
 * Copyright 2026 Arm Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
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

import { MemoryTextFileAdapter } from '../../__test__/memory-text-file-adapter';
import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import {
    CBUILD_INDEX_FILE_GLOB,
    CMSIS_JSON_FILE_GLOB,
    CTRACE_FILE_GLOB,
    ENABLE_TRACE_GENERATION_VIEW_SETTING
} from '../../manifest';
import { containsSubstringsInOrder, normalizeFsPath, waitForCondition, waitForImmediate } from '../../utils';
import { CTraceYamlDocument, CTraceYamlFile } from './ctrace-yaml';
import { TraceConfigurationRunMessageReader } from './ctrace-run-validation-message-reader';
import { TraceConfigurationBackupStore } from './trace-configuration-backup';
import { getTraceConfigurationBackupFileName } from './trace-configuration-file-names';
import { TRACE_OFF_MESSAGE } from './trace-configuration-generated-ctrace-file-manager';
import { TraceConfigurationModel } from './trace-configuration-model';
import {
    TraceConfigurationPrevalidationResult,
    TraceConfigurationPrevalidator
} from './trace-configuration-prevalidator';
import { TraceConfigurationProcessorCapabilities } from './trace-configuration-processor-capabilities';
import * as TraceConfigurationTypes from './trace-configuration-types';

interface TraceConfigurationModelPrivate {
    ctraceFile: CTraceYamlFile | undefined;
    setProcessorDisable(document: CTraceYamlDocument, processorPath: (string | number)[]): void;
}

interface MockFileSystemWatcher {
    dispose: jest.Mock;
    onDidCreate: jest.Mock;
    onDidChange: jest.Mock;
    onDidDelete: jest.Mock;
    _handlers: {
        create: Array<(uri: vscode.Uri) => void>;
        change: Array<(uri: vscode.Uri) => void>;
        delete: Array<(uri: vscode.Uri) => void>;
    };
}

interface TraceConfigurationProcessorCapabilitiesPrivate {
    processorCapabilities: Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities>;
}

interface MutableWorkspace {
    workspaceFolders: vscode.WorkspaceFolder[] | undefined;
}

const mutableWorkspace = vscode.workspace as unknown as MutableWorkspace;
const originalWorkspaceFolders = mutableWorkspace.workspaceFolders;
const temporaryWorkspaceRoots: string[] = [];

function createPassingPrevalidator(): jest.Mocked<TraceConfigurationPrevalidator> {
    return {
        validate: jest.fn().mockResolvedValue({ status: 'passed' }),
        cancel: jest.fn().mockResolvedValue(undefined)
    };
}

function createRunMessageReader(): jest.Mocked<TraceConfigurationRunMessageReader> {
    return {
        exists: jest.fn().mockResolvedValue(false),
        readIfExists: jest.fn().mockResolvedValue(undefined)
    };
}

function createWorkspaceModel(
    onDidChange: () => void = () => { },
    prevalidator: TraceConfigurationPrevalidator = createPassingPrevalidator(),
    runMessageReader: TraceConfigurationRunMessageReader = createRunMessageReader()
): TraceConfigurationModel {
    return new TraceConfigurationModel(
        onDidChange,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        prevalidator,
        runMessageReader
    );
}

function createCapabilities(displayName = 'cm33'): Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities> {
    return new Map([
        [
            '0',
            {
                displayName,
                core: 'Cortex-M33',
                ...TraceConfigurationTypes.CORTEX_M_DWT_4_TRACE_CAPABILITIES
            }
        ]
    ]);
}

function getLastCreatedFileSystemWatcher(): MockFileSystemWatcher {
    const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.at(-1)?.value as MockFileSystemWatcher | undefined;
    expect(watcher).toBeDefined();
    return watcher as MockFileSystemWatcher;
}

function fireWatcherHandler(watcher: MockFileSystemWatcher, handlerName: 'create' | 'change' | 'delete', uri: vscode.Uri): void {
    switch (handlerName) {
        case 'create':
            watcher._handlers.create[0]?.(uri);
            break;
        case 'change':
            watcher._handlers.change[0]?.(uri);
            break;
        case 'delete':
            watcher._handlers.delete[0]?.(uri);
            break;
    }
}

async function resolveGeneratedCBuildRunWatcher(
    model: TraceConfigurationModel,
    cbuildRunFile: vscode.Uri
): Promise<MockFileSystemWatcher> {
    (vscode.commands.executeCommand as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(cbuildRunFile.fsPath);
    await model.loadInitialFile();

    const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
    const watcherCount = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length;
    const workspaceRoot = path.dirname(path.dirname(cbuildRunFile.fsPath));
    const cbuildIndexFile = vscode.Uri.file(path.join(workspaceRoot, 'project.cbuild-idx.yml'));

    fireWatcherHandler(cbuildIndexWatcher, 'change', cbuildIndexFile);
    await waitForCondition('resolved generated cbuild-run watcher', () =>
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length >= watcherCount + 1);

    const watcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results.at(watcherCount)?.value as MockFileSystemWatcher | undefined;
    expect(watcher).toBeDefined();
    return watcher as MockFileSystemWatcher;
}

async function waitForWatcherWork(): Promise<void> {
    for (let index = 0; index < 10; index++) {
        await waitForImmediate();
    }
}

function expectSameFsPath(actual: string | undefined, expected: string): void {
    expect(actual).toBeDefined();
    expect(normalizeFsPath(actual as string)).toBe(normalizeFsPath(expected));
}

function createProcessor(core: string, pname?: string): ProcessorType {
    return {
        core,
        revision: 'r0p0',
        'max-clock': 0,
        ...(pname ? { pname } : {})
    };
}

function mockGeneratedCBuildRunProcessors(processors: ProcessorType[], targetSet = '<default>'): void {
    jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
    jest.spyOn(CbuildRunReader.prototype, 'getTraceMode').mockReturnValue('server');
    jest.spyOn(CbuildRunReader.prototype, 'getProcessors').mockReturnValue(processors);
    jest.spyOn(CbuildRunReader.prototype, 'getTargetSet').mockReturnValue(targetSet);
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
    const workspaceRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'trace-configuration-model-'));
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

async function waitForTemporaryTextFile(
    fileName: string,
    predicate: (contents: string) => boolean = () => true
): Promise<string> {
    let contents = '';
    await waitForCondition(fileName, async () => {
        try {
            contents = await readTemporaryTextFile(fileName);
            return predicate(contents);
        } catch {
            return false;
        }
    });
    return contents;
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

async function createModelFromText(
    text: string,
    capabilities?: Map<string, TraceConfigurationTypes.ProcessorTraceCapabilities>,
    fileName = 'target.ctrace.yml',
    prevalidator: jest.Mocked<TraceConfigurationPrevalidator> = createPassingPrevalidator()
): Promise<{
    adapter: MemoryTextFileAdapter;
    backupStore: jest.Mocked<TraceConfigurationBackupStore>;
    model: TraceConfigurationModel;
    prevalidator: jest.Mocked<TraceConfigurationPrevalidator>;
}> {
    const adapter = new MemoryTextFileAdapter(text);
    const file = new CTraceYamlFile(fileName, adapter);
    const document = await file.load();
    document.assignCTraceRefs();
    const processorCapabilities = capabilities ? new TraceConfigurationProcessorCapabilities(() => file) : undefined;
    if (processorCapabilities) {
        const privateCapabilities = processorCapabilities as unknown as TraceConfigurationProcessorCapabilitiesPrivate;
        capabilities?.forEach((value, key) => privateCapabilities.processorCapabilities.set(key, value));
    }
    const backupStore: jest.Mocked<TraceConfigurationBackupStore> = {
        restore: jest.fn().mockResolvedValue(undefined),
        write: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
    };
    const model = new TraceConfigurationModel(
        () => { },
        processorCapabilities,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        backupStore,
        prevalidator
    );
    (model as unknown as TraceConfigurationModelPrivate).ctraceFile = file;
    return { adapter, backupStore, model, prevalidator };
}

describe('TraceConfigurationModel', () => {
    afterEach(async () => {
        jest.restoreAllMocks();
        mutableWorkspace.workspaceFolders = originalWorkspaceFolders;
        await Promise.all(temporaryWorkspaceRoots.splice(0).map(workspaceRoot =>
            fsPromises.rm(workspaceRoot, { recursive: true, force: true })));
    });

    it.each([
        { fileName: 'ctrace.yml', expected: false },
        { fileName: 'ctrace.yaml', expected: false },
        { fileName: 'board.ctrace.yml', expected: true },
        { fileName: 'board.ctrace.yaml', expected: true },
        { fileName: '~board.ctrace.yml', expected: false },
        { fileName: '~board.ctrace.yaml', expected: false },
        { fileName: 'trace.yml', expected: false },
        { fileName: 'ctrace.json', expected: false },
    ])('recognizes ctrace file names: $fileName', ({ fileName, expected }) => {
        expect(TraceConfigurationModel.isCTraceFileName(fileName)).toBe(expected);
    });

    it('creates an empty state before a ctrace file is loaded', () => {
        const model = new TraceConfigurationModel();

        expect(model.createState()).toMatchObject({
            rows: [],
            loading: false,
            dirty: false,
            emptyMessage: 'Open a ctrace.yml file to edit trace configuration.'
        });
    });

    it('keeps a loaded ctrace filename absolute', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const fileName = path.join(workspaceRoot, '.cmsis', 'target.ctrace.yml');
        const { model } = await createModelFromText('created-by: CMSIS Debugger\n');
        (model as unknown as TraceConfigurationModelPrivate).ctraceFile = new CTraceYamlFile(fileName, new MemoryTextFileAdapter('created-by: CMSIS Debugger\n'));

        expect(model.createState().fileName).toBe(fileName);
        model.dispose();
    });

    it('keeps a loaded ctrace filename absolute', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const fileName = path.join(workspaceRoot, '.cmsis', 'target.ctrace.yml');
        const { model } = await createModelFromText('created-by: CMSIS Debugger\n');
        (model as unknown as TraceConfigurationModelPrivate).ctraceFile = new CTraceYamlFile(fileName, new MemoryTextFileAdapter('created-by: CMSIS Debugger\n'));

        expect(model.createState().fileName).toBe(fileName);
        model.dispose();
    });

    it('watches generated cbuild-run files in the top-level out folder', async () => {
        const model = new TraceConfigurationModel();

        await model.watchForGeneratedCBuildRunFiles();

        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        const pattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls[0]?.[0] as { pattern: string };
        expect(pattern.pattern).toBe(CBUILD_INDEX_FILE_GLOB);

        model.dispose();
        expect(getLastCreatedFileSystemWatcher().dispose).toHaveBeenCalledTimes(1);
    });


    it.each([
        { handlerName: 'create', expectedType: 'created' },
        { handlerName: 'change', expectedType: 'changed' },
        { handlerName: 'delete', expectedType: 'deleted' },
    ] as const)('fires generated cbuild-run events when files are $expectedType', async ({ handlerName, expectedType }) => {
        const onDidChange = jest.fn();
        const model = new TraceConfigurationModel(onDidChange);
        const events: unknown[] = [];
        model.onDidChangeGeneratedCBuildRunFile(event => events.push(event));
        const uri = vscode.Uri.file('/workspace/out/project.cbuild-run.yml');
        const watcher = await resolveGeneratedCBuildRunWatcher(model, uri);
        onDidChange.mockClear();

        fireWatcherHandler(watcher, handlerName, uri);
        await waitForWatcherWork();

        expect(events).toEqual([{ type: expectedType, uri }]);
        expect(onDidChange).toHaveBeenCalledTimes(1);
        model.dispose();
    });

    it('creates a generated ctrace file with processors disabled by default when a cbuild-run file is created', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
        const onDidChange = jest.fn();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M23', 'core1'),
        ]);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const model = new TraceConfigurationModel(onDidChange);
        const watcher = await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        fireWatcherHandler(watcher, 'create', cbuildRunFile);

        const generatedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        const generatedText = await waitForTemporaryTextFile(generatedTraceFile);
        await waitForCondition('trace generation view to be enabled', () => updateConfiguration.mock.calls.some(call =>
            call[0] === ENABLE_TRACE_GENERATION_VIEW_SETTING
            && call[1] === true
            && call[2] === vscode.ConfigurationTarget.Workspace
        ));
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            true,
            vscode.ConfigurationTarget.Workspace
        );
        expect(generatedText).toContain('created-by: CMSIS Debugger');
        expect(containsSubstringsInOrder(generatedText, [
            'pname: core0',
            'core: Cortex-M55',
            'disable:',
            'timestamps:',
            'itm-prescaler: 1',
            'data:',
            'events:',
            'itm:',
            'enable: 0x0',
            'pcsampling:',
            'period: 0',
            'synchronization:',
            'DWT: 256M',
            'pname: core1',
            'core: Cortex-M23',
            'disable:'
        ])).toBe(true);
        expect(generatedText.match(/disable:/g) ?? []).toHaveLength(2);
        expect(generatedText).not.toMatch(/timesync|exceptions|instructions/);
        [
            ['ctrace', 'setup', 0],
            ['ctrace', 'setup', 0, 'timestamps'],
            ['ctrace', 'setup', 0, 'advanced-settings'],
            ['ctrace', 'setup', 0, 'synchronization'],
        ].forEach(pathToExpand => model.updateExpandedState(JSON.stringify(pathToExpand), true));
        const state = model.createState();
        expectSameFsPath(state.fileName, generatedTraceFile);
        expect(state.rows
            .filter(row => row.path.at(-2) === 'setup' && typeof row.path.at(-1) === 'number')
            .map(row => row.checked))
            .toEqual([false, false]);
        expect(state.rows.find(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'timestamps'])))
            .toMatchObject({ checked: true });
        expect(state.rows.find(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'timestamps', 'itm-prescaler'])))
            .toMatchObject({ value: '1' });
        expect(state.rows.find(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'timesync'])))
            .toMatchObject({ checked: false });
        expect(state.rows.find(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'synchronization', 'DWT'])))
            .toMatchObject({ value: '256M' });
        expect(generatedText).not.toContain('timestamps: {}');
        expect(generatedText).not.toContain('instructions: {}');
        expect(generatedText).not.toContain('data: []');
        expect(generatedText).not.toContain('events: []');
        expect(generatedText).not.toContain('pname: core1\n      core: Cortex-M23\n      timestamps');
        expect(onDidChange).toHaveBeenCalled();
        model.dispose();
    });

    it('creates a default ctrace file when an index is created after the cbuild-run file exists', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        const cbuildRunDirectory = path.join(workspaceRoot, 'arbitrary', 'nested', 'output');
        const cbuildRunFile = vscode.Uri.file(path.join(cbuildRunDirectory, 'demo+debug.cbuild-run.yml'));
        await createTemporaryDirectory(cbuildRunDirectory);
        await writeTemporaryTextFile(cbuildRunFile.fsPath, 'cbuild-run:\n');
        const model = new TraceConfigurationModel();

        await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        const generatedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo+debug.ctrace.yml');
        const generatedText = await waitForTemporaryTextFile(generatedTraceFile);
        expect(generatedText).toContain('created-by: CMSIS Debugger');
        expect(generatedText).toContain('pname: core0');
        expectSameFsPath(model.createState().fileName, generatedTraceFile);
        model.dispose();
    });

    it('clears the active ctrace file and shows guidance when trace mode is off', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
        jest.spyOn(CbuildRunReader.prototype, 'parse').mockResolvedValue();
        jest.spyOn(CbuildRunReader.prototype, 'getTraceMode').mockReturnValue('off');
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFileName = path.join(ctraceDirectory, 'demo.ctrace.yml');
        const cbuildRunDirectory = path.join(workspaceRoot, 'out');
        const cbuildRunFile = vscode.Uri.file(path.join(cbuildRunDirectory, 'demo.cbuild-run.yml'));
        await createTemporaryDirectory(ctraceDirectory);
        await createTemporaryDirectory(cbuildRunDirectory);
        await writeTemporaryTextFile(ctraceFileName, [
            'ctrace:',
            '  setup:',
            '    - pname: core0',
            '      core: Cortex-M55',
            ''
        ].join('\n'));
        await writeTemporaryTextFile(cbuildRunFile.fsPath, 'cbuild-run:\n');
        const model = new TraceConfigurationModel();
        await model.openFile(ctraceFileName);
        expect(model.createState().rows.length).toBeGreaterThan(0);

        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(cbuildRunFile.fsPath);
        await model.watchForGeneratedCBuildRunFiles();
        const cbuildIndexWatcher = getLastCreatedFileSystemWatcher();
        fireWatcherHandler(
            cbuildIndexWatcher,
            'change',
            vscode.Uri.file(path.join(workspaceRoot, 'project.cbuild-idx.yml'))
        );
        await waitForCondition('trace-off guidance', () =>
            model.createState().emptyMessage === TRACE_OFF_MESSAGE);

        expect(model.createState()).toMatchObject({
            fileName: undefined,
            rows: [],
            dirty: false,
            emptyMessage: TRACE_OFF_MESSAGE
        });
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            true,
            vscode.ConfigurationTarget.Workspace
        );
        await expect(readTemporaryTextFile(ctraceFileName)).resolves.toContain('pname: core0');
        model.dispose();
    });

    it('rejects generated multi-core cbuild-run data when a processor is missing pname', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
            createProcessor('Cortex-M33'),
        ]);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const generatedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        const model = new TraceConfigurationModel();
        const watcher = await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        fireWatcherHandler(watcher, 'create', cbuildRunFile);

        await waitForCondition('invalid multi-core processor error', () =>
            model.createState().errorMessage?.includes(
                'Invalid multi-core cbuild-run processor data: processor entries 2 are missing pname.'
            ) ?? false);
        await expect(readTemporaryTextFile(generatedTraceFile)).rejects.toThrow('ENOENT');
        expect(model.createState().errorMessage).toContain(
            'Invalid multi-core cbuild-run processor data: processor entries 2 are missing pname.'
        );
        model.dispose();
    });

    it('reuses an existing .cmsis folder when a generated cbuild-run file is created', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        mockGeneratedCBuildRunProcessors([
            createProcessor('Cortex-M55', 'core0'),
        ]);
        await createTemporaryDirectory(path.join(workspaceRoot, '.cmsis'));
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const model = new TraceConfigurationModel();
        const watcher = await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        fireWatcherHandler(watcher, 'create', cbuildRunFile);

        await waitForTemporaryTextFile(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml'), contents => contents.includes('pname: core0'));
        expect(vscode.workspace.fs.createDirectory).not.toHaveBeenCalled();
        await expect(readTemporaryTextFile(path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml'))).resolves.toContain('pname: core0');
        model.dispose();
    });

    it('adds only new processor pnames when a generated cbuild-run file changes', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
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
        const model = new TraceConfigurationModel();
        const watcher = await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        fireWatcherHandler(watcher, 'change', cbuildRunFile);

        const generatedText = await waitForTemporaryTextFile(generatedTraceFile, contents => contents.includes('pname: core1'));
        await waitForCondition('trace generation view to be enabled', () => updateConfiguration.mock.calls.some(call =>
            call[0] === ENABLE_TRACE_GENERATION_VIEW_SETTING
            && call[1] === true
            && call[2] === vscode.ConfigurationTarget.Workspace
        ));
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            true,
            vscode.ConfigurationTarget.Workspace
        );
        expect(generatedText.match(/pname: core0/g) ?? []).toHaveLength(1);
        expect(generatedText).toContain('created-by: user');
        expect(generatedText).toContain('location: existingWatch');
        expect(generatedText).toContain('pname: core1');
        expect(generatedText).toContain('core: Cortex-M33');
        model.dispose();
    });

    it('disables trace generation and leaves the ctrace file untouched when a generated cbuild-run file is deleted', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const updateConfiguration = mockTraceGenerationConfiguration();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const generatedTraceFile = path.join(ctraceDirectory, 'demo.ctrace.yml');
        const originalText = [
            'ctrace:',
            '  created-by: user',
            '  setup:',
            '    - pname: core0',
            '      core: Cortex-M55',
            ''
        ].join('\n');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(generatedTraceFile, originalText);
        const cbuildRunFile = vscode.Uri.file(path.join(workspaceRoot, 'out', 'demo.cbuild-run.yml'));
        const parseSpy = jest.spyOn(CbuildRunReader.prototype, 'parse');
        const model = new TraceConfigurationModel();
        const watcher = await resolveGeneratedCBuildRunWatcher(model, cbuildRunFile);

        fireWatcherHandler(watcher, 'delete', cbuildRunFile);

        await waitForCondition('trace generation view to be disabled', () => updateConfiguration.mock.calls.some(call =>
            call[0] === ENABLE_TRACE_GENERATION_VIEW_SETTING
            && call[1] === false
            && call[2] === vscode.ConfigurationTarget.Workspace
        ));
        await expect(readTemporaryTextFile(generatedTraceFile)).resolves.toBe(originalText);
        expect(updateConfiguration).toHaveBeenCalledWith(
            ENABLE_TRACE_GENERATION_VIEW_SETTING,
            false,
            vscode.ConfigurationTarget.Workspace
        );
        expect(parseSpy).not.toHaveBeenCalled();
        model.dispose();
    });

    it('writes processor disable directly after pname', () => {
        const document = CTraceYamlDocument.parse([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            ''
        ].join('\n'));
        const model = new TraceConfigurationModel() as unknown as TraceConfigurationModelPrivate;

        model.setProcessorDisable(document, ['ctrace', 'setup', 0]);

        expect(document.toString()).toContain([
            '    - pname: cm33',
            '      disable:',
            '      timestamps:',
            ''
        ].join('\n'));
    });

    it('keeps webview edits in memory until the user saves', async () => {
        const originalText = [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      data:',
            '      instructions:',
            '        start:',
            '        stop:',
            ''
        ].join('\n');
        const { adapter, model } = await createModelFromText(originalText);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'start'], 'start');
        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'stop'], 'stop');

        expect(adapter.text).toBe(originalText);
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(true);

        await model.saveCurrentDocument();

        expect(adapter.writeCount).toBe(1);
        expect(adapter.text).toContain('access: W');
        expect(adapter.text.match(/access: X/g) ?? []).toHaveLength(2);
        expect(model.createState().dirty).toBe(false);
    });

    it('publishes running and successful validation contexts for a dirty document', async () => {
        const prevalidator = createPassingPrevalidator();
        let completeValidation: ((result: TraceConfigurationPrevalidationResult) => void) | undefined;
        prevalidator.validate.mockImplementationOnce(() => new Promise(resolve => {
            completeValidation = resolve;
        }));
        const { model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n'), undefined, undefined, prevalidator);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        expect(model.createState().validationState).toBe('pending');

        await waitForCondition('pyTS prevalidation to start', () => prevalidator.validate.mock.calls.length === 1);
        expect(model.createState().validationState).toBe('running');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext',
            'vscode-cmsis-debugger.traceConfiguration.isValidating',
            true
        );

        completeValidation?.({
            status: 'passed',
            referenceMessages: [{ ctraceRef: 'data#0', severity: 'warning', message: 'aligned range' }]
        });
        await waitForCondition('pyTS prevalidation to pass', () => model.createState().validationState === 'passed');

        const passedState = model.createState();
        expect(passedState.validationState).toBe('passed');
        expect(passedState.rows.find(row => row.path.join('.') === 'ctrace.setup.0.data.0')?.validation).toEqual({
            severity: 'warning',
            message: 'aligned range'
        });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext',
            'vscode-cmsis-debugger.traceConfiguration.validationSucceeded',
            true
        );
        await model.deactivate();
    });

    it('does not save a dirty document whose latest pyTS validation failed', async () => {
        const prevalidator = createPassingPrevalidator();
        prevalidator.validate.mockResolvedValue({ status: 'failed', message: 'conversion failed' });
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n'), undefined, undefined, prevalidator);
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        await model.saveCurrentDocument();

        expect(adapter.writeCount).toBe(0);
        expect(model.createState()).toMatchObject({
            dirty: true,
            validationState: 'failed',
            validationMessage: 'conversion failed'
        });
        await model.deactivate();
    });

    it('switches watched ctrace-run messages between production and backup sources', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(fileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      data:',
            '        - location: counter',
            ''
        ].join('\n'));
        const runMessageReader = createRunMessageReader();
        const productionMessages = [
            { ctraceRef: 'data#0', severity: 'info' as const, message: 'production message' }
        ];
        const backupMessages = [
            { ctraceRef: 'data#0', severity: 'error' as const, message: 'backup message' }
        ];
        runMessageReader.readIfExists.mockImplementation(async runFileName =>
            path.basename(runFileName).startsWith('~') ? backupMessages : productionMessages);
        const model = createWorkspaceModel(() => { }, createPassingPrevalidator(), runMessageReader);
        const watcherStartIndex = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length;

        await model.openFile(fileName);
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0]), true);
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0, 'data']), true);
        const getDataValidation = () => model.createState().rows.find(row =>
            JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'data', 0]))?.validation;
        expect(getDataValidation()).toEqual({ severity: 'info', message: 'production message' });

        const productionWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
            .mock.results.at(watcherStartIndex)?.value as MockFileSystemWatcher;
        const backupWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
            .mock.results.at(watcherStartIndex + 1)?.value as MockFileSystemWatcher;
        await backupWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', '~target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toEqual({ severity: 'info', message: 'production message' });

        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'location'], 'nextCounter');
        expect(getDataValidation()).toBeUndefined();
        await productionWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', 'target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toBeUndefined();
        await backupWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', '~target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toEqual({ severity: 'error', message: 'backup message' });

        await backupWatcher._handlers.delete[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', '~target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toBeUndefined();

        await backupWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', '~target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toEqual({ severity: 'error', message: 'backup message' });
        await model.saveCurrentDocument();
        expect(model.createState().dirty).toBe(false);
        expect(getDataValidation()).toBeUndefined();

        await backupWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', '~target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toBeUndefined();
        await productionWatcher._handlers.create[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', 'target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toEqual({ severity: 'info', message: 'production message' });
        await productionWatcher._handlers.delete[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', 'target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toBeUndefined();
        await model.deactivate();
    });

    it('clears production messages after a manual ctrace edit until pyTS updates its output', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(fileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: oldSymbol',
            ''
        ].join('\n'));
        const runMessageReader = createRunMessageReader();
        runMessageReader.readIfExists.mockResolvedValue([
            { ctraceRef: 'data#0', severity: 'warning', message: 'old production message' }
        ]);
        const model = createWorkspaceModel(() => { }, createPassingPrevalidator(), runMessageReader);
        const watcherStartIndex = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls.length;

        await model.openFile(fileName);
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0]), true);
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0, 'data']), true);
        const getDataValidation = () => model.createState().rows.find(row =>
            JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'data', 0]))?.validation;
        expect(getDataValidation()).toEqual({ severity: 'warning', message: 'old production message' });

        const productionWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
            .mock.results.at(watcherStartIndex)?.value as MockFileSystemWatcher;
        const sourceWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock)
            .mock.results.at(watcherStartIndex + 2)?.value as MockFileSystemWatcher;
        await writeTemporaryTextFile(fileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: updatedSymbol',
            ''
        ].join('\n'));
        fireWatcherHandler(sourceWatcher, 'change', vscode.Uri.file(fileName));
        await waitForCondition('manual ctrace edit reload', () => getDataValidation() === undefined);

        runMessageReader.readIfExists.mockResolvedValue([
            { ctraceRef: 'data#0', severity: 'error', message: 'new production message' }
        ]);
        await productionWatcher._handlers.change[0]?.(vscode.Uri.file(
            path.join(workspaceRoot, '.trace', 'target.ctrace-run.yml')
        ));
        expect(getDataValidation()).toEqual({ severity: 'error', message: 'new production message' });
        await model.deactivate();
    });

    it('writes a delayed backup without changing the active file', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        const originalText = [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(fileName, originalText);
        const prevalidator = createPassingPrevalidator();
        const model = createWorkspaceModel(() => { }, prevalidator);
        await model.openFile(fileName);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        await expect(readTemporaryTextFile(backupFileName)).rejects.toThrow('ENOENT');
        const backupText = await waitForTemporaryTextFile(backupFileName, contents => contents.includes('access: W'));
        expect(backupText).toContain('access: W');
        await expect(readTemporaryTextFile(fileName)).resolves.toBe(originalText);
        expect(model.createState().dirty).toBe(true);
        await model.deactivate();
    });

    it('flushes a pending backup before opening another file', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const firstFileName = path.join(ctraceDirectory, 'first.ctrace.yml');
        const secondFileName = path.join(ctraceDirectory, 'second.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(firstFileName, 'ctrace:\n  setup:\n    - pname: cm33\n      data:\n');
        await writeTemporaryTextFile(secondFileName, 'ctrace:\n  setup:\n    - pname: cm55\n');
        const model = createWorkspaceModel();
        await model.openFile(firstFileName);
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        await model.openFile(secondFileName);

        await expect(readTemporaryTextFile(getTraceConfigurationBackupFileName(firstFileName)))
            .resolves.toContain('access: W');
        expect(model.createState().fileName).toBe(secondFileName);
        expect(model.createState().dirty).toBe(false);
        await model.deactivate();
    });

    it('cancels active validation before opening another file', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const firstFileName = path.join(ctraceDirectory, 'first.ctrace.yml');
        const secondFileName = path.join(ctraceDirectory, 'second.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(firstFileName, 'ctrace:\n  setup:\n    - pname: cm33\n      data:\n');
        await writeTemporaryTextFile(secondFileName, 'ctrace:\n  setup:\n    - pname: cm55\n');
        const prevalidator = createPassingPrevalidator();
        let completeValidation: ((result: { status: 'cancelled' }) => void) | undefined;
        prevalidator.validate.mockImplementationOnce(() => new Promise(resolve => {
            completeValidation = resolve;
        }));
        prevalidator.cancel.mockImplementation(async () => {
            completeValidation?.({ status: 'cancelled' });
        });
        const model = createWorkspaceModel(() => { }, prevalidator);
        await model.openFile(firstFileName);
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        await waitForCondition('pyTS prevalidation to start', () => prevalidator.validate.mock.calls.length === 1);
        const cancellationCount = prevalidator.cancel.mock.calls.length;

        await model.openFile(secondFileName);

        expect(prevalidator.cancel.mock.calls.length).toBeGreaterThan(cancellationCount);
        expect(model.createState()).toMatchObject({
            fileName: secondFileName,
            dirty: false,
            validationState: 'idle'
        });
        await model.deactivate();
    });

    it('restores a backup as dirty even when the active file is newer, then removes it on save', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(backupFileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 200000000',
            ''
        ].join('\n'));
        await writeTemporaryTextFile(fileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'));
        const prevalidator = createPassingPrevalidator();
        const model = createWorkspaceModel(() => { }, prevalidator);

        await model.openFile(fileName);

        const document = (model as unknown as TraceConfigurationModelPrivate).ctraceFile?.document;
        expect(document?.toString()).toContain('clock: 200000000');
        expect(model.createState().dirty).toBe(true);

        await model.saveCurrentDocument();

        expect(prevalidator.validate).toHaveBeenCalledWith(fileName);
        await expect(readTemporaryTextFile(fileName)).resolves.toContain('clock: 200000000');
        await expect(readTemporaryTextFile(backupFileName)).rejects.toThrow('ENOENT');
        expect(model.createState().dirty).toBe(false);
        await model.deactivate();
    });

    it('discards an invalid backup and opens the active file clean', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(fileName, 'ctrace:\n  created-by: original\n');
        await writeTemporaryTextFile(backupFileName, 'ctrace:\n  setup: [unterminated\n');
        const model = new TraceConfigurationModel();

        await model.openFile(fileName);

        const document = (model as unknown as TraceConfigurationModelPrivate).ctraceFile?.document;
        expect(document?.toString()).toContain('created-by: original');
        expect(model.createState().dirty).toBe(false);
        await expect(readTemporaryTextFile(backupFileName)).rejects.toThrow('ENOENT');
        await model.deactivate();
    });

    it('cancels a pending backup and deletes it when reverting', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const fileName = path.join(ctraceDirectory, 'target.ctrace.yml');
        const backupFileName = getTraceConfigurationBackupFileName(fileName);
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(fileName, [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n'));
        const model = createWorkspaceModel();
        await model.openFile(fileName);
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        await model.refreshFile();

        await new Promise(resolve => setTimeout(resolve, 550));
        await expect(readTemporaryTextFile(backupFileName)).rejects.toThrow('ENOENT');
        expect((model as unknown as TraceConfigurationModelPrivate).ctraceFile?.document?.toString())
            .not.toContain('access: W');
        expect(model.createState().dirty).toBe(false);
        await model.deactivate();
    });

    it('flushes the latest snapshot when saving the active file fails', async () => {
        const { adapter, backupStore, model, prevalidator } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n'));
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        jest.spyOn(adapter, 'writeTextFile').mockRejectedValueOnce(new Error('save failed'));

        await expect(model.saveCurrentDocument()).rejects.toThrow('save failed');

        expect(backupStore.write).toHaveBeenCalledTimes(2);
        expect(backupStore.write.mock.calls[0]?.[1]).toContain('access: W');
        expect(backupStore.write.mock.calls[1]?.[1]).toContain('access: W');
        expect(backupStore.delete).not.toHaveBeenCalled();
        expect(prevalidator.validate).toHaveBeenCalledTimes(2);
        expect(model.createState()).toMatchObject({ dirty: true, validationState: 'passed' });
        await model.deactivate();
    });

    it('serializes emptied editable sequences as bare keys', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchSymbol',
            '          access: W',
            '      instructions:',
            '        start:',
            '          - location: main',
            '            access: X',
            '        stop:',
            '          - location: endTrace',
            '            access: X',
            ''
        ].join('\n'));

        await model.removeItem(['ctrace', 'setup', 0, 'data', 0]);
        await model.removeItem(['ctrace', 'setup', 0, 'instructions', 'start', 0]);
        await model.removeItem(['ctrace', 'setup', 0, 'instructions', 'stop', 0]);

        expect(adapter.writeCount).toBe(0);

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      data:\n');
        expect(adapter.text).toContain('        start:\n');
        expect(adapter.text).toContain('        stop:\n');
        expect(adapter.text).not.toContain('data: []');
        expect(adapter.text).not.toContain('start: []');
        expect(adapter.text).not.toContain('stop: []');
    });

    it('normalizes already empty data and event trace lists to bare keys on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      data: []',
            '      events: []',
            ''
        ].join('\n'), createCapabilities());

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      data:\n');
        expect(adapter.text).toContain('      events:\n');
        expect(adapter.text).not.toContain('data: []');
        expect(adapter.text).not.toContain('events: []');
        expect(adapter.text).not.toContain('data: {}');
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0]), true);
        expect(model.createState().rows.find(row => row.path.join('/') === 'ctrace/setup/0/events')?.control).toBe('multi-select');
    });

    it('normalizes empty timestamps and instructions maps to bare keys on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps: {}',
            '      instructions: {}',
            ''
        ].join('\n'));

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      timestamps:\n');
        expect(adapter.text).toContain('      instructions:\n');
        expect(adapter.text).not.toContain('timestamps: {}');
        expect(adapter.text).not.toContain('instructions: {}');
    });

    it('normalizes empty trace configuration sequences to bare keys on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps: {}',
            '      data: []',
            '      instructions:',
            '        start: []',
            '        stop: []',
            '      tracehalt: {}',
            '    - pname: cm55',
            '      instructions: {}',
            ''
        ].join('\n'));

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      timestamps:\n');
        expect(adapter.text).toContain('      data:\n');
        expect(adapter.text).toContain('        start:\n');
        expect(adapter.text).toContain('        stop:\n');
        expect(adapter.text).toContain('      tracehalt:\n');
        expect(adapter.text).toContain('    - pname: cm55\n      instructions:\n');
        expect(adapter.text).not.toContain('[]');
        expect(adapter.text).not.toContain('{}');
    });

    it('rejects direct add attempts when shared DWT comparators are already used', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchOne',
            '        - location: watchTwo',
            '      instructions:',
            '        start:',
            '          - location: main',
            '        stop:',
            '      tracehalt:',
            '        - location: stopTrace',
            ''
        ].join('\n'), createCapabilities());

        await model.addItem(['ctrace', 'setup', 0, 'instructions', 'stop'], 'stop');

        const document = (model as unknown as TraceConfigurationModelPrivate).ctraceFile?.document;
        expect(document?.yaml.getItem(['ctrace', 'setup', 0, 'instructions', 'stop', 0])).toBeUndefined();
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
        expect(model.createState().errorMessage).toContain('already use 4 of 4');
    });

    it('drops legacy ctrace ELF metadata on save', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '  ELF-files:',
            '    - file: program.axf',
            '      pname: cm33',
            ''
        ].join('\n'));

        await model.saveCurrentDocument();

        expect(adapter.text).not.toContain('ELF-files');
        expect(adapter.text).not.toContain('program.axf');
    });

    it('refresh discards unsaved webview edits and resumes file watching', async () => {
        const originalText = [
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            ''
        ].join('\n');
        const { adapter, model } = await createModelFromText(originalText);

        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');

        expect(model.createState().dirty).toBe(true);

        await model.refreshFile();

        expect(adapter.text).toBe(originalText);
        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
    });

    it('updates specialized trace controls in memory and saves their YAML shapes', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '      exceptions:',
            '      events:',
            '      itm:',
            '        enable: 0x00000000',
            '      data:',
            '        - location: watchSymbol',
            '          match:',
            '            value: 0x10',
            '      instructions:',
            '      pcsampling:',
            '      synchronization:',
            '        DWT: off',
            '      timesync:',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0], false);
        await model.updateValue(['ctrace', 'setup', 0], true);
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'events'], ['CYCCNT', 'EXCCNT']);
        await model.updateValue(['ctrace', 'setup', 0, 'itm'], ['0', '31']);
        await model.updateValue(['ctrace', 'setup', 0, 'itm', 'privileged'], ['8-15', '24-31']);
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'access'], 'Read Write');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'size'], '4');
        await model.updateValue(['ctrace', 'setup', 0, 'instructions'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'instructions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'exceptions'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'exceptions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'timesync'], false);
        await model.updateValue(['ctrace', 'setup', 0, 'timesync'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'pcsampling'], '64 * 16');
        await model.updateValue(['ctrace', 'setup', 0, 'synchronization', 'DWT'], '256M');

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(true);

        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      timestamps:\n        itm-prescaler: 1\n');
        expect(adapter.text).toContain('      exceptions:\n');
        expect(adapter.text).toContain('      events:\n        - event: CYCCNT\n        - event: EXCCNT\n');
        expect(adapter.text).toContain('      itm:\n        enable: 0x80000001\n        privileged: 0xa\n');
        expect(adapter.text).toContain('          access: RW\n');
        expect(adapter.text).toContain('            size: 4\n');
        expect(adapter.text).toContain('      instructions:\n');
        expect(adapter.text).toContain('      pcsampling:\n        period: 1024\n');
        expect(adapter.text).toContain('      synchronization:\n        DWT: 256M\n');
        expect(adapter.text).toContain('      timesync:\n');
        expect(adapter.text).not.toContain('disable:');
        expect(adapter.text).not.toContain('      instructions: {}\n');
        expect(adapter.text).not.toContain('      timestamps: {}\n');
    });

    it('writes the PC Sampling off selection as zero', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      pcsampling:',
            '        period: 64',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0, 'pcsampling'], 'off');
        await model.saveCurrentDocument();

        expect(adapter.text).toContain('      pcsampling:\n        period: 0\n');
    });

    it('expands collapsed comparator lists and focuses the newly added child', async () => {
        const { model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      data:',
            '        - location: existingWatch',
            ''
        ].join('\n'), createCapabilities());
        const dataPath = ['ctrace', 'setup', 0, 'data'];
        model.updateExpandedState(JSON.stringify(dataPath), false);

        await model.addItem(dataPath, 'data');

        const focusedState = model.createState();
        const dataRow = focusedState.rows.find(row => JSON.stringify(row.path) === JSON.stringify(dataPath));
        expect(dataRow?.expanded).toBe(true);
        expect(focusedState.focusedRowId).toBe(JSON.stringify(['ctrace', 'setup', 0, 'data', 1]));
        expect(focusedState.rows.some(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'data', 1]))).toBe(true);
        expect(model.createState().focusedRowId).toBeUndefined();
    });

    it('focuses a ctrace reference in the matching solution set', async () => {
        const { model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      data:',
            '        - location: watchMe',
            ''
        ].join('\n'), createCapabilities(), 'demo+target.ctrace.yml');

        await expect(model.focusCTraceReference('demo+target', 'data#0')).resolves.toBe(true);

        const focusedState = model.createState();
        expect(focusedState.focusedRowId).toBe(JSON.stringify(['ctrace', 'setup', 0, 'data', 0]));
        expect(focusedState.rows.find(row => JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'data']))?.expanded).toBe(true);
        expect(model.createState().focusedRowId).toBeUndefined();
    });

    it('focuses an event reference on the visible event counters row', async () => {
        const { model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      events:',
            '        - event: EXCCNT',
            ''
        ].join('\n'), createCapabilities(), 'demo+target.ctrace.yml');

        await expect(model.focusCTraceReference('demo+target', 'events#0')).resolves.toBe(true);

        const focusedState = model.createState();
        const eventsPath = ['ctrace', 'setup', 0, 'events'];
        expect(focusedState.focusedRowId).toBe(JSON.stringify(eventsPath));
        expect(focusedState.rows.some(row => JSON.stringify(row.path) === JSON.stringify(eventsPath))).toBe(true);
    });

    it('loads the matching solution set before focusing a ctrace reference', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFileName = path.join(ctraceDirectory, 'demo+target.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFileName, [
            'ctrace:',
            '  setup:',
            '    - data:',
            '        - location: watchMe',
            ''
        ].join('\n'));
        const { model } = await createModelFromText('ctrace:\n  setup: []\n', createCapabilities(), 'other.ctrace.yml');
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([vscode.Uri.file(ctraceFileName)]);

        await expect(model.focusCTraceReference('demo+target', 'data#0')).resolves.toBe(true);

        const focusedState = model.createState();
        expectSameFsPath(focusedState.fileName, ctraceFileName);
        expect(focusedState.focusedRowId).toBe(JSON.stringify(['ctrace', 'setup', 0, 'data', 0]));
        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(CTRACE_FILE_GLOB, null, 10);
    });

    it('loads a matching ctrace file outside the workspace from its direct path', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceFileName = path.join(workspaceRoot, 'external', '.cmsis', 'demo+target.ctrace.yml');
        await createTemporaryDirectory(path.dirname(ctraceFileName));
        await writeTemporaryTextFile(ctraceFileName, [
            'ctrace:',
            '  setup:',
            '    - itm:',
            '        enable: 1',
            ''
        ].join('\n'));
        const { model } = await createModelFromText('ctrace:\n  setup: []\n', createCapabilities(), 'other.ctrace.yml');
        (vscode.workspace.findFiles as jest.Mock).mockClear();

        await expect(model.focusCTraceReference('demo+target', 'itm', ctraceFileName)).resolves.toBe(true);

        const focusedState = model.createState();
        expectSameFsPath(focusedState.fileName, ctraceFileName);
        expect(focusedState.focusedRowId).toBe(JSON.stringify(['ctrace', 'setup', 0, 'itm']));
    });

    it('does not focus a ctrace reference from another solution set', async () => {
        const { model } = await createModelFromText('ctrace:\n  setup:\n    - data:\n        - location: watchMe\n', createCapabilities(), 'demo+target.ctrace.yml');

        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

        await expect(model.focusCTraceReference('other+target', 'data#0')).resolves.toBe(false);
        expect(model.createState().focusedRowId).toBeUndefined();
    });

    it('serializes webview-added fields in the documented ctrace.yml order', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      core: Cortex-M33',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0, 'events'], ['CYCCNT']);
        await model.updateValue(['ctrace', 'setup', 0, 'itm'], ['0']);
        await model.addItem(['ctrace', 'setup', 0, 'data'], 'data');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'location'], 'watchSymbol');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'output'], 'PC');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'label'], 'Watch');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'size'], '4');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'value'], '0x10');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'size'], '4');
        await model.updateValue(['ctrace', 'setup', 0, 'exceptions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'instructions'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'pcsampling'], '64');
        await model.updateValue(['ctrace', 'setup', 0, 'synchronization', 'DWT'], '16M');
        await model.updateValue(['ctrace', 'setup', 0, 'timesync'], true);
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true);

        await model.saveCurrentDocument();

        expect(containsSubstringsInOrder(adapter.text, [
            '    - pname: cm33',
            '      core: Cortex-M33',
            '      timestamps:',
            '        itm-prescaler: 1',
            '      timesync:',
            '      data:',
            '        - location: watchSymbol',
            '          label: Watch',
            '          access: W',
            '          size: 4',
            '          output: PC',
            '          match:',
            '            value: 0x10',
            '            size: 4',
            '      exceptions:',
            '      events:',
            '        - event: CYCCNT',
            '      itm:',
            '        enable: 0x00000001',
            '      instructions:',
            '      pcsampling:',
            '        period: 64',
            '      synchronization:',
            '        DWT: 16M'
        ])).toBe(true);
    });

    it('does not create optional match size when match value is absent', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchSymbol',
            ''
        ].join('\n'), createCapabilities());
        const onDidChange = jest.fn();
        model.setOnDidChange(onDidChange);

        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'size'], '4');

        expect(model.createState().dirty).toBe(false);
        expect(onDidChange).toHaveBeenCalled();
        await model.saveCurrentDocument();
        expect(adapter.text).not.toContain('match:');
    });

    it('does not create match value when shared DWT comparators are exhausted', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      data:',
            '        - location: watchOne',
            '          match:',
            '        - location: watchTwo',
            '      instructions:',
            '        start:',
            '          - location: main',
            '      tracehalt:',
            '        - location: halt',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'value'], '0x10');

        expect(model.createState().dirty).toBe(false);
        expect(model.createState().errorMessage).toContain('already use 4 of 4');
        await model.saveCurrentDocument();
        expect(adapter.text).not.toContain('value: 0x10');
    });

    it('deletes optional values and prunes empty match parents', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            '        itm-prescaler: 4',
            '      itm:',
            '        enable: 0x00000001',
            '        privileged: 0xf',
            '      data:',
            '        - location: watchSymbol',
            '          label: Watch label',
            '          output: value',
            '          match:',
            '            value: 0x10',
            '            size: 4',
            ''
        ].join('\n'), createCapabilities());

        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'clock'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'itm-prescaler'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'itm', 'privileged'], []);
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'label'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'output'], '');
        await model.updateValue(['ctrace', 'setup', 0, 'data', 0, 'match', 'value'], '');
        await model.saveCurrentDocument();

        expect(adapter.text).not.toContain('clock:');
        expect(adapter.text).not.toContain('itm-prescaler:');
        expect(adapter.text).not.toContain('privileged:');
        expect(adapter.text).not.toContain('Watch label');
        expect(adapter.text).not.toContain('output:');
        expect(adapter.text).not.toContain('match:');
    });

    it('reloads externally changed clean files before applying webview edits and ignores the stale edit', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'), createCapabilities());
        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 200000000',
            ''
        ].join('\n'));

        await model.updateValue(['ctrace', 'setup', 0, 'timestamps', 'clock'], '300000000');
        await model.saveCurrentDocument();

        expect(adapter.text).toContain('clock: 200000000');
        expect(adapter.text).not.toContain('300000000');
    });

    it('supports save options for external disk changes', async () => {
        const { adapter, model } = await createModelFromText([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'), createCapabilities());
        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 200000000',
            ''
        ].join('\n'));

        await model.saveCurrentDocument({ reloadBeforeSave: true, skipWhenReloaded: true });

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);

        adapter.simulateExternalChange([
            'ctrace:',
            '  setup:',
            '    - pname: cm33',
            '      timestamps:',
            '        clock: 300000000',
            ''
        ].join('\n'));

        await model.saveCurrentDocument({ abortIfDiskChanged: true });

        expect(adapter.writeCount).toBe(0);
        expect(model.createState().dirty).toBe(false);
    });

    it('loads and watches an existing .cmsis ctrace file when CMSIS Solution has no cbuild-run path', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const ctraceDirectory = path.join(workspaceRoot, '.cmsis');
        const ctraceFileName = path.join(ctraceDirectory, 'demo.ctrace.yml');
        await createTemporaryDirectory(ctraceDirectory);
        await writeTemporaryTextFile(ctraceFileName, [
            'ctrace:',
            '  setup:',
            '    - pname: core0',
            '      timestamps:',
            '        clock: 100000000',
            ''
        ].join('\n'));
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        (vscode.workspace.findFiles as jest.Mock).mockImplementation((include: vscode.GlobPattern) => {
            const pattern = typeof include === 'string' ? include : include.pattern;
            return Promise.resolve(pattern === CTRACE_FILE_GLOB ? [vscode.Uri.file(ctraceFileName)] : []);
        });
        const onDidChange = jest.fn();
        const model = new TraceConfigurationModel(onDidChange);

        await model.loadInitialFile();

        expect(model.createState().loading).toBe(false);
        expectSameFsPath(model.createState().fileName, ctraceFileName);
        expect(model.createState().rows.length).toBeGreaterThan(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(CTRACE_FILE_GLOB, null, 10);
        expect(onDidChange).toHaveBeenCalled();

        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0]), true);
        model.updateExpandedState(JSON.stringify(['ctrace', 'setup', 0, 'timestamps']), true);
        const ctraceWatcher = getLastCreatedFileSystemWatcher();
        onDidChange.mockClear();
        await writeTemporaryTextFile(ctraceFileName, [
            'ctrace:',
            '  setup:',
            '    - pname: core0',
            '      timestamps:',
            '        clock: 2000000000',
            ''
        ].join('\n'));
        fireWatcherHandler(ctraceWatcher, 'change', vscode.Uri.file(ctraceFileName));
        await waitForCondition('ctrace watcher state refresh', () => model.createState().rows.some(row =>
            JSON.stringify(row.path) === JSON.stringify(['ctrace', 'setup', 0, 'timestamps', 'clock'])
            && row.value === '2000000000'
        ));

        expect(onDidChange).toHaveBeenCalled();
        model.dispose();
    });

    it('processes an existing cbuild-run file after CMSIS Solution activates', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const cbuildRunDirectory = path.join(workspaceRoot, 'out');
        const cbuildRunFile = vscode.Uri.file(path.join(cbuildRunDirectory, 'demo.cbuild-run.yml'));
        await createTemporaryDirectory(cbuildRunDirectory);
        await writeTemporaryTextFile(cbuildRunFile.fsPath, 'cbuild-run:\n');
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        mockTraceGenerationConfiguration();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(cbuildRunFile.fsPath);
        const model = new TraceConfigurationModel();

        await model.loadInitialFile();

        const generatedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        await expect(readTemporaryTextFile(generatedTraceFile)).resolves.toContain('pname: core0');
        expectSameFsPath(model.createState().fileName, generatedTraceFile);
        expect(model.createState().rows.length).toBeGreaterThan(0);
        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(CMSIS_JSON_FILE_GLOB, null, 1);
        model.dispose();
    });

    it('processes a prebuilt project whose index already exists when the activation command is empty', async () => {
        const workspaceRoot = await createTemporaryWorkspace();
        const cbuildRunDirectory = path.join(workspaceRoot, 'out');
        const cbuildRunFile = vscode.Uri.file(path.join(cbuildRunDirectory, 'demo.cbuild-run.yml'));
        await createTemporaryDirectory(cbuildRunDirectory);
        await writeTemporaryTextFile(cbuildRunFile.fsPath, 'cbuild-run:\n');
        const cbuildIndexFile = vscode.Uri.file(path.join(workspaceRoot, 'demo.cbuild-idx.yml'));
        await writeTemporaryTextFile(cbuildIndexFile.fsPath, [
            'build-idx:',
            '  cbuild-run: out/demo.cbuild-run.yml',
            ''
        ].join('\n'));
        mockGeneratedCBuildRunProcessors([createProcessor('Cortex-M55', 'core0')]);
        mockTraceGenerationConfiguration();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        (vscode.workspace.findFiles as jest.Mock).mockImplementation((include: vscode.GlobPattern) => {
            const pattern = typeof include === 'string' ? include : include.pattern;
            return Promise.resolve(pattern === CBUILD_INDEX_FILE_GLOB ? [cbuildIndexFile] : []);
        });
        const model = new TraceConfigurationModel();

        await model.watchForGeneratedCBuildRunFiles();
        await model.loadInitialFile();

        const generatedTraceFile = path.join(workspaceRoot, '.cmsis', 'demo.ctrace.yml');
        await expect(readTemporaryTextFile(generatedTraceFile)).resolves.toContain('pname: core0');
        expectSameFsPath(model.createState().fileName, generatedTraceFile);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: CBUILD_INDEX_FILE_GLOB }),
            null,
            1
        );
        model.dispose();
    });

    it('shows build guidance and watches for an index when CMSIS Solution returns no cbuild-run path', async () => {
        await createTemporaryWorkspace();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue('   ');
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValueOnce([]);
        const model = new TraceConfigurationModel();

        await model.loadInitialFile();

        expect(vscode.workspace.findFiles).toHaveBeenCalledWith(CTRACE_FILE_GLOB, null, 10);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('cmsis-csolution.getCbuildRunFile');
        const pattern = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.calls[0]?.[0] as { pattern: string };
        expect(pattern.pattern).toBe(CBUILD_INDEX_FILE_GLOB);
        expect(model.createState().emptyMessage).toBe(
            'Build/Rebuild csolution project to enable trace configuration'
        );
        model.dispose();
    });

    it('validates explicitly opened ctrace file names before loading', async () => {
        const model = new TraceConfigurationModel();

        await expect(model.openFile('trace.yml')).rejects.toThrow(
            'Please select a *.ctrace.yml, or *.ctrace.yaml file.'
        );
    });

    it('throws clear errors when actions require a loaded document', async () => {
        const model = new TraceConfigurationModel();

        await expect(model.saveCurrentDocument()).rejects.toThrow('No ctrace.yml file is loaded.');
        await expect(model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true)).rejects.toThrow('No ctrace.yml file is loaded.');

        (model as unknown as TraceConfigurationModelPrivate).ctraceFile = new CTraceYamlFile('target.ctrace.yml');

        await expect(model.updateValue(['ctrace', 'setup', 0, 'timestamps'], true)).rejects.toThrow('No ctrace.yml document is loaded.');
    });

    it('stores reported errors in state and notifies listeners', () => {
        const onDidChange = jest.fn();
        const model = new TraceConfigurationModel(onDidChange);

        model.reportError('failed badly', 'Trace Configuration');

        expect(model.createState().errorMessage).toBe('failed badly');
        expect(onDidChange).toHaveBeenCalledTimes(1);
    });
});
