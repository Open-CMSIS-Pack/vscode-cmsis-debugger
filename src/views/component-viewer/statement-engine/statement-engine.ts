/**
 * Copyright 2025 Arm Limited
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

import { ScvdBase } from '../model/scvd-base';
import { ScvdComponentViewer } from '../model/scvd-component-viewer';
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';
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


export class StatementEngine {
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

    get model(): ScvdComponentViewer {
        return this._model;
    }

    get statementTree(): StatementBase | undefined {
        return this._statementTree;
    }

    get executionContext(): ExecutionContext {
        return this._executionContext;
    }

    private buildStatement(item: ScvdBase, parent: StatementBase | undefined) : StatementBase | undefined {
        const ctorName = item.constructor?.name;

        switch (ctorName) {
            case 'ScvdObject':
                // Object-specific logic
                return new StatementObject(item, parent);
            case 'ScvdVar':
                // Variable-specific logic.
                return new StatementVar(item, parent);
            case 'ScvdCalc':
                // Calculation-specific logic.
                return new StatementCalc(item, parent);
            case 'ScvdReadList':
                // ReadList-specific logic.
                return new StatementReadList(item, parent);
            case 'ScvdRead':
                // Read-specific logic.
                return new StatementRead(item, parent);
            case 'ScvdList':
                // List-specific logic.
                return new StatementList(item, parent);
            case 'ScvdListOut':
                // List-specific logic.
                return new StatementListOut(item, parent);
            case 'ScvdOut':
                // Output-specific logic.
                return new StatementOut(item, parent);
            case 'ScvdItem':
                // Item-specific logic.
                return new StatementItem(item, parent);
            case 'ScvdPrint':
                // Print-specific logic.
                return new StatementPrint(item, parent);
            default:
                // Generic logic for other item types.
                return undefined;
        }
    }

    public addChildrenFromScvd(item: ScvdBase, parent: StatementBase | undefined): StatementBase | undefined {

        const statement = this.buildStatement(item, parent);
        if(statement === undefined) {
            return undefined;
        }

        for (const child of item.children) {
            this.addChildrenFromScvd(child, statement);
        }

        return statement;
    }


    public initialize(): boolean {
        const objects = this._model.objects;
        if(objects === undefined || objects.objects.length === 0) {
            return false;
        }

        const object = objects.objects[0];
        if(object === undefined) {
            return false;
        }

        const statementTree = this.addChildrenFromScvd(object, undefined);
        if(statementTree !== undefined) {
            statementTree.sortChildren();
            this._statementTree = statementTree;
        }

        return true;
    }

    public async executeAll(guiTree: ScvdGuiTree): Promise<void> {
        // Execute all statements in the statement tree.
        // This is a placeholder implementation.

        this._executionContext.memoryHost.clear();

        if (this._statementTree) {
            //console.log('Executing statements in the statement tree...');
            await this._statementTree.executeStatement(this.executionContext, guiTree);
        }
    }
}
