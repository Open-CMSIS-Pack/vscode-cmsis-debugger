/**
 * Copyright 2025-2026 Arm Limited
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

import { ScvdNode } from '../model/scvd-node';
import { ScvdComponentViewer } from '../model/scvd-component-viewer';
import { ScvdBreak } from '../model/scvd-break';
import { ScvdCalc } from '../model/scvd-calc';
import { ScvdItem } from '../model/scvd-item';
import { ScvdList } from '../model/scvd-list';
import { ScvdListOut } from '../model/scvd-list-out';
import { ScvdObject } from '../model/scvd-object';
import { ScvdOut } from '../model/scvd-out';
import { ScvdPrint } from '../model/scvd-print';
import { ScvdRead } from '../model/scvd-read';
import { ScvdReadList } from '../model/scvd-readlist';
import { ScvdVar } from '../model/scvd-var';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { formatPerfSummary, resetPerfBackendStats, setPerfBackendEnabled } from '../perf-stats';
import { StatementBase } from './statement-base';
import { StatementBreak } from './statement-break';
import { StatementCalc } from './statement-calc';
import { StatementItem } from './statement-item';
import { StatementList } from './statement-list';
import { StatementListOut } from './statement-list-out';
import { StatementObject } from './statement-object';
import { StatementOut } from './statement-out';
import { StatementPrint } from './statement-print';
import { StatementRead } from './statement-read';
import { StatementReadList } from './statement-readList';
import { StatementVar } from './statement-var';
import { logger } from '../../../logger';


export class StatementEngine {
    private static readonly TIMING_ENABLED = true;
    private _model: ScvdComponentViewer;
    private _statementTree: StatementBase | undefined;
    private _executionContext: ExecutionContext;

    constructor(
        model: ScvdComponentViewer,
        executionContext: ExecutionContext
    ) {
        this._model = model;
        this._executionContext = executionContext;
    }

    public get model(): ScvdComponentViewer {
        return this._model;
    }

    public get statementTree(): StatementBase | undefined {
        return this._statementTree;
    }

    public get executionContext(): ExecutionContext {
        return this._executionContext;
    }

    private buildStatement(item: ScvdNode, parent: StatementBase | undefined) : StatementBase | undefined {
        if (item instanceof ScvdObject) {
            // Object-specific logic
            return new StatementObject(item, parent);
        }
        if (item instanceof ScvdVar) {
            // Variable-specific logic.
            return new StatementVar(item, parent);
        }
        if (item instanceof ScvdCalc) {
            // Calculation-specific logic.
            return new StatementCalc(item, parent);
        }
        if (item instanceof ScvdReadList) {
            // ReadList-specific logic.
            return new StatementReadList(item, parent);
        }
        if (item instanceof ScvdRead) {
            // Read-specific logic.
            return new StatementRead(item, parent);
        }
        if (item instanceof ScvdListOut) {
            // ListOut-specific logic.
            return new StatementListOut(item, parent);
        }
        if (item instanceof ScvdList) {
            // List-specific logic.
            return new StatementList(item, parent);
        }
        if (item instanceof ScvdOut) {
            // Output-specific logic.
            return new StatementOut(item, parent);
        }
        if (item instanceof ScvdItem) {
            // Item-specific logic.
            return new StatementItem(item, parent);
        }
        if (item instanceof ScvdPrint) {
            // Print-specific logic.
            return new StatementPrint(item, parent);
        }
        if (item instanceof ScvdBreak) {
            // Break-specific logic.
            return new StatementBreak(item, parent);
        }
        // Generic logic for other item types.
        return undefined;
    }

    public addChildrenFromScvd(item: ScvdNode, parent: StatementBase | undefined): StatementBase | undefined {

        const statement = this.buildStatement(item, parent);
        if (statement === undefined) {
            return undefined;
        }

        for (const child of item.children) {
            this.addChildrenFromScvd(child, statement);
        }

        return statement;
    }


    public initialize(): boolean {
        const objects = this._model.objects;
        if (objects === undefined || objects.objects.length === 0) {
            return false;
        }

        const object = objects.objects[0];
        if (object === undefined) {
            return false;
        }

        const statementTree = this.addChildrenFromScvd(object, undefined);
        if (statementTree !== undefined) {
            statementTree.sortChildren();
            const breaks = this._model.breaks?.breaks ?? [];
            for (const breakItem of breaks) {
                this.insertBreakAtLine(statementTree, breakItem);
            }
            statementTree.sortChildren();
            this._statementTree = statementTree;
        }

        return true;
    }

    public async executeAll(guiTree: ScvdGuiTree): Promise<void> {
        // Execute all statements in the statement tree.
        // This is a placeholder implementation.

        this._executionContext.memoryHost.clearNonConst();

        const timingStart = StatementEngine.TIMING_ENABLED ? Date.now() : 0;
        if (StatementEngine.TIMING_ENABLED) {
            setPerfBackendEnabled(true);
            resetPerfBackendStats();
            await this._executionContext.debugTarget.beginUpdateCycle();
            this._executionContext.debugTarget.resetReadStats();
        }
        if (this._statementTree) {
            //console.log('Executing statements in the statement tree...');
            await this._statementTree.executeStatement(this.executionContext, guiTree);
        }
        if (StatementEngine.TIMING_ENABLED) {
            const elapsed = Date.now() - timingStart;
            const stats = this._executionContext.debugTarget.getReadStats();
            const cacheStats = this._executionContext.debugTarget.getTargetReadCacheStats();
            const summary = `[SCVD][executeAll] total=${elapsed}ms reads=${stats.count} readMs=${stats.totalMs} readBytes=${stats.totalBytes} maxReadMs=${stats.maxMs} cacheMaxReads=${cacheStats.requestedReads} cacheActualReads=${cacheStats.totalReads} cacheRefreshReads=${cacheStats.refreshReads} cacheMissReads=${cacheStats.missReads} prefetchMs=${cacheStats.prefetchMs}`;
            logger.appendLine(summary);
            console.log(summary);
            const perfSummary = formatPerfSummary();
            logger.appendLine(perfSummary);
            console.log(perfSummary);
            setPerfBackendEnabled(false);
        }
    }

    private insertBreakAtLine(root: StatementBase, breakItem: ScvdBreak): void {
        const lineNo = Number(breakItem.getLineNoStr());
        if (this.hasBreakAtLine(root, lineNo)) {
            return;
        }

        const targetParent = this.findInsertionParentBySpan(root, lineNo);
        this.buildStatement(breakItem, targetParent);
    }

    private hasBreakAtLine(node: StatementBase, line: number): boolean {
        const isBreak = node.scvdItem.constructor?.name === 'ScvdBreak' && node.line === line;
        if (isBreak) {
            return true;
        }
        for (const child of node.children) {
            if (this.hasBreakAtLine(child, line)) {
                return true;
            }
        }
        return false;
    }

    private findInsertionParentBySpan(node: StatementBase, targetLine: number): StatementBase {
        for (const child of node.children) {
            const min = child.line;
            const max = this.getMaxLine(child);
            if (targetLine >= min && targetLine <= max) {
                return this.findInsertionParentBySpan(child, targetLine);
            }
        }
        return node;
    }

    private getMaxLine(node: StatementBase): number {
        let max = node.line;
        for (const child of node.children) {
            const childMax = this.getMaxLine(child);
            if (childMax > max) {
                max = childMax;
            }
        }
        return max;
    }
}
