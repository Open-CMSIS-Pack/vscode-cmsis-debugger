/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { parseStringPromise, ParserOptions } from 'xml2js';
import { Json } from './model/scvd-base';
import { Resolver } from './resolver';
import { ScvdComponentViewer } from './model/scvd-component-viewer';
import { StatementEngine } from './statement-engine/statement-engine';
import { ScvdEvalContext } from './scvd-eval-context';
import { GDBTargetDebugSession } from '../../debug-session';
import { ScvdGuiTree } from './scvd-gui-tree';


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
    private _model: ScvdComponentViewer | undefined;
    private _memUsageStart: number = 0;
    private _memUsageLast: number = 0;
    private _timeUsageLast: number = 0;
    private _statementEngine: StatementEngine | undefined;
    private _guiTree: ScvdGuiTree | undefined;

    public constructor(
    ) {
    }

    private injectLineNumbers(xml: string): string {
        const lines = xml.split(/\r?\n/);
        const result: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            result.push(lines[i].replace(
                /<((?!\/|!|\?)([A-Za-z_][A-Za-z0-9._:-]*))/g,
                `<$1 __line="${i + 1}"`
            ));
        }
        return result.join('\n');
    }

    public getGuiTree(): ScvdGuiTree[] | undefined {
        return this._guiTree?.children;
    }

    public getStats(text: string): string {
        const mem = process.memoryUsage();
        const memCurrent = Math.round(mem.heapUsed / 1024 / 1024);
        const timeCurrent = Date.now();

        if(this._timeUsageLast === 0) {
            this._timeUsageLast = timeCurrent;
        }
        if(this._memUsageStart === 0) {
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

    public async readModel(filename: URI, debugSession: GDBTargetDebugSession): Promise<void> {
        const stats: string[] = [];

        stats.push(this.getStats(`  Start reading SCVD file ${filename}`));
        const buf = (await this.readFileToBuffer(filename)).toString('utf-8');
        stats.push(this.getStats('  read'));
        const bufLineNo = this.injectLineNumbers(buf);
        stats.push(this.getStats('  inject'));
        const xml: Json = await this.parseXml(bufLineNo);
        stats.push(this.getStats('  parse'));

        if(xml === undefined) {
            console.error('Failed to parse SCVD XML');
            return;
        }

        this.model = new ScvdComponentViewer(undefined);
        if(!this.model) {
            console.error('Failed to create SCVD model');
            return;
        }

        this.model.readXml(xml);
        stats.push(this.getStats('  model.readXml'));

        const scvdEvalContext = new ScvdEvalContext(this.model);
        scvdEvalContext.init(debugSession);
        stats.push(this.getStats('  evalContext.init'));

        const executionContext = scvdEvalContext.getExecutionContext();
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

        console.log('ComponentViewerInstance readModel stats:\n' + stats.join('\n  '));
    }

    public async update(): Promise<void> {
        const stats: string[] = [];
        stats.push(this.getStats('  start'));
        if(this._statementEngine === undefined || this._guiTree === undefined) {
            return;
        }
        this._guiTree.clear();
        await this._statementEngine.executeAll(this._guiTree);
        stats.push(this.getStats('end'));
        console.log('ComponentViewerInstance update stats:\n' + stats.join('\n  '));
    }

    private async readFileToBuffer(filePath: URI): Promise<Buffer> {
        try {
            const buffer = await vscode.workspace.fs.readFile(filePath);
            return Buffer.from(buffer);
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    }

    private async parseXml(text: string) {
        try {
            const json = await parseStringPromise(text, xmlOpts);
            //console.log(JSON.stringify(json, null, 2));
            return json;
        } catch (err) {
            console.error('Error parsing XML:', err);
        }
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

    public updateModel(activeSession: GDBTargetDebugSession): void {
        // TODO: Update values in the model by re-evaluating necessary statements
        console.log(activeSession);
    }

    public async executeStatements(guiTree: ScvdGuiTree): Promise<void> {
        if(this._statementEngine !== undefined) {
            await this._statementEngine.executeAll(guiTree);
        }
    }
}
