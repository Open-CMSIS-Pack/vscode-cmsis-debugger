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
import { StatementPrint } from './statement-print';
import { perf } from '../stats-config';
import { componentViewerLogger } from '../../../logger';


export class StatementItem extends StatementBase {

    constructor(item: ScvdNode, parent: StatementBase | undefined) {
        super(item, parent);
    }

    // TOIMPL: add printChildren to guiTree, and take the furst to set name/value for the item parent
    public override async executeStatement(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`Line: ${this.line}: Executing statement: ${await this.getLogName()}`);
        const shouldExecute = await this.shouldExecute(executionContext);
        if (!shouldExecute) {
            return;
        }

        await this.onExecute(executionContext, guiTree);

        /* Example code for evaluating children.
           Normally this happens here, but in this case it’s done in onExecute
           to account for nameless item and print.

        for (const child of this.children) {  // executed in list
            await child.executeStatement(executionContext, guiTree);
        }*/
    }

    protected override async onExecute(executionContext: ExecutionContext, guiTree: ScvdGuiTree): Promise<void> {
        componentViewerLogger.debug(`Line: ${this.line}: Executing <${this.scvdItem.tag}> : ${await this.getLogName()}`);

        const printChildren = this.children.filter((child): child is StatementPrint => child instanceof StatementPrint);
        if (printChildren.length > 0) {
            // When <item> has <print> children, first check if any print condition matches
            // If no print matches, skip creating the item entirely (don't display incomplete item)
            let matched = false;
            let guiNamePrint = '';
            let guiValuePrint = '';
            for (const printChild of printChildren) {
                const shouldPrint = await printChild.scvdItem.getConditionResult();
                if (shouldPrint !== false) {
                    guiNamePrint = await printChild.scvdItem.getGuiName() ?? '';
                    guiValuePrint = await printChild.scvdItem.getGuiValue() ?? '';
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // No print statement evaluated to true, so skip execution of item and nested statements
                return;
            }
            // A print matched, create the item with the print's name/value
            const childGuiTree = this.getOrCreateGuiChild(guiTree, guiNamePrint);
            perf?.recordGuiItemNode();
            childGuiTree.setGuiName(guiNamePrint);
            childGuiTree.setGuiValue(guiValuePrint);
            // Execute non-print children
            for (const child of this.children) {
                if (!(child instanceof StatementPrint)) {
                    await child.executeStatement(executionContext, childGuiTree);
                }
            }
            return;
        }

        // No print children, display item with its own name/value (even if incomplete/empty)
        const guiNameStart = perf?.start() ?? 0;
        const guiName = await this.getGuiName() ?? '';
        perf?.end(guiNameStart, 'guiNameMs', 'guiNameCalls');
        const childGuiTree = this.getOrCreateGuiChild(guiTree, guiName);
        perf?.recordGuiItemNode();
        const guiValueStart = perf?.start() ?? 0;
        const guiValue = await this.getGuiValue() ?? '';
        perf?.end(guiValueStart, 'guiValueMs', 'guiValueCalls');
        childGuiTree.setGuiName(guiName);
        childGuiTree.setGuiValue(guiValue);

        if (this.children.length > 0) {
            for (const child of this.children) {
                await child.executeStatement(executionContext, childGuiTree);
            }
        }
    }
}
