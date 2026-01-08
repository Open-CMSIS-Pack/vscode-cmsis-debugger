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
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementPrint extends StatementBase {

    constructor(item: ScvdBase, parent: StatementBase | undefined) {
        super(item, parent);
    }

    public async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        const conditionResult = await this.scvdItem.getConditionResult();
        if (conditionResult === false) {
            console.log(`${this.scvdItem.getLineNoStr()}: Skipping ${this.scvdItem.getDisplayLabel()} for condition result: ${conditionResult}`);
            return;
        }

        const childGuiTree = new ScvdGuiTree(guiTree);
        const guiName = await this.scvdItem.getGuiName();
        const guiValue = await this.scvdItem.getGuiValue();
        childGuiTree.setGuiName(guiName);
        childGuiTree.setGuiValue(guiValue);
        childGuiTree.isPrint = true;

        await this.onExecute(executionContext, childGuiTree);

        if(this.children.length > 0) {
            for (const child of this.children) {
                await child.executeStatement(executionContext, childGuiTree);
            }
        }
    }

    protected async onExecute(_executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        console.log(`${this.line}: Executing print: ${await this.scvdItem.getGuiName()}`);
    }
}
