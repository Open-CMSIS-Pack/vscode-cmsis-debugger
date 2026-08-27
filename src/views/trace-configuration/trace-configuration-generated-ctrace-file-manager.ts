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

import * as path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import * as vscode from 'vscode';

import { CbuildRunReader, ProcessorType } from '../../cbuild-run';
import { logger } from '../../logger';
import { CTraceProcessorTraceSetup, CTraceYamlDocument } from './ctrace-yaml';
import { GeneratedCBuildRunFileChangeEvent } from './trace-configuration-file-watcher';
import * as TraceConfigurationTypes from './trace-configuration-types';
import { ENABLE_TRACE_GENERATION_VIEW_SETTING } from '../../manifest';

interface GeneratedTraceProcessor {
    core: string;
    pname?: string | undefined;
}

/**
 * TraceConfigurationGeneratedCTraceFileManager owns the generated cbuild-run to
 * generated ctrace.yml conversion flow.
 */
export class TraceConfigurationGeneratedCTraceFileManager {
    private readonly decoder = new TextDecoder();
    private readonly encoder = new TextEncoder();

    /**
     * processGeneratedCBuildRunFileChange updates generated trace files and the
     * trace generation setting for a generated cbuild-run watcher event, then
     * returns the ctrace file that the model should load.
     */
    public async processGeneratedCBuildRunFileChange(event: GeneratedCBuildRunFileChangeEvent): Promise<vscode.Uri | undefined> {
        logger.debug(`Trace Configuration: Generated cbuild-run file ${event.type}: ${event.uri.fsPath}`);
        switch (event.type) {
            case 'created':
            case 'changed': {
                const traceFileUri = await this.createDefaultCTraceFile(event.uri);
                await this.setTraceGenerationWebviewEnabled(true);
                return traceFileUri;
            }
            case 'deleted':
                await this.setTraceGenerationWebviewEnabled(false);
                return undefined;
        }
    }

    /**
     * createDefaultCTraceFile creates the default trace configuration associated
     * with a cbuild-run file. Existing files are preserved and receive only
     * missing processor setup entries.
     */
    public async createDefaultCTraceFile(cbuildRunFileUri: vscode.Uri): Promise<vscode.Uri> {
        return this.createOrUpdateGeneratedCTraceFile(cbuildRunFileUri);
    }

    /**
     * createOrUpdateGeneratedCTraceFile reads processors from a generated
     * cbuild-run file, creates the matching .cmsis ctrace file when needed, and
     * returns the generated ctrace file URI.
     */
    private async createOrUpdateGeneratedCTraceFile(cbuildRunFileUri: vscode.Uri): Promise<vscode.Uri> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.at(0);
        if (!workspaceFolder) {
            throw new Error('Cannot generate a ctrace file without an open workspace folder.');
        }
        const projectName = this.getProjectNameFromGeneratedCBuildRunFile(cbuildRunFileUri);
        const processors = await this.readGeneratedCBuildRunProcessors(cbuildRunFileUri);
        const traceFileUri = this.resolveGeneratedCTraceFileUri(workspaceFolder.uri, projectName);
        const traceFileExists = await this.fileExists(traceFileUri);
        const document = traceFileExists
            ? await this.readCTraceDocument(traceFileUri)
            : CTraceYamlDocument.create('CMSIS Debugger');

        const changed = this.addMissingProcessorTraceSetups(document, processors);

        if (!traceFileExists || changed) {
            await this.writeCTraceDocument(traceFileUri, document);
        }

        return traceFileUri;
    }

    /**
     * getProjectNameFromGeneratedCBuildRunFile derives the project base name
     * used for the generated .cmsis ctrace file.
     */
    private getProjectNameFromGeneratedCBuildRunFile(cbuildRunFileUri: vscode.Uri): string {
        const baseName = path.basename(cbuildRunFileUri.fsPath);
        const suffix = '.cbuild-run.yml';
        return baseName.endsWith(suffix) ? baseName.slice(0, -suffix.length) : path.parse(baseName).name;
    }

    /**
     * readGeneratedCBuildRunProcessors parses a generated cbuild-run file and
     * converts its processor entries into the subset needed for ctrace setup.
     */
    private async readGeneratedCBuildRunProcessors(cbuildRunFileUri: vscode.Uri): Promise<GeneratedTraceProcessor[]> {
        const reader = new CbuildRunReader();
        await reader.parse(cbuildRunFileUri.fsPath);
        const processors = reader.getProcessors();
        this.validateGeneratedProcessors(processors);
        return processors.map(processor => ({
            core: processor.core,
            ...(processor.pname ? { pname: processor.pname } : {})
        }));
    }

    /**
     * validateGeneratedProcessors rejects multi-core generated processor data
     * when any processor is missing the pname needed to address it uniquely.
     */
    private validateGeneratedProcessors(processors: ProcessorType[]): void {
        if (processors.length <= 1) {
            return;
        }

        const missingPnameIndexes = processors.flatMap((processor, index) => processor.pname ? [] : [String(index + 1)]);

        if (missingPnameIndexes.length > 0) {
            throw new Error(
                'Invalid multi-core cbuild-run processor data: processor entries '
                + missingPnameIndexes.join(', ')
                + ' are missing pname.'
            );
        }
    }

    /**
     * resolveGeneratedCTraceFileUri returns the .cmsis ctrace path associated
     * with a generated project using the supported *.ctrace.yml file format.
     */
    private resolveGeneratedCTraceFileUri(workspaceFolderUri: vscode.Uri, projectName: string): vscode.Uri {
        const cmsisDirectory = vscode.Uri.file(path.join(workspaceFolderUri.fsPath, '.cmsis'));
        return vscode.Uri.file(path.join(cmsisDirectory.fsPath, `${projectName}.ctrace.yml`));
    }

    /**
     * readCTraceDocument reads an existing ctrace file through VS Code's
     * workspace filesystem and parses it into a ctrace YAML document.
     */
    private async readCTraceDocument(traceFileUri: vscode.Uri): Promise<CTraceYamlDocument> {
        const contents = await vscode.workspace.fs.readFile(traceFileUri);
        return CTraceYamlDocument.parse(this.decoder.decode(contents), traceFileUri.fsPath);
    }

    /**
     * writeCTraceDocument normalizes a ctrace document, creates its parent
     * directory when needed, and writes the serialized YAML through VS Code.
     */
    private async writeCTraceDocument(traceFileUri: vscode.Uri, document: CTraceYamlDocument): Promise<void> {
        document.normalizeDocumentOrder();
        document.assignCTraceRefs();
        await this.ensureDirectoryExists(vscode.Uri.file(path.dirname(traceFileUri.fsPath)));
        await vscode.workspace.fs.writeFile(traceFileUri, this.encoder.encode(document.toString()));
    }

    /**
     * fileExists returns whether VS Code can stat the URI without surfacing
     * missing-file errors to the caller.
     */
    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        return await this.statIfExists(uri) !== undefined;
    }

    /**
     * ensureDirectoryExists creates a missing directory and rejects paths that
     * already exist as non-directory filesystem entries.
     */
    private async ensureDirectoryExists(uri: vscode.Uri): Promise<void> {
        const stat = await this.statIfExists(uri);

        if (!stat) {
            await vscode.workspace.fs.createDirectory(uri);
            return;
        }

        if (!this.isDirectoryStat(stat)) {
            throw new Error(`${uri.fsPath} exists but is not a directory.`);
        }
    }

    /**
     * statIfExists returns a filesystem stat for an existing URI and converts
     * expected missing-file errors into undefined.
     */
    private async statIfExists(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
        try {
            return await vscode.workspace.fs.stat(uri);
        } catch (error) {
            if (this.isFileNotFoundError(error)) {
                return undefined;
            }
            throw error;
        }
    }

    /**
     * isDirectoryStat handles both VS Code FileStat objects and Node-like stats
     * to determine whether a stat describes a directory.
     */
    private isDirectoryStat(stat: vscode.FileStat): boolean {
        const nodeStat = stat as vscode.FileStat & { isDirectory?: () => boolean };
        return stat.type === vscode.FileType.Directory || nodeStat.isDirectory?.() === true;
    }

    /**
     * isFileNotFoundError recognizes the missing-file error codes returned by
     * the workspace filesystem adapters used in tests and production.
     */
    private isFileNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const errorWithCode = error as { code?: unknown };
        return errorWithCode.code === 'ENOENT' || errorWithCode.code === 'FileNotFound';
    }

    /**
     * addMissingProcessorTraceSetups appends setup entries for generated
     * processors that are not already represented in the ctrace document.
     */
    private addMissingProcessorTraceSetups(document: CTraceYamlDocument, processors: GeneratedTraceProcessor[]): boolean {
        const existingProcessorKeys = new Set(document.yaml
            .getArray<CTraceProcessorTraceSetup>(['ctrace', 'setup'])
            .flatMap(setup => {
                const key = this.getProcessorTraceSetupKey(setup);
                return key ? [key] : [];
            }));
        let changed = false;

        for (const processor of processors) {
            const key = this.getGeneratedTraceProcessorKey(processor);

            if (key && existingProcessorKeys.has(key)) {
                continue;
            }

            document.yaml.append(['ctrace', 'setup'], this.createProcessorTraceSetup(processor));
            if (key) {
                existingProcessorKeys.add(key);
            }
            changed = true;
        }

        if (changed) {
            document.normalizeDocumentOrder();
            document.assignCTraceRefs();
        }

        return changed;
    }

    /**
     * getProcessorTraceSetupKey returns the identity key used to match existing
     * ctrace setup entries against generated processor data.
     */
    private getProcessorTraceSetupKey(setup: CTraceProcessorTraceSetup): string | undefined {
        if (setup.pname) {
            return `pname:${setup.pname}`;
        }

        return setup.core ? `core:${setup.core}` : undefined;
    }

    /**
     * getGeneratedTraceProcessorKey returns the identity key used for a
     * processor read from generated cbuild-run data.
     */
    private getGeneratedTraceProcessorKey(processor: GeneratedTraceProcessor): string | undefined {
        if (processor.pname) {
            return `pname:${processor.pname}`;
        }

        return processor.core ? `core:${processor.core}` : undefined;
    }

    /**
     * createProcessorTraceSetup builds the default ctrace setup object for a
     * generated processor based on that core's trace capabilities.
     */
    private createProcessorTraceSetup(processor: GeneratedTraceProcessor): CTraceProcessorTraceSetup {
        const setup: CTraceProcessorTraceSetup = {
            core: processor.core,
            ...(processor.pname ? { pname: processor.pname } : {})
        };
        const capabilities = TraceConfigurationTypes.TRACE_CAPABILITIES_BY_CORE.get(processor.core)
            ?? TraceConfigurationTypes.NO_TRACE_CAPABILITIES;

        if (!capabilities.supportsTrace) {
            return setup;
        }

        if (capabilities.timestamps) {
            setup.timestamps = {};
        }
        if (capabilities.timeSynchronization) {
            setup.timesync = null;
        }
        if (capabilities.dwtComparators > 0) {
            setup.data = [];
        }
        if (capabilities.exceptions) {
            setup.exceptions = null;
        }
        if (capabilities.eventCounters) {
            setup.events = [];
        }
        if (capabilities.instrumentationTrace) {
            setup.itm = { enable: '0x0' };
        }
        if (capabilities.instructionTrace) {
            setup.instructions = {};
        }
        if (capabilities.pcSampling) {
            setup.pcsampling = { period: 'off' };
        }
        if (capabilities.streamSynchronization) {
            setup.synchronization = { DWT: '256M' };
        }

        return setup;
    }

    /**
     * setTraceGenerationWebviewEnabled persists whether the trace generation
     * webview should be enabled for the current workspace.
     */
    private async setTraceGenerationWebviewEnabled(enabled: boolean): Promise<void> {
        await vscode.workspace
            .getConfiguration()
            .update(ENABLE_TRACE_GENERATION_VIEW_SETTING, enabled, vscode.ConfigurationTarget.Workspace);
    }
}
