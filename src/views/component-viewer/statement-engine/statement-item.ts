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
import { ExecutionContext } from '../scvd-eval-context';
import { ScvdGuiTree } from '../scvd-gui-tree';
import { StatementBase } from './statement-base';


export class StatementItem extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    // TOIMPL: add printChildren to guiTree, and take the furst to set name/value for the item parent
    public override async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        const conditionResult = await this.scvdItem.getConditionResult();
        if (conditionResult === false) {
            //console.log(`${this.scvdItem.getLineNoStr()}: Skipping ${this.scvdItem.getDisplayLabel()} for condition result: ${conditionResult}`);
            return;
        }

        const guiName = await this.scvdItem.getGuiName();
        const childGuiTree = this.getOrCreateGuiChild(guiTree, guiName, this.scvdItem.nodeId);
        const guiValue = await this.scvdItem.getGuiValue();
        childGuiTree.setGuiName(guiName);
        childGuiTree.setGuiValue(guiValue);
        await this.onExecute(executionContext, childGuiTree);

        if (this.children.length > 0) {
            for (const child of this.children) {
                await child.executeStatement(executionContext, childGuiTree);
            }
        }

        if (guiName === undefined) {
            const guiChildren = [...childGuiTree.children];  // copy to keep iteration safe during detach
            for (const guiChild of guiChildren) {
                if (guiChild.isPrint) {
                    const guiNamePrint = guiChild.getGuiName();
                    const guiValuePrint = guiChild.getGuiValue();
                    childGuiTree.setGuiName(guiNamePrint);
                    childGuiTree.setGuiValue(guiValuePrint);
                    break;  // use first found
                }
            }

            for (const guiChild of guiChildren) {
                if (guiChild.isPrint) {
                    guiChild.detach();  // remove temporary print nodes
                }
            }

            if (guiName === undefined && childGuiTree.children.length === 0) { // TOIMPL: check other conditions to drop
                childGuiTree.detach();  // drop empty items that never produced a GUI name/value
            }
        }
    }

    protected override async onExecute(_executionContext: ExecutionContext, _guiTree: ScvdGuiTree): Promise<void> {
        //console.log(`${this.line}: Executing item: ${await this.scvdItem.getGuiName()}`);
    }
}
