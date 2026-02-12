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
 */

import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { createHash } from 'crypto';
import { parseStringPromise, ParserOptions } from 'xml2js';
import { Json } from './model/scvd-base';
import { Resolver } from './resolver';
import { ScvdComponentViewer } from './model/scvd-component-viewer';
import { StatementEngine } from './statement-engine/statement-engine';
import { ScvdEvalContext } from './scvd-eval-context';
import { GDBTargetDebugSession, GDBTargetDebugTracker } from '../../debug-session';
import { ScvdGuiTree } from './scvd-gui-tree';
import { componentViewerLogger } from '../../logger';


const xmlOpts: ParserOptions = {
    explicitArray: false,
    mergeAttrs: true,
    explicitRoot: true,
    trim: true,
    // Add child objects that carry their original tag name via '#name'
    explicitChildren: true,
    preserveChildrenOrder: true
};

export class ComponentViewerInstance {
    // Cache final file key per path to keep IDs stable across updates.
    private static _fileKeysByPath: Map<string, string> = new Map<string, string>();
    // Track how many times a base hash was used to disambiguate collisions.
    private static _fileKeyCounts: Map<string, number> = new Map<string, number>();

    private _model: ScvdComponentViewer | undefined;
    private _memUsageStart: number = 0;
    private _memUsageLast: number = 0;
    private _timeUsageLast: number = 0;
    private _statementEngine: StatementEngine | undefined;
    private _guiTree: ScvdGuiTree | undefined;
    private _fileKey: string | undefined;
    private _scvdEvalContext: ScvdEvalContext | undefined;

    public constructor(
    ) {
    }

    private injectLineNumbers(xml: string): string {
        const lines = xml.split(/\r?\n/);
        const result: string[] = [];
        for (const [idx, line] of lines.entries()) {
            result.push(line.replace(
                /<((?!\/|!|\?)([A-Za-z_][A-Za-z0-9._:-]*))/g,
                `<$1 __line="${idx + 1}"`
            ));
        }
        return result.join('\n');
    }

    public get scvdEvalContext(): ScvdEvalContext | undefined {
        return this._scvdEvalContext;
    }

    public set scvdEvalContext(scvdEvalContext: ScvdEvalContext | undefined) {
        this._scvdEvalContext = scvdEvalContext;
    }

    public getGuiTree(): ScvdGuiTree[] | undefined {
        return this._guiTree?.children;
    }

    public getStats(text: string): string {
        const mem = process.memoryUsage();
        const memCurrent = Math.round(mem.heapUsed / 1024 / 1024);
        const timeCurrent = Date.now();

        if (this._timeUsageLast === 0) {
            this._timeUsageLast = timeCurrent;
        }
        if (this._memUsageStart === 0) {
            this._memUsageStart = memCurrent;
            this._memUsageLast = memCurrent;
        }

        const memUsage = memCurrent - this._memUsageLast;
        const timeUsage = timeCurrent - this._timeUsageLast;
        const memIncrease = memCurrent - this._memUsageStart;

        this._memUsageLast = memCurrent;
        this._timeUsageLast = timeCurrent;

        return `${text}, Time: ${timeUsage} ms, Mem: ${memUsage}, Mem Increase: ${memIncrease} MB, (Total: ${memCurrent} MB)`;
    }

    public updateActiveSession(debugSession: GDBTargetDebugSession): void {
        this._scvdEvalContext?.updateActiveSession(debugSession);
    }

    public async readModel(filename: URI, debugSession: GDBTargetDebugSession, debugTracker: GDBTargetDebugTracker): Promise<void> {
        const stats: string[] = [];
        this._fileKey = ComponentViewerInstance.getFileKey(filename);

        stats.push(this.getStats(`  Start reading SCVD file ${filename}`));
        const buf = (await this.readFileToBuffer(filename)).toString('utf-8');
        stats.push(this.getStats('  read'));
        const bufLineNo = this.injectLineNumbers(buf);
        stats.push(this.getStats('  inject'));
        const xml: Json = await this.parseXml(bufLineNo);
        stats.push(this.getStats('  parse'));

        if (xml === undefined) {
            componentViewerLogger.error('Failed to parse SCVD XML');
            return;
        }

        this.model = new ScvdComponentViewer(undefined);
        if (!this.model) {
            componentViewerLogger.error('Failed to create SCVD model');
            return;
        }

        this.model.readXml(xml);
        stats.push(this.getStats('  model.readXml'));

        this.scvdEvalContext = new ScvdEvalContext(this.model);
        this.scvdEvalContext.init(debugSession, debugTracker);
        stats.push(this.getStats('  evalContext.init'));

        const executionContext = this.scvdEvalContext?.getExecutionContext();
        if (executionContext === undefined) {
            componentViewerLogger.error('Failed to get execution context from SCVD EvalContext');
            return;
        }
        this.model.setExecutionContextAll(executionContext);
        stats.push(this.getStats('  model.setExecutionContextAll'));

        this.model.configureAll();
        stats.push(this.getStats('  model.configureAll'));
        this.model.validateAll(true);
        stats.push(this.getStats('  model.validateAll'));

        const resolver = new Resolver(this.model);
        resolver.resolve();
        stats.push(this.getStats('  resolver.resolve'));

        await this.model.calculateTypedefs();
        stats.push(this.getStats('  model.calculateTypedefs'));

        this.statementEngine = new StatementEngine(this.model, executionContext);
        this.statementEngine.initialize();
        stats.push(this.getStats('  statementEngine.initialize'));
        this._guiTree = new ScvdGuiTree(undefined);
        this._guiTree.setId(this._fileKey);
        this._guiTree.setGuiName('component-viewer-root');

        componentViewerLogger.debug(`ComponentViewerInstance readModel stats:\n  ${stats.join('\n  ')}`);
    }

    public async update(): Promise<void> {
        const stats: string[] = [];
        stats.push(this.getStats('  start'));
        if (this._statementEngine === undefined || this._guiTree === undefined) {
            return;
        }
        this._guiTree.clear();
        await this.executeStatements(this._guiTree);
        stats.push(this.getStats('end'));
        componentViewerLogger.debug(`ComponentViewerInstance update stats:\n  ${stats.join('\n  ')}`);
    }

    private async readFileToBuffer(filePath: URI): Promise<Buffer> {
        try {
            const buffer = await vscode.workspace.fs.readFile(filePath);
            return Buffer.from(buffer);
        } catch (error) {
            componentViewerLogger.error('Error reading file:', error);
            throw error;
        }
    }

    private async parseXml(text: string) {
        try {
            const json = await parseStringPromise(text, xmlOpts);
            return json;
        } catch (err) {
            componentViewerLogger.error('Error parsing XML:', err);
        }
    }

    private static getFileKey(filename: URI): string {
        const filePath = filename.fsPath ?? filename.toString();
        const existing = ComponentViewerInstance._fileKeysByPath.get(filePath);
        if (existing !== undefined) {
            return existing;
        }
        const baseHash = createHash('sha1').update(filePath).digest('hex').slice(0, 16);
        const nextCount = ComponentViewerInstance._fileKeyCounts.get(baseHash) ?? 0;
        const suffix = nextCount === 0 ? '' : `-f${nextCount}`;
        const key = `${baseHash}${suffix}`;
        ComponentViewerInstance._fileKeyCounts.set(baseHash, nextCount + 1);
        ComponentViewerInstance._fileKeysByPath.set(filePath, key);
        return key;
    }

    public get model(): ScvdComponentViewer | undefined {
        return this._model;
    }

    private set model(value: ScvdComponentViewer | undefined) {
        this._model = value;
    }

    public get statementEngine(): StatementEngine | undefined {
        return this._statementEngine;
    }

    private set statementEngine(value: StatementEngine | undefined) {
        this._statementEngine = value;
    }

    public async executeStatements(guiTree: ScvdGuiTree): Promise<void> {
        if (this._statementEngine !== undefined) {
            await this._statementEngine.executeAll(guiTree);
        }
    }

}
